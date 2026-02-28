/**
 * Live Preview Extension for CodeMirror 6
 * 
 * Provides live preview decorations for markdown:
 * - Hashtags styling
 * - URL chips
 * - Checkboxes
 * - Bold/italic/strikethrough
 * - Code blocks
 * - Headings
 * - Blockquotes
 */

import { EditorView, Decoration, ViewPlugin, WidgetType } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { RangeSet, Range } from "@codemirror/state";

// CSS class to hide markdown syntax
const hiddenClass = Decoration.mark({ class: "cm-formatting-hidden" });

// Decoration for different markdown elements
const boldClass = Decoration.mark({ class: "cm-bold" });
const italicClass = Decoration.mark({ class: "cm-italic" });
const strikeClass = Decoration.mark({ class: "cm-strikethrough" });
const codeClass = Decoration.mark({ class: "cm-code" });
const hashtagClass = Decoration.mark({ class: "cm-hashtag" });
const urlChipClass = Decoration.mark({ class: "cm-url-chip" });
const blockquoteClass = Decoration.mark({ class: "cm-blockquote" });
const fencedCodeClass = Decoration.mark({ class: "cm-fenced-code" });
const fencedCodeLineClass = Decoration.line({ class: "cm-fenced-code-line" });

// Callback for checkbox toggles (set externally)
let checkboxToggleCallback: ((pos: number, checked: boolean) => void) | undefined;

export function setCheckboxToggleCallback(callback: (pos: number, checked: boolean) => void): void {
  checkboxToggleCallback = callback;
}

// Widget for checkboxes
class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly pos: number,
    readonly onToggle?: (pos: number, checked: boolean) => void
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = `cm-checkbox ${this.checked ? "checked" : ""}`;
    span.textContent = this.checked ? "☑" : "☐";
    span.style.cursor = "pointer";
    span.style.marginRight = "0.3em";
    span.style.fontSize = "1.1em";
    
    if (this.onToggle) {
      span.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onToggle!(this.pos, !this.checked);
      });
    }
    
    return span;
  }

  eq(other: CheckboxWidget): boolean {
    return this.checked === other.checked && this.pos === other.pos;
  }
}

// Widget for URL chips
class URLChipWidget extends WidgetType {
  constructor(readonly url: string, readonly domain: string) {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-url-chip-widget";
    
    // Favicon
    const favicon = document.createElement("img");
    favicon.src = `https://www.google.com/s2/favicons?domain=${this.domain}&sz=16`;
    favicon.style.width = "14px";
    favicon.style.height = "14px";
    favicon.style.marginRight = "4px";
    favicon.style.verticalAlign = "middle";
    
    // Domain text
    const text = document.createElement("span");
    text.textContent = this.domain;
    
    span.appendChild(favicon);
    span.appendChild(text);
    
    span.style.backgroundColor = "rgba(59, 130, 246, 0.1)";
    span.style.color = "var(--accent, #3b82f6)";
    span.style.padding = "0.1em 0.4em";
    span.style.borderRadius = "4px";
    span.style.fontSize = "0.9em";
    span.style.cursor = "pointer";
    span.title = this.url;
    
    span.addEventListener("click", (e) => {
      e.preventDefault();
      window.open(this.url, "_blank", "noopener,noreferrer");
    });
    
    return span;
  }

  eq(other: URLChipWidget): boolean {
    return this.url === other.url;
  }
}

// Get the line number for a position
function getLineAt(view: EditorView, pos: number): number {
  return view.state.doc.lineAt(pos).number;
}

// Check if cursor is on the same line (always false in read-only mode)
function cursorOnLine(view: EditorView, from: number, to: number): boolean {
  // In read-only mode, always return false to hide all syntax
  if (view.state.readOnly) {
    return false;
  }
  const cursorLine = getLineAt(view, view.state.selection.main.head);
  const fromLine = getLineAt(view, from);
  const toLine = getLineAt(view, to);
  return cursorLine >= fromLine && cursorLine <= toLine;
}

