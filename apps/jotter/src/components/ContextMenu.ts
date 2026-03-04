export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

const isMobile = () => window.matchMedia("(max-width: 640px)").matches;

export function showContextMenu(items: ContextMenuItem[], x: number, y: number): void {
  // Remove any existing context menu or action sheet
  document.querySelector(".context-menu")?.remove();
  document.querySelector(".action-sheet-backdrop")?.remove();

  if (isMobile()) {
    showActionSheet(items);
  } else {
    showDropdownMenu(items, x, y);
  }
}

function showDropdownMenu(items: ContextMenuItem[], x: number, y: number): void {
  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.style.position = "fixed";
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.style.zIndex = "1000";
  menu.style.background = "var(--bg)";
  menu.style.border = "1px solid var(--border)";
  menu.style.borderRadius = "var(--radius)";
  menu.style.boxShadow = "var(--shadow)";
  menu.style.padding = "4px 0";
  menu.style.minWidth = "160px";

  for (const item of items) {
    const el = document.createElement("div");
    el.className = "context-menu-item";
    el.textContent = item.label;
    el.style.padding = "6px 12px";
    el.style.cursor = "pointer";
    el.style.fontSize = "13px";
    el.style.color = item.danger ? "var(--danger)" : "var(--text)";
    el.addEventListener("mouseenter", () => { el.style.background = "var(--bg-hover)"; });
    el.addEventListener("mouseleave", () => { el.style.background = "transparent"; });
    el.addEventListener("click", () => { item.onClick(); menu.remove(); });
    menu.appendChild(el);
  }

  document.body.appendChild(menu);

  const close = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node)) {
      menu.remove();
      document.removeEventListener("click", close);
    }
  };
  setTimeout(() => document.addEventListener("click", close), 0);
}

function showActionSheet(items: ContextMenuItem[]): void {
  const backdrop = document.createElement("div");
  backdrop.className = "action-sheet-backdrop";

  const sheet = document.createElement("div");
  sheet.className = "action-sheet";

  for (const item of items) {
    const btn = document.createElement("button");
    btn.className = `action-sheet-item${item.danger ? " danger" : ""}`;
    btn.textContent = item.label;
    btn.addEventListener("click", () => {
      item.onClick();
      backdrop.remove();
    });
    sheet.appendChild(btn);
  }

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "action-sheet-cancel";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", () => backdrop.remove());
  sheet.appendChild(cancelBtn);

  backdrop.appendChild(sheet);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.remove();
  });

  document.body.appendChild(backdrop);
}
