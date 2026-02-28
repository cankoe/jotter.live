/**
 * Mention Decoration Extension for CodeMirror 6
 * 
 * Replaces @handle mentions with display name widgets.
 * Uses a Facet to inject contact data into the editor state.
 * 
 * Stored format: @chrisJohnson (Slack-style handle)
 * Display: Chip showing "Chris Johnson"
 * When editing: Shows raw @chrisJohnson with autocomplete
 */

import { EditorState, StateField, StateEffect, Facet, RangeSet, Compartment } from "@codemirror/state";
import type { Extension, Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import type { MentionContact } from "./types";

// Facet to provide contacts to the editor
export const contactsFacet = Facet.define<MentionContact[], MentionContact[]>({
  combine: (values) => values.flat(),
});

// Effect to update contacts
export const setContactsEffect = StateEffect.define<MentionContact[]>();

// Compartment for dynamic contact updates
export const contactsCompartment = new Compartment();

// Widget that displays a contact's display name as a chip
class MentionWidget extends WidgetType {
  constructor(
    readonly displayName: string,
    readonly handle: string
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-mention-chip";
    span.textContent = `@${this.displayName}`;
    span.title = `@${this.handle}`;
    return span;
  }

  eq(other: MentionWidget): boolean {
    return this.handle === other.handle && this.displayName === other.displayName;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

// Regex to match @handle mentions (alphanumeric starting with letter)
// This matches Slack-style handles like @chrisJohnson, @user2, etc.
const mentionRegex = /@([a-zA-Z][a-zA-Z0-9]*)/g;

// Interface for a found mention
export interface FoundMention {
  from: number;
  to: number;
  handle: string;
  fullMatch: string;
}

// Find all mentions in the document
export function findMentions(state: EditorState): FoundMention[] {
  const mentions: FoundMention[] = [];
  const doc = state.doc;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const lineText = line.text;
    const lineFrom = line.from;

    let match;
    mentionRegex.lastIndex = 0;
    
    while ((match = mentionRegex.exec(lineText)) !== null) {
      mentions.push({
        from: lineFrom + match.index,
        to: lineFrom + match.index + match[0].length,
        handle: match[1],
        fullMatch: match[0],
      });
    }
  }

  return mentions;
}

// Find a mention at a specific cursor position
export function findMentionAtPosition(state: EditorState, pos: number): FoundMention | null {
  const mentions = findMentions(state);
  return mentions.find(m => pos >= m.from && pos <= m.to) || null;
}

// Build decorations for mentions
function buildMentionDecorations(state: EditorState): DecorationSet {
  const contacts = state.facet(contactsFacet);
  // Map by handle (lowercase for case-insensitive lookup)
  const contactMap = new Map(contacts.map(c => [c.handle.toLowerCase(), c]));
  
  const decorations: Range<Decoration>[] = [];
  const doc = state.doc;
  
  // Check if this is a readonly editor
  const isReadonly = state.facet(EditorState.readOnly);
  const cursorPos = state.selection.main.head;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const lineText = line.text;
    const lineFrom = line.from;

    let match;
    mentionRegex.lastIndex = 0;
    
    while ((match = mentionRegex.exec(lineText)) !== null) {
      const from = lineFrom + match.index;
      const to = from + match[0].length;
      const handle = match[1];
      
      // Check if cursor is inside this mention
      const cursorInMention = !isReadonly && cursorPos >= from && cursorPos <= to;
      
      // Look up contact by handle (case-insensitive)
      const contact = contactMap.get(handle.toLowerCase());
      
      // Only show widget if:
      // 1. Contact exists for this handle
      // 2. Cursor is not inside the mention (to allow editing)
      if (contact && !cursorInMention) {
        decorations.push(
          Decoration.replace({
            widget: new MentionWidget(contact.displayName, handle),
          }).range(from, to)
        );
      }
    }
  }

  return RangeSet.of(decorations, true);
}

// StateField that computes and caches mention decorations
export const mentionDecorationField = StateField.define<DecorationSet>({
  create(state) {
    return buildMentionDecorations(state);
  },
  
  update(decorations, tr) {
    // Rebuild decorations on document change, selection change, or contacts update
    if (tr.docChanged || tr.selection || tr.effects.some(e => e.is(setContactsEffect))) {
      return buildMentionDecorations(tr.state);
    }
    return decorations.map(tr.changes);
  },
  
  provide(field) {
    return EditorView.decorations.from(field);
  },
});

// Theme for mention chips
export const mentionTheme = EditorView.theme({
  ".cm-mention-chip": {
    display: "inline",
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    color: "#22c55e",
    padding: "0.1em 0.4em",
    borderRadius: "4px",
    fontWeight: "500",
    cursor: "default",
    whiteSpace: "nowrap",
  },
});

// Create the extension with initial contacts
export function createMentionExtension(initialContacts: MentionContact[] = []): Extension {
  return [
    contactsCompartment.of(contactsFacet.of(initialContacts)),
    mentionDecorationField,
    mentionTheme,
  ];
}

// Update contacts using compartment reconfiguration
export function updateContactsViaCompartment(view: EditorView, contacts: MentionContact[]): void {
  view.dispatch({
    effects: contactsCompartment.reconfigure(contactsFacet.of(contacts)),
  });
}
