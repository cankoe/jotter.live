export interface ToastOptions {
  message: string;
  action?: { label: string; onClick: () => void };
  duration?: number;
}

export function showToast(options: ToastOptions): void {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const el = document.createElement("div");
  el.className = "toast";

  const text = document.createElement("span");
  text.textContent = options.message;
  el.appendChild(text);

  if (options.action) {
    const btn = document.createElement("button");
    btn.className = "toast-btn";
    btn.textContent = options.action.label;
    btn.addEventListener("click", () => { options.action!.onClick(); el.remove(); });
    el.appendChild(btn);
  }

  document.body.appendChild(el);
  if (options.duration !== 0) {
    setTimeout(() => el.remove(), options.duration ?? 5000);
  }
}
