import type { NotesDB, Note } from "../storage/db";
import type { ImageStore } from "../storage/images";
import { loadSettings } from "../components/Settings";
import {
  ensureJotterFolder,
  listFiles,
  uploadFile,
  downloadFile,
  deleteFile,
  getStartPageToken,
  getChangesSinceLastSync,
  storeChangeToken,
  hasChangeToken,
  type DriveFile,
} from "./google-drive";

export interface SyncResult {
  notesUploaded: number;
  notesDownloaded: number;
  notesDeleted: number;
  filesUploaded: number;
  filesDownloaded: number;
}

type ProgressFn = (message: string, progress: number) => void;

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

// --- Main sync entry point ---

export async function syncNotes(
  db: NotesDB,
  imageStore: ImageStore,
  _direction: string = "both",
  onProgress?: ProgressFn,
): Promise<SyncResult> {
  onProgress?.("Connecting to Google Drive...", 0);
  const folders = await ensureJotterFolder();

  // If we have a change token, do a fast delta sync
  if (hasChangeToken()) {
    return deltaSync(db, imageStore, folders, onProgress);
  }

  // First sync — full bidirectional
  return fullSync(db, imageStore, folders, onProgress);
}

// --- Full sync (first time or after reset) ---

async function fullSync(
  db: NotesDB,
  imageStore: ImageStore,
  folders: { rootId: string; notesId: string; filesId: string },
  onProgress?: ProgressFn,
): Promise<SyncResult> {
  const result: SyncResult = {
    notesUploaded: 0, notesDownloaded: 0, notesDeleted: 0,
    filesUploaded: 0, filesDownloaded: 0,
  };

  // Get the start page token BEFORE we start syncing
  const startToken = await getStartPageToken();

  onProgress?.("Full sync: comparing notes...", 5);

  const localNotes = await db.getAll();
  const remoteNoteFiles = await listFiles(folders.notesId);
  const remoteNoteMap = new Map(remoteNoteFiles.map((f) => [f.name.replace(/\.md$/, ""), f]));
  const localNoteMap = new Map(localNotes.map((n) => [n.id, n]));

  const localFileNames = await imageStore.list();
  const remoteFileList = await listFiles(folders.filesId);
  const remoteFileMap = new Map(remoteFileList.map((f) => [f.name, f]));

  const totalItems = localNotes.length + remoteNoteMap.size + localFileNames.length + remoteFileMap.size + 1;
  let done = 0;
  const progress = (msg: string) => {
    done++;
    onProgress?.(msg, Math.min(95, Math.round((done / totalItems) * 100)));
  };

  // Push notes
  const notesToPush = localNotes.filter((n) => {
    const remote = remoteNoteMap.get(n.id);
    if (!remote) return !n.deleted;
    return n.updatedAt > new Date(remote.modifiedTime).getTime();
  });

  await runParallel(notesToPush, async (note) => {
    const remote = remoteNoteMap.get(note.id);
    if (note.deleted && note.deletedAt && remote) {
      progress(`Deleting: ${note.title}`);
      await deleteFile(remote.id);
      result.notesDeleted++;
    } else {
      progress(`Uploading: ${note.title}`);
      await uploadFile(folders.notesId, `${note.id}.md`, serializeNote(note), "text/markdown", remote?.id);
      result.notesUploaded++;
    }
  });
  done += localNotes.length - notesToPush.length; // count skipped

  // Pull notes
  const notesToPull = Array.from(remoteNoteMap.entries()).filter(([id, remote]) => {
    const local = localNoteMap.get(id);
    if (!local) return true;
    return new Date(remote.modifiedTime).getTime() > local.updatedAt;
  });

  await runParallel(notesToPull, async ([, remote]) => {
    progress(`Downloading: ${remote.name}`);
    const blob = await downloadFile(remote.id);
    const parsed = parseNote(await blob.text());
    if (parsed) { await db.put(parsed); result.notesDownloaded++; }
  });
  done += remoteNoteMap.size - notesToPull.length;

  // Push files (only missing)
  const filesToPush = localFileNames.filter((n) => !remoteFileMap.has(n));
  await runParallel(filesToPush, async (name) => {
    progress(`Uploading: ${name}`);
    const blob = await imageStore.retrieve(name);
    if (blob) { await uploadFile(folders.filesId, name, blob, blob.type || "application/octet-stream"); result.filesUploaded++; }
  });
  done += localFileNames.length - filesToPush.length;

  // Pull files (only missing)
  const localFileSet = new Set(localFileNames);
  const filesToPull = Array.from(remoteFileMap.entries()).filter(([n]) => !localFileSet.has(n));
  await runParallel(filesToPull, async ([name, remote]) => {
    progress(`Downloading: ${name}`);
    const blob = await downloadFile(remote.id);
    await imageStore.store(blob, name);
    result.filesDownloaded++;
  });
  done += remoteFileMap.size - filesToPull.length;

  // Settings
  onProgress?.("Syncing settings...", 95);
  const settings = loadSettings();
  const remoteRootFiles = await listFiles(folders.rootId);
  const existingSettings = remoteRootFiles.find((f) => f.name === "settings.json");
  await uploadFile(folders.rootId, "settings.json", JSON.stringify(settings, null, 2), "application/json", existingSettings?.id);

  // Store tokens
  storeChangeToken(startToken);
  localStorage.setItem("jotter-last-sync", String(Date.now()));

  onProgress?.("Done", 100);
  return result;
}

// --- Delta sync (fast, using change tokens) ---