// Extract domain from URL
function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Build decorations for live preview
function buildDecorations(view: EditorView): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const doc = view.state.doc;

  // Process each line for custom patterns
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const lineText = line.text;
    const lineFrom = line.from;

    const cursorOnThisLine = cursorOnLine(view, lineFrom, line.to);

    // Hashtags: #tag, #tag-name, or #tag/subtag
    const hashtagRegex = /(?:^|[^#\w])#([\w/-]+)/g;
    let match;
    while ((match = hashtagRegex.exec(lineText)) !== null) {
      const hashIndex = lineText.indexOf("#", match.index);
      const from = lineFrom + hashIndex;
      const to = from + 1 + match[1].length;
      decorations.push(hashtagClass.range(from, to));
    }

    // URLs: https://... or http://...
    const urlRegex = /https?:\/\/[^\s<>"]+/g;
    while ((match = urlRegex.exec(lineText)) !== null) {
      const from = lineFrom + match.index;
      const to = from + match[0].length;
      const url = match[0].replace(/[.,;:!?)]+$/, ""); // Clean trailing punctuation
      const domain = extractDomain(url);

      if (!cursorOnThisLine) {
        decorations.push(Decoration.replace({
          widget: new URLChipWidget(url, domain),
        }).range(from, from + url.length));
      } else {
        decorations.push(urlChipClass.range(from, from + url.length));
      }
    }
  }

  // Process syntax tree for standard markdown
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        const nodeFrom = node.from;
        const nodeTo = node.to;
        const isOnLine = cursorOnLine(view, nodeFrom, nodeTo);

        // Bold: **text** or __text__
        if (node.name === "StrongEmphasis") {
          if (!isOnLine) {
            decorations.push(hiddenClass.range(nodeFrom, nodeFrom + 2));
            decorations.push(hiddenClass.range(nodeTo - 2, nodeTo));
          }
          decorations.push(boldClass.range(nodeFrom + 2, nodeTo - 2));
        }

        // Italic: *text* or _text_
        if (node.name === "Emphasis") {
          if (!isOnLine) {
            decorations.push(hiddenClass.range(nodeFrom, nodeFrom + 1));
            decorations.push(hiddenClass.range(nodeTo - 1, nodeTo));
          }
          decorations.push(italicClass.range(nodeFrom + 1, nodeTo - 1));
        }

        // Strikethrough: ~~text~~
        if (node.name === "Strikethrough") {
          if (!isOnLine) {
            decorations.push(hiddenClass.range(nodeFrom, nodeFrom + 2));
            decorations.push(hiddenClass.range(nodeTo - 2, nodeTo));
          }
          decorations.push(strikeClass.range(nodeFrom + 2, nodeTo - 2));
        }

        // Inline code: `code`
        if (node.name === "InlineCode") {
          if (!isOnLine) {
            decorations.push(hiddenClass.range(nodeFrom, nodeFrom + 1));
            decorations.push(hiddenClass.range(nodeTo - 1, nodeTo));
          }
          decorations.push(codeClass.range(nodeFrom + 1, nodeTo - 1));
        }

        // Headings: hide # markers
        if (node.name.startsWith("ATXHeading")) {
          const text = view.state.sliceDoc(nodeFrom, nodeTo);
          const hashCount = text.match(/^#+/)?.[0].length || 0;
          if (hashCount > 0 && !isOnLine) {
            decorations.push(hiddenClass.range(nodeFrom, nodeFrom + hashCount + 1));
          }
        }

        // Task lists: - [ ] or - [x]
        if (node.name === "TaskMarker") {
          const text = view.state.sliceDoc(nodeFrom, nodeTo);
          const checked = text.includes("x") || text.includes("X");
          if (!isOnLine) {
            decorations.push(Decoration.replace({
              widget: new CheckboxWidget(checked, nodeFrom, checkboxToggleCallback),
            }).range(nodeFrom, nodeTo));
          }
        }

        // Blockquotes: style the content
        if (node.name === "Blockquote") {
          for (let pos = nodeFrom; pos < nodeTo;) {
            const line = doc.lineAt(pos);
            if (line.text.startsWith(">")) {
              if (!cursorOnLine(view, line.from, line.to)) {
                const markerEnd = line.text.startsWith("> ") ? 2 : 1;
                decorations.push(hiddenClass.range(line.from, line.from + markerEnd));
              }
              decorations.push(blockquoteClass.range(line.from, line.to));
            }
            pos = line.to + 1;
          }
        }

        // Fenced code blocks
        if (node.name === "FencedCode") {
          const text = view.state.sliceDoc(nodeFrom, nodeTo);
          const lines = text.split("\n");
          const isReadOnly = view.state.readOnly;

          if (lines.length >= 2) {
            const openingLine = doc.lineAt(nodeFrom);
            const closingLineNum = doc.lineAt(nodeTo).number;
            const openingLineNum = openingLine.number;
            const cursorLine = getLineAt(view, view.state.selection.main.head);

            // Hide opening ``` line
            if (isReadOnly || cursorLine !== openingLineNum) {
              const openEnd = openingLine.to;
              decorations.push(hiddenClass.range(nodeFrom, openEnd + 1));
            }

            // Hide closing ``` line
            if (isReadOnly || cursorLine !== closingLineNum) {
              if (lines.length > 1) {
                const closingLine = doc.line(closingLineNum);
                decorations.push(hiddenClass.range(closingLine.from, nodeTo));
              }
            }

            // Add code block styling to content lines
            for (let lineNum = openingLineNum + 1; lineNum < closingLineNum; lineNum++) {
              const codeLine = doc.line(lineNum);
              decorations.push(fencedCodeLineClass.range(codeLine.from));
            }
          }
        }
      },
    });
  }

  decorations.sort((a, b) => a.from - b.from || a.to - b.to);
  return RangeSet.of(decorations);
}

