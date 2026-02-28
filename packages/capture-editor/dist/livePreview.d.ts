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
import { ViewPlugin } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
export declare function setCheckboxToggleCallback(callback: (pos: number, checked: boolean) => void): void;
export declare const livePreviewPlugin: ViewPlugin<{
    decorations: DecorationSet;
    update(update: ViewUpdate): void;
}, undefined>;
export declare const livePreviewTheme: import("@codemirror/state").Extension;
//# sourceMappingURL=livePreview.d.ts.map