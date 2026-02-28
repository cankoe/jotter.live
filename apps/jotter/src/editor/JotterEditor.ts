import { CaptureEditor } from "@capture/editor";
import { StateEffect } from "@codemirror/state";
import { createImageRenderExtension, createImagePasteHandler } from "./imageExtension";
import type { ImageStore } from "../storage/images";

export interface JotterEditorOptions {
  content?: string;
  placeholder?: string;
  autoFocus?: boolean;
  existingTags?: string[];
  onChange?: (content: string) => void;
  onImagePaste?: (blob: Blob) => Promise<string>;
  imageStore?: ImageStore;
}

export class JotterEditor {
  private editor: CaptureEditor;
  private container: HTMLElement;
  private options: JotterEditorOptions;

  constructor(container: HTMLElement, options: JotterEditorOptions = {}) {
    this.container = container;
    this.options = options;

    this.editor = new CaptureEditor(container, {
      content: options.content || "",
      placeholder: options.placeholder || "Start typing, paste anything...",
      autoFocus: options.autoFocus ?? true,
      contacts: [], // No mentions in Jotter
      existingTags: options.existingTags || [],
      onChange: options.onChange,
    });

    if (options.imageStore) {
      const view = this.editor.getEditorView();
      view.dispatch({
        effects: StateEffect.appendConfig.of([
          createImageRenderExtension(options.imageStore),
          createImagePasteHandler(options.imageStore),
        ]),
      });
    }

    this.setupDragDrop();
  }

  private setupDragDrop(): void {
    const view = this.editor.getEditorView();
    const dom = view.dom;

    dom.addEventListener("dragover", (e) => {
      e.preventDefault();
      dom.classList.add("drag-over");
    });

    dom.addEventListener("dragleave", () => {
      dom.classList.remove("drag-over");
    });

    dom.addEventListener("drop", async (e) => {
      e.preventDefault();
      dom.classList.remove("drag-over");
      if (!this.options.onImagePaste) return;
      const files = e.dataTransfer?.files;
      if (!files) return;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith("image/")) {
          const ref = await this.options.onImagePaste(file);
          this.insertAtCursor(`![image](jotter-file://${ref})`);
        }
      }
    });
  }

  private insertAtCursor(text: string): void {
    const view = this.editor.getEditorView();
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length },
    });
  }

  getContent(): string { return this.editor.getContent(); }
  setContent(content: string): void { this.editor.setContent(content); }
  updateTags(tags: string[]): void { this.editor.updateTags(tags); }
  focus(): void { this.editor.focus(); }
  getEditorView() { return this.editor.getEditorView(); }
  destroy(): void { this.editor.destroy(); }
}
