export interface LandingOverlayOptions {
  onDismiss: () => void;
}

/**
 * Controls the #landing overlay in index.html.
 * For returning users: already hidden by inline script (no flicker).
 * For first visit: visible from page load, dismissed on CTA click.
 * Can be re-shown from Settings > About.
 */
export class LandingOverlay {
  private el: HTMLElement;
  private callback: () => void;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(options: LandingOverlayOptions) {
    this.el = document.getElementById("landing")!;
    this.callback = options.onDismiss;

    const cta = document.getElementById("landing-cta");
    if (cta) {
      cta.addEventListener("click", () => this.dismiss());
    }
  }

  /** Show the landing overlay */
  show(): void {
    this.el.classList.remove("hidden", "dismissing");
    this.el.style.display = "flex";
    this.el.scrollTop = 0;

    this.keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") {
        this.dismiss();
      }
    };
    document.addEventListener("keydown", this.keyHandler);
  }

  /** Check if landing is currently visible (not hidden by class or inline script) */
  isVisible(): boolean {
    return getComputedStyle(this.el).display !== "none";
  }

  private dismiss(): void {
    if (this.keyHandler) {
      document.removeEventListener("keydown", this.keyHandler);
      this.keyHandler = null;
    }
    this.el.classList.add("dismissing");
    const done = () => {
      this.el.style.display = "none";
      this.el.classList.add("hidden");
      this.el.classList.remove("dismissing");
      this.callback();
    };
    this.el.addEventListener("transitionend", done, { once: true });
    setTimeout(() => {
      if (!this.el.classList.contains("hidden")) done();
    }, 600);
  }
}
