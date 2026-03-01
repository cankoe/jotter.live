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

// --- Parallel execution helper ---

async function runParallel<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency = 5,
): Promise<void> {
  let i = 0;
  async function next(): Promise<void> {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => next());
  await Promise.all(workers);
}

// --- Sync engine ---

export async function syncNotes(
  db: NotesDB,
  imageStore: ImageStore,
  direction: SyncDirection = "both",
  onProgress?: (message: string, progress: number) => void,
): Promise<SyncResult> {
  const result: SyncResult = {
    notesUploaded: 0,
    notesDownloaded: 0,
    notesDeleted: 0,
    filesUploaded: 0,
    filesDownloaded: 0,
  };

  let completed = 0;
  let totalWork = 0;

  function report(msg: string): void {
    if (!onProgress) return;
    completed++;
    const pct = totalWork > 0 ? Math.round((completed / totalWork) * 100) : 0;
    onProgress(msg, Math.min(100, pct));
  }

  onProgress?.("Connecting to Google Drive...", 0);
  const { notesId, filesId, rootId } = await ensureJotterFolder();

  // --- Gather counts for progress ---
  onProgress?.("Comparing notes...", 0);
  const localNotes = await db.getAll();
  const remoteNoteFiles = await listFiles(notesId);
  const remoteNoteMap = new Map<string, DriveFile>();
  for (const f of remoteNoteFiles) {
    const id = f.name.replace(/\.md$/, "");
    remoteNoteMap.set(id, f);
  }
  const localNoteMap = new Map<string, Note>();
  for (const n of localNotes) {
    localNoteMap.set(n.id, n);
  }

  const localFileNames = await imageStore.list();
  const remoteFileList = await listFiles(filesId);
  const remoteFileMap = new Map<string, DriveFile>();
  for (const f of remoteFileList) {
    remoteFileMap.set(f.name, f);
  }

  // Count total work items for progress calculation
  totalWork = localNotes.length + remoteNoteMap.size + localFileNames.length + remoteFileMap.size + 1; // +1 for settings

  // --- Push notes (parallel) ---
  if (direction === "push" || direction === "both") {
    await runParallel(localNotes, async (note) => {
      const remote = remoteNoteMap.get(note.id);
      if (!remote) {
        if (!note.deleted) {
          report(`Uploading: ${note.title || "Untitled"}`);
          await uploadFile(notesId, `${note.id}.md`, serializeNote(note), "text/markdown");
          result.notesUploaded++;
        } else {
          report(`Skipping deleted`);
        }
      } else {
        const remoteModified = new Date(remote.modifiedTime).getTime();
        if (note.updatedAt > remoteModified) {
          if (note.deleted && note.deletedAt && note.deletedAt > remoteModified) {
            report(`Deleting remote: ${note.title || "Untitled"}`);
            await deleteFile(remote.id);
            result.notesDeleted++;
          } else {
            report(`Updating: ${note.title || "Untitled"}`);
            await uploadFile(notesId, `${note.id}.md`, serializeNote(note), "text/markdown", remote.id);
            result.notesUploaded++;
          }
        } else {
          report(`Up to date`);
        }
      }
    });
  } else {
    completed += localNotes.length;
  }

  // --- Pull notes (parallel) ---
  if (direction === "pull" || direction === "both") {
    const remoteEntries = Array.from(remoteNoteMap.entries());
    await runParallel(remoteEntries, async ([noteId, remote]) => {
      const local = localNoteMap.get(noteId);
      const remoteModified = new Date(remote.modifiedTime).getTime();
      if (!local) {
        report(`Downloading: ${remote.name}`);
        const blob = await downloadFile(remote.id);
        const text = await blob.text();
        const parsed = parseNote(text);
        if (parsed) {
          await db.put(parsed);
          result.notesDownloaded++;
        }
      } else if (direction === "both" && remoteModified > local.updatedAt) {
        report(`Updating local: ${remote.name}`);
        const blob = await downloadFile(remote.id);
        const text = await blob.text();
        const parsed = parseNote(text);
        if (parsed) {
          await db.put(parsed);
          result.notesDownloaded++;
        }
      } else {
        report(`Up to date`);
      }
    });
  } else {
    completed += remoteNoteMap.size;
  }

  // --- Push files (parallel) ---
  onProgress?.("Syncing files...", (completed / totalWork) * 100);

  if (direction === "push" || direction === "both") {
    const filesToUpload = localFileNames.filter((n) => !remoteFileMap.has(n));
    completed += localFileNames.length - filesToUpload.length; // skip already-synced
    await runParallel(filesToUpload, async (name) => {
      report(`Uploading: ${name}`);
      const blob = await imageStore.retrieve(name);
      if (blob) {
        await uploadFile(filesId, name, blob, blob.type || "application/octet-stream");
        result.filesUploaded++;
      }
    });
  } else {
    completed += localFileNames.length;
  }

  if (direction === "pull" || direction === "both") {
    const localFileSet = new Set(localFileNames);
    const filesToDownload = Array.from(remoteFileMap.entries()).filter(([n]) => !localFileSet.has(n));
    completed += remoteFileMap.size - filesToDownload.length; // skip already-synced
    await runParallel(filesToDownload, async ([name, remote]) => {
      report(`Downloading: ${name}`);
      const blob = await downloadFile(remote.id);
      await imageStore.store(blob, name);
      result.filesDownloaded++;
    });
  } else {
    completed += remoteFileMap.size;
  }

  // --- Upload settings ---
  if (direction === "push" || direction === "both") {
    report("Syncing settings...");
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
  } else {
    report("Skipping settings (pull-only)");
  }

  // Store last sync time
  localStorage.setItem("jotter-last-sync", String(Date.now()));

  return result;
}

export function getLastSyncTime(): number | null {
  const raw = localStorage.getItem("jotter-last-sync");
  return raw ? parseInt(raw, 10) : null;
}
