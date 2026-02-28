import type { NotesDB, Note } from "../storage/db";
import type { ImageStore } from "../storage/images";
import { loadSettings, type SettingsValues } from "../components/Settings";
import {
  ensureJotterFolder,
  listFiles,
  uploadFile,
  downloadFile,
  deleteFile,
  type DriveFile,
} from "./google-drive";

export type SyncDirection = "push" | "pull" | "both";

export interface SyncResult {
  notesUploaded: number;
  notesDownloaded: number;
  notesDeleted: number;
  filesUploaded: number;
  filesDownloaded: number;
}

// --- YAML frontmatter helpers ---

function serializeNote(note: Note): string {
  const frontmatter = [
    "---",
    `id: ${note.id}`,
    `title: ${escapeFrontmatterValue(note.title)}`,
    `createdAt: ${note.createdAt}`,
    `updatedAt: ${note.updatedAt}`,
    `deleted: ${note.deleted}`,
    `deletedAt: ${note.deletedAt === null ? "null" : note.deletedAt}`,
    "---",
  ].join("\n");
  return `${frontmatter}\n${note.content}`;
}

function escapeFrontmatterValue(value: string): string {
  // Wrap in quotes if it contains special YAML characters
  if (/[:#\[\]{}&*!|>'"%@`,?]/.test(value) || value.trim() !== value) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

function parseNote(text: string): Note | null {
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;

  const [, frontmatter, content] = match;
  const meta: Record<string, string> = {};

  for (const line of frontmatter.split("\n")) {
    const colonIdx = line.indexOf(": ");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 2).trim();
    // Unescape quoted strings
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
    meta[key] = value;
  }

  if (!meta.id) return null;

  return {
    id: meta.id,
    title: meta.title || "Untitled",
    createdAt: parseInt(meta.createdAt, 10) || Date.now(),
    updatedAt: parseInt(meta.updatedAt, 10) || Date.now(),
    deleted: meta.deleted === "true",
    deletedAt: meta.deletedAt === "null" || !meta.deletedAt ? null : parseInt(meta.deletedAt, 10),
    content,
  };
}

// --- Sync engine ---

export async function syncNotes(
  db: NotesDB,
  imageStore: ImageStore,
  direction: SyncDirection = "both",
): Promise<SyncResult> {
  const result: SyncResult = {
    notesUploaded: 0,
    notesDownloaded: 0,
    notesDeleted: 0,
    filesUploaded: 0,
    filesDownloaded: 0,
  };

  const { notesId, filesId, rootId } = await ensureJotterFolder();

  // --- Sync notes ---
  const localNotes = await db.getAll();
  const remoteNoteFiles = await listFiles(notesId);
  const remoteNoteMap = new Map<string, DriveFile>();
  for (const f of remoteNoteFiles) {
    // Extract note ID from filename: {id}.md
    const id = f.name.replace(/\.md$/, "");
    remoteNoteMap.set(id, f);
  }
  const localNoteMap = new Map<string, Note>();
  for (const n of localNotes) {
    localNoteMap.set(n.id, n);
  }

  if (direction === "push" || direction === "both") {
    // Upload local notes that are new or newer than remote
    for (const note of localNotes) {
      const remote = remoteNoteMap.get(note.id);
      if (!remote) {
        // Not in remote — upload
        if (!note.deleted) {
          await uploadFile(notesId, `${note.id}.md`, serializeNote(note), "text/markdown");
          result.notesUploaded++;
        }
      } else {
        const remoteModified = new Date(remote.modifiedTime).getTime();
        if (note.updatedAt > remoteModified) {
          // Local is newer — upload
          if (note.deleted && note.deletedAt && note.deletedAt > remoteModified) {
            // Note was locally deleted after remote was last modified — delete remote
            await deleteFile(remote.id);
            result.notesDeleted++;
          } else {
            await uploadFile(notesId, `${note.id}.md`, serializeNote(note), "text/markdown", remote.id);
            result.notesUploaded++;
          }
        }
      }
    }
  }

  if (direction === "pull" || direction === "both") {
    // Download remote notes that are new or newer than local
    for (const [noteId, remote] of remoteNoteMap) {
      const local = localNoteMap.get(noteId);
      const remoteModified = new Date(remote.modifiedTime).getTime();

      if (!local) {
        // Not in local — download
        const blob = await downloadFile(remote.id);
        const text = await blob.text();
        const parsed = parseNote(text);
        if (parsed) {
          await db.put(parsed);
          result.notesDownloaded++;
        }
      } else if (direction === "both" && remoteModified > local.updatedAt) {
        // Remote is newer — download and update
        const blob = await downloadFile(remote.id);
        const text = await blob.text();
        const parsed = parseNote(text);
        if (parsed) {
          await db.put(parsed);
          result.notesDownloaded++;
        }
      }
    }
  }

  // --- Sync files ---
  const localFileNames = await imageStore.list();
  const remoteFileList = await listFiles(filesId);
  const remoteFileMap = new Map<string, DriveFile>();
  for (const f of remoteFileList) {
    remoteFileMap.set(f.name, f);
  }

  if (direction === "push" || direction === "both") {
    // Upload local files not in remote
    for (const name of localFileNames) {
      if (!remoteFileMap.has(name)) {
        const blob = await imageStore.retrieve(name);
        if (blob) {
          await uploadFile(filesId, name, blob, blob.type || "application/octet-stream");
          result.filesUploaded++;
        }
      }
    }
  }

  if (direction === "pull" || direction === "both") {
    // Download remote files not in local
    const localFileSet = new Set(localFileNames);
    for (const [name, remote] of remoteFileMap) {
      if (!localFileSet.has(name)) {
        const blob = await downloadFile(remote.id);
        await imageStore.store(blob, name);
        result.filesDownloaded++;
      }
    }
  }

  // --- Upload settings ---
  if (direction === "push" || direction === "both") {
    const settings = loadSettings();
    const remoteRootFiles = await listFiles(rootId);
    const existingSettings = remoteRootFiles.find((f) => f.name === "settings.json");
    await uploadFile(
      rootId,
      "settings.json",
      JSON.stringify(settings, null, 2),
      "application/json",
      existingSettings?.id,
    );
  }

  // Store last sync time
  localStorage.setItem("jotter-last-sync", String(Date.now()));

  return result;
}

export function getLastSyncTime(): number | null {
  const raw = localStorage.getItem("jotter-last-sync");
  return raw ? parseInt(raw, 10) : null;
}
