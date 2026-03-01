import type { Note } from "../storage/db";
import { groupByDate } from "../utils/dates";
import { searchNotes } from "../utils/search";
import { createNoteItem } from "./NoteItem";

export interface SidebarOptions {
  onNoteSelect: (id: string) => void;
  onNoteActionClick: (id: string, e: MouseEvent) => void;
  onNewNote: () => void;
  onTrashClick: () => void;
  onBulkTrash: (ids: string[]) => void;
  onBulkExport: (ids: string[]) => void;
}

export class Sidebar {
  readonly el: HTMLElement;
  private listEl: HTMLElement;
  private searchWrap: HTMLElement;
  private searchInput: HTMLInputElement;
  private trashEl: HTMLElement;
  private backEl: HTMLElement;
  private options: SidebarOptions;
  private notes: Note[] = [];
  private trashedNotes: Note[] = [];
  private trashCount = 0;
  private activeNoteId: string | null = null;
  private showDraft = false;
  private searchQuery = "";
  private mode: "notes" | "trash" = "notes";

  private selectionMode = false;
  private selectedIds = new Set<string>();
  private selectionBarEl: HTMLElement;
  private selectBtn: HTMLButtonElement;

  constructor(options: SidebarOptions) {
    this.options = options;
    this.el = document.createElement("aside");
    this.el.className = "sidebar";

    this.searchWrap = document.createElement("div");
    this.searchWrap.className = "sidebar-search";
    this.searchInput = document.createElement("input");
    this.searchInput.type = "text";
    this.searchInput.placeholder = "Search notes...";
    this.searchInput.addEventListener("input", () => {
      this.searchQuery = this.searchInput.value;
      this.render();
    });
    const newBtn = document.createElement("button");
    newBtn.className = "sidebar-new-btn";
    newBtn.title = "New note";
    newBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/></svg>`;
    newBtn.addEventListener("click", options.onNewNote);

    this.selectBtn = document.createElement("button");
    this.selectBtn.className = "sidebar-new-btn";
    this.selectBtn.title = "Select notes";
    this.selectBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>`;
    this.selectBtn.addEventListener("click", () => this.enterSelectionMode());

    this.searchWrap.append(this.searchInput, this.selectBtn, newBtn);

    this.backEl = document.createElement("div");
    this.backEl.className = "sidebar-back";
    this.backEl.textContent = "\u2190 Back to Notes";
    this.backEl.addEventListener("click", () => this.showNotes());
    this.backEl.style.display = "none";

    this.listEl = document.createElement("div");
    this.listEl.className = "sidebar-list";

    this.trashEl = document.createElement("div");
    this.trashEl.className = "sidebar-trash";
    this.trashEl.addEventListener("click", options.onTrashClick);

    // Selection toolbar at the bottom
    this.selectionBarEl = document.createElement("div");
    this.selectionBarEl.className = "sidebar-selection-bar";
    this.selectionBarEl.style.display = "none";

    this.el.append(this.searchWrap, this.backEl, this.listEl, this.trashEl, this.selectionBarEl);
  }

  update(notes: Note[], trashedNotes: Note[], activeNoteId: string | null, isDraft = false): void {
    this.notes = notes;
    this.trashedNotes = trashedNotes;
    this.trashCount = trashedNotes.length;
    this.activeNoteId = activeNoteId;
    this.showDraft = isDraft;
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

  private enterSelectionMode(): void {
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
      this.trashEl.style.display = "none";
      this.selectionBarEl.style.display = "none";
      this.renderTrashList();
    } else {
      this.searchWrap.style.display = "";
      this.backEl.style.display = "none";
      this.trashEl.style.display = this.selectionMode ? "none" : "";
      this.selectBtn.style.display = this.selectionMode ? "none" : "";
      this.renderNotesList();
      this.renderSelectionBar();
    }
  }

  private renderNotesList(): void {
    // Ghost note for unsaved draft
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
    this.trashEl.textContent = `\uD83D\uDDD1 Trash${this.trashCount > 0 ? ` (${this.trashCount})` : ""}`;
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
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => this.exitSelectionMode());

    this.selectionBarEl.append(countSpan, exportBtn, trashBtn, cancelBtn);
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
        onClick: () => {}, // No selecting trashed notes
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
