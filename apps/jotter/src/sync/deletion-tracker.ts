/**
 * Tracks locally deleted files so they can be removed from Drive on next sync.
 * Uses localStorage since OPFS deletions leave no trace.
 */

const KEY = "jotter-deleted-files";

export function trackFileDeletion(filename: string): void {
  const deleted = getDeletedFiles();
  deleted.add(filename);
  localStorage.setItem(KEY, JSON.stringify(Array.from(deleted)));
}

export function getDeletedFiles(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* ignore */ }
  return new Set();
}

export function clearDeletedFiles(): void {
  localStorage.removeItem(KEY);
}
