/**
 * CaptureEditor - Vanilla JavaScript wrapper for the CodeMirror-based capture editor
 * 
 * Usage:
 * ```ts
 * const editor = new CaptureEditor(container, {
 *   content: 'Initial content',
 *   placeholder: 'What\'s on your mind?',
 *   contacts: [{ uid: '123', handle: 'johnDoe', displayName: 'John Doe' }],
 *   onChange: (content) => console.log('Content changed:', content),
 *   onSubmit: () => console.log('Submitted!'),
 * });
 * 
 * // Update contacts later
 * editor.updateContacts([{ uid: '456', handle: 'janeDoe', displayName: 'Jane Doe' }]);
 * 
 * // Get/set content
 * console.log(editor.getContent());
 * editor.setContent('New content');
 * 
 * // Cleanup
 * editor.destroy();
 * ```
 */

import { EditorState, Compartment } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { EditorView, keymap, highlightActiveLine, placeholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting, HighlightStyle, bracketMatching, foldGutter, foldKeymap, codeFolding } from "@codemirror/language";
import { tags as highlightTags } from "@lezer/highlight";
import { completionKeymap, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { search, searchKeymap } from "@codemirror/search";
import TurndownService from "turndown";
import { emojiMap } from "./emojiData";

import type { CaptureEditorOptions, MentionContact } from "./types";
import {
  contactsFacet,
  contactsCompartment,
  mentionDecorationField,
  mentionTheme,
} from "./mentionDecoration";
import { livePreviewPlugin, livePreviewTheme, checkboxToggleFacet, tableDecorationField } from "./livePreview";
import { createCaptureAutocomplete, autocompleteTheme } from "./autocomplete";

// Base editor theme
const baseEditorTheme = EditorView.theme({
  "&": {
    fontSize: "15px",
    backgroundColor: "var(--bg-card, #1f2937)",
    borderRadius: "var(--radius, 8px)",
    border: "1px solid var(--border-color, #374151)",
  },
  "&.cm-focused": {
    outline: "none",
    borderColor: "var(--accent, #3b82f6)",
    boxShadow: "0 0 0 2px rgba(59, 130, 246, 0.2)",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  ".cm-content": {
    padding: "0.75rem 1rem",
    minHeight: "1.5em",
    caretColor: "var(--accent, #3b82f6)",
  },
  ".cm-cursor": {
    borderLeftColor: "var(--accent, #3b82f6)",
    borderLeftWidth: "2px",
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(128, 128, 128, 0.06)",
  },
  ".cm-selectionBackground": {
    backgroundColor: "rgba(59, 130, 246, 0.2) !important",
  },
  "&.cm-focused .cm-selectionBackground": {
    backgroundColor: "rgba(59, 130, 246, 0.3) !important",
  },
  ".cm-line": {
    padding: "0 4px",
  },
});

// Syntax highlighting (markdown + code blocks)
// Markdown-only tags (shared between light and dark)
const markdownTags = [
  { tag: highlightTags.heading1, fontWeight: "bold", fontSize: "1.5em" },
  { tag: highlightTags.heading2, fontWeight: "bold", fontSize: "1.3em" },
  { tag: highlightTags.heading3, fontWeight: "bold", fontSize: "1.15em" },
  { tag: highlightTags.emphasis, fontStyle: "italic" },
  { tag: highlightTags.strong, fontWeight: "bold" },
  { tag: highlightTags.strikethrough, textDecoration: "line-through" },
  { tag: highlightTags.monospace, fontFamily: "monospace" },
  { tag: highlightTags.link, color: "var(--accent, #3b82f6)", textDecoration: "underline" },
  { tag: highlightTags.url, color: "var(--accent, #3b82f6)" },
];

// Light theme (GitHub-inspired)
const lightHighlightStyle = HighlightStyle.define([
  ...markdownTags,
  { tag: highlightTags.keyword, color: "#d73a49" },
  { tag: highlightTags.controlKeyword, color: "#d73a49" },
  { tag: highlightTags.operatorKeyword, color: "#d73a49" },
  { tag: highlightTags.definitionKeyword, color: "#d73a49" },
  { tag: highlightTags.moduleKeyword, color: "#d73a49" },
  { tag: highlightTags.string, color: "#032f62" },
  { tag: highlightTags.number, color: "#005cc5" },
  { tag: highlightTags.bool, color: "#005cc5" },
  { tag: highlightTags.null, color: "#005cc5" },
  { tag: highlightTags.regexp, color: "#032f62" },
  { tag: highlightTags.function(highlightTags.definition(highlightTags.variableName)), color: "#6f42c1" },
  { tag: highlightTags.function(highlightTags.variableName), color: "#6f42c1" },
  { tag: highlightTags.definition(highlightTags.variableName), color: "#e36209" },
  { tag: highlightTags.variableName, color: "#24292e" },
  { tag: highlightTags.definition(highlightTags.typeName), color: "#e36209" },
  { tag: highlightTags.typeName, color: "#e36209" },
  { tag: highlightTags.className, color: "#e36209" },
  { tag: highlightTags.propertyName, color: "#005cc5" },
  { tag: highlightTags.definition(highlightTags.propertyName), color: "#005cc5" },
  { tag: highlightTags.operator, color: "#d73a49" },
  { tag: highlightTags.punctuation, color: "#24292e" },
  { tag: highlightTags.bracket, color: "#24292e" },
  { tag: highlightTags.comment, color: "#6a737d", fontStyle: "italic" },
  { tag: highlightTags.lineComment, color: "#6a737d", fontStyle: "italic" },
  { tag: highlightTags.blockComment, color: "#6a737d", fontStyle: "italic" },
  { tag: highlightTags.tagName, color: "#22863a" },
  { tag: highlightTags.attributeName, color: "#6f42c1" },
  { tag: highlightTags.attributeValue, color: "#032f62" },
  { tag: highlightTags.meta, color: "#6a737d" },
  { tag: highlightTags.atom, color: "#005cc5" },
]);

// Dark theme (One Dark-inspired)
const darkHighlightStyle = HighlightStyle.define([
  ...markdownTags,
  { tag: highlightTags.keyword, color: "#c678dd" },
  { tag: highlightTags.controlKeyword, color: "#c678dd" },
  { tag: highlightTags.operatorKeyword, color: "#c678dd" },
  { tag: highlightTags.definitionKeyword, color: "#c678dd" },
  { tag: highlightTags.moduleKeyword, color: "#c678dd" },
  { tag: highlightTags.string, color: "#98c379" },
  { tag: highlightTags.number, color: "#d19a66" },
  { tag: highlightTags.bool, color: "#d19a66" },
  { tag: highlightTags.null, color: "#d19a66" },
  { tag: highlightTags.regexp, color: "#e06c75" },
  { tag: highlightTags.function(highlightTags.definition(highlightTags.variableName)), color: "#61afef" },
  { tag: highlightTags.function(highlightTags.variableName), color: "#61afef" },
  { tag: highlightTags.definition(highlightTags.variableName), color: "#e5c07b" },
  { tag: highlightTags.variableName, color: "#e06c75" },
  { tag: highlightTags.definition(highlightTags.typeName), color: "#e5c07b" },
  { tag: highlightTags.typeName, color: "#e5c07b" },
  { tag: highlightTags.className, color: "#e5c07b" },
  { tag: highlightTags.propertyName, color: "#e06c75" },
  { tag: highlightTags.definition(highlightTags.propertyName), color: "#e06c75" },
  { tag: highlightTags.operator, color: "#56b6c2" },
  { tag: highlightTags.punctuation, color: "#abb2bf" },
  { tag: highlightTags.bracket, color: "#abb2bf" },
  { tag: highlightTags.comment, color: "#7f848e", fontStyle: "italic" },
  { tag: highlightTags.lineComment, color: "#7f848e", fontStyle: "italic" },
  { tag: highlightTags.blockComment, color: "#7f848e", fontStyle: "italic" },
  { tag: highlightTags.tagName, color: "#e06c75" },
  { tag: highlightTags.attributeName, color: "#d19a66" },
  { tag: highlightTags.attributeValue, color: "#98c379" },
  { tag: highlightTags.meta, color: "#abb2bf" },
  { tag: highlightTags.atom, color: "#d19a66" },
]);

// Pick based on current color scheme
function getHighlightStyle(): HighlightStyle {
  const isDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches
    || document.documentElement.getAttribute("data-theme") === "dark";
  return isDark ? darkHighlightStyle : lightHighlightStyle;
}

// Compartment for swapping highlight styles
const highlightCompartment = new Compartment();

// Autocomplete compartment for dynamic updates
const autocompleteCompartment = new Compartment();

// Configure Turndown for rich text paste
const turndownService = new TurndownService({
  headingStyle: "atx",
  hr: "---",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  fence: "```",
  emDelimiter: "*",
  strongDelimiter: "**",
  linkStyle: "inlined",
});

// Add rules for better code block handling
turndownService.addRule("fencedCodeBlock", {
  filter: (node) => {
    return (
      node.nodeName === "PRE" &&
      node.firstChild !== null &&
      node.firstChild.nodeName === "CODE"
    );
  },
  replacement: (_content, node) => {
    const codeNode = node.firstChild as HTMLElement;
    const code = codeNode.textContent || "";
    // Try to detect language from class
    const className = codeNode.className || "";
    const langMatch = className.match(/language-(\w+)/);
    const lang = langMatch ? langMatch[1] : "";
    return `\n\`\`\`${lang}\n${code}\n\`\`\`\n`;
  },
});

// Add rule for inline code
turndownService.addRule("inlineCode", {
  filter: (node) => {
    return node.nodeName === "CODE" && node.parentNode?.nodeName !== "PRE";
  },
  replacement: (content) => {
    return `\`${content}\``;
  },
});

// Add rule for strikethrough
turndownService.addRule("strikethrough", {
  filter: (node) => {
    const nodeName = node.nodeName.toLowerCase();
    return nodeName === "del" || nodeName === "s" || nodeName === "strike";
  },
  replacement: (content) => {
    return `~~${content}~~`;
  },
});

// Add rule for task lists
turndownService.addRule("taskListItem", {
  filter: (node) => {
    return (
      node.nodeName === "LI" &&
      node.querySelector('input[type="checkbox"]') !== null
    );
  },
  replacement: (content, node) => {
    const checkbox = (node as HTMLElement).querySelector(
      'input[type="checkbox"]'
    ) as HTMLInputElement;
    const checked = checkbox?.checked ? "x" : " ";
    // Remove the checkbox from content and clean up
    const cleanContent = content.replace(/^\s*\[[ x]\]\s*/i, "").trim();
    return `- [${checked}] ${cleanContent}\n`;
  },
});

// Add rule for tables
turndownService.addRule("table", {
  filter: "table",
  replacement: (_content, node) => {
    const table = node as HTMLTableElement;
    const hasHeaders = table.querySelectorAll("th").length > 0;
    const rows: string[][] = [];

    // Extract all rows
    const allRows = table.querySelectorAll("tr");
    allRows.forEach((tr) => {
      const cells: string[] = [];
      tr.querySelectorAll("th, td").forEach((cell) => {
        cells.push((cell.textContent || "").trim().replace(/\|/g, "\\|"));
      });
      rows.push(cells);
    });

    if (rows.length === 0) return "";

    // Determine column count from widest row
    const colCount = Math.max(...rows.map((r) => r.length));

    // Pad rows to same column count
    const padded = rows.map((r) => {
      while (r.length < colCount) r.push("");
      return r;
    });

    // If no <th> elements, prepend a blank header row
    let headerRow: string[];
    let bodyRows: string[][];
    if (hasHeaders) {
      headerRow = padded[0];
      bodyRows = padded.slice(1);
    } else {
      headerRow = new Array(colCount).fill(" ");
      bodyRows = padded;
    }

    const header = `| ${headerRow.join(" | ")} |`;
    const separator = `| ${headerRow.map(() => "---").join(" | ")} |`;
    const body = bodyRows
      .map((r) => `| ${r.join(" | ")} |`)
      .join("\n");

    return `\n\n${header}\n${separator}\n${body}\n\n`;
  },
});

/**
 * Replaces :shortcode: with the emoji character when the closing : is typed.
 * e.g. typing ":" after ":smile" → inserts "😄" and removes ":smile".
 * This matches Slack behavior: the document stores the emoji, not the shortcode.
 */
function createEmojiShortcodeHandler(): Extension {
  return EditorView.inputHandler.of((view, from, to, text) => {
    if (text !== ":" || from !== to) return false;

    // Look back up to 30 chars for an opening :shortcode pattern
    const before = view.state.sliceDoc(Math.max(0, from - 30), from);
    const m = before.match(/:([a-z0-9_+\-]+)$/);
    if (!m) return false;

    const emoji = emojiMap[m[1]];
    if (!emoji) return false;

    // Replace ":shortcode" (without the closing :) with the emoji
    const replaceFrom = from - m[0].length;
    view.dispatch({
      changes: { from: replaceFrom, to: from, insert: emoji },
      selection: { anchor: replaceFrom + emoji.length },
      userEvent: "input",
    });
    return true;
  });
}

// ASCII emoticon → emoji replacement on space/enter/punctuation
const EMOTICONS: [RegExp, string][] = [
  [/:[-]?\)/,  "😊"],  // :) :-) smile
  [/:[-]?D/,   "😄"],  // :D :-D big grin
  [/;[-]?\)/,  "😉"],  // ;) ;-) wink
  [/:[-]?\(/,  "😢"],  // :( :-( sad
  [/:['`][-]?\(/, "😢"], // :( with tear variants
  [/:[-]?\|/,  "😐"],  // :| neutral
  [/:[-]?\//,  "😕"],  // :/ skeptical
  [/:[-]?P/,   "😛"],  // :P :-P tongue
  [/:[-]?O/,   "😮"],  // :O :-O surprised
  [/:[-]?\*/,  "😘"],  // :* kiss
  [/>\.<|>:-</,"😠"],  // >:< angry
  [/<3/,       "❤️"],  // <3 heart
  [/\^[-_]?\^/,"😁"],  // ^^ or ^_^ happy
  [/-_-/,      "😑"],  // -_- expressionless
  [/O:-?\)/,   "😇"],  // O:) angel
  [/B-?\)/,    "😎"],  // B-) sunglasses
  [/\*shrug\*/,"🤷"],  // *shrug*
];

/**
 * Replaces ASCII emoticons with emoji when followed by a space or punctuation.
 * e.g. ":)" + space → "😊 "
 */
function createEmoticonHandler(): Extension {
  return EditorView.inputHandler.of((view, from, to, text) => {
    // Only trigger on space, newline, or common sentence-ending punctuation
    if (!/^[ \t\n.,!?;)]$/.test(text)) return false;
    // Don't act inside a selection
    if (from !== to) return false;

    // Look at the text just before the cursor (up to 10 chars)
    const before = view.state.sliceDoc(Math.max(0, from - 10), from);

    for (const [pattern, emoji] of EMOTICONS) {
      const m = before.match(new RegExp(pattern.source + "$"));
      if (m) {
        const emotStart = from - m[0].length;
        // Insert: emoji + the triggering character
        view.dispatch({
          changes: { from: emotStart, to: from, insert: emoji },
          selection: { anchor: emotStart + emoji.length },
          userEvent: "input",
        });
        // Let the space/punctuation insert normally via a second dispatch
        view.dispatch({
          changes: { from: emotStart + emoji.length, to: emotStart + emoji.length, insert: text },
          selection: { anchor: emotStart + emoji.length + text.length },
          userEvent: "input",
        });
        return true;
      }
    }
    return false;
  });
}

/**
 * Wrap selection when typing formatting characters.
 * Typing *, `, ~, [ wraps selected text instead of replacing it.
 */
function createSelectionWrapHandler(): Extension {
  const wrapPairs: Record<string, string> = {
    "*": "*",
    "`": "`",
    "~": "~",
    "[": "]",
    "(": ")",
    '"': '"',
  };

  return EditorView.inputHandler.of((view, from, to, text) => {
    // Only act when there's a selection and the typed char is a wrap char
    if (from === to || !wrapPairs[text]) return false;

    const closing = wrapPairs[text];
    const selected = view.state.sliceDoc(from, to);

    view.dispatch({
      changes: { from, to, insert: text + selected + closing },
      selection: { anchor: from + 1, head: from + 1 + selected.length },
    });
    return true;
  });
}

/**
 * Create a paste handler extension for rich text
 */
function createRichTextPasteHandler(): Extension {
  return EditorView.domEventHandlers({
    paste(event: ClipboardEvent, view: EditorView) {
      const clipboardData = event.clipboardData;
      if (!clipboardData) return false;

      // Check for HTML content
      const html = clipboardData.getData("text/html");
      if (html && html.trim()) {
        // Don't convert if it's just plain wrapped in basic tags
        // Check if there's meaningful HTML structure
        const hasRichContent = /<(p|div|h[1-6]|ul|ol|li|table|pre|code|blockquote|strong|em|b|i|a|img)[^>]*>/i.test(html);

        if (hasRichContent) {
          event.preventDefault();

          try {
            // Strip HTML comments (e.g. Google Sheets style blocks)
            const cleanHtml = html.replace(/<!--[\s\S]*?-->/g, "");
            // Convert HTML to Markdown
            const markdown = turndownService.turndown(cleanHtml);

            // Insert at cursor position
            const { from, to } = view.state.selection.main;
            view.dispatch({
              changes: { from, to, insert: markdown },
              selection: { anchor: from + markdown.length },
            });

            return true;
          } catch (err) {
            console.warn("Failed to convert rich text paste:", err);
            // Fall through to default paste handling
            return false;
          }
        }
      }

      // Check for pasted images
      const items = clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          event.preventDefault();

          const file = item.getAsFile();
          if (file) {
            // Convert image to base64 and insert as markdown image
            const reader = new FileReader();
            reader.onload = () => {
              const base64 = reader.result as string;
              const imageMarkdown = `![pasted image](${base64})`;

              const { from, to } = view.state.selection.main;
              view.dispatch({
                changes: { from, to, insert: imageMarkdown },
                selection: { anchor: from + imageMarkdown.length },
              });
            };
            reader.readAsDataURL(file);
          }

          return true;
        }
      }

      // Let default handling process plain text
      return false;
    },
    drop(event: DragEvent, view: EditorView) {
      const files = event.dataTransfer?.files;
      if (!files || files.length === 0) return false;

      // Check for image files
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith("image/")) {
          event.preventDefault();

          const reader = new FileReader();
          reader.onload = () => {
            const base64 = reader.result as string;
            const imageMarkdown = `![${file.name}](${base64})`;

            // Insert at drop position
            const pos = view.posAtCoords({
              x: event.clientX,
              y: event.clientY,
            });
            const insertPos = pos ?? view.state.selection.main.head;
            view.dispatch({
              changes: { from: insertPos, to: insertPos, insert: imageMarkdown },
              selection: { anchor: insertPos + imageMarkdown.length },
            });
          };
          reader.readAsDataURL(file);
          return true;
        }
      }
      return false;
    },
  });
}