// ViewPlugin for live preview
export const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

// Theme for live preview elements
export const livePreviewTheme = EditorView.theme({
  ".cm-formatting-hidden": {
    fontSize: "0 !important",
    width: "0 !important",
    display: "inline-block",
    overflow: "hidden",
    verticalAlign: "baseline",
  },
  ".cm-bold": {
    fontWeight: "bold",
  },
  ".cm-italic": {
    fontStyle: "italic",
  },
  ".cm-strikethrough": {
    textDecoration: "line-through",
  },
  ".cm-code": {
    fontFamily: "monospace",
    backgroundColor: "rgba(0, 0, 0, 0.1)",
    padding: "0.1em 0.3em",
    borderRadius: "3px",
  },
  ".cm-hashtag": {
    color: "#f59e0b",
    fontWeight: "500",
  },
  ".cm-checkbox": {
    cursor: "pointer",
    fontSize: "1.1em",
    marginRight: "0.3em",
    userSelect: "none",
  },
  ".cm-checkbox.checked": {
    color: "var(--success, #22c55e)",
  },
  ".cm-url-chip": {
    color: "var(--accent, #3b82f6)",
    textDecoration: "underline",
  },
  ".cm-url-chip-widget": {
    display: "inline-flex",
    alignItems: "center",
    verticalAlign: "baseline",
  },
  ".cm-blockquote": {
    borderLeft: "3px solid var(--border-color, #ccc)",
    paddingLeft: "0.75em",
    color: "var(--text-muted, #888)",
    fontStyle: "italic",
  },
  // Fenced code block styling
  ".cm-fenced-code-line": {
    backgroundColor: "rgba(0, 0, 0, 0.15)",
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace",
    fontSize: "0.9em",
    lineHeight: "1.5",
    padding: "0 0.75em",
    borderLeft: "3px solid var(--accent, #3b82f6)",
    display: "block",
  },
  ".cm-fenced-code-line:first-of-type": {
    borderTopLeftRadius: "6px",
    borderTopRightRadius: "6px",
    paddingTop: "0.5em",
  },
  ".cm-fenced-code-line:last-of-type": {
    borderBottomLeftRadius: "6px",
    borderBottomRightRadius: "6px",
    paddingBottom: "0.5em",
  },
});
