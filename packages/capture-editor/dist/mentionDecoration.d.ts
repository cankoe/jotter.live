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
import { EditorState, StateField, Facet, Compartment } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import type { MentionContact } from "./types";
export declare const contactsFacet: Facet<MentionContact[], MentionContact[]>;
export declare const setContactsEffect: import("@codemirror/state").StateEffectType<MentionContact[]>;
export declare const contactsCompartment: Compartment;
export interface FoundMention {
    from: number;
    to: number;
    handle: string;
    fullMatch: string;
}
export declare function findMentions(state: EditorState): FoundMention[];
export declare function findMentionAtPosition(state: EditorState, pos: number): FoundMention | null;
export declare const mentionDecorationField: StateField<DecorationSet>;
export declare const mentionTheme: Extension;
export declare function createMentionExtension(initialContacts?: MentionContact[]): Extension;
export declare function updateContactsViaCompartment(view: EditorView, contacts: MentionContact[]): void;
//# sourceMappingURL=mentionDecoration.d.ts.map