/**
 * Handle Enter key in lists: continue list items or exit empty items.
 */
function continueList(view: EditorView): boolean {
  const { head } = view.state.selection.main;
  const line = view.state.doc.lineAt(head);
  const text = line.text;

  // Match bullet list: "- ", "* ", "+ " with optional leading whitespace
  const bulletMatch = text.match(/^(\s*)([-*+])\s(.*)$/);
  if (bulletMatch) {
    const [, indent, marker, content] = bulletMatch;
    // Empty item: remove it and exit list
    if (!content.trim()) {
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: "" },
      });
      return true;
    }
    // Continue with same marker
    const insert = `\n${indent}${marker} `;
    view.dispatch({
      changes: { from: head, to: head, insert },
      selection: { anchor: head + insert.length },
    });
    return true;
  }

  // Match ordered list: "1. ", "2. " etc with optional leading whitespace
  const orderedMatch = text.match(/^(\s*)(\d+)\.\s(.*)$/);
  if (orderedMatch) {
    const [, indent, numStr, content] = orderedMatch;
    // Empty item: remove it and exit list
    if (!content.trim()) {
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: "" },
      });
      return true;
    }
    // Continue with next number
    const nextNum = parseInt(numStr, 10) + 1;
    const insert = `\n${indent}${nextNum}. `;
    view.dispatch({
      changes: { from: head, to: head, insert },
      selection: { anchor: head + insert.length },
    });
    return true;
  }

  // Match task list: "- [ ] " or "- [x] " with optional leading whitespace
  const taskMatch = text.match(/^(\s*[-*+])\s\[[ xX]\]\s(.*)$/);
  if (taskMatch) {
    const [, prefix, content] = taskMatch;
    // Empty item: remove it and exit list
    if (!content.trim()) {
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: "" },
      });
      return true;
    }
    // Continue with unchecked task
    const insert = `\n${prefix} [ ] `;
    view.dispatch({
      changes: { from: head, to: head, insert },
      selection: { anchor: head + insert.length },
    });
    return true;
  }

  // Match blockquote: "> " with optional leading whitespace
  const quoteMatch = text.match(/^(\s*>+)\s(.*)$/);
  if (quoteMatch) {
    const [, prefix, content] = quoteMatch;
    if (!content.trim()) {
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: "" },
      });
      return true;
    }
    const insert = `\n${prefix} `;
    view.dispatch({
      changes: { from: head, to: head, insert },
      selection: { anchor: head + insert.length },
    });
    return true;
  }

  return false; // Let default Enter handle it
}

