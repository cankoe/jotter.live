import type { NotesDB } from "./storage/db";
import type { ImageStore } from "./storage/images";

const WELCOME_NOTE = `# Welcome to Jotter

Your quick notepad — offline, private, and yours.

## Text formatting

**Bold**, *italic*, ~~strikethrough~~, \`inline code\`, ==highlighted==, ^superscript^, ~subscript~

## Lists

- Drag-drop files onto the editor
- Paste images from your clipboard
- Search notes with Cmd/Ctrl + Shift + F
  - Nested lists work too
    - As deep as you need

1. Ordered lists
2. Also supported
3. With automatic numbering

## Checklists

- [x] Open Jotter
- [x] Read this welcome note
- [ ] Create your first note
- [ ] Try pasting an image
- [ ] Explore the settings

## Code blocks

\`\`\`javascript
// Syntax highlighting with language labels and copy button
function greet(name) {
  const message = \`Hello, \${name}!\`;
  console.log(message);
  return message;
}
\`\`\`

## Math (LaTeX)

Inline math: $E = mc^2$ and $\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$

Block math:

$$
\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}
$$

## Links & hashtags

Visit [jotter.live](https://jotter.live) anytime. Organize notes with hashtags like #welcome and #getting-started — they autocomplete!

## Blockquotes & callouts

> A simple blockquote

> [!tip] Pro tip
> Use callouts for notes, warnings, tips, and more.

> [!warning] Heads up
> Your data is stored only in this browser. Export regularly!

## Emoji

Type shortcodes: :wave: :rocket: :sparkles: :heart: :tada:

## Footnotes

Jotter uses IndexedDB[^1] and OPFS[^2] for storage.

[^1]: IndexedDB is a browser-native database for structured data.
[^2]: Origin Private File System — a fast, private file storage API.

## Horizontal rule

---

## Definition lists

Jotter
: A quick notepad that lives in your browser

OPFS
: Origin Private File System — stores files locally

## Tables

| Shortcut | Action |
| -------- | ------ |
| Cmd/Ctrl + N | New note |
| Cmd/Ctrl + Shift + F | Search notes |
| Cmd/Ctrl + Shift + E | Export workspace |
| Cmd/Ctrl + B | Bold |
| Cmd/Ctrl + I | Italic |
| Cmd/Ctrl + F | Find in note |

## Diagrams (Mermaid)

\`\`\`mermaid
graph LR
  A[Open Jotter] --> B[Write notes]
  B --> C{Need files?}
  C -->|Yes| D[Drag & drop]
  C -->|No| E[Keep writing]
  D --> E
  E --> F[Export anytime]
\`\`\`

A sequence diagram:

\`\`\`mermaid
sequenceDiagram
  participant You
  participant Jotter
  participant Browser
  You->>Jotter: Type a note
  Jotter->>Browser: Save to IndexedDB
  Browser-->>Jotter: Saved!
  You->>Jotter: Paste an image
  Jotter->>Browser: Store in OPFS
  Browser-->>Jotter: Stored!
\`\`\`

## Files & images

This note includes a sample image and file. Open the **Files** panel (paperclip icon) to see them. Click any file to insert it into a note.

![sample image](jotter-file://welcome.png)

[View sample file](jotter-file://readme.txt)

## More callout types

> [!note] Note
> Standard informational callout.

> [!info] Info
> Useful context or background.

> [!important] Important
> Don't miss this.

> [!danger] Danger
> Proceed with caution!

---

*Delete this note anytime — it's yours to keep or toss. Happy jotting!*
`;

/** Create a small PNG image (blue gradient square with "J") */
function createSampleImage(): Blob {
  const canvas = document.createElement("canvas");
  canvas.width = 200;
  canvas.height = 200;
  const ctx = canvas.getContext("2d")!;

  // Gradient background
  const grad = ctx.createLinearGradient(0, 0, 200, 200);
  grad.addColorStop(0, "#3b82f6");
  grad.addColorStop(1, "#1d4ed8");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 200, 200);

  // White "J" letter
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 120px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("J", 100, 105);

  // Convert to blob synchronously via data URL
  const dataUrl = canvas.toDataURL("image/png");
  const binary = atob(dataUrl.split(",")[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "image/png" });
}

/** Create a sample text file */
function createSampleFile(): Blob {
  const text = `Jotter — Quick Notepad
======================

This is a sample file stored in Jotter.

Your files are stored locally in your browser using the
Origin Private File System (OPFS). They never leave your device.

You can attach any file type: images, PDFs, documents,
spreadsheets, and more. Drag-drop them onto the editor
or use the + button in the Files panel.

To export everything, press Cmd/Ctrl + Shift + E or
go to Settings > Data > Export workspace.

Happy jotting!
`;
  return new Blob([text], { type: "text/plain" });
}

export async function createWelcomeNote(
  db: NotesDB,
  fileStore: ImageStore,
): Promise<void> {
  // Store sample files
  const imgBlob = createSampleImage();
  await fileStore.store(imgBlob, "welcome.png");

  const txtBlob = createSampleFile();
  await fileStore.store(txtBlob, "readme.txt");

  // Create the welcome note
  await db.create(WELCOME_NOTE);
}
