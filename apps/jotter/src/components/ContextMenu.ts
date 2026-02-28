export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

export function showContextMenu(items: ContextMenuItem[], x: number, y: number): void {
  // Remove any existing context menu
  const existing = document.querySelector(".context-menu");
  if (existing) existing.remove();

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

  // Close on click outside
  const close = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node)) {
      menu.remove();
      document.removeEventListener("click", close);
    }
  };
  // Delay to avoid immediate close from the same right-click
  setTimeout(() => document.addEventListener("click", close), 0);
}