/**
 * Create a command that toggles markdown formatting around the selection.
 * If text is selected and already wrapped, unwraps it. Otherwise wraps it.
 * If no selection, inserts markers and places cursor between them.
 */
function toggleMarkdown(marker: string): (view: EditorView) => boolean {
  return (view: EditorView) => {
    const { from, to } = view.state.selection.main;
    const len = marker.length;

    if (from === to) {
      // No selection: insert markers and place cursor between them
      view.dispatch({
        changes: { from, to, insert: marker + marker },
        selection: { anchor: from + len },
      });
      return true;
    }

    const selected = view.state.sliceDoc(from, to);

    // Check if already wrapped — unwrap
    if (selected.startsWith(marker) && selected.endsWith(marker) && selected.length >= len * 2) {
      const inner = selected.slice(len, -len);
      view.dispatch({
        changes: { from, to, insert: inner },
        selection: { anchor: from, head: from + inner.length },
      });
      return true;
    }

    // Check if the surrounding text has the markers — unwrap
    const before = view.state.sliceDoc(Math.max(0, from - len), from);
    const after = view.state.sliceDoc(to, Math.min(view.state.doc.length, to + len));
    if (before === marker && after === marker) {
      view.dispatch({
        changes: [
          { from: from - len, to: from, insert: "" },
          { from: to, to: to + len, insert: "" },
        ],
        selection: { anchor: from - len, head: to - len },
      });
      return true;
    }

    // Wrap selection
    view.dispatch({
      changes: { from, to, insert: marker + selected + marker },
      selection: { anchor: from + len, head: from + len + selected.length },
    });
    return true;
  };
}

