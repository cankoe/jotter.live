/**
 * @capture/editor - Shared CodeMirror-based capture editor
 *
 * A framework-agnostic rich text editor for captures with:
 * - Live preview (markdown, hashtags, URLs)
 * - Mention autocomplete and resolution (@handle format)
 * - Checkbox interactivity
 * - Cmd/Ctrl+Enter submission
 */
export { CaptureEditor } from "./CaptureEditor";
export type { MentionContact, MentionEditingState, CaptureEditorOptions, CaptureEditorEventType, CaptureEditorEvent, CaptureEditorChangeEvent, CaptureEditorSubmitEvent, CaptureEditorCheckboxEvent, } from "./types";
export { contactsFacet, contactsCompartment, mentionDecorationField, mentionTheme, createMentionExtension, updateContactsViaCompartment, setContactsEffect, findMentions, findMentionAtPosition, } from "./mentionDecoration";
export type { FoundMention } from "./mentionDecoration";
export { livePreviewPlugin, livePreviewTheme, setCheckboxToggleCallback, } from "./livePreview";
export { createCaptureAutocomplete, autocompleteTheme, triggerAutocomplete, } from "./autocomplete";
//# sourceMappingURL=index.d.ts.map