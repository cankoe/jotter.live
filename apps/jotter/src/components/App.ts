import { NotesDB, type Note } from "../storage/db";
import { OPFSImageStore, MemoryImageStore, type ImageStore } from "../storage/images";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { EditorPane } from "./EditorPane";
import { AttachmentsPane } from "./AttachmentsPane";
import { ResizeHandle } from "./ResizeHandle";
import { showToast } from "./Toast";
import { showContextMenu } from "./ContextMenu";
import { exportNotesToZip, importFromZip, exportWorkspace, importWorkspace } from "../utils/zip";
import { LandingOverlay } from "./LandingOverlay";
import { SettingsPanel, loadSettings, saveSettings, applySettings, PRIVACY_POLICY, TERMS_OF_SERVICE } from "./Settings";
import { createWelcomeNote } from "../welcome";
import { isSignedIn, hasToken, signIn, signOut } from "../sync/google-auth";
import { clearFolderCache, getJotterFolderUrl } from "../sync/google-drive";
import { syncNotes, getLastSyncTime } from "../sync/sync-engine";

export class App {
  private db: NotesDB;
  private images: ImageStore;
  private topBar: TopBar;
  private sidebar: Sidebar;
  private editorPane: EditorPane;
  private settingsPanel: SettingsPanel;
  private attachmentsPane: AttachmentsPane;
  private landing!: LandingOverlay;
  private overlay: HTMLElement;

  private activeNoteId: string | null = null;
  private isDraft = false; // true when editing a new unsaved note
  private notes: Note[] = [];
  private trashedNotes: Note[] = [];
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private sidebarOpen = false;
  private syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isSyncing = false;

