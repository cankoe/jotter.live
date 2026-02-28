/**
 * Shared types for the capture editor
 */

// Contact for mention resolution
export interface MentionContact {
  uid: string;
  handle: string;      // Slack-style handle, e.g., "chrisJohnson"
  displayName: string;
  email?: string;
}

// State for tracking when cursor is inside a mention (for widget visibility)
export interface MentionEditingState {
  /** Whether cursor is currently inside a mention */
  active: boolean;
  /** Position of @ in the document */
  atPos: number;
  /** End position of the handle text */
  endPos: number;
  /** The handle being edited */
  handle: string;
}

// Options for creating a capture editor
export interface CaptureEditorOptions {
  /** Initial content */
  content?: string;
  /** Placeholder text when empty */
  placeholder?: string;
  /** Whether the editor is readonly */
  readonly?: boolean;
  /** Whether to auto-focus on mount */
  autoFocus?: boolean;
  /** Contacts for mention autocomplete and resolution */
  contacts?: MentionContact[];
  /** Existing tags for hashtag autocomplete */
  existingTags?: string[];
  /** Callback when content changes */
  onChange?: (content: string) => void;
  /** Callback for Cmd/Ctrl+Enter */
  onSubmit?: () => void;
  /** Callback when a checkbox is toggled */
  onCheckboxToggle?: (pos: number, checked: boolean) => void;
}

// Events emitted by the editor
export type CaptureEditorEventType = 'change' | 'submit' | 'checkboxToggle';

export interface CaptureEditorChangeEvent {
  type: 'change';
  content: string;
}

export interface CaptureEditorSubmitEvent {
  type: 'submit';
}

export interface CaptureEditorCheckboxEvent {
  type: 'checkboxToggle';
  position: number;
  checked: boolean;
}

export type CaptureEditorEvent = 
  | CaptureEditorChangeEvent 
  | CaptureEditorSubmitEvent 
  | CaptureEditorCheckboxEvent;