/** Indent a list item (add 2 spaces at start). Returns false if not on a list line. */
function indentListItem(view: EditorView): boolean {
  const { head } = view.state.selection.main;
  const line = view.state.doc.lineAt(head);
  if (/^\s*([-*+]|\d+\.)\s/.test(line.text)) {
    view.dispatch({
      changes: { from: line.from, to: line.from, insert: "  " },
      selection: { anchor: head + 2 },
    });
    return true;
  }
  return false;
}

/** Dedent a list item (remove up to 2 leading spaces). Returns false if not on a list line. */
function dedentListItem(view: EditorView): boolean {
  const { head } = view.state.selection.main;
  const line = view.state.doc.lineAt(head);
  if (/^\s*([-*+]|\d+\.)\s/.test(line.text)) {
    const match = line.text.match(/^( {1,2})/);
    if (match) {
      const removeCount = match[1].length;
      view.dispatch({
        changes: { from: line.from, to: line.from + removeCount, insert: "" },
        selection: { anchor: Math.max(line.from, head - removeCount) },
      });
      return true;
    }
  }
  return false;
}

/**
 * Insert a markdown link. If text is selected, wraps it as [text](url).
 * If no selection, inserts [](url) template.
 */
function insertLink(view: EditorView): boolean {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);

  if (selected) {
    // Check if the selection looks like a URL
    if (/^https?:\/\//.test(selected)) {
      const insert = `[](${selected})`;
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + 1 }, // cursor inside []
      });
    } else {
      const insert = `[${selected}](url)`;
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + selected.length + 3, head: from + selected.length + 6 }, // select "url"
      });
    }
  } else {
    const insert = "[](url)";
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + 1 }, // cursor inside []
    });
  }
  return true;
}

