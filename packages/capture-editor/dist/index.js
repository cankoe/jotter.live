/**
 * @capture/editor - Shared CodeMirror-based capture editor
 *
 * A framework-agnostic rich text editor for captures with:
 * - Live preview (markdown, hashtags, URLs)
 * - Mention autocomplete and resolution (@handle format)
 * - Checkbox interactivity
 * - Cmd/Ctrl+Enter submission
 */
// Main editor class
export { CaptureEditor } from "./CaptureEditor";
// Individual extensions (for advanced customization)
export { contactsFacet, contactsCompartment, mentionDecorationField, mentionTheme, createMentionExtension, updateContactsViaCompartment, setContactsEffect, findMentions, findMentionAtPosition, } from "./mentionDecoration";
export { livePreviewPlugin, livePreviewTheme, setCheckboxToggleCallback, } from "./livePreview";
export { createCaptureAutocomplete, autocompleteTheme, triggerAutocomplete, } from "./autocomplete";
//# sourceMappingURL=index.js.map