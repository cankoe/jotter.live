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
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags as highlightTags } from "@lezer/highlight";
import { completionKeymap } from "@codemirror/autocomplete";
import TurndownService from "turndown";
import { contactsFacet, contactsCompartment, mentionDecorationField, mentionTheme, } from "./mentionDecoration";
import { livePreviewPlugin, livePreviewTheme, setCheckboxToggleCallback } from "./livePreview";
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
        overflow: "hidden",
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
        backgroundColor: "transparent",
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
    // Placeholder styling
    "&.cm-editor-empty .cm-content[data-placeholder]::before": {
        content: "attr(data-placeholder)",
        position: "absolute",
        color: "var(--text-muted, #9ca3af)",
        pointerEvents: "none",
    },
});
// Syntax highlighting
const highlightStyle = HighlightStyle.define([
    { tag: highlightTags.heading1, fontWeight: "bold", fontSize: "1.5em" },
    { tag: highlightTags.heading2, fontWeight: "bold", fontSize: "1.3em" },
    { tag: highlightTags.heading3, fontWeight: "bold", fontSize: "1.15em" },
    { tag: highlightTags.emphasis, fontStyle: "italic" },
    { tag: highlightTags.strong, fontWeight: "bold" },
    { tag: highlightTags.strikethrough, textDecoration: "line-through" },
    { tag: highlightTags.monospace, fontFamily: "monospace" },
    { tag: highlightTags.link, color: "var(--accent, #3b82f6)", textDecoration: "underline" },
    { tag: highlightTags.url, color: "var(--accent, #3b82f6)" },
]);
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
        return (node.nodeName === "PRE" &&
            node.firstChild !== null &&
            node.firstChild.nodeName === "CODE");
    },
    replacement: (_content, node) => {
        const codeNode = node.firstChild;
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
        return (node.nodeName === "LI" &&
            node.querySelector('input[type="checkbox"]') !== null);
    },
    replacement: (content, node) => {
        const checkbox = node.querySelector('input[type="checkbox"]');
        const checked = checkbox?.checked ? "x" : " ";
        // Remove the checkbox from content and clean up
        const cleanContent = content.replace(/^\s*\[[ x]\]\s*/i, "").trim();
        return `- [${checked}] ${cleanContent}\n`;
    },
});
/**
 * Create a paste handler extension for rich text
 */
function createRichTextPasteHandler() {
    return EditorView.domEventHandlers({
        paste(event, view) {
            const clipboardData = event.clipboardData;
            if (!clipboardData)
                return false;
            // Check for HTML content
            const html = clipboardData.getData("text/html");
            if (html && html.trim()) {
                // Don't convert if it's just plain wrapped in basic tags
                // Check if there's meaningful HTML structure
                const hasRichContent = /<(p|div|h[1-6]|ul|ol|li|table|pre|code|blockquote|strong|em|b|i|a|img)[^>]*>/i.test(html);
                if (hasRichContent) {
                    event.preventDefault();
                    try {
                        // Convert HTML to Markdown
                        const markdown = turndownService.turndown(html);
                        // Insert at cursor position
                        const { from, to } = view.state.selection.main;
                        view.dispatch({
                            changes: { from, to, insert: markdown },
                            selection: { anchor: from + markdown.length },
                        });
                        return true;
                    }
                    catch (err) {
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
                            const base64 = reader.result;
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
    });
}
export class CaptureEditor {
    constructor(container, options = {}) {
        this.container = container;
        this.options = options;
        // Set up checkbox toggle callback
        if (options.onCheckboxToggle) {
            setCheckboxToggleCallback(options.onCheckboxToggle);
        }
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
        // Set initial empty class
        if ((options.content || "").trim().length === 0) {
            this.view.dom.classList.add("cm-editor-empty");
        }
        // Auto-focus if requested
        if (options.autoFocus) {
            this.view.focus();
        }
    }
    buildExtensions() {
        const { options } = this;
        // Custom keymap for submit (Cmd/Ctrl+Enter)
        const submitKeymap = keymap.of([
            {
                key: "Mod-Enter",
                run: () => {
                    options.onSubmit?.();
                    return true;
                },
            },
        ]);
        // Placeholder extension
        const placeholderExt = EditorView.contentAttributes.of({
            "data-placeholder": options.placeholder || "What's on your mind?",
        });
        // Update listener for onChange and empty class
        const updateListener = EditorView.updateListener.of((update) => {
            if (update.docChanged) {
                const content = update.state.doc.toString();
                options.onChange?.(content);
                // Toggle empty class for placeholder
                const isEmpty = content.trim().length === 0;
                if (isEmpty) {
                    update.view.dom.classList.add("cm-editor-empty");
                }
                else {
                    update.view.dom.classList.remove("cm-editor-empty");
                }
            }
        });
        // Autocomplete with initial contacts/tags
        const autocompleteExt = createCaptureAutocomplete(options.contacts || [], options.existingTags || []);
        return [
            submitKeymap,
            history(),
            keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap, ...completionKeymap]),
            markdown({
                base: markdownLanguage,
                codeLanguages: languages,
            }),
            syntaxHighlighting(highlightStyle),
            baseEditorTheme,
            livePreviewPlugin,
            livePreviewTheme,
            // Mention handling: contacts facet and decorations
            contactsCompartment.of(contactsFacet.of(options.contacts || [])),
            mentionDecorationField,
            mentionTheme,
            autocompleteCompartment.of(autocompleteExt),
            autocompleteTheme,
            placeholderExt,
            updateListener,
            EditorView.lineWrapping,
            EditorState.readOnly.of(options.readonly || false),
            // Rich text paste handler (HTML → Markdown, image paste)
            createRichTextPasteHandler(),
        ];
    }
    /** Get the current content */
    getContent() {
        return this.view.state.doc.toString();
    }
    /** Set the content */
    setContent(content) {
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
    updateContacts(contacts) {
        // Update mention decorations
        this.view.dispatch({
            effects: contactsCompartment.reconfigure(contactsFacet.of(contacts)),
        });
        // Update autocomplete
        const newAutocomplete = createCaptureAutocomplete(contacts, this.options.existingTags || []);
        this.view.dispatch({
            effects: autocompleteCompartment.reconfigure(newAutocomplete),
        });
        // Store for future reference
        this.options.contacts = contacts;
    }
    /** Update existing tags for autocomplete */
    updateTags(tags) {
        const newAutocomplete = createCaptureAutocomplete(this.options.contacts || [], tags);
        this.view.dispatch({
            effects: autocompleteCompartment.reconfigure(newAutocomplete),
        });
        // Store for future reference
        this.options.existingTags = tags;
    }
    /** Focus the editor */
    focus() {
        this.view.focus();
    }
    /** Check if editor has focus */
    hasFocus() {
        return this.view.hasFocus;
    }
    /** Get the underlying EditorView (for advanced use) */
    getEditorView() {
        return this.view;
    }
    /** Destroy the editor and clean up */
    destroy() {
        this.view.destroy();
    }
}
//# sourceMappingURL=CaptureEditor.js.map