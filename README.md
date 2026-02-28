# Jotter

**Your quick notepad. Offline. Private. Yours.**

[jotter.live](https://jotter.live)

Jotter is a free, offline-first notepad that lives entirely in your browser. No accounts, no servers, no tracking. Your notes stay on your device.

## Features

### Editor
- **Rich Markdown** — Live preview with bold, italic, headings, lists, checklists, blockquotes, tables, and more
- **Code Blocks** — Syntax-highlighted with language labels, copy button, and adaptive light/dark colors
- **Math** — LaTeX rendering with KaTeX (inline `$...$` and block `$$...$$`)
- **Diagrams** — Mermaid flowcharts, sequence diagrams, and more with light/dark theme support
- **Tables** — Rendered as clean HTML tables with headers and alignment
- **Emoji** — Shortcodes like `:rocket:` rendered inline
- **Callouts** — `> [!tip]`, `> [!warning]`, `> [!note]`, `> [!info]`, `> [!danger]`, and more
- **Footnotes** — References and definitions with sequential numbering
- **Highlight, Super/Subscript** — `==highlight==`, `^super^`, `~sub~`
- **Definition Lists** — Term/definition pairs
- **Horizontal Rules** — Clean dividers

### Files
- **Paste, Drag-Drop, Upload** — Images and any file type stored locally in OPFS
- **Files Panel** — Browse, search, and insert stored files with date sorting
- **Inline Preview** — Images render inline, files show as clickable chips with the full filename
- **Click to Open** — Images and files open in a new tab

### Organization
- **Search** — Instant full-text search across all notes
- **Hashtags** — Organize notes with `#tags` that autocomplete from existing tags
- **Date Grouping** — Notes grouped by Today, Yesterday, This Week, Older
- **Trash** — Soft delete with configurable retention (7 days to never auto-delete)

### Interface
- **Three-Pane Layout** — Notes sidebar, editor, and files panel — all resizable with draggable borders
- **Formatting Toolbar** — Heading, bold, italic, strikethrough, code, code block, link, quote, bullet list, checklist, table, image
- **Hover Actions** — Triple-dot menu on notes for export and trash
- **Settings** — Theme (system/light/dark), font size, line height, content width, toolbar visibility
- **Landing Page** — Welcome screen on first visit with "Learn more" details
- **Keyboard Shortcuts** — Cmd/Ctrl+N (new), Cmd/Ctrl+Shift+F (search), Cmd/Ctrl+Shift+E (export), Cmd/Ctrl+B/I (bold/italic), Cmd/Ctrl+F (find)

### Data
- **Export/Import** — Full workspace as ZIP (notes with original IDs + files + settings) — additive import preserves existing notes
- **Single Note Export** — Individual notes via the action menu
- **Drag-Drop Import** — Drop `.md` or `.zip` files onto the sidebar
- **Cross-Browser Sync** — Export on one browser, import on another — settings included
- **Welcome Note** — First-time users get a comprehensive note demonstrating all features

### PWA
- **Installable** — Works as a standalone app on desktop and mobile
- **Fully Offline** — After first visit, no internet needed
- **Update Prompt** — New versions detected with refresh button
- **System Theme** — Adapts to light/dark mode with distinct syntax highlighting for code
- **Incognito Warning** — Detects private browsing and warns about data loss

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
- **Cloudflare Workers** — Hosting with static assets

## Getting Started

```bash
# Install dependencies
npm install

# Build the editor package
cd packages/capture-editor && npx tsc && cd ../..

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
  capture-editor/       # CodeMirror-based markdown editor with live preview
apps/
  jotter/               # The Jotter PWA
    src/
      components/       # UI (App, Sidebar, EditorPane, TopBar, Settings, etc.)
      editor/           # JotterEditor wrapper + jotter-file:// extension
      storage/          # IndexedDB notes + OPFS file storage
      styles/           # CSS (theme, layout, settings, landing)
      utils/            # Date grouping, search, zip export/import
    public/             # Static assets (icons, sitemap, robots.txt, OG image)
    wrangler.toml       # Cloudflare Workers deployment config
```

## Privacy

Everything stays in your browser:

- Notes stored in **IndexedDB**
- Files stored in the **Origin Private File System (OPFS)**
- Settings stored in **localStorage**
- No data leaves your device — ever
- No accounts, cookies, analytics, tracking, or servers
- Export your full workspace anytime as a ZIP backup
- Open source — [view the code](https://github.com/cankoe/jotter.live)

## License

MIT
