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
import katex from "katex";
import mermaid from "mermaid";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { RangeSet, Range, StateField, EditorState, Facet } from "@codemirror/state";
import { emojiMap } from "./emojiData";

// CSS class to hide markdown syntax
const hiddenClass = Decoration.mark({ class: "cm-formatting-hidden" });

// Decoration for different markdown elements
const boldClass = Decoration.mark({ class: "cm-bold" });
const italicClass = Decoration.mark({ class: "cm-italic" });
const strikeClass = Decoration.mark({ class: "cm-strikethrough" });
const codeClass = Decoration.mark({ class: "cm-code" });
const hashtagClass = Decoration.mark({ class: "cm-hashtag" });
const urlChipClass = Decoration.mark({ class: "cm-url-chip" });
const highlightClass = Decoration.mark({ class: "cm-highlight" });
const superscriptClass = Decoration.mark({ class: "cm-superscript" });
const subscriptClass = Decoration.mark({ class: "cm-subscript" });
const linkTextClass = Decoration.mark({ class: "cm-link-text" });
const fencedCodeClass = Decoration.mark({ class: "cm-fenced-code" });
const fencedCodeLineClass = Decoration.line({ class: "cm-fenced-code-line" });
const checkedTaskLineClass = Decoration.line({ class: "cm-checked-task-line" });

// Facet to provide checkbox toggle callback per editor instance
type CheckboxToggleFn = (pos: number, checked: boolean) => void;
export const checkboxToggleFacet = Facet.define<CheckboxToggleFn, CheckboxToggleFn | undefined>({
  combine: (values) => values[0],
});

// Keep legacy API for backwards compatibility
export function setCheckboxToggleCallback(_callback: (pos: number, checked: boolean) => void): void {
  // Deprecated: use checkboxToggleFacet instead. No-op for backwards compat.
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

// Widget for horizontal rules
class HorizontalRuleWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-hr-widget";
    return span;
  }

  eq(): boolean {
    return true;
  }
}