async function deltaSync(
  db: NotesDB,
  imageStore: ImageStore,
  folders: { rootId: string; notesId: string; filesId: string },
  onProgress?: ProgressFn,
): Promise<SyncResult> {
  const result: SyncResult = {
    notesUploaded: 0, notesDownloaded: 0, notesDeleted: 0,
    filesUploaded: 0, filesDownloaded: 0,
  };

  onProgress?.("Checking for changes...", 10);

  // 1. Check what changed on Drive since last sync
  const changesResult = await getChangesSinceLastSync();

  if (!changesResult) {
    // No token — fall back to full sync
    return fullSync(db, imageStore, folders, onProgress);
  }

  const { changes, newToken } = changesResult;

  // Filter to changes in our Jotter folders
  const noteChanges: typeof changes = [];
  const fileChanges: typeof changes = [];

  for (const change of changes) {
    if (!change.file) {
      // File was deleted or we can't see it
      if (change.removed) {
        noteChanges.push(change); // Could be either — we'll check
        fileChanges.push(change);
      }
      continue;
    }
    // Check if file is in our folders (via parents)
    const file = change.file as DriveFile & { parents?: string[] };
    if ((file as any).parents?.includes(folders.notesId)) {
      noteChanges.push(change);
    } else if ((file as any).parents?.includes(folders.filesId)) {
      fileChanges.push(change);
    }
  }

  const totalWork = noteChanges.length + fileChanges.length + 1; // +1 for local push
  let done = 0;
  const progress = (msg: string) => {
    done++;
    onProgress?.(msg, Math.min(95, Math.round((done / Math.max(totalWork, 1)) * 100)));
  };

  // 2. Pull remote changes (notes — updated or new)
  for (const change of noteChanges) {
    if (change.removed || !change.file) {
      // File was removed from Drive — we'll catch this in the deletion check below
      progress("Checking removal");
      continue;
    }
    const noteId = change.file.name.replace(/\.md$/, "");
    const local = await db.get(noteId);
    const remoteModified = new Date(change.file.modifiedTime).getTime();

    if (!local || remoteModified > local.updatedAt) {
      progress(`Downloading: ${change.file.name}`);
      const blob = await downloadFile(change.fileId);
      const parsed = parseNote(await blob.text());
      if (parsed) { await db.put(parsed); result.notesDownloaded++; }
    } else {
      progress("Up to date");
    }
  }

  // 2b. Check for notes deleted on Drive (soft-delete locally)
  const hasRemovals = changes.some((c) => c.removed);
  if (hasRemovals) {
    const remoteNoteFiles = await listFiles(folders.notesId);
    const remoteNoteIds = new Set(remoteNoteFiles.map((f) => f.name.replace(/\.md$/, "")));
    const localNotes = await db.getAll();
    for (const note of localNotes) {
      if (!note.deleted && !remoteNoteIds.has(note.id)) {
        // Note exists locally but not on Drive — was deleted remotely
        progress(`Trashing: ${note.title}`);
        await db.softDelete(note.id);
        result.notesDeleted++;
      }
    }
  }

  // 3. Pull remote changes (files — updated or new)
  for (const change of fileChanges) {
    if (change.removed || !change.file) {
      progress("Checking removal");
      continue;
    }
    const name = change.file.name;
    const existing = await imageStore.retrieve(name);
    if (!existing) {
      progress(`Downloading: ${name}`);
      const blob = await downloadFile(change.fileId);
      await imageStore.store(blob, name);
      result.filesDownloaded++;
    } else {
      progress("Up to date");
    }
  }

  // 4. Push local changes since last sync
  onProgress?.("Pushing local changes...", 70);
  const lastSync = getLastSyncTime() || 0;
  const localNotes = await db.getAll();
  const changedNotes = localNotes.filter((n) => n.updatedAt > lastSync);

  if (changedNotes.length > 0) {
    // Need remote note list to get file IDs for updates
    const remoteNoteFiles = await listFiles(folders.notesId);
    const remoteNoteMap = new Map(remoteNoteFiles.map((f) => [f.name.replace(/\.md$/, ""), f]));

    await runParallel(changedNotes, async (note) => {
      const remote = remoteNoteMap.get(note.id);
      if (note.deleted && note.deletedAt && remote) {
        progress(`Deleting: ${note.title}`);
        await deleteFile(remote.id);
        result.notesDeleted++;
      } else if (!note.deleted) {
        progress(`Uploading: ${note.title}`);
        await uploadFile(folders.notesId, `${note.id}.md`, serializeNote(note), "text/markdown", remote?.id);
        result.notesUploaded++;
      }
    });
  }

  // Push new local files
  const localFileNames = await imageStore.list();
  const remoteFileList = await listFiles(folders.filesId);
  const remoteFileSet = new Set(remoteFileList.map((f) => f.name));
  const newFiles = localFileNames.filter((n) => !remoteFileSet.has(n));

  if (newFiles.length > 0) {
    await runParallel(newFiles, async (name) => {
      progress(`Uploading: ${name}`);
      const blob = await imageStore.retrieve(name);
      if (blob) { await uploadFile(folders.filesId, name, blob, blob.type || "application/octet-stream"); result.filesUploaded++; }
    });
  }

  // Settings
  onProgress?.("Syncing settings...", 95);
  const settings = loadSettings();
  const remoteRootFiles = await listFiles(folders.rootId);
  const existingSettings = remoteRootFiles.find((f) => f.name === "settings.json");
  await uploadFile(folders.rootId, "settings.json", JSON.stringify(settings, null, 2), "application/json", existingSettings?.id);

  // Store tokens
  storeChangeToken(newToken);
  localStorage.setItem("jotter-last-sync", String(Date.now()));

  onProgress?.("Done", 100);
  return result;
}

export function getLastSyncTime(): number | null {
  const raw = localStorage.getItem("jotter-last-sync");
  return raw ? parseInt(raw, 10) : null;
}
