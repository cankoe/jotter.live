import type { Note } from "../storage/db";
import { groupByDate } from "../utils/dates";
import { searchNotes } from "../utils/search";
import { createNoteItem } from "./NoteItem";

const ICON_PLUS = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="9" y1="3" x2="9" y2="15"/><line x1="3" y1="9" x2="15" y2="9"/></svg>`;
const ICON_TRASH = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.25 4.5h13.5"/><path d="M6 4.5V3a1.5 1.5 0 011.5-1.5h3A1.5 1.5 0 0112 3v1.5"/><path d="M14.25 4.5v10.5a1.5 1.5 0 01-1.5 1.5h-7.5a1.5 1.5 0 01-1.5-1.5V4.5"/></svg>`;
const ICON_SETTINGS = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="2.5"/><path d="M14.7 11.1a1.2 1.2 0 00.2 1.3l.04.04a1.44 1.44 0 11-2.04 2.04l-.04-.04a1.2 1.2 0 00-1.3-.2 1.2 1.2 0 00-.72 1.1v.12a1.44 1.44 0 11-2.88 0v-.06a1.2 1.2 0 00-.78-1.1 1.2 1.2 0 00-1.3.2l-.04.04a1.44 1.44 0 11-2.04-2.04l.04-.04a1.2 1.2 0 00.2-1.3 1.2 1.2 0 00-1.1-.72H3.44a1.44 1.44 0 010-2.88h.06a1.2 1.2 0 001.1-.78 1.2 1.2 0 00-.2-1.3l-.04-.04A1.44 1.44 0 116.4 3.32l.04.04a1.2 1.2 0 001.3.2h.06a1.2 1.2 0 00.72-1.1V2.34a1.44 1.44 0 112.88 0v.06a1.2 1.2 0 00.72 1.1 1.2 1.2 0 001.3-.2l.04-.04a1.44 1.44 0 112.04 2.04l-.04.04a1.2 1.2 0 00-.2 1.3v.06a1.2 1.2 0 001.1.72h.12a1.44 1.44 0 010 2.88h-.06a1.2 1.2 0 00-1.1.72z"/></svg>`;

export interface SidebarOptions {
  onNoteSelect: (id: string) => void;
  onNoteActionClick: (id: string, e: MouseEvent) => void;
  onNewNote: () => void;
  onTrashClick: () => void;
  onBulkTrash: (ids: string[]) => void;
  onBulkExport: (ids: string[]) => void;
  onShowSettings: () => void;
}

export class Sidebar {
  readonly el: HTMLElement;
  private listEl: HTMLElement;
  private searchWrap: HTMLElement;
  private searchInput: HTMLInputElement;
  private backEl: HTMLElement;
  private options: SidebarOptions;
  private notes: Note[] = [];
  private trashedNotes: Note[] = [];
  private trashCount = 0;
  private activeNoteId: string | null = null;
  private showDraft = false;
  private searchQuery = "";
  private mode: "notes" | "trash" = "notes";
  private trashBadge: HTMLElement;

  private selectionMode = false;
  private selectedIds = new Set<string>();
  private selectionBarEl: HTMLElement;
  private selectBtn: HTMLButtonElement;

  constructor(options: SidebarOptions) {
    this.options = options;
    this.el = document.createElement("aside");
    this.el.className = "sidebar";

    // Search bar
    this.searchWrap = document.createElement("div");
    this.searchWrap.className = "sidebar-search";
    this.searchInput = document.createElement("input");
    this.searchInput.type = "text";
    this.searchInput.placeholder = "Search notes...";
    this.searchInput.setAttribute("aria-label", "Search notes");
    this.searchInput.addEventListener("input", () => {
      this.searchQuery = this.searchInput.value;
      this.render();
    });

    this.selectBtn = document.createElement("button");
    this.selectBtn.className = "sidebar-new-btn";
    this.selectBtn.title = "Select notes";
    this.selectBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>`;
    this.selectBtn.addEventListener("click", () => this.enterSelectionMode());

    this.searchWrap.append(this.searchInput, this.selectBtn);

    // Full-width "New Note" button below search
    const newNoteArea = document.createElement("button");
    newNoteArea.className = "sidebar-new-note-btn";
    newNoteArea.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="9" y1="3" x2="9" y2="15"/><line x1="3" y1="9" x2="15" y2="9"/></svg> New Note`;
    newNoteArea.addEventListener("click", options.onNewNote);

    // Back button (for trash view)
    this.backEl = document.createElement("div");
    this.backEl.className = "sidebar-back";
    this.backEl.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3L5 8l5 5"/></svg> Back to Notes`;
    this.backEl.addEventListener("click", () => this.showNotes());
    this.backEl.style.display = "none";

    // Notes list
    this.listEl = document.createElement("div");
    this.listEl.className = "sidebar-list";

    // Selection toolbar
    this.selectionBarEl = document.createElement("div");
    this.selectionBarEl.className = "sidebar-selection-bar";
    this.selectionBarEl.style.display = "none";

    // Bottom action bar (Trash + Settings)
    const bottomBar = document.createElement("div");
    bottomBar.className = "sidebar-bottom-bar";

    const trashBtn = document.createElement("button");
    trashBtn.className = "sidebar-bottom-btn";
    trashBtn.title = "Trash";
    this.trashBadge = document.createElement("span");
    this.trashBadge.className = "sidebar-bottom-badge";
    trashBtn.innerHTML = ICON_TRASH;
    const trashLabel = document.createElement("span");
    trashLabel.textContent = "Trash";
    trashBtn.append(trashLabel, this.trashBadge);
    trashBtn.addEventListener("click", () => options.onTrashClick());

    const settingsBtn = this.createBottomBtn(ICON_SETTINGS, "Settings", () => options.onShowSettings());

    bottomBar.append(trashBtn, settingsBtn);

    this.el.append(this.searchWrap, newNoteArea, this.backEl, this.listEl, this.selectionBarEl, bottomBar);
  }

  private createBottomBtn(iconHtml: string, label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.className = "sidebar-bottom-btn";
    btn.title = label;
    btn.innerHTML = `${iconHtml}<span>${label}</span>`;
    btn.addEventListener("click", onClick);
    return btn;
  }

  update(notes: Note[], trashedNotes: Note[], activeNoteId: string | null, isDraft = false): void {
    this.notes = notes;
    this.trashedNotes = trashedNotes;
    this.trashCount = trashedNotes.length;
    this.activeNoteId = activeNoteId;
    this.showDraft = isDraft;
    this.trashBadge.textContent = this.trashCount > 0 ? String(this.trashCount) : "";
    this.trashBadge.style.display = this.trashCount > 0 ? "" : "none";
    this.render();
  }

  showTrash(): void {
    this.mode = "trash";
    this.searchQuery = "";
    this.searchInput.value = "";
    this.exitSelectionMode();
    this.render();
  }

  showNotes(): void {
    this.mode = "notes";
    this.searchQuery = "";
    this.searchInput.value = "";
    this.exitSelectionMode();
    this.render();
  }

  enterSelectionMode(): void {
    if (this.mode !== "notes") return;
    this.selectionMode = true;
    this.selectedIds.clear();
    this.render();
  }

  private exitSelectionMode(): void {
    this.selectionMode = false;
    this.selectedIds.clear();
    this.render();
  }

  private toggleNoteSelection(id: string): void {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
    this.render();
  }

  private render(): void {
    this.listEl.innerHTML = "";

    if (this.mode === "trash") {
      this.searchWrap.style.display = "none";
      this.backEl.style.display = "";
      this.selectionBarEl.style.display = "none";
      this.renderTrashList();
    } else {
      this.searchWrap.style.display = "";
      this.backEl.style.display = "none";
      this.selectBtn.style.display = this.selectionMode ? "none" : "";
      this.renderNotesList();
      this.renderSelectionBar();
    }
  }

  private renderNotesList(): void {
    if (this.showDraft && !this.searchQuery && !this.selectionMode) {
      const ghost = document.createElement("div");
      ghost.className = "note-item note-item-draft active";
      const content = document.createElement("div");
      content.className = "note-item-content";
      const title = document.createElement("div");
      title.className = "note-item-title";
      title.textContent = "New note";
      const time = document.createElement("div");
      time.className = "note-item-time";
      time.textContent = "draft";
      content.append(title, time);
      ghost.appendChild(content);
      this.listEl.appendChild(ghost);
    }

    const filtered = searchNotes(this.notes, this.searchQuery);
    const groups = groupByDate(filtered, (n) => n.createdAt);
    for (const group of groups) {
      const label = document.createElement("div");
      label.className = "sidebar-group-label";
      label.textContent = group.label;
      this.listEl.appendChild(label);
      for (const note of group.items) {
        this.listEl.appendChild(createNoteItem({
          note,
          active: note.id === this.activeNoteId,
          onClick: this.options.onNoteSelect,
          onActionClick: this.options.onNoteActionClick,
          selectionMode: this.selectionMode,
          selected: this.selectedIds.has(note.id),
          onToggleSelect: (id) => this.toggleNoteSelection(id),
        }));
      }
    }
  }

  private renderSelectionBar(): void {
    if (!this.selectionMode) {
      this.selectionBarEl.style.display = "none";
      return;
    }
    this.selectionBarEl.style.display = "";
    this.selectionBarEl.innerHTML = "";

    const countSpan = document.createElement("span");
    countSpan.className = "sidebar-selection-count";
    countSpan.textContent = `${this.selectedIds.size} selected`;

    const selectAllBtn = document.createElement("button");
    selectAllBtn.className = "sidebar-selection-btn";
    const allSelected = this.selectedIds.size === this.notes.length && this.notes.length > 0;
    selectAllBtn.textContent = allSelected ? "Deselect All" : "Select All";
    selectAllBtn.addEventListener("click", () => {
      if (allSelected) {
        this.selectedIds.clear();
      } else {
        for (const n of this.notes) this.selectedIds.add(n.id);
      }
      this.render();
    });

    const exportBtn = document.createElement("button");
    exportBtn.className = "sidebar-selection-btn";
    exportBtn.textContent = "Export";
    exportBtn.disabled = this.selectedIds.size === 0;
    exportBtn.addEventListener("click", () => {
      if (this.selectedIds.size > 0) {
        this.options.onBulkExport(Array.from(this.selectedIds));
        this.exitSelectionMode();
      }
    });

    const trashBtn = document.createElement("button");
    trashBtn.className = "sidebar-selection-btn danger";
    trashBtn.textContent = "Trash";
    trashBtn.disabled = this.selectedIds.size === 0;
    trashBtn.addEventListener("click", () => {
      if (this.selectedIds.size > 0) {
        this.options.onBulkTrash(Array.from(this.selectedIds));
        this.exitSelectionMode();
      }
    });

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "sidebar-selection-btn";
    cancelBtn.textContent = "Done";
    cancelBtn.style.fontWeight = "600";
    cancelBtn.addEventListener("click", () => this.exitSelectionMode());

    this.selectionBarEl.append(countSpan, selectAllBtn, exportBtn, trashBtn, cancelBtn);
  }

  private renderTrashList(): void {
    if (this.trashedNotes.length === 0) {
      const empty = document.createElement("div");
      empty.className = "sidebar-empty";
      empty.textContent = "Trash is empty";
      this.listEl.appendChild(empty);
      return;
    }
    for (const note of this.trashedNotes) {
      this.listEl.appendChild(createNoteItem({
        note,
        active: false,
        onClick: () => {},
        onActionClick: this.options.onNoteActionClick,
      }));
    }
  }

  setOpen(open: boolean): void {
    this.el.classList.toggle("open", open);
  }

  focusSearch(): void {
    this.searchInput.focus();
  }

  getMode(): "notes" | "trash" {
    return this.mode;
  }
}
