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
import { EditorView } from "@codemirror/view";
import type { CaptureEditorOptions, MentionContact } from "./types";
export declare class CaptureEditor {
    private view;
    private container;
    private options;
    constructor(container: HTMLElement, options?: CaptureEditorOptions);
    private buildExtensions;
    /** Get the current content */
    getContent(): string;
    /** Set the content */
    setContent(content: string): void;
    /** Update contacts for mention resolution and autocomplete */
    updateContacts(contacts: MentionContact[]): void;
    /** Update existing tags for autocomplete */
    updateTags(tags: string[]): void;
    /** Focus the editor */
    focus(): void;
    /** Check if editor has focus */
    hasFocus(): boolean;
    /** Get the underlying EditorView (for advanced use) */
    getEditorView(): EditorView;
    /** Destroy the editor and clean up */
    destroy(): void;
}
//# sourceMappingURL=CaptureEditor.d.ts.map