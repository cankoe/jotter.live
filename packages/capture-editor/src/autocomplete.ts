/**
 * Autocomplete Extension for CodeMirror 6
 * 
 * Provides autocomplete for:
 * - Mentions (@handle) - Slack-style handles
 * - Hashtags (#tag)
 */

import { autocompletion, CompletionContext, startCompletion } from "@codemirror/autocomplete";
import type { CompletionResult, Completion } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { MentionContact } from "./types";
import { emojiMap, emojiEntries } from "./emojiData";

// Mention autocomplete: triggered by @
function mentionCompletion(contacts: MentionContact[]) {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const beforeCursor = context.state.sliceDoc(
      Math.max(0, context.pos - 50),
      context.pos
    );

    // Match @word pattern (alphanumeric after @)
    const match = beforeCursor.match(/(?:^|[^@\w])@([a-zA-Z0-9]*)$/);
    if (!match) return null;

    const query = match[1].toLowerCase().trim();
    const from = context.pos - match[1].length;

    // Filter contacts by query - match on displayName or handle
    const filteredContacts = contacts.filter(contact => {
      const nameMatch = contact.displayName.toLowerCase().includes(query);
      const handleMatch = contact.handle.toLowerCase().includes(query);
      const emailMatch = contact.email?.toLowerCase().includes(query);
      return nameMatch || handleMatch || emailMatch;
    });

    const options: Completion[] = filteredContacts.slice(0, 10).map(contact => ({
      label: contact.displayName,
      detail: `@${contact.handle}`,
      type: "text",
      apply: (view, completion, from, to) => {
        // Insert @handle followed by a space
        const insert = `${contact.handle} `;
        view.dispatch({
          changes: { from, to, insert },
          selection: { anchor: from + insert.length },
        });
      },
    }));

    // Add option to create new mention (stub) if no exact match
    if (query.length > 0 && !filteredContacts.some(c =>
      c.handle.toLowerCase() === query.toLowerCase()
    )) {
      options.push({
        label: query,
        detail: "New contact (stub)",
        type: "text",
        boost: -1,
        apply: (view, completion, from, to) => {
          // Insert the query as-is (will create stub on save)
          const insert = `${query} `;
          view.dispatch({
            changes: { from, to, insert },
            selection: { anchor: from + insert.length },
          });
        },
      });
    }

    return {
      from,
      options,
      validFor: /^[a-zA-Z0-9]*$/,
    };
  };
}

