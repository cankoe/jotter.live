export interface ResizeHandleOptions {
  direction: "left" | "right";
  targetEl: HTMLElement;
  cssVar: string;
  minSize: number;
  maxSize: number;
  storageKey: string;
}

export class ResizeHandle {
  readonly el: HTMLElement;

  constructor(private options: ResizeHandleOptions) {
    this.el = document.createElement("div");
    this.el.className = "resize-handle";

    const saved = localStorage.getItem(options.storageKey);
    if (saved) {
      const px = parseInt(saved, 10);
      if (px >= options.minSize && px <= options.maxSize) {
        document.documentElement.style.setProperty(options.cssVar, `${px}px`);
      }
    }

    this.el.addEventListener("mousedown", (e) => this.onMouseDown(e));
  }

  private onMouseDown(startEvent: MouseEvent): void {
    startEvent.preventDefault();
    const startX = startEvent.clientX;
    const startWidth = this.options.targetEl.getBoundingClientRect().width;

    const onMouseMove = (e: MouseEvent) => {
      let delta = e.clientX - startX;
      if (this.options.direction === "right") delta = -delta;
      const newWidth = Math.round(
        Math.max(this.options.minSize, Math.min(this.options.maxSize, startWidth + delta))
      );
      document.documentElement.style.setProperty(this.options.cssVar, `${newWidth}px`);
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      const finalWidth = this.options.targetEl.getBoundingClientRect().width;
      localStorage.setItem(this.options.storageKey, String(Math.round(finalWidth)));
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }
}
