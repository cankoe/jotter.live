/**
 * Autocomplete Extension for CodeMirror 6
 *
 * Provides autocomplete for:
 * - Mentions (@handle) - Slack-style handles
 * - Hashtags (#tag)
 */
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { MentionContact } from "./types";
export declare function createCaptureAutocomplete(contacts?: MentionContact[], existingTags?: string[]): Extension;
export declare const autocompleteTheme: Extension;
export declare function triggerAutocomplete(view: EditorView): void;
//# sourceMappingURL=autocomplete.d.ts.map