export class CaptureEditor {
  private view: EditorView;
  private container: HTMLElement;
  private options: CaptureEditorOptions;

  constructor(container: HTMLElement, options: CaptureEditorOptions = {}) {
    this.container = container;
    this.options = options;

    // Build extensions
    const extensions = this.buildExtensions();

    // Create editor state
    const state = EditorState.create({
      doc: options.content || "",
      extensions,
    });

    // Create editor view
    this.view = new EditorView({
      state,
      parent: container,
    });


    // Auto-focus if requested
    if (options.autoFocus) {
      this.view.focus();
    }

    // Listen for system theme changes to swap highlight style
    window.matchMedia?.("(prefers-color-scheme: dark)")
      .addEventListener("change", () => {
        this.view.dispatch({
          effects: highlightCompartment.reconfigure(
            syntaxHighlighting(getHighlightStyle())
          ),
        });
      });

    // Observe data-theme attribute changes (from app settings)
    const observer = new MutationObserver(() => {
      this.view.dispatch({
        effects: highlightCompartment.reconfigure(
          syntaxHighlighting(getHighlightStyle())
        ),
      });
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
  }

  private buildExtensions(): Extension[] {
    const { options } = this;

    // Lightweight path for read-only rendering (no interactive features)
    if (options.readonly) {
      return this.buildReadonlyExtensions();
    }

    // Custom keymap for submit and formatting
    const submitKeymap = keymap.of([
      {
        key: "Mod-Enter",
        run: () => {
          options.onSubmit?.();
          return true;
        },
      },
      {
        key: "Mod-b",
        run: toggleMarkdown("**"),
      },
      {
        key: "Mod-i",
        run: toggleMarkdown("*"),
      },
      {
        key: "Mod-d",
        run: toggleMarkdown("~~"),
      },
      {
        key: "Mod-e",
        run: toggleMarkdown("`"),
      },
      {
        key: "Mod-k",
        run: insertLink,
      },
      {
        key: "Enter",
        run: continueList,
      },
    ]);

    // Placeholder extension (built-in)
    const placeholderExt = placeholder(options.placeholder || "What's on your mind?");

    // Update listener for onChange
    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const content = update.state.doc.toString();
        options.onChange?.(content);
      }
    });

