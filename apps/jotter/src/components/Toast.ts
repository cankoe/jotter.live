export interface ToastOptions {
  message: string;
  action?: { label: string; onClick: () => void };
  duration?: number;
}

const TOAST_GAP = 8;

function repositionToasts(): void {
  const toasts = Array.from(document.querySelectorAll<HTMLElement>(".toast"));
  // Check if sync toast is visible — stack above it
  const syncToast = document.querySelector<HTMLElement>(".sync-toast:not(.hidden)");
  let bottom = 20;
  if (syncToast) {
    bottom = 20 + syncToast.offsetHeight + TOAST_GAP;
  }
  for (let i = toasts.length - 1; i >= 0; i--) {
    toasts[i].style.bottom = `${bottom}px`;
    bottom += toasts[i].offsetHeight + TOAST_GAP;
  }
}

function removeToast(el: HTMLElement): void {
  el.remove();
  repositionToasts();
}

export function showToast(options: ToastOptions): void {
  const el = document.createElement("div");
  el.className = "toast";

  const text = document.createElement("span");
  text.textContent = options.message;
  el.appendChild(text);

  if (options.action) {
    const btn = document.createElement("button");
    btn.className = "toast-btn";
    btn.textContent = options.action.label;
    btn.addEventListener("click", () => { options.action!.onClick(); removeToast(el); });
    el.appendChild(btn);
  }

  document.body.appendChild(el);
  repositionToasts();

  if (options.duration !== 0) {
    setTimeout(() => { if (el.parentNode) removeToast(el); }, options.duration ?? 5000);
  }
}
