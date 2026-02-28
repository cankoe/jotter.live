import { JotterEditor } from "../editor/JotterEditor";
import type { ImageStore } from "../storage/images";

export interface EditorPaneOptions {
  onChange: (content: string) => void;
  onImagePaste: (blob: Blob) => Promise<string>;
  onImageUpload?: (filename: string) => void;
  imageStore: ImageStore;
}

// SVG icons for toolbar buttons (16x16, stroke-based)
const ICONS: Record<string, string> = {
  bold: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="0" stroke-linecap="round"><text x="2" y="13" font-size="14" font-weight="800" font-family="serif" fill="currentColor">B</text></svg>`,
  italic: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="0"><text x="4" y="13" font-size="14" font-style="italic" font-family="serif" fill="currentColor">I</text></svg>`,
  strikethrough: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><text x="2.5" y="13" font-size="14" font-family="serif" fill="currentColor" stroke-width="0">S</text><line x1="1" y1="8" x2="15" y2="8"/></svg>`,
  code: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="5,3 1,8 5,13"/><polyline points="11,3 15,8 11,13"/></svg>`,
  heading: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="0"><text x="1" y="13" font-size="14" font-weight="700" font-family="sans-serif" fill="currentColor">H</text></svg>`,
  checklist: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="1" width="6" height="6" rx="1"/><polyline points="2.5,4 4,5.5 6,2.5"/><line x1="10" y1="4" x2="15" y2="4"/><rect x="1" y="9" width="6" height="6" rx="1"/><line x1="10" y1="12" x2="15" y2="12"/></svg>`,
  link: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 8.5a3 3 0 004.2.3l2-2a3 3 0 00-4.2-4.2l-1.2 1.1"/><path d="M9.5 7.5a3 3 0 00-4.2-.3l-2 2a3 3 0 004.2 4.2l1.1-1.1"/></svg>`,
  quote: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="0"><text x="0" y="14" font-size="18" font-family="serif" fill="currentColor">\u201C</text></svg>`,
  image: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><circle cx="5.5" cy="6.5" r="1.5"/><path d="M1.5 11l3.5-3.5 2.5 2.5 3-3 4 4"/></svg>`,
  bulletList: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="3" cy="4" r="1.2" fill="currentColor" stroke="none"/><circle cx="3" cy="8" r="1.2" fill="currentColor" stroke="none"/><circle cx="3" cy="12" r="1.2" fill="currentColor" stroke="none"/><line x1="7" y1="4" x2="14" y2="4"/><line x1="7" y1="8" x2="14" y2="8"/><line x1="7" y1="12" x2="14" y2="12"/></svg>`,
  codeBlock: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="1.5" width="13" height="13" rx="2"/><polyline points="5,6 3.5,8 5,10"/><polyline points="11,6 12.5,8 11,10"/><line x1="9" y1="5" x2="7" y2="11"/></svg>`,
  table: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="2" width="13" height="12" rx="1.5"/><line x1="1.5" y1="6" x2="14.5" y2="6"/><line x1="1.5" y1="10" x2="14.5" y2="10"/><line x1="6" y1="2" x2="6" y2="14"/><line x1="10.5" y1="2" x2="10.5" y2="14"/></svg>`,
};

interface ToolbarAction {
  icon: string;
  title: string;
  shortcut?: string;
  action: (pane: EditorPane) => void;
}

const SEPARATOR = "separator";

const TOOLBAR_ITEMS: (ToolbarAction | typeof SEPARATOR)[] = [
  {
    icon: ICONS.heading,
    title: "Heading",
    action: (p) => p.toggleLinePrefix("# "),
  },
  {
    icon: ICONS.bold,
    title: "Bold",
    shortcut: "Cmd+B",
    action: (p) => p.wrapSelection("**"),
  },
  {
    icon: ICONS.italic,
    title: "Italic",
    shortcut: "Cmd+I",
    action: (p) => p.wrapSelection("*"),
  },
  {
    icon: ICONS.strikethrough,
    title: "Strikethrough",
    action: (p) => p.wrapSelection("~~"),
  },
  SEPARATOR,
  {
    icon: ICONS.code,
    title: "Inline code",
    action: (p) => p.wrapSelection("`"),
  },
  {
    icon: ICONS.codeBlock,
    title: "Code block",
    action: (p) => p.insertCodeBlock(),
  },
  {
    icon: ICONS.link,
    title: "Link",
    action: (p) => p.insertLink(),
  },
  SEPARATOR,
  {
    icon: ICONS.quote,
    title: "Quote",
    action: (p) => p.toggleLinePrefix("> "),
  },
  {
    icon: ICONS.bulletList,
    title: "Bullet list",
    action: (p) => p.toggleLinePrefix("- "),
  },
  {
    icon: ICONS.checklist,
    title: "Checklist",
    action: (p) => p.toggleLinePrefix("- [ ] "),
  },
  {
    icon: ICONS.table,
    title: "Insert table",
    action: (p) => p.insertTable(),
  },
  SEPARATOR,
  {
    icon: ICONS.image,
    title: "Add image",
    action: (p) => p.openImagePicker(),
  },
];

export class EditorPane {
  readonly el: HTMLElement;
  private editorWrap: HTMLElement;
  private editor: JotterEditor | null = null;
  private options: EditorPaneOptions;

