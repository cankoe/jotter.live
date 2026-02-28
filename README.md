# Jotter

**Your quick notepad. Offline. Private. Yours.**

[jotter.live](https://jotter.live)

Jotter is a free, offline-first notepad that lives entirely in your browser. No accounts, no servers, no tracking. Your notes stay on your device.

## Features

- **Rich Markdown Editor** — Live preview with bold, italic, headings, lists, checklists, blockquotes, and more
- **Code Blocks** — Syntax-highlighted with language labels and copy button
- **Math** — LaTeX rendering with KaTeX (inline `$...$` and block `$$...$$`)
- **Diagrams** — Mermaid flowcharts, sequence diagrams, and more
- **Tables** — Rendered as clean HTML tables
- **Files & Images** — Paste, drag-drop, or upload any file type
- **Emoji** — Shortcodes like `:rocket:` rendered inline
- **Callouts** — `> [!tip]`, `> [!warning]`, `> [!note]`, and more
- **Footnotes** — References and definitions
- **Search** — Instant full-text search across all notes
- **Hashtags** — Organize and find notes with `#tags` that autocomplete
- **Formatting Toolbar** — Bold, italic, code, links, lists, tables, images
- **Files Panel** — Browse and insert stored files with search and date sorting
- **Resizable Panes** — Three-pane layout (sidebar, editor, files) with draggable borders
- **Trash** — Soft delete with configurable retention (7 days to never)
- **Export/Import** — Full workspace as ZIP, individual notes as markdown
- **Settings** — Theme (system/light/dark), font size, line height, content width
- **PWA** — Installable on any device, works completely offline
- **System Theme** — Adapts to light/dark mode with distinct syntax highlighting

## Tech Stack

- **TypeScript** — Vanilla, no framework
- **Vite** — Build tool and dev server
- **CodeMirror 6** — Editor engine via `@capture/editor`
- **IndexedDB** — Note storage (via `idb`)
- **OPFS** — File/image storage (Origin Private File System)
- **KaTeX** — Math rendering
- **Mermaid** — Diagram rendering
- **JSZip** — Export/import
- **Workbox** — Service worker for offline support

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server
cd apps/jotter && npm run dev

# Run tests
cd apps/jotter && npm test

# Build for production
cd apps/jotter && npm run build
```

## Project Structure

```
packages/
  capture-editor/       # CodeMirror-based markdown editor
apps/
  jotter/               # The Jotter PWA
    src/
      components/       # UI components (App, Sidebar, EditorPane, etc.)
      editor/           # JotterEditor wrapper + image extension
      storage/          # IndexedDB + OPFS storage layers
      styles/           # CSS (theme, layout, settings, landing)
      utils/            # Date grouping, search, zip utilities
```

## Privacy

Everything stays in your browser:

- Notes are stored in **IndexedDB**
- Files are stored in the **Origin Private File System (OPFS)**
- No data leaves your device
- No accounts, cookies, analytics, or servers
- Export your workspace anytime as a ZIP backup

## License

MIT
