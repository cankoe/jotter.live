# Jotter — Design Document

**Domain:** jotter.live
**Date:** 2026-02-27

## Overview

Jotter is an installable PWA notepad for quick brain dumps. Everything is stored locally in the browser (IndexedDB + OPFS). No server, no accounts, fully offline after first visit.

## Requirements

| Decision | Choice |
|---|---|
| Visual style | System-native (OS light/dark via `prefers-color-scheme`) |
| Note list | Date-grouped (Today, Yesterday, This Week, Older) + search, chronological within groups |
| Save behavior | Auto-save as you type (500ms debounce) |
| Images | Paste + drag-drop + upload button, stored as files in OPFS by content hash |
| Image references | `jotter-img://<sha256-hash>.<ext>` in markdown, resolved to blob URLs at render |
| Export | .md per note + images/ folder in .zip, relative image links |
| Import | .md files or .zip containing .md + images/ folder |
| Mentions/tags | Hashtags only (no @mentions) |
| Deletion | Trash bin, auto-purge after 30 days |
| Tech stack | Vanilla TypeScript + Vite, CaptureEditor from `@capture/editor` |
| PWA | Full offline, precached shell, service worker update prompt |

## Data Model

### IndexedDB — `jotter` database

**`notes` object store:**

```
id: string (uuid)
content: string (markdown)
title: string (derived from first line, or "Untitled")
createdAt: number (timestamp ms)
updatedAt: number (timestamp ms)
deleted: boolean (false = active, true = trashed)
deletedAt: number | null (timestamp when trashed, for 30-day auto-purge)
```

Indexes: `updatedAt`, `deleted`, `createdAt`.

### OPFS — `/images/` directory

Images stored as files: `/images/<sha256-hash>.<ext>`

Content-hashing provides deduplication. In markdown, referenced as `jotter-img://<hash>.<ext>`. At render time, resolved to `URL.createObjectURL()` blob URLs via a custom CodeMirror decoration.

## App Layout

```
+--------------------------------------------------+
|  Jotter                           [+] [gear] [v] |
+----------------+---------------------------------+
|  [search]      |                                 |
|----------------|   (CaptureEditor instance)      |
|  Today         |                                 |
|   * Meeting..  |   Auto-focused, ready to        |
|   * Quick th.. |   type / paste / drop           |
|  Yesterday     |                                 |
|   * Ideas fo.. |                                 |
|  This Week     |                                 |
|   * Project..  |                                 |
|  Older         |                                 |
|   * (more)     |                                 |
|----------------|                                 |
|  Trash (3)     |                                 |
+----------------+---------------------------------+
```

- **Left sidebar** (~250px): search bar, date-grouped note list, trash link at bottom
- **Main area**: CaptureEditor filling the space, auto-focused on open
- **Top bar**: App name, new note [+], settings [gear], export [download]
- **Mobile**: Sidebar collapses, hamburger to toggle, swipe to navigate

## Core Workflows

### Opening the app
1. Service worker serves cached shell instantly
2. IndexedDB loads note list, populates sidebar
3. Fresh empty note created, auto-focused
4. If previous note was empty (no content), discard it silently

### Typing/editing
1. CaptureEditor `onChange` fires on keystroke
2. Debounced save (500ms) writes to IndexedDB
3. Sidebar title/preview updates in real-time
4. Images pasted/dropped/uploaded: hash computed, stored in OPFS, `jotter-img://` reference inserted

### Switching notes
1. Click note in sidebar loads content into editor
2. Current note already auto-saved
3. Editor content replaced, scroll to top, cursor at end

### Deleting
1. Right-click or swipe: "Move to Trash"
2. Sets `deleted: true`, `deletedAt: now`
3. From Trash: "Restore" or "Delete Forever"
4. On app open: purge notes where `deletedAt` > 30 days

### Search
1. Search bar filters notes by full-text content match (includes hashtags)
2. Instant filtering, highlights matching notes
3. In-memory scan for reasonable note counts

### Export
1. Select notes (checkbox mode) or "Export All"
2. Generate .md per note, extract `jotter-img://` references
3. Pull image files from OPFS
4. Bundle into .zip (notes at root, images/ folder, relative links)
5. Trigger browser download

### Import
1. Accept .md files or .zip containing .md + images/
2. If .zip with images: store in OPFS, rewrite paths to `jotter-img://`
3. If standalone .md: import text, flag broken image references
4. If markdown contains base64 images: extract, store in OPFS, replace with `jotter-img://`

## Editor Adaptation

A `JotterEditor` wrapper class around `CaptureEditor`:

1. **Disable mentions** — no contacts, no mention decorations
2. **Keep hashtags** — live preview styling, useful for search
3. **Keep live preview** — bold, italic, code, headings, checkboxes, URL chips, blockquotes
4. **Keep rich-text paste** — HTML to markdown conversion
5. **Modify image paste** — intercept, hash, store OPFS, insert `jotter-img://`
6. **Add drag-drop** — handle `drop` events, same pipeline as paste
7. **Add image upload** — button/shortcut that opens file picker
8. **Add `jotter-img://` rendering** — custom decoration resolving to inline image previews
9. **System-native theme** — use `prefers-color-scheme`, CSS custom properties

## PWA & Service Worker

- **Precache** all shell assets on install
- **No runtime caching needed** — no external API calls
- **Update detection**: new service worker detected, show toast "New version available" with Refresh button, `skipWaiting()` + reload
- **Manifest**: `display: standalone`, standard icon sizes (192, 512), `start_url: /`
- **Fully offline** after first visit

## Project Structure

```
packages/
  capture-editor/          # existing, unchanged
apps/
  jotter/                  # new Vite app
    index.html
    src/
      main.ts              # entry, PWA registration
      styles/
        theme.css          # CSS vars, light/dark system-native
        layout.css         # sidebar, main area, responsive
      components/
        App.ts             # root, state management
        Sidebar.ts         # note list, search, date grouping, trash
        NoteItem.ts        # note preview in sidebar
        EditorPane.ts      # JotterEditor wrapper + toolbar
        TopBar.ts          # app name, action buttons
        Toast.ts           # notifications (update, undo)
        ImportExport.ts    # export .zip, import .md/.zip
        Settings.ts        # settings panel
      editor/
        JotterEditor.ts    # CaptureEditor wrapper
        imageExtension.ts  # drag-drop, upload, jotter-img:// rendering
      storage/
        db.ts              # IndexedDB wrapper (notes CRUD)
        images.ts          # OPFS image storage
      utils/
        dates.ts           # date grouping helpers
        search.ts          # full-text search
        zip.ts             # zip creation/extraction
      sw.ts                # service worker
    public/
      manifest.json
      icons/
    vite.config.ts
    tsconfig.json
    package.json
```
