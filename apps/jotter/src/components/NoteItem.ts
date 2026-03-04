import type { Note } from "../storage/db";

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export interface NoteItemOptions {
  note: Note;
  active: boolean;
  onClick: (id: string) => void;
  onActionClick: (id: string, e: MouseEvent) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export function createNoteItem(options: NoteItemOptions): HTMLElement {
  const { note, active, onClick, onActionClick, selectionMode, selected, onToggleSelect } = options;
  const el = document.createElement("div");
  el.className = `note-item${active ? " active" : ""}${selected ? " selected" : ""}`;
  el.dataset.noteId = note.id;

  // Checkbox for selection mode
  if (selectionMode) {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "note-item-checkbox";
    checkbox.checked = !!selected;
    checkbox.addEventListener("click", (e) => {
      e.stopPropagation();
      onToggleSelect?.(note.id);
    });
    el.appendChild(checkbox);
  }

  // Content wrapper
  const content = document.createElement("div");
  content.className = "note-item-content";

  const title = document.createElement("div");
  title.className = "note-item-title";
  title.textContent = note.title || "Untitled";

  const preview = document.createElement("div");
  preview.className = "note-item-preview";
  const lines = note.content.split("\n").filter((l) => l.trim());
  preview.textContent = lines[1]?.trim() || "";

  const time = document.createElement("div");
  time.className = "note-item-time";
  time.textContent = relativeTime(note.createdAt);

  content.append(title, preview, time);

  // Actions wrapper
  const actions = document.createElement("div");
  actions.className = "note-item-actions";

  const actionBtn = document.createElement("button");
  actionBtn.className = "note-item-action-btn";
  actionBtn.textContent = "\u00B7\u00B7\u00B7";
  actionBtn.title = "Note actions";
  actionBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onActionClick(note.id, e);
  });
  actions.appendChild(actionBtn);

  el.append(content, actions);

  if (selectionMode) {
    el.addEventListener("click", () => onToggleSelect?.(note.id));
  } else {
    // Long-press shows the note action menu on mobile (replaces three-dot button)
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    let longPressed = false;

    el.addEventListener("touchstart", (e) => {
      longPressed = false;
      const touch = e.touches[0];
      longPressTimer = setTimeout(() => {
        longPressed = true;
        // Create a synthetic MouseEvent at the touch position for the context menu
        const syntheticEvent = new MouseEvent("click", {
          clientX: touch.clientX,
          clientY: touch.clientY,
        });
        onActionClick(note.id, syntheticEvent);
      }, 500);
    }, { passive: true });

    el.addEventListener("touchmove", () => {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    }, { passive: true });

    el.addEventListener("touchend", () => {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    }, { passive: true });

    // Tap to select note — use touchend for immediate response on mobile
    let touchStartY = 0;
    el.addEventListener("touchstart", (e) => {
      touchStartY = e.touches[0].clientY;
    }, { passive: true });
    el.addEventListener("touchend", (e) => {
      if (longPressed) { longPressed = false; return; }
      const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
      if (dy < 10) {
        e.preventDefault();
        onClick(note.id);
      }
    });
    // Keep click for mouse/desktop
    el.addEventListener("click", () => onClick(note.id));
  }

  return el;
}