    // Autocomplete with initial contacts/tags
    const autocompleteExt = createCaptureAutocomplete(
      options.contacts || [],
      options.existingTags || []
    );

    return [
      submitKeymap,
      history(),
      keymap.of([
        { key: "Tab", run: indentListItem },
        { key: "Shift-Tab", run: dedentListItem },
        indentWithTab,
        ...defaultKeymap,
        ...historyKeymap,
        ...completionKeymap,
        ...searchKeymap,
        ...closeBracketsKeymap,
        ...foldKeymap,
      ]),
      search(),
      closeBrackets(),
      bracketMatching(),
      codeFolding(),
      highlightActiveLine(),
      markdown({
        base: markdownLanguage,
        codeLanguages: languages,
      }),
      highlightCompartment.of(syntaxHighlighting(getHighlightStyle())),
      baseEditorTheme,
      livePreviewPlugin,
      livePreviewTheme,
      tableDecorationField,
      // Mention handling: contacts facet and decorations
      contactsCompartment.of(contactsFacet.of(options.contacts || [])),
      mentionDecorationField,
      mentionTheme,
      autocompleteCompartment.of(autocompleteExt),
      autocompleteTheme,
      placeholderExt,
      updateListener,
      EditorView.lineWrapping,
      // Checkbox toggle callback (per-instance via facet)
      ...(options.onCheckboxToggle
        ? [checkboxToggleFacet.of(options.onCheckboxToggle)]
        : []),
      // Rich text paste handler (HTML → Markdown, image paste)
      createRichTextPasteHandler(),
      // Wrap selection with formatting characters
      createSelectionWrapHandler(),
      // :shortcode: → emoji replacement when closing : is typed (e.g. :smile: → 😊)
      createEmojiShortcodeHandler(),
      // ASCII emoticon → emoji replacement (e.g. :) → 😊)
      createEmoticonHandler(),
    ];
  }

  /** Lightweight extensions for read-only rendering — no interactive features */
  private buildReadonlyExtensions(): Extension[] {
    const { options } = this;

    return [
      markdown({
        base: markdownLanguage,
        codeLanguages: languages,
      }),
      highlightCompartment.of(syntaxHighlighting(getHighlightStyle())),
      baseEditorTheme,
      livePreviewPlugin,
      livePreviewTheme,
      tableDecorationField,
      // Mention handling
      contactsCompartment.of(contactsFacet.of(options.contacts || [])),
      mentionDecorationField,
      mentionTheme,
      EditorView.lineWrapping,
      EditorState.readOnly.of(true),
      // Checkbox toggle callback (per-instance via facet)
      ...(options.onCheckboxToggle
        ? [checkboxToggleFacet.of(options.onCheckboxToggle)]
        : []),
    ];
  }

  /** Get the current content */
  getContent(): string {
    return this.view.state.doc.toString();
  }

  /** Set the content */
  setContent(content: string): void {
    const currentContent = this.view.state.doc.toString();
    if (currentContent !== content) {
      this.view.dispatch({
        changes: {
          from: 0,
          to: currentContent.length,
          insert: content,
        },
      });
    }
  }

  /** Update contacts for mention resolution and autocomplete */
  updateContacts(contacts: MentionContact[]): void {
    // Update mention decorations
    this.view.dispatch({
      effects: contactsCompartment.reconfigure(contactsFacet.of(contacts)),
    });

    // Update autocomplete
    const newAutocomplete = createCaptureAutocomplete(
      contacts,
      this.options.existingTags || []
    );
    this.view.dispatch({
      effects: autocompleteCompartment.reconfigure(newAutocomplete),
    });

    // Store for future reference
    this.options.contacts = contacts;
  }

  /** Update existing tags for autocomplete */
  updateTags(tags: string[]): void {
    const newAutocomplete = createCaptureAutocomplete(
      this.options.contacts || [],
      tags
    );
    this.view.dispatch({
      effects: autocompleteCompartment.reconfigure(newAutocomplete),
    });

    // Store for future reference
    this.options.existingTags = tags;
  }

  /** Focus the editor */
  focus(): void {
    this.view.focus();
  }

  /** Check if editor has focus */
  hasFocus(): boolean {
    return this.view.hasFocus;
  }

  /** Get the underlying EditorView (for advanced use) */
  getEditorView(): EditorView {
    return this.view;
  }

  /** Destroy the editor and clean up */
  destroy(): void {
    this.view.destroy();
  }
}
