export class SyncBar {
  readonly el: HTMLElement;
  private textEl: HTMLElement;
  private barEl: HTMLElement;
  private fillEl: HTMLElement;

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "sync-bar hidden";

    this.textEl = document.createElement("span");
    this.textEl.className = "sync-bar-text";

    this.barEl = document.createElement("div");
    this.barEl.className = "sync-bar-track";
    this.fillEl = document.createElement("div");
    this.fillEl.className = "sync-bar-fill";
    this.barEl.appendChild(this.fillEl);

    this.el.append(this.textEl, this.barEl);
  }

  show(text: string, progress?: number): void {
    this.el.classList.remove("hidden");
    this.textEl.textContent = text;
    if (progress !== undefined) {
      this.fillEl.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    } else {
      // Indeterminate — animate
      this.fillEl.style.width = "";
      this.fillEl.classList.add("indeterminate");
    }
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