// Hashtag autocomplete: triggered by #
function hashtagCompletion(existingTags: string[]) {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const beforeCursor = context.state.sliceDoc(
      Math.max(0, context.pos - 50),
      context.pos
    );

    const match = beforeCursor.match(/(?:^|[^#\w])#([\w/-]*)$/);
    if (!match) return null;

    const query = match[1].toLowerCase();
    const from = context.pos - match[1].length;

    // Filter existing tags
    const filteredTags = existingTags.filter(tag =>
      tag.toLowerCase().includes(query)
    );

    const options: Completion[] = filteredTags.slice(0, 10).map(tag => ({
      label: tag,
      type: "text",
      apply: (view, completion, from, to) => {
        const insert = `${tag} `;
        view.dispatch({
          changes: { from, to, insert },
          selection: { anchor: from + insert.length },
        });
      },
    }));

    // Add query as option if it's new
    if (query.length > 0 && !filteredTags.some(t => t.toLowerCase() === query)) {
      options.push({
        label: query,
        detail: "New tag",
        type: "text",
        boost: -1,
        apply: (view, completion, from, to) => {
          const insert = `${query} `;
          view.dispatch({
            changes: { from, to, insert },
            selection: { anchor: from + insert.length },
          });
        },
      });
    }

    return {
      from,
      options,
      validFor: /^[\w-]*$/,
    };
  };
}

// Emoji autocomplete: triggered by :, Slack-style (emoji on left, :shortcode: label)
function emojiCompletion() {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const beforeCursor = context.state.sliceDoc(
      Math.max(0, context.pos - 40),
      context.pos
    );

    // Match :shortcode pattern — allow at start of line or after whitespace/punctuation
    const match = beforeCursor.match(/(?:^|[\s(,;])(:([a-z0-9_+\-]*))$/);
    if (!match) return null;

    const query = match[2].toLowerCase();
    // from includes the colon
    const from = context.pos - match[1].length;

    // Prioritize: prefix matches first, then substring matches
    const prefixMatches: [string, string][] = [];
    const substringMatches: [string, string][] = [];
    for (const [code, emoji] of emojiEntries) {
      if (code.startsWith(query)) prefixMatches.push([code, emoji]);
      else if (code.includes(query)) substringMatches.push([code, emoji]);
    }
    const filtered = [...prefixMatches, ...substringMatches].slice(0, 16);

    const options: Completion[] = filtered.map(([code, emoji]) => ({
      label: `:${code}:`,
      displayLabel: `:${code}:`,
      type: "emoji",
      detail: emoji,   // stored for addToOptions renderer
      apply: (view, _completion, from, to) => {
        view.dispatch({
          changes: { from, to, insert: emoji },
          selection: { anchor: from + emoji.length },
        });
      },
    }));

    return {
      from,
      options,
      validFor: /^:[a-z0-9_+\-]*$/,
    };
  };
}

// Create the autocomplete extension
export function createCaptureAutocomplete(
  contacts: MentionContact[] = [],
  existingTags: string[] = [],
): Extension {
  return autocompletion({
    override: [
      mentionCompletion(contacts),
      hashtagCompletion(existingTags),
      emojiCompletion(),
    ],
    defaultKeymap: true,
    closeOnBlur: true,
    icons: false,
    addToOptions: [
      {
        // Render emoji character on the left side of each emoji option
        render(completion: Completion): Node | null {
          if (completion.type !== "emoji" || !completion.detail) return null;
          const span = document.createElement("span");
          span.className = "cm-autocomplete-emoji-icon";
          span.textContent = completion.detail;
          return span;
        },
        position: 20, // before label (label is at 50)
      },
    ],
    optionClass: (completion) => {
      if (completion.detail === "New contact (stub)" ||
        completion.detail === "New tag") {
        return "cm-autocomplete-create";
      }
      if (completion.type === "emoji") {
        return "cm-autocomplete-emoji";
      }
      return "";
    },
  });
}

// Theme for autocomplete
export const autocompleteTheme = EditorView.theme({
  ".cm-tooltip-autocomplete": {
    backgroundColor: "var(--bg-card, #1f2937)",
    border: "1px solid var(--border-color, #374151)",
    borderRadius: "8px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
  },
  ".cm-completionLabel": {
    color: "var(--text-primary, #fff)",
  },
  ".cm-completionDetail": {
    color: "var(--text-muted, #9ca3af)",
    marginLeft: "0.5em",
    fontSize: "0.9em",
  },
  ".cm-completionMatchedText": {
    color: "var(--accent, #3b82f6)",
    fontWeight: "bold",
    textDecoration: "none",
  },
  ".cm-autocomplete-create .cm-completionLabel": {
    color: "var(--accent, #3b82f6)",
  },
  // Emoji picker — Slack style
  ".cm-autocomplete-emoji": {
    display: "flex",
    alignItems: "center",
    gap: "0",
  },
  ".cm-autocomplete-emoji .cm-completionDetail": {
    // Hide the raw emoji character in detail (it's shown via the icon span)
    display: "none",
  },
  ".cm-autocomplete-emoji .cm-completionLabel": {
    color: "var(--text-muted, #9ca3af)",
    fontFamily: "monospace",
    fontSize: "0.9em",
  },
  ".cm-autocomplete-emoji .cm-completionMatchedText": {
    color: "var(--text-primary, #fff)",
    fontWeight: "bold",
    textDecoration: "none",
  },
  ".cm-autocomplete-emoji-icon": {
    fontSize: "1.4em",
    lineHeight: "1",
    marginRight: "0.5em",
    flexShrink: "0",
    width: "1.6em",
    textAlign: "center",
  },
});

// Programmatically trigger autocomplete
export function triggerAutocomplete(view: EditorView): void {
  startCompletion(view);
}