// Widget for markdown tables — renders a real HTML <table>
class TableWidget extends WidgetType {
  constructor(
    readonly headers: string[],
    readonly alignments: ("left" | "center" | "right" | null)[],
    readonly rows: string[][],
    readonly raw: string
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-table-widget";

    const table = document.createElement("table");

    // Header
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    this.headers.forEach((cell, i) => {
      const th = document.createElement("th");
      th.textContent = cell.trim();
      const align = this.alignments[i];
      if (align) th.style.textAlign = align;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement("tbody");
    this.rows.forEach((row) => {
      const tr = document.createElement("tr");
      this.headers.forEach((_, i) => {
        const td = document.createElement("td");
        td.textContent = (row[i] || "").trim();
        const align = this.alignments[i];
        if (align) td.style.textAlign = align;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrapper.appendChild(table);

    return wrapper;
  }

  eq(other: TableWidget): boolean {
    return this.raw === other.raw;
  }
}

/**
 * Parse a markdown table string into headers, alignments, and rows.
 */
function parseMarkdownTable(text: string): {
  headers: string[];
  alignments: ("left" | "center" | "right" | null)[];
  rows: string[][];
} | null {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return null;

  const parseCells = (line: string): string[] => {
    // Remove leading/trailing pipes and split
    let trimmed = line.trim();
    if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
    if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
    return trimmed.split("|").map((c) => c.trim());
  };

  const headers = parseCells(lines[0]);
  const separatorCells = parseCells(lines[1]);

  // Validate separator row
  const isValidSep = separatorCells.every((c) => /^:?-+:?$/.test(c.trim()));
  if (!isValidSep) return null;

  // Parse alignments from separator
  const alignments = separatorCells.map((c): "left" | "center" | "right" | null => {
    const t = c.trim();
    if (t.startsWith(":") && t.endsWith(":")) return "center";
    if (t.endsWith(":")) return "right";
    if (t.startsWith(":")) return "left";
    return null;
  });

  const rows = lines.slice(2).map(parseCells);

  return { headers, alignments, rows };
}

// Widget for code block header (language label + copy button)
class CodeBlockHeaderWidget extends WidgetType {
  constructor(readonly lang: string, readonly code: string) {
    super();
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-code-header";

    if (this.lang) {
      const label = document.createElement("span");
      label.className = "cm-code-lang";
      label.textContent = this.lang;
      wrapper.appendChild(label);
    }

    const spacer = document.createElement("span");
    spacer.style.flex = "1";
    wrapper.appendChild(spacer);

    const copyBtn = document.createElement("button");
    copyBtn.className = "cm-code-copy";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      navigator.clipboard.writeText(this.code).then(() => {
        copyBtn.textContent = "Copied!";
        setTimeout(() => { copyBtn.textContent = "Copy"; }, 1500);
      });
    });
    wrapper.appendChild(copyBtn);

    return wrapper;
  }

  eq(other: CodeBlockHeaderWidget): boolean {
    return this.lang === other.lang && this.code === other.code;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

// Widget for inline math $...$
class InlineMathWidget extends WidgetType {
  constructor(readonly tex: string) {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-math-inline";
    try {
      katex.render(this.tex, span, { throwOnError: false, displayMode: false });
    } catch {
      span.textContent = `$${this.tex}$`;
      span.classList.add("cm-math-error");
    }
    return span;
  }

  eq(other: InlineMathWidget): boolean {
    return this.tex === other.tex;
  }
}

// Widget for block math $$...$$
class BlockMathWidget extends WidgetType {
  constructor(readonly tex: string) {
    super();
  }

  toDOM(): HTMLElement {
    const div = document.createElement("div");
    div.className = "cm-math-block";
    try {
      katex.render(this.tex, div, { throwOnError: false, displayMode: true });
    } catch {
      div.textContent = `$$${this.tex}$$`;
      div.classList.add("cm-math-error");
    }
    return div;
  }

  eq(other: BlockMathWidget): boolean {
    return this.tex === other.tex;
  }
}

// Mermaid initialization — adapts to light/dark mode
let mermaidCurrentTheme: string | null = null;
let mermaidIdCounter = 0;

function isDarkMode(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    || document.documentElement.getAttribute("data-theme") === "dark";
}

function initMermaid() {
  const theme = isDarkMode() ? "dark" : "default";
  if (mermaidCurrentTheme === theme) return;
  mermaidCurrentTheme = theme;
  mermaid.initialize({
    startOnLoad: false,
    theme,
    securityLevel: "loose",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
    themeVariables: theme === "dark" ? {
      primaryColor: "#3b82f6",
      primaryTextColor: "#e5e5e5",
      primaryBorderColor: "#4b5563",
      lineColor: "#6b7280",
      secondaryColor: "#1e3a5f",
      tertiaryColor: "#1f2937",
      mainBkg: "#1f2937",
      nodeBorder: "#4b5563",
      clusterBkg: "#111827",
      titleColor: "#e5e5e5",
      edgeLabelBackground: "#1f2937",
    } : {
      primaryColor: "#dbeafe",
      primaryTextColor: "#1a1a1a",
      primaryBorderColor: "#93c5fd",
      lineColor: "#6b7280",
      secondaryColor: "#e0e7ff",
      tertiaryColor: "#f3f4f6",
      mainBkg: "#eff6ff",
      nodeBorder: "#93c5fd",
      clusterBkg: "#f9fafb",
      titleColor: "#1a1a1a",
      edgeLabelBackground: "#ffffff",
    },
  });
}

// Widget for mermaid diagrams — renders SVG asynchronously
class MermaidWidget extends WidgetType {
  constructor(readonly code: string) {
    super();
  }

  toDOM(): HTMLElement {
    const container = document.createElement("div");
    container.className = "cm-mermaid";

    initMermaid();
    const id = `mermaid-cm-${++mermaidIdCounter}`;

    mermaid.render(id, this.code).then(({ svg }) => {
      container.innerHTML = svg;
      // Make SVG responsive
      const svgEl = container.querySelector("svg");
      if (svgEl) {
        svgEl.style.maxWidth = "100%";
        svgEl.style.height = "auto";
      }
    }).catch((err: Error) => {
      container.className = "cm-mermaid cm-mermaid-error";
      container.textContent = `Mermaid error: ${err.message}`;
    });

    return container;
  }

  eq(other: MermaidWidget): boolean {
    return this.code === other.code;
  }

  // Don't destroy/recreate when scrolling — keep rendered SVG
  get estimatedHeight(): number { return 200; }
}

// Widget for footnote references [^id] → superscript
class FootnoteRefWidget extends WidgetType {
  constructor(readonly id: string, readonly index: number) {
    super();
  }

  toDOM(): HTMLElement {
    const sup = document.createElement("sup");
    sup.className = "cm-footnote-ref";
    sup.textContent = String(this.index);
    sup.title = `Footnote: ${this.id}`;
    return sup;
  }

  eq(other: FootnoteRefWidget): boolean {
    return this.id === other.id && this.index === other.index;
  }
}

// Widget for emoji shortcodes :code: → emoji
class EmojiWidget extends WidgetType {
  constructor(readonly emoji: string) {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-emoji";
    span.textContent = this.emoji;
    return span;
  }

  eq(other: EmojiWidget): boolean {
    return this.emoji === other.emoji;
  }
}

// Widget for bullet list markers
class BulletWidget extends WidgetType {
  constructor(readonly char: string = "•") {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-bullet-marker";
    span.textContent = this.char;
    return span;
  }

  eq(other: BulletWidget): boolean {
    return this.char === other.char;
  }
}

// Widget for markdown links [text](url)
class LinkWidget extends WidgetType {
  constructor(readonly text: string, readonly url: string) {
    super();
  }

  toDOM(): HTMLElement {
    const a = document.createElement("a");
    a.className = "cm-link-widget";
    a.textContent = this.text;
    a.href = this.url;
    a.title = this.url;
    a.addEventListener("click", (e) => {
      e.preventDefault();
      window.open(this.url, "_blank", "noopener,noreferrer");
    });
    return a;
  }

  eq(other: LinkWidget): boolean {
    return this.text === other.text && this.url === other.url;
  }
}

// Widget for markdown images ![alt](url)
class ImageWidget extends WidgetType {
  constructor(readonly alt: string, readonly url: string) {
    super();
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement("span");
    wrapper.className = "cm-image-widget";

    const img = document.createElement("img");
    img.src = this.url;
    img.alt = this.alt;
    img.title = this.alt || this.url;
    img.loading = "lazy";

    img.addEventListener("error", () => {
      wrapper.textContent = `[Image: ${this.alt || this.url}]`;
      wrapper.classList.add("cm-image-error");
    });

    wrapper.appendChild(img);
    return wrapper;
  }

  eq(other: ImageWidget): boolean {
    return this.alt === other.alt && this.url === other.url;
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

  // Collect code ranges to exclude hashtag/URL matching inside them
  const codeRanges: { from: number; to: number }[] = [];
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name === "FencedCode" || node.name === "InlineCode" || node.name === "CodeText") {
          codeRanges.push({ from: node.from, to: node.to });
        }
      },
    });
  }
  const isInCode = (pos: number): boolean =>
    codeRanges.some((r) => pos >= r.from && pos < r.to);

  // Track footnote reference IDs → sequential index
  const footnoteIndexMap = new Map<string, number>();

  // Process each line for custom patterns
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const lineText = line.text;
    const lineFrom = line.from;

    const cursorOnThisLine = cursorOnLine(view, lineFrom, line.to);

    // Track footnote IDs for consistent numbering (declared outside but needs to persist across lines)
    // (footnoteIndexMap is declared before the loop)

    // Hashtags: #tag, #tag-name, or #tag/subtag (skip inside code)
    const hashtagRegex = /(?:^|[^#\w])#([\w/-]+)/g;
    let match;
    while ((match = hashtagRegex.exec(lineText)) !== null) {
      const hashIndex = lineText.indexOf("#", match.index);
      const from = lineFrom + hashIndex;
      const to = from + 1 + match[1].length;
      if (!isInCode(from)) {
        decorations.push(hashtagClass.range(from, to));
      }
    }

    // Highlight: ==text== (skip inside code)
    const highlightRegex = /==((?!=).+?)==/g;
    while ((match = highlightRegex.exec(lineText)) !== null) {
      const from = lineFrom + match.index;
      const to = from + match[0].length;
      if (!isInCode(from)) {
        if (!cursorOnThisLine) {
          decorations.push(hiddenClass.range(from, from + 2));
          decorations.push(hiddenClass.range(to - 2, to));
        }
        decorations.push(highlightClass.range(from + 2, to - 2));
      }
    }

    // Superscript: ^text^ (skip inside code)
    const supRegex = /\^([^\^\s][^\^]*?)\^/g;
    while ((match = supRegex.exec(lineText)) !== null) {
      const from = lineFrom + match.index;
      const to = from + match[0].length;
      if (!isInCode(from)) {
        if (!cursorOnThisLine) {
          decorations.push(hiddenClass.range(from, from + 1));
          decorations.push(hiddenClass.range(to - 1, to));
        }
        decorations.push(superscriptClass.range(from + 1, to - 1));
      }
    }

    // Subscript: ~text~ (single ~, not ~~; skip inside code)
    const subRegex = /(?<!~)~(?!~)([^~\s][^~]*?)~(?!~)/g;
    while ((match = subRegex.exec(lineText)) !== null) {
      const from = lineFrom + match.index;
      const to = from + match[0].length;
      if (!isInCode(from)) {
        if (!cursorOnThisLine) {
          decorations.push(hiddenClass.range(from, from + 1));
          decorations.push(hiddenClass.range(to - 1, to));
        }
        decorations.push(subscriptClass.range(from + 1, to - 1));
      }
    }

    // Emoji shortcodes: :smile: → 😄 (skip inside code)
    const emojiRegex = /:([a-z0-9_+-]+):/g;
    while ((match = emojiRegex.exec(lineText)) !== null) {
      const code = match[1];
      const emoji = emojiMap[code];
      if (emoji && !isInCode(lineFrom + match.index) && !cursorOnThisLine) {
        const from = lineFrom + match.index;
        const to = from + match[0].length;
        decorations.push(Decoration.replace({
          widget: new EmojiWidget(emoji),
        }).range(from, to));
      }
    }

    // Inline math is handled by the StateField (tableDecorationField)
    // to avoid conflicts with block math and double rendering

    // Footnote references: [^id] (but NOT definitions [^id]:)
    const footnoteRefRegex = /\[\^([^\]]+)\](?!:)/g;
    while ((match = footnoteRefRegex.exec(lineText)) !== null) {
      const from = lineFrom + match.index;
      const to = from + match[0].length;
      if (!isInCode(from) && !cursorOnThisLine) {
        const fnId = match[1];
        // Assign numeric index based on order of appearance
        if (!footnoteIndexMap.has(fnId)) {
          footnoteIndexMap.set(fnId, footnoteIndexMap.size + 1);
        }
        decorations.push(Decoration.replace({
          widget: new FootnoteRefWidget(fnId, footnoteIndexMap.get(fnId)!),
        }).range(from, to));
      }
    }

    // Footnote definitions: [^id]: text — style the line
    const fnDefMatch = lineText.match(/^\[\^([^\]]+)\]:\s/);
    if (fnDefMatch && !isInCode(lineFrom)) {
      decorations.push(Decoration.line({
        class: "cm-footnote-def",
      }).range(lineFrom));
      if (!cursorOnThisLine) {
        // Hide the [^id]: prefix
        const prefixLen = fnDefMatch[0].length;
        decorations.push(hiddenClass.range(lineFrom, lineFrom + prefixLen));
        // Add a footnote label widget
        const fnId = fnDefMatch[1];
        if (!footnoteIndexMap.has(fnId)) {
          footnoteIndexMap.set(fnId, footnoteIndexMap.size + 1);
        }
        decorations.push(Decoration.widget({
          widget: new FootnoteRefWidget(fnId, footnoteIndexMap.get(fnId)!),
          side: -1,
        }).range(lineFrom + prefixLen));
      }
    }

    // Footnote definition continuation: indented lines following a definition
    // Walk backward to verify this actually traces to a [^id]: line
    if (/^\s{2,}\S/.test(lineText) && i > 1) {
      let isFnContinuation = false;
      for (let j = i - 1; j >= 1; j--) {
        const checkLine = doc.line(j).text;
        if (/^\[\^[^\]]+\]:\s/.test(checkLine)) {
          isFnContinuation = true;
          break;
        }
        if (!/^\s{2,}\S/.test(checkLine)) {
          break; // Not indented — stop looking
        }
      }
      if (isFnContinuation) {
        decorations.push(Decoration.line({
          class: "cm-footnote-def cm-footnote-def-continuation",
        }).range(lineFrom));
      }
    }

    // Definition lists: term line followed by : definition
    const defMatch = lineText.match(/^:\s+(.+)/);
    if (defMatch && !isInCode(lineFrom) && i > 1) {
      decorations.push(Decoration.line({
        class: "cm-def-list-def",
      }).range(lineFrom));
      if (!cursorOnThisLine) {
        // Hide the ": " prefix
        decorations.push(hiddenClass.range(lineFrom, lineFrom + 2));
      }
      // Style the term line (the non-empty line before the first : in a group)
      const prevLine = doc.line(i - 1);
      const isPrevAlsoDef = /^:\s+/.test(prevLine.text);
      if (!isPrevAlsoDef && prevLine.text.trim().length > 0) {
        decorations.push(Decoration.line({
          class: "cm-def-list-term",
        }).range(prevLine.from));
      }
    }

    // URLs: https://... or http://... (skip inside code)
    const urlRegex = /https?:\/\/[^\s<>"]+/g;
    while ((match = urlRegex.exec(lineText)) !== null) {
      if (isInCode(lineFrom + match.index)) continue;
      const from = lineFrom + match.index;
      const to = from + match[0].length;
      // Clean trailing punctuation, but preserve balanced parentheses
      let url = match[0];
      // Count open/close parens — strip trailing ) only if unbalanced
      const openParens = (url.match(/\(/g) || []).length;
      const closeParens = (url.match(/\)/g) || []).length;
      if (closeParens > openParens && url.endsWith(")")) {
        url = url.slice(0, -1);
      }
      url = url.replace(/[.,;:!?]+$/, ""); // Clean trailing punctuation (not parens)
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

        // Headings: hide # markers and add spacing
        if (node.name.startsWith("ATXHeading")) {
          const text = view.state.sliceDoc(nodeFrom, nodeTo);
          const hashMatch = text.match(/^#+/);
          const hashCount = hashMatch?.[0].length || 0;
          if (hashCount > 0) {
            const line = doc.lineAt(nodeFrom);
            decorations.push(Decoration.line({
              class: `cm-heading cm-heading-${Math.min(hashCount, 6)}`,
            }).range(line.from));
            if (!isOnLine) {
              decorations.push(hiddenClass.range(nodeFrom, nodeFrom + hashCount + 1));
            }
          }
        }

        // Horizontal rules: --- or *** or ___
        if (node.name === "HorizontalRule") {
          if (!isOnLine) {
            decorations.push(Decoration.replace({
              widget: new HorizontalRuleWidget(),
            }).range(nodeFrom, nodeTo));
          } else {
            decorations.push(Decoration.line({
              class: "cm-hr-source",
            }).range(doc.lineAt(nodeFrom).from));
          }
        }

        // Task lists: - [ ] or - [x]
        if (node.name === "TaskMarker") {
          const text = view.state.sliceDoc(nodeFrom, nodeTo);
          const checked = text.includes("x") || text.includes("X");
          if (!isOnLine) {
            decorations.push(Decoration.replace({
              widget: new CheckboxWidget(checked, nodeFrom, view.state.facet(checkboxToggleFacet)),
            }).range(nodeFrom, nodeTo));
          }
          // Style the entire line for checked tasks
          if (checked) {
            const line = doc.lineAt(nodeFrom);
            decorations.push(checkedTaskLineClass.range(line.from));
          }
        }

        // List items: style with bullet/number and nesting indentation
        if (node.name === "ListItem") {
          const parent = node.node.parent;
          if (!parent) return;

          // Count nesting depth by walking up through list ancestors
          let depth = 0;
          let ancestor = parent as typeof parent | null;
          while (ancestor) {
            if (ancestor.name === "BulletList" || ancestor.name === "OrderedList") {
              depth++;
            }
            ancestor = ancestor.parent;
          }
          const nestClass = `cm-list-depth-${Math.min(depth, 4)}`;

          if (parent!.name === "BulletList") {
            // Check if this list item is a task — skip, checkboxes handle those
            let hasTask = false;
            let child = node.node.firstChild;
            while (child) {
              if (child.name === "Task" || child.name === "TaskMarker") {
                hasTask = true;
                break;
              }
              child = child.nextSibling;
            }

            const line = doc.lineAt(nodeFrom);
            decorations.push(Decoration.line({
              class: `cm-bullet-list-line ${nestClass}`,
            }).range(line.from));

            if (!hasTask) {
              // Hide the list mark and replace with styled bullet
              const markChild = node.node.firstChild;
              if (markChild && markChild.name === "ListMark" && !isOnLine) {
                const bulletChars = ["•", "◦", "▪", "▹"];
                const bulletChar = bulletChars[Math.min(depth - 1, bulletChars.length - 1)];
                decorations.push(Decoration.replace({
                  widget: new BulletWidget(bulletChar),
                }).range(markChild.from, markChild.to + 1));
              }
            }
          }

          if (parent!.name === "OrderedList") {
            const line = doc.lineAt(nodeFrom);
            decorations.push(Decoration.line({
              class: `cm-ordered-list-line ${nestClass}`,
            }).range(line.from));
          }
        }

        // Blockquotes: style with nesting depth + callout support
        if (node.name === "Blockquote") {
          // Count nesting depth
          let depth = 0;
          let ancestor = node.node as typeof node.node | null;
          while (ancestor) {
            if (ancestor.name === "Blockquote") depth++;
            ancestor = ancestor.parent;
          }

          for (let pos = nodeFrom; pos < nodeTo;) {
            const line = doc.lineAt(pos);
            const quoteMatch = line.text.match(/^(>+)\s?/);
            if (quoteMatch) {
              if (!cursorOnLine(view, line.from, line.to)) {
                decorations.push(hiddenClass.range(line.from, line.from + quoteMatch[0].length));
              }
              // Check for callout syntax: > [!type] on first line
              const calloutMatch = line.text.match(/^>+\s*\[!([\w-]+)\]\s*(.*)/);
              if (calloutMatch) {
                const calloutType = calloutMatch[1].toLowerCase();
                decorations.push(Decoration.line({
                  class: `cm-blockquote cm-blockquote-depth-${Math.min(depth, 3)} cm-callout cm-callout-${calloutType}`,
                }).range(line.from));
              } else {
                decorations.push(Decoration.line({
                  class: `cm-blockquote cm-blockquote-depth-${Math.min(depth, 3)}`,
                }).range(line.from));
              }
            }
            pos = line.to + 1;
          }
        }

        // Markdown links: [text](url)
        if (node.name === "Link") {
          const children: { name: string; from: number; to: number }[] = [];
          let child = node.node.firstChild;
          while (child) {
            children.push({ name: child.name, from: child.from, to: child.to });
            child = child.nextSibling;
          }

          // Find the link marks and URL
          const marks = children.filter(c => c.name === "LinkMark");
          const urlNode = children.find(c => c.name === "URL");

          if (marks.length >= 4 && urlNode) {
            // marks[0] = [, marks[1] = ], marks[2] = (, marks[3] = )
            const linkText = view.state.sliceDoc(marks[0].to, marks[1].from);
            const url = view.state.sliceDoc(urlNode.from, urlNode.to);

            const isCustomProtocol = url.includes("://") && !url.startsWith("http");
            if (!isOnLine && !isCustomProtocol) {
              decorations.push(Decoration.replace({
                widget: new LinkWidget(linkText, url),
              }).range(nodeFrom, nodeTo));
            } else if (isOnLine) {
              decorations.push(linkTextClass.range(marks[0].to, marks[1].from));
            }
            // Custom protocols (jotter-file://, etc.) are left undecorated for app extensions
          }
        }

        // Markdown images: ![alt](url)
        if (node.name === "Image") {
          const children: { name: string; from: number; to: number }[] = [];
          let child = node.node.firstChild;
          while (child) {
            children.push({ name: child.name, from: child.from, to: child.to });
            child = child.nextSibling;
          }

          const urlNode = children.find(c => c.name === "URL");

          if (urlNode) {
            const marks = children.filter(c => c.name === "LinkMark");
            const alt = marks.length >= 2
              ? view.state.sliceDoc(marks[0].to, marks[1].from)
              : "";
            const url = view.state.sliceDoc(urlNode.from, urlNode.to);

            // Skip custom protocol URLs (e.g. jotter-file://) — handled by app extensions
            if (!isOnLine && url.startsWith("http")) {
              decorations.push(Decoration.replace({
                widget: new ImageWidget(alt, url),
              }).range(nodeFrom, nodeTo));
            }
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

            // Extract language from opening fence
            const langMatch = openingLine.text.match(/^`{3,}(\w*)/);
            const lang = langMatch?.[1] || "";

            // Mermaid blocks are handled by the StateField — skip here
            if (lang.toLowerCase() === "mermaid") return;

            // Extract code content (between opening and closing fences)
            const codeLines = lines.slice(1, -1);
            const code = codeLines.join("\n");

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

            // Add language label + copy button only when opening fence is hidden
            const openingHidden = isReadOnly || cursorLine !== openingLineNum;
            if (openingHidden && openingLineNum + 1 <= closingLineNum - 1) {
              const firstCodeLine = doc.line(openingLineNum + 1);
              decorations.push(Decoration.widget({
                widget: new CodeBlockHeaderWidget(lang, code),
                side: -1, // before the line content
              }).range(firstCodeLine.from));
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

// StateField for table decorations (StateFields CAN replace multi-line ranges)
function buildTableDecorations(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const doc = state.doc;
  const isReadonly = state.facet(EditorState.readOnly);
  const cursorHead = state.selection.main.head;
  const cursorLine = doc.lineAt(cursorHead).number;

  // Tables and mermaid blocks
  syntaxTree(state).iterate({
    enter: (node) => {
      const nodeFrom = node.from;
      const nodeTo = node.to;

      // Tables
      if (node.name === "Table") {
        const tableFirstLine = doc.lineAt(nodeFrom).number;
        const tableLastLine = doc.lineAt(nodeTo).number;
        const cursorInTable = !isReadonly && cursorLine >= tableFirstLine && cursorLine <= tableLastLine;

        if (!cursorInTable) {
          const raw = state.sliceDoc(nodeFrom, nodeTo);
          const parsed = parseMarkdownTable(raw);
          if (parsed) {
            decorations.push(Decoration.replace({
              widget: new TableWidget(
                parsed.headers,
                parsed.alignments,
                parsed.rows,
                raw
              ),
            }).range(nodeFrom, nodeTo));
          }
        }
        return;
      }

      // Mermaid fenced code blocks
      if (node.name === "FencedCode") {
        const openingLine = doc.lineAt(nodeFrom);
        const langMatch = openingLine.text.match(/^`{3,}(\w+)/);
        if (langMatch?.[1]?.toLowerCase() !== "mermaid") return;

        const firstLine = openingLine.number;
        const lastLine = doc.lineAt(nodeTo).number;
        const cursorInBlock = !isReadonly && cursorLine >= firstLine && cursorLine <= lastLine;

        if (!cursorInBlock) {
          const raw = state.sliceDoc(nodeFrom, nodeTo);
          // Extract code between fences
          const lines = raw.split("\n");
          const code = lines.slice(1, lines[lines.length - 1].startsWith("```") ? -1 : undefined).join("\n").trim();
          if (code) {
            decorations.push(Decoration.replace({
              widget: new MermaidWidget(code),
              block: false,
            }).range(nodeFrom, nodeTo));
          }
        }
      }
    },
  });

  // Block math: $$...$$ (multi-line or single-line)
  const text = doc.toString();
  const blockMathRanges: { from: number; to: number }[] = [];
  const blockMathRegex = /\$\$([\s\S]*?)\$\$/g;
  let match;
  while ((match = blockMathRegex.exec(text)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    const firstLine = doc.lineAt(from).number;
    const lastLine = doc.lineAt(to).number;
    const cursorInBlock = !isReadonly && cursorLine >= firstLine && cursorLine <= lastLine;

    blockMathRanges.push({ from, to });
    if (!cursorInBlock) {
      decorations.push(Decoration.replace({
        widget: new BlockMathWidget(match[1].trim()),
      }).range(from, to));
    }
  }

  // Inline math: $...$ (single $ not $$, skip ranges already covered by block math)
  const inlineMathRegex = /(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g;
  while ((match = inlineMathRegex.exec(text)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    // Skip if inside a block math range
    if (blockMathRanges.some((r) => from >= r.from && to <= r.to)) continue;
    const line = doc.lineAt(from);
    const onCursorLine = !isReadonly && line.number === cursorLine;
    if (!onCursorLine) {
      decorations.push(Decoration.replace({
        widget: new InlineMathWidget(match[1]),
      }).range(from, to));
    }
  }

  decorations.sort((a, b) => a.from - b.from);
  return RangeSet.of(decorations, true);
}

export const tableDecorationField = StateField.define<DecorationSet>({
  create(state) {
    return buildTableDecorations(state);
  },
  update(decorations, tr) {
    if (tr.docChanged || tr.selection) {
      return buildTableDecorations(tr.state);
    }
    return decorations.map(tr.changes);
  },
  provide(field) {
    return EditorView.decorations.from(field);
  },
});

// Theme for live preview elements
export const livePreviewTheme = EditorView.theme({
  ".cm-formatting-hidden": {
    fontSize: "0 !important",
    letterSpacing: "0 !important",
    width: "1px !important",
    display: "inline-block",
    overflow: "hidden",
    verticalAlign: "baseline",
    color: "transparent",
    userSelect: "none",
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
  ".cm-blockquote-depth-2": {
    borderLeftWidth: "3px",
    borderLeftStyle: "double",
    paddingLeft: "1em",
  },
  ".cm-blockquote-depth-3": {
    borderLeftWidth: "4px",
    borderLeftStyle: "double",
    paddingLeft: "1.25em",
  },
  // Callout blocks
  ".cm-callout": {
    fontStyle: "normal",
    borderRadius: "4px",
    padding: "0.25em 0.75em",
  },
  ".cm-callout-note": {
    borderLeftColor: "var(--accent, #3b82f6)",
    backgroundColor: "rgba(59, 130, 246, 0.06)",
    color: "inherit",
  },
  ".cm-callout-tip": {
    borderLeftColor: "#22c55e",
    backgroundColor: "rgba(34, 197, 94, 0.06)",
    color: "inherit",
  },
  ".cm-callout-warning": {
    borderLeftColor: "#f59e0b",
    backgroundColor: "rgba(245, 158, 11, 0.06)",
    color: "inherit",
  },
  ".cm-callout-danger, .cm-callout-error": {
    borderLeftColor: "#ef4444",
    backgroundColor: "rgba(239, 68, 68, 0.06)",
    color: "inherit",
  },
  ".cm-callout-info": {
    borderLeftColor: "#06b6d4",
    backgroundColor: "rgba(6, 182, 212, 0.06)",
    color: "inherit",
  },
  ".cm-callout-important": {
    borderLeftColor: "#a855f7",
    backgroundColor: "rgba(168, 85, 247, 0.06)",
    color: "inherit",
  },
  ".cm-highlight": {
    backgroundColor: "rgba(245, 158, 11, 0.25)",
    borderRadius: "2px",
    padding: "0.05em 0",
  },
  ".cm-link-text": {
    color: "var(--accent, #3b82f6)",
    textDecoration: "underline",
    textDecorationColor: "rgba(59, 130, 246, 0.4)",
  },
  ".cm-link-widget": {
    color: "var(--accent, #3b82f6)",
    textDecoration: "underline",
    textDecorationColor: "rgba(59, 130, 246, 0.4)",
    cursor: "pointer",
  },
  ".cm-link-widget:hover": {
    textDecorationColor: "var(--accent, #3b82f6)",
  },
  ".cm-image-widget": {
    display: "block",
    margin: "0.5em 0",
  },
  ".cm-image-widget img": {
    maxWidth: "100%",
    maxHeight: "400px",
    borderRadius: "6px",
    objectFit: "contain",
  },
  ".cm-image-error": {
    color: "var(--text-muted, #888)",
    fontStyle: "italic",
    fontSize: "0.9em",
  },
  ".cm-bullet-list-line, .cm-ordered-list-line": {
    paddingLeft: "0.5em",
  },
  ".cm-bullet-marker": {
    color: "var(--text-muted, #888)",
    marginRight: "0.4em",
    fontSize: "0.9em",
  },
  // Nesting depth indentation
  ".cm-list-depth-2": {
    paddingLeft: "1.5em",
  },
  ".cm-list-depth-3": {
    paddingLeft: "2.5em",
  },
  ".cm-list-depth-4": {
    paddingLeft: "3.5em",
  },
  // Heading spacing
  ".cm-heading": {
    fontWeight: "bold",
  },
  ".cm-heading-1": {
    fontSize: "1.5em",
    paddingTop: "0.3em",
    paddingBottom: "0.1em",
  },
  ".cm-heading-2": {
    fontSize: "1.3em",
    paddingTop: "0.25em",
    paddingBottom: "0.1em",
  },
  ".cm-heading-3": {
    fontSize: "1.15em",
    paddingTop: "0.2em",
    paddingBottom: "0.05em",
  },
  ".cm-heading-4": {
    fontSize: "1.05em",
    paddingTop: "0.15em",
  },
  ".cm-heading-5": {
    fontSize: "1em",
    paddingTop: "0.1em",
  },
  ".cm-heading-6": {
    fontSize: "0.95em",
    marginTop: "0.2em",
    marginBottom: "0.1em",
    color: "var(--text-muted, #888)",
  },
  // Horizontal rule
  ".cm-hr-widget": {
    display: "inline-block",
    width: "100%",
    borderTop: "1px solid var(--border-color, #374151)",
    margin: "0.25em 0",
    verticalAlign: "middle",
  },
  ".cm-hr-source": {
    color: "var(--text-muted, #888)",
  },
  // Checked task styling
  ".cm-checked-task-line": {
    textDecoration: "line-through",
    color: "var(--text-muted, #888)",
    opacity: "0.7",
  },
  // Table styling
  ".cm-table-widget": {
    display: "block",
    margin: "0.5em 0",
    overflowX: "auto",
  },
  ".cm-table-widget table": {
    borderCollapse: "collapse",
    width: "100%",
    fontSize: "0.95em",
  },
  ".cm-table-widget th": {
    fontWeight: "600",
    textAlign: "left",
    padding: "0.4em 0.75em",
    borderBottom: "2px solid var(--border-color, #374151)",
    whiteSpace: "nowrap",
  },
  ".cm-table-widget td": {
    padding: "0.35em 0.75em",
    borderBottom: "1px solid rgba(128, 128, 128, 0.15)",
  },
  ".cm-table-widget tbody tr:hover": {
    backgroundColor: "rgba(128, 128, 128, 0.06)",
  },
  // Fenced code block styling
  ".cm-fenced-code-line": {
    backgroundColor: "rgba(128, 128, 128, 0.08)",
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace",
    fontSize: "0.9em",
    lineHeight: "1.5",
    padding: "0 0.75em",
    borderLeft: "3px solid var(--accent, #3b82f6)",
    display: "block",
  },
  ".cm-code-header": {
    display: "flex",
    alignItems: "center",
    padding: "0.3em 0.75em",
    backgroundColor: "rgba(128, 128, 128, 0.12)",
    borderTopLeftRadius: "6px",
    borderTopRightRadius: "6px",
    borderLeft: "3px solid var(--accent, #3b82f6)",
    fontSize: "0.8em",
    color: "var(--text-muted, #888)",
  },
  ".cm-code-lang": {
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    textTransform: "lowercase",
  },
  ".cm-code-copy": {
    background: "none",
    border: "1px solid rgba(128, 128, 128, 0.3)",
    borderRadius: "4px",
    color: "var(--text-muted, #888)",
    padding: "0.15em 0.5em",
    fontSize: "0.9em",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  ".cm-code-copy:hover": {
    color: "var(--text-primary, #fff)",
    borderColor: "rgba(128, 128, 128, 0.5)",
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
  // Math / KaTeX
  ".cm-math-inline": {
    display: "inline-block",
    verticalAlign: "baseline",
  },
  ".cm-math-block": {
    display: "block",
    textAlign: "center",
    margin: "0.75em 0",
    padding: "0.5em 0",
    overflowX: "auto",
  },
  ".cm-math-error": {
    color: "#ef4444",
    fontFamily: "monospace",
    fontSize: "0.9em",
  },
  // Footnotes
  ".cm-footnote-ref": {
    color: "var(--accent, #3b82f6)",
    fontSize: "0.75em",
    fontWeight: "600",
    cursor: "default",
    verticalAlign: "super",
    lineHeight: "0",
    padding: "0 1px",
  },
  ".cm-footnote-def": {
    paddingLeft: "1.5em",
    borderLeft: "2px solid var(--accent, #3b82f6)",
    color: "var(--text-muted, #888)",
    fontSize: "0.9em",
  },
  ".cm-footnote-def-continuation": {
    borderLeftStyle: "dotted",
  },
  // Definition lists
  ".cm-def-list-term": {
    fontWeight: "bold",
    fontSize: "1.02em",
  },
  ".cm-def-list-def": {
    paddingLeft: "1.5em",
    borderLeft: "2px solid rgba(128, 128, 128, 0.3)",
    color: "var(--text-secondary, #ccc)",
  },
  // Superscript / Subscript
  ".cm-superscript": {
    verticalAlign: "super",
    fontSize: "0.8em",
    lineHeight: "0",
  },
  ".cm-subscript": {
    verticalAlign: "sub",
    fontSize: "0.8em",
    lineHeight: "0",
  },
  // Mermaid diagrams
  ".cm-mermaid": {
    display: "block",
    margin: "0.75em 0",
    padding: "1.5em 1em",
    backgroundColor: "var(--bg-secondary, #f5f5f5)",
    border: "1px solid var(--border-color, rgba(0,0,0,0.1))",
    borderRadius: "8px",
    overflowX: "auto",
    cursor: "default",
    userSelect: "none",
    textAlign: "center",
  },
  ".cm-mermaid svg": {
    maxWidth: "100%",
    height: "auto",
    display: "inline-block",
  },
  ".cm-mermaid-error": {
    color: "#ef4444",
    fontFamily: "monospace",
    fontSize: "0.85em",
    padding: "0.75em 1em",
    textAlign: "left",
  },
  // Emoji
  ".cm-emoji": {
    fontSize: "1.1em",
    lineHeight: "1",
    display: "inline-block",
    verticalAlign: "middle",
  },
});