  constructor(private root: HTMLElement) {
    this.db = new NotesDB();
    if (typeof navigator !== "undefined" && "storage" in navigator && typeof navigator.storage?.getDirectory === "function") {
      this.images = new OPFSImageStore();
    } else {
      this.images = new MemoryImageStore();
      console.warn("OPFS not available, images will not persist across sessions");
    }

    this.settingsPanel = new SettingsPanel({
      onExportWorkspace: () => this.exportFullWorkspace(),
      onImportWorkspace: (file) => this.importFullWorkspace(file),
      onClearAllData: () => this.clearAllData(),
      onShowWelcome: () => this.showLanding(),
      onCreateNote: (content) => this.createNoteWithContent(content),
      onSettingsChange: () => {},
      onConnectDrive: () => {
        signIn().then(() => {
          showToast({ message: "Google Drive connected — syncing..." });
          this.settingsPanel.render();
          this.syncNow();
        }).catch((err) => {
          console.error("Drive sign-in failed:", err);
          showToast({ message: "Failed to connect Google Drive" });
        });
      },
      onDisconnectDrive: () => {
        signOut();
        clearFolderCache();
        this.settingsPanel.render();
      },
      onSyncNow: () => this.syncNow(),
      isDriveConnected: () => hasToken(),
      getLastSyncTime: () => getLastSyncTime(),
      getDriveFolderUrl: () => getJotterFolderUrl(),
    });

    this.topBar = new TopBar({
      onNewNote: () => this.createNewNote(),
      onToggleSidebar: () => this.toggleSidebar(),
      onToggleAttachments: () => {
        this.attachmentsPane.toggle();
        this.topBar.setAttachmentsActive(this.attachmentsPane.isOpen());
      },
      onShowAbout: () => this.showLanding(),
      onShowSettings: () => this.settingsPanel.toggle(),
    });

    this.sidebar = new Sidebar({
      onNoteSelect: (id) => this.selectNote(id),
      onNoteActionClick: (id, e) => this.showNoteContextMenu(id, e),
      onNewNote: () => this.createNewNote(),
      onTrashClick: () => this.showTrash(),
    });

    this.editorPane = new EditorPane({
      onChange: (content) => this.onContentChange(content),
      onImagePaste: async (blob) => {
        const name = (blob as File).name || undefined;
        const filename = await this.images.store(blob, name);
        if (this.attachmentsPane.isOpen()) this.attachmentsPane.refresh();
        return filename;
      },
      onImageUpload: () => {
        if (this.attachmentsPane.isOpen()) this.attachmentsPane.refresh();
      },
      imageStore: this.images,
    });

    this.attachmentsPane = new AttachmentsPane({
      fileStore: this.images,
      onInsertFile: (md) => this.editorPane.insertAtCursor(md),
    });

    this.overlay = document.createElement("div");
    this.overlay.className = "sidebar-overlay";
    this.overlay.addEventListener("click", () => this.toggleSidebar());

    // Drag-drop on sidebar for .md/.zip import
    this.setupSidebarDragDrop();

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      // Cmd/Ctrl + N: new note
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        this.createNewNote();
      }
      // Cmd/Ctrl + Shift + F: focus search
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "f") {
        e.preventDefault();
        this.sidebar.focusSearch();
      }
      // Cmd/Ctrl + Shift + E: export workspace
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "e") {
        e.preventDefault();
        this.exportFullWorkspace();
      }
      // Escape: close sidebar on mobile
      if (e.key === "Escape" && this.sidebarOpen) {
        this.closeSidebar();
      }
    });

    const appEl = document.createElement("div");
    appEl.className = "app";
    const mainEl = document.createElement("div");
    mainEl.className = "main";

    // Resize handle between sidebar and editor
    const sidebarResizeHandle = new ResizeHandle({
      direction: "left",
      targetEl: this.sidebar.el,
      cssVar: "--sidebar-width",
      minSize: 180,
      maxSize: 480,
      storageKey: "jotter-sidebar-width",
    });

    // Resize handle between editor and attachments pane
    const attachmentsResizeHandle = new ResizeHandle({
      direction: "right",
      targetEl: this.attachmentsPane.el,
      cssVar: "--attachments-width",
      minSize: 160,
      maxSize: 400,
      storageKey: "jotter-attachments-width",
    });

    mainEl.append(
      this.sidebar.el,
      sidebarResizeHandle.el,
      this.editorPane.el,
      attachmentsResizeHandle.el,
      this.attachmentsPane.el,
    );
    appEl.append(this.topBar.el, mainEl, this.overlay);
    this.root.innerHTML = "";
    this.root.appendChild(appEl);
  }

  private async checkPrivateMode(): Promise<void> {
    let isPrivate = false;

    // Method 1: storage quota check (incognito typically has tiny quota)
    if (navigator.storage?.estimate) {
      try {
        const { quota } = await navigator.storage.estimate();
        // Incognito Chrome ~120MB, normal Chrome ~50GB+
        if (quota && quota < 500 * 1024 * 1024) isPrivate = true;
      } catch { /* ignore */ }
    }

    // Method 2: try to detect via IndexedDB persistence
    if (!isPrivate) {
      try {
        const persisted = await navigator.storage?.persisted?.();
        // In incognito, persisted() may return false or throw
        // This alone isn't conclusive, so only use as supplementary signal
      } catch {
        isPrivate = true;
      }
    }

    if (isPrivate) {
      const banner = document.createElement("div");
      banner.className = "incognito-banner";
      banner.innerHTML = `
        <span>You're in private/incognito mode — your notes and files will be lost when this window closes.</span>
        <button class="incognito-dismiss" title="Dismiss">&times;</button>
      `;
      banner.querySelector(".incognito-dismiss")!.addEventListener("click", () => banner.remove());
      this.root.querySelector(".app")?.prepend(banner);
    }
  }

  async init(): Promise<void> {
    // Check for incognito/private mode
    this.checkPrivateMode();

    // Apply saved settings
    applySettings(loadSettings());

    await this.db.open();
    const settings = loadSettings();
    if (settings.trashRetentionDays > 0) {
      await this.db.purgeOldTrashed(settings.trashRetentionDays);
    }

    // First visit: create a welcome note with sample files
    if (!localStorage.getItem("jotter-welcomed")) {
      await createWelcomeNote(this.db, this.images);
    }

    await this.refreshNoteList();

    // Check for /privacy or /terms route
    const path = window.location.pathname;
    if (path === "/privacy" || path === "/terms") {
      const content = path === "/privacy" ? PRIVACY_POLICY : TERMS_OF_SERVICE;
      await this.createNoteWithContent(content);
    } else if (!localStorage.getItem("jotter-welcomed") && this.notes.length > 0) {
      // Select the welcome note on first visit
      await this.selectNote(this.notes[0].id);
    } else {
      await this.createNewNote();
    }
    this.attachmentsPane.initIfOpen();
    this.topBar.setAttachmentsActive(this.attachmentsPane.isOpen());

    // Landing overlay: inline script in index.html already hides it for returning users.
    // We just wire up the dismiss callback and keyboard handlers.
    this.landing = new LandingOverlay({
      onDismiss: () => {
        localStorage.setItem("jotter-welcomed", "1");
      },
    });
    // For first visit, landing is already visible — just attach keyboard listeners
    if (this.landing.isVisible()) {
      this.landing.show();
    }
  }

  private showLanding(): void {
    this.landing.show();
  }

  private async refreshNoteList(): Promise<void> {
    this.notes = await this.db.listActive();
    this.trashedNotes = await this.db.listTrashed();
    this.sidebar.update(this.notes, this.trashedNotes, this.activeNoteId, this.isDraft);
    this.editorPane.updateTags(this.extractTags());
  }

  private extractTags(): string[] {
    const tags = new Set<string>();
    const re = /(?:^|[^#\w])#([\w/-]+)/g;
    for (const note of this.notes) {
      let match;
      while ((match = re.exec(note.content)) !== null) {
        tags.add(match[1]);
      }
    }
    return Array.from(tags);
  }

  private async createNewNote(): Promise<void> {
    // If already editing a draft, just keep it
    if (this.isDraft) return;
    this.activeNoteId = null;
    this.isDraft = true;
    this.editorPane.loadNote("");
    this.sidebar.update(this.notes, this.trashedNotes, null, true);
  }

  private async createNoteWithContent(content: string): Promise<void> {
    const note = await this.db.create(content);
    this.activeNoteId = note.id;
    this.isDraft = false;
    this.editorPane.loadNote(content);
    await this.refreshNoteList();
  }

  private async selectNote(id: string): Promise<void> {
    // Discard draft or empty persisted note when switching away
    if (this.isDraft) {
      this.isDraft = false;
    } else if (this.activeNoteId && this.activeNoteId !== id) {
      const current = await this.db.get(this.activeNoteId);
      if (current && !current.content.trim()) {
        await this.db.hardDelete(this.activeNoteId);
      }
    }
    this.activeNoteId = id;
    const note = await this.db.get(id);
    if (note) this.editorPane.loadNote(note.content);
    await this.refreshNoteList();
    this.closeSidebar();
  }

  private onContentChange(content: string): void {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => this.saveCurrentNote(content), 500);
  }

  private async saveCurrentNote(content: string): Promise<void> {
    if (!content.trim()) return; // Don't save empty notes
    if (this.isDraft) {
      // First real content — persist the draft
      const note = await this.db.create(content);
      this.activeNoteId = note.id;
      this.isDraft = false;
      await this.refreshNoteList();
      return;
    }
    if (!this.activeNoteId) return;
    await this.db.update(this.activeNoteId, { content });
    await this.refreshNoteList();
    this.scheduleDebouncedSync();
  }

  private showNoteContextMenu(id: string, e: MouseEvent): void {
    if (this.sidebar.getMode() === "trash") {
      this.showTrashNoteContextMenu(id, e);
    } else {
      showContextMenu([
        { label: "Export note", onClick: () => this.exportSingleNote(id) },
        { label: "Move to Trash", onClick: () => this.trashNote(id), danger: true },
      ], e.clientX, e.clientY);
    }
  }

  private showTrashNoteContextMenu(id: string, e: MouseEvent): void {
    showContextMenu([
      { label: "Restore", onClick: () => this.restoreNote(id) },
      { label: "Delete Forever", onClick: () => this.permanentlyDeleteNote(id), danger: true },
    ], e.clientX, e.clientY);
  }

  private async trashNote(id: string): Promise<void> {
    await this.db.softDelete(id);
    if (this.activeNoteId === id) {
      this.activeNoteId = null;
      await this.createNewNote();
    }
    await this.refreshNoteList();
    showToast({
      message: "Note moved to trash",
      action: {
        label: "Undo",
        onClick: async () => { await this.db.restore(id); await this.refreshNoteList(); },
      },
    });
  }

  private async restoreNote(id: string): Promise<void> {
    await this.db.restore(id);
    await this.refreshNoteList();
    showToast({ message: "Note restored" });
  }

  private async permanentlyDeleteNote(id: string): Promise<void> {
    await this.db.hardDelete(id);
    await this.refreshNoteList();
    showToast({ message: "Note permanently deleted" });
  }

  private async showTrash(): Promise<void> {
    await this.refreshNoteList();
    this.sidebar.showTrash();
  }

  private async exportNotes(): Promise<void> {
    const notes = await this.db.listActive();
    if (notes.length === 0) {
      showToast({ message: "No notes to export" });
      return;
    }
    const blob = await exportNotesToZip(notes, this.images);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jotter-export-${new Date().toISOString().split("T")[0]}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    showToast({ message: `Exported ${notes.length} note(s)` });
  }

  private async exportSingleNote(id: string): Promise<void> {
    const note = await this.db.get(id);
    if (!note) return;
    const blob = await exportNotesToZip([note], this.images);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeName = (note.title || "Untitled").replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim() || "Untitled";
    a.download = `${safeName}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    showToast({ message: "Note exported" });
  }

  private async importFiles(files: FileList): Promise<void> {
    for (let i = 0; i < files.length; i++) {
      const result = await importFromZip(files[i]);
      // Store images
      for (const img of result.images) {
        await this.images.store(img.blob);
      }
      // Create notes
      for (const note of result.notes) {
        await this.db.create(note.content);
      }
    }
    await this.refreshNoteList();
    if (this.attachmentsPane.isOpen()) this.attachmentsPane.refresh();
  }

  private async exportFullWorkspace(): Promise<void> {
    const notes = await this.db.listActive();
    const trashed = await this.db.listTrashed();
    const blob = await exportWorkspace(notes, trashed, this.images, loadSettings());
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jotter-workspace-${new Date().toISOString().split("T")[0]}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    showToast({ message: "Workspace exported" });
  }

  private async clearAllData(): Promise<void> {
    const allNotes = await this.db.getAll();
    for (const note of allNotes) {
      await this.db.hardDelete(note.id);
    }
    const allFiles = await this.images.list();
    for (const f of allFiles) {
      await this.images.delete(f);
    }
    this.activeNoteId = null;
    this.isDraft = false;
    await this.refreshNoteList();
    await this.createNewNote();
    if (this.attachmentsPane.isOpen()) this.attachmentsPane.refresh();
    showToast({ message: "All data cleared" });
  }

  private async importFullWorkspace(file: File): Promise<void> {
    const result = await importWorkspace(file);
    let notesAdded = 0;

    // Store files (additive — store handles dedup by content)
    for (const f of result.files) {
      await this.images.store(f.blob, f.filename);
    }

    // Restore full notes with original IDs/timestamps (skip existing)
    for (const note of result.fullNotes) {
      const existing = await this.db.get(note.id);
      if (!existing) {
        await this.db.put(note);
        notesAdded++;
      }
    }

    // Create simple notes (legacy format, no IDs)
    for (const note of result.simpleNotes) {
      await this.db.create(note.content);
      notesAdded++;
    }

    // Restore settings if present
    if (result.settings) {
      saveSettings(result.settings);
      applySettings(result.settings);
    }

    await this.refreshNoteList();
    if (this.attachmentsPane.isOpen()) this.attachmentsPane.refresh();
    const parts = [`${notesAdded} note(s)`, `${result.files.length} file(s)`];
    if (result.settings) parts.push("settings");
    showToast({ message: `Imported ${parts.join(", ")}` });
  }

  private async syncNow(): Promise<void> {
    if (this.isSyncing || !isSignedIn()) return;
    this.isSyncing = true;
    try {
      const result = await syncNotes(this.db, this.images, "both", (msg) => {
        showToast({ message: msg, duration: 0 });
      });
      const parts: string[] = [];
      if (result.notesUploaded) parts.push(`${result.notesUploaded} up`);
      if (result.notesDownloaded) parts.push(`${result.notesDownloaded} down`);
      if (result.filesUploaded) parts.push(`${result.filesUploaded} files up`);
      if (result.filesDownloaded) parts.push(`${result.filesDownloaded} files down`);
      if (result.notesDeleted) parts.push(`${result.notesDeleted} deleted`);
      const summary = parts.length > 0 ? parts.join(", ") : "Already up to date";
      showToast({ message: `Sync complete: ${summary}` });
      this.settingsPanel.render();
      // Refresh the note list in case new notes were pulled
      if (result.notesDownloaded > 0 || result.filesDownloaded > 0) {
        await this.refreshNoteList();
        if (this.attachmentsPane.isOpen()) this.attachmentsPane.refresh();
      }
    } catch (err) {
      console.error("Sync failed:", err);
      showToast({ message: "Sync failed. Check console for details." });
    } finally {
      this.isSyncing = false;
    }
  }

  private scheduleDebouncedSync(): void {
    if (!isSignedIn()) return;
    const settings = loadSettings();
    if (!settings.autoSync) return;
    if (this.syncDebounceTimer) clearTimeout(this.syncDebounceTimer);
    this.syncDebounceTimer = setTimeout(() => {
      this.syncNow();
    }, 10_000);
  }

  private setupSidebarDragDrop(): void {
    const el = this.sidebar.el;
    let dragCounter = 0;

    el.addEventListener("dragenter", (e) => {
      e.preventDefault();
      dragCounter++;
      el.classList.add("drag-over");
    });

    el.addEventListener("dragover", (e) => {
      e.preventDefault();
    });

    el.addEventListener("dragleave", () => {
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        el.classList.remove("drag-over");
      }
    });

    el.addEventListener("drop", async (e) => {
      e.preventDefault();
      dragCounter = 0;
      el.classList.remove("drag-over");
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;
      // Filter to .md and .zip only
      const mdFiles: File[] = [];
      const zipFiles: File[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (f.name.endsWith(".md")) mdFiles.push(f);
        else if (f.name.endsWith(".zip")) zipFiles.push(f);
      }
      if (mdFiles.length > 0 || zipFiles.length > 0) {
        try {
          // Import .zip files as workspace imports
          for (const zf of zipFiles) {
            await this.importFullWorkspace(zf);
          }
          // Import .md files as individual notes
          if (mdFiles.length > 0) {
            const dt = new DataTransfer();
            for (const f of mdFiles) dt.items.add(f);
            await this.importFiles(dt.files);
            showToast({ message: `Imported ${mdFiles.length} note(s)` });
          }
        } catch (err) {
          console.error("Import failed:", err);
          showToast({ message: "Import failed" });
        }
      }
    });
  }

  private toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
    this.sidebar.setOpen(this.sidebarOpen);
    this.overlay.classList.toggle("open", this.sidebarOpen);
    this.topBar.setSidebarActive(this.sidebarOpen);
  }

  private closeSidebar(): void {
    this.sidebarOpen = false;
    this.sidebar.setOpen(false);
    this.overlay.classList.toggle("open", false);
    this.topBar.setSidebarActive(false);
  }
}
