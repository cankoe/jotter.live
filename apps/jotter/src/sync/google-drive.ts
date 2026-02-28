import { getAccessToken } from "./google-auth";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
}

const FOLDER_KEY = "jotter-gdrive-folder";

let cachedFolderId: string | null = localStorage.getItem(FOLDER_KEY);
let cachedNotesFolderId: string | null = null;
let cachedFilesFolderId: string | null = null;

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return { Authorization: `Bearer ${token}` };
}

async function driveRequest(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = await authHeaders();
  const resp = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Drive API error ${resp.status}: ${body}`);
  }
  return resp;
}

/**
 * Find or create a folder with the given name under the specified parent.
 * Returns the folder ID.
 */
async function ensureFolder(name: string, parentId?: string): Promise<string> {
  const q = parentId
    ? `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    : `name='${name}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;

  const searchUrl = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`;
  const resp = await driveRequest(searchUrl);
  const data = await resp.json();

  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }

  // Create the folder
  const metadata: Record<string, unknown> = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) {
    metadata.parents = [parentId];
  }

  const createResp = await driveRequest(`${DRIVE_API}/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata),
  });
  const created = await createResp.json();
  return created.id;
}

/**
 * Ensure the Jotter folder structure exists:
 * Jotter/
 *   notes/
 *   files/
 * Returns { rootId, notesId, filesId }
 */
export async function ensureJotterFolder(): Promise<{ rootId: string; notesId: string; filesId: string }> {
  if (cachedFolderId && cachedNotesFolderId && cachedFilesFolderId) {
    return { rootId: cachedFolderId, notesId: cachedNotesFolderId, filesId: cachedFilesFolderId };
  }

  const rootId = await ensureFolder("Jotter");
  const notesId = await ensureFolder("notes", rootId);
  const filesId = await ensureFolder("files", rootId);

  cachedFolderId = rootId;
  cachedNotesFolderId = notesId;
  cachedFilesFolderId = filesId;
  localStorage.setItem(FOLDER_KEY, rootId);

  return { rootId, notesId, filesId };
}

/**
 * Get the URL to the Jotter folder in Google Drive.
 * Returns null if not yet synced.
 */
export function getJotterFolderUrl(): string | null {
  if (cachedFolderId) {
    return `https://drive.google.com/drive/folders/${cachedFolderId}`;
  }
  return null;
}

/**
 * List all files in a Drive folder.
 */
export async function listFiles(folderId: string): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "nextPageToken,files(id,name,mimeType,modifiedTime)",
      spaces: "drive",
      pageSize: "1000",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const resp = await driveRequest(`${DRIVE_API}/files?${params.toString()}`);
    const data = await resp.json();
    if (data.files) files.push(...data.files);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return files;
}

/**
 * Upload or update a file in Drive.
 * If existingFileId is provided, updates that file; otherwise creates a new one.
 */
export async function uploadFile(
  folderId: string,
  name: string,
  content: string | Blob,
  mimeType: string,
  existingFileId?: string,
): Promise<string> {
  const metadata: Record<string, unknown> = { name };
  if (!existingFileId) {
    metadata.parents = [folderId];
  }

  const body = typeof content === "string" ? new Blob([content], { type: mimeType }) : content;

  const boundary = "jotter_boundary_" + Date.now();
  const metaPart = JSON.stringify(metadata);

  // Build multipart body
  const parts: (string | Blob)[] = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaPart}\r\n`,
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    body,
    `\r\n--${boundary}--`,
  ];

  const multipartBody = new Blob(parts);

  const url = existingFileId
    ? `${UPLOAD_API}/files/${existingFileId}?uploadType=multipart`
    : `${UPLOAD_API}/files?uploadType=multipart`;

  const method = existingFileId ? "PATCH" : "POST";

  const resp = await driveRequest(url, {
    method,
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body: multipartBody,
  });

  const data = await resp.json();
  return data.id;
}

/**
 * Download a file's content from Drive.
 */
export async function downloadFile(fileId: string): Promise<Blob> {
  const resp = await driveRequest(`${DRIVE_API}/files/${fileId}?alt=media`);
  return resp.blob();
}

/**
 * Delete a file from Drive (permanent delete).
 */
export async function deleteFile(fileId: string): Promise<void> {
  await driveRequest(`${DRIVE_API}/files/${fileId}`, { method: "DELETE" });
}

/**
 * Clear cached folder IDs (e.g., on sign-out).
 */
export function clearFolderCache(): void {
  cachedFolderId = null;
  cachedNotesFolderId = null;
  cachedFilesFolderId = null;
  localStorage.removeItem(FOLDER_KEY);
}
