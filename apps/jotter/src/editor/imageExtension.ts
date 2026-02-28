import { EditorView, Decoration, ViewPlugin, WidgetType } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import { RangeSet, type Range, Prec } from "@codemirror/state";
import type { ImageStore } from "../storage/images";

function isImageFilename(filename: string): boolean {
  return /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(filename);
}

class FileResolver {
  private cache = new Map<string, string>();
  private pending = new Map<string, Promise<string | undefined>>();
  private store: ImageStore;

  constructor(store: ImageStore) { this.store = store; }

  async resolve(filename: string): Promise<string | undefined> {
    if (this.cache.has(filename)) return this.cache.get(filename);
    if (this.pending.has(filename)) return this.pending.get(filename);
    const promise = this.store.retrieve(filename).then((blob) => {
      this.pending.delete(filename);
      if (blob) {
        const url = URL.createObjectURL(blob);
        this.cache.set(filename, url);
        return url;
      }
      return undefined;
    });
    this.pending.set(filename, promise);
    return promise;
  }

  revokeAll(): void {
    for (const url of this.cache.values()) URL.revokeObjectURL(url);
    this.cache.clear();
  }
}

/** Widget for inline image preview (clickable — opens in new tab) */
class InlineImageWidget extends WidgetType {
  constructor(readonly filename: string, readonly altText: string, readonly resolver: FileResolver) { super(); }

  toDOM(): HTMLElement {
    const wrapper = document.createElement("span");
    wrapper.className = "jotter-inline-image";
    const img = document.createElement("img");
    img.alt = this.altText;
    img.style.maxWidth = "100%";
    img.style.borderRadius = "6px";
    img.style.margin = "4px 0";
    img.style.display = "block";
    img.style.cursor = "pointer";
    img.title = `${this.filename} — click to open`;
    this.resolver.resolve(this.filename).then((url) => {
      if (url) {
        img.src = url;
        img.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.open(url, "_blank");
        });
      } else {
        img.alt = `[Missing: ${this.filename}]`;
      }
    });
    wrapper.appendChild(img);
    return wrapper;
  }

  eq(other: InlineImageWidget): boolean { return this.filename === other.filename; }
}

/** Widget for non-image file links (clickable chip — opens in new tab) */
class FileChipWidget extends WidgetType {
  constructor(readonly filename: string, readonly linkText: string, readonly resolver: FileResolver) { super(); }

  toDOM(): HTMLElement {
    const chip = document.createElement("span");
    chip.className = "jotter-file-chip";
    chip.title = `${this.filename} — click to open`;
    chip.style.display = "inline-flex";
    chip.style.alignItems = "center";
    chip.style.gap = "4px";
    chip.style.padding = "2px 8px";
    chip.style.borderRadius = "4px";
    chip.style.backgroundColor = "rgba(59, 130, 246, 0.1)";
    chip.style.color = "var(--accent, #3b82f6)";
    chip.style.cursor = "pointer";
    chip.style.fontSize = "0.9em";

    const icon = document.createElement("span");
    icon.textContent = "\uD83D\uDCCE";
    icon.style.fontSize = "0.85em";

    const text = document.createElement("span");
    text.textContent = this.linkText || this.filename;

    chip.append(icon, text);

    this.resolver.resolve(this.filename).then((url) => {
      if (url) {
        chip.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.open(url, "_blank");
        });
      }
    });

    return chip;
  }

  eq(other: FileChipWidget): boolean { return this.filename === other.filename; }
}

// Matches ![alt](jotter-file://filename) — image syntax
const IMAGE_LINK_RE = /!\[([^\]]*)\]\(jotter-file:\/\/([^)]+)\)/g;
// Matches [text](jotter-file://filename) — regular link syntax (non-image)
const FILE_LINK_RE = /(?<!!)\[([^\]]*)\]\(jotter-file:\/\/([^)]+)\)/g;

function buildFileDecorations(view: EditorView, resolver: FileResolver): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const doc = view.state.doc;
  const cursorLine = doc.lineAt(view.state.selection.main.head).number;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    if (i === cursorLine) continue;
    let match;

    // Image links — render as inline images
    IMAGE_LINK_RE.lastIndex = 0;
    while ((match = IMAGE_LINK_RE.exec(line.text)) !== null) {
      const from = line.from + match.index;
      const to = from + match[0].length;
      const filename = match[2];
      if (isImageFilename(filename)) {
        decorations.push(Decoration.replace({
          widget: new InlineImageWidget(filename, match[1], resolver),
        }).range(from, to));
      } else {
        decorations.push(Decoration.replace({
          widget: new FileChipWidget(filename, match[1], resolver),
        }).range(from, to));
      }
    }

    // Regular file links — render as clickable chips
    FILE_LINK_RE.lastIndex = 0;
    while ((match = FILE_LINK_RE.exec(line.text)) !== null) {
      const from = line.from + match.index;
      const to = from + match[0].length;
      decorations.push(Decoration.replace({
        widget: new FileChipWidget(match[2], match[1], resolver),
      }).range(from, to));
    }
  }

  return RangeSet.of(decorations);
}

export function createImageRenderExtension(store: ImageStore) {
  const resolver = new FileResolver(store);

  class FileDecoPlugin {
    decorations: DecorationSet;
    private _view: EditorView;

    constructor(view: EditorView) {
      this._view = view;
      this.decorations = buildFileDecorations(view, resolver);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildFileDecorations(update.view, resolver);
      }
    }

    destroy() { resolver.revokeAll(); }
  }

  return ViewPlugin.fromClass(FileDecoPlugin, {
    decorations: (v) => v.decorations,
  });
}

export function createImagePasteHandler(store: ImageStore) {
  return Prec.highest(EditorView.domEventHandlers({
    paste(event: ClipboardEvent, view: EditorView) {
      const items = event.clipboardData?.items;
      if (!items) return false;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          event.preventDefault();
          const file = item.getAsFile();
          if (file) {
            store.store(file, file.name).then((filename) => {
              const md = `![image](jotter-file://${filename})`;
              const { from, to } = view.state.selection.main;
              view.dispatch({
                changes: { from, to, insert: md },
                selection: { anchor: from + md.length },
              });
            });
          }
          return true;
        }
      }
      return false;
    },
  }));
}
