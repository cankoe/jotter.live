export class SyncBar {
  readonly el: HTMLElement;
  private textEl: HTMLElement;
  private fillEl: HTMLElement;

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "sync-toast hidden";

    this.textEl = document.createElement("div");
    this.textEl.className = "sync-toast-text";

    const track = document.createElement("div");
    track.className = "sync-toast-track";
    this.fillEl = document.createElement("div");
    this.fillEl.className = "sync-toast-fill";
    track.appendChild(this.fillEl);

    this.el.append(this.textEl, track);
    document.body.appendChild(this.el);
  }

  show(text: string): void {
    this.el.classList.remove("hidden");
    this.textEl.textContent = text;
    this.fillEl.style.width = "0%";
    this.fillEl.classList.add("indeterminate");
  }

  update(text: string, progress: number): void {
    this.textEl.textContent = text;
    this.fillEl.classList.remove("indeterminate");
    this.fillEl.style.width = `${Math.min(100, Math.max(0, progress))}%`;
  }

  hide(): void {
    this.el.classList.add("hidden");
    this.fillEl.classList.remove("indeterminate");
  }
}