  constructor(options: EditorPaneOptions) {
    this.options = options;
    this.el = document.createElement("main");
    this.el.className = "editor-pane";

    // Toolbar
    const toolbar = document.createElement("div");
    toolbar.className = "editor-toolbar";

    for (const item of TOOLBAR_ITEMS) {
      if (item === SEPARATOR) {
        const sep = document.createElement("div");
        sep.className = "editor-toolbar-sep";
        toolbar.appendChild(sep);
        continue;
      }
      const btn = document.createElement("button");
      btn.className = "editor-toolbar-btn";
      btn.title = item.shortcut ? `${item.title} (${item.shortcut})` : item.title;
      btn.innerHTML = item.icon;
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault(); // Prevent editor blur
      });
      btn.addEventListener("click", () => {
        item.action(this);
        this.editor?.focus();
      });
      toolbar.appendChild(btn);
    }

    // Editor container
    this.editorWrap = document.createElement("div");
    this.editorWrap.className = "editor-wrap";

    this.el.append(toolbar, this.editorWrap);

    // Click anywhere in the editor wrap to focus
    this.editorWrap.addEventListener("click", (e) => {
      if (!this.editor) return;
      const target = e.target as HTMLElement;
      if (!target.closest(".cm-content")) {
        this.editor.focus();
      }
    });
  }

  openImagePicker(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/*";
    input.addEventListener("change", async () => {
      if (!input.files) return;
      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i];
        if (file.type.startsWith("image/")) {
          const filename = await this.options.onImagePaste(file);
          this.insertAtCursor(`![image](jotter-file://${filename})\n`);
          this.options.onImageUpload?.(filename);
        }
      }
    });
    input.click();
  }

  /** Wrap selection with a symmetric marker (e.g. ** for bold, * for italic) */
  wrapSelection(marker: string): void {
    if (!this.editor) return;
    const view = this.editor.getEditorView();
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to);

    if (selected.startsWith(marker) && selected.endsWith(marker) && selected.length >= marker.length * 2) {
      // Unwrap
      const inner = selected.slice(marker.length, -marker.length);
      view.dispatch({
        changes: { from, to, insert: inner },
        selection: { anchor: from, head: from + inner.length },
      });
    } else if (from === to) {
      // No selection — insert markers and place cursor between
      const text = `${marker}${marker}`;
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + marker.length },
      });
    } else {
      // Wrap selection
      const text = `${marker}${selected}${marker}`;
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from, head: from + text.length },
      });
    }
  }

  /** Toggle a line prefix (e.g. "# ", "> ", "- [ ] ") */
  toggleLinePrefix(prefix: string): void {
    if (!this.editor) return;
    const view = this.editor.getEditorView();
    const { from, to } = view.state.selection.main;
    const line = view.state.doc.lineAt(from);

    if (line.text.startsWith(prefix)) {
      // Remove prefix
      view.dispatch({
        changes: { from: line.from, to: line.from + prefix.length, insert: "" },
      });
    } else {
      // Add prefix
      view.dispatch({
        changes: { from: line.from, to: line.from, insert: prefix },
      });
    }
  }

  /** Insert a markdown link */
  insertLink(): void {
    if (!this.editor) return;
    const view = this.editor.getEditorView();
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to);

    if (selected) {
      // Wrap selection as link text
      const text = `[${selected}](url)`;
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + selected.length + 3, head: from + selected.length + 6 },
      });
    } else {
      const text = "[text](url)";
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + 1, head: from + 5 },
      });
    }
  }

  /** Insert a fenced code block */
  insertCodeBlock(): void {
    if (!this.editor) return;
    const view = this.editor.getEditorView();
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to);

    if (selected) {
      const text = `\`\`\`\n${selected}\n\`\`\``;
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + 4, head: from + 4 + selected.length },
      });
    } else {
      const text = "```\n\n```";
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + 4 },
      });
    }
  }

  /** Insert a markdown table */
  insertTable(): void {
    if (!this.editor) return;
    const view = this.editor.getEditorView();
    const { from, to } = view.state.selection.main;
    const table = "| Header | Header | Header |\n| ------ | ------ | ------ |\n| Cell   | Cell   | Cell   |\n| Cell   | Cell   | Cell   |";
    view.dispatch({
      changes: { from, to, insert: table },
      selection: { anchor: from + 2, head: from + 8 },
    });
  }

  loadNote(content: string): void {
    if (this.editor) {
      this.editor.setContent(content);
    } else {
      this.editor = new JotterEditor(this.editorWrap, {
        content,
        onChange: this.options.onChange,
        onImagePaste: this.options.onImagePaste,
        imageStore: this.options.imageStore,
      });
    }
    this.editor.focus();
  }

  getContent(): string {
    return this.editor?.getContent() || "";
  }

  focus(): void {
    this.editor?.focus();
  }

  updateTags(tags: string[]): void {
    this.editor?.updateTags(tags);
  }

  insertAtCursor(text: string): void {
    if (!this.editor) return;
    const view = this.editor.getEditorView();
    const { from, to } = view.state.selection.main;
    const insert = text + "\n";
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + insert.length },
    });
    this.editor.focus();
  }

  destroy(): void {
    this.editor?.destroy();
    this.editor = null;
  }
}
