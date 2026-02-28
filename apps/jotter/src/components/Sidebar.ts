import type { Note } from "../storage/db";
import { groupByDate } from "../utils/dates";
import { searchNotes } from "../utils/search";
import { createNoteItem } from "./NoteItem";

export interface SidebarOptions {
  onNoteSelect: (id: string) => void;
  onNoteActionClick: (id: string, e: MouseEvent) => void;
  onTrashClick: () => void;
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
    this.searchWrap.appendChild(this.searchInput);

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

    this.el.append(this.searchWrap, this.backEl, this.listEl, this.trashEl);
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
    this.render();
  }

  showNotes(): void {
    this.mode = "notes";
    this.searchQuery = "";
    this.searchInput.value = "";
    this.render();
  }

  private render(): void {
    this.listEl.innerHTML = "";

    if (this.mode === "trash") {
      this.searchWrap.style.display = "none";
      this.backEl.style.display = "";
      this.trashEl.style.display = "none";
      this.renderTrashList();
    } else {
      this.searchWrap.style.display = "";
      this.backEl.style.display = "none";
      this.trashEl.style.display = "";
      this.renderNotesList();
    }
  }

  private renderNotesList(): void {
    // Ghost note for unsaved draft
    if (this.showDraft && !this.searchQuery) {
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
        }));
      }
    }
    this.trashEl.textContent = `\uD83D\uDDD1 Trash${this.trashCount > 0 ? ` (${this.trashCount})` : ""}`;
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
