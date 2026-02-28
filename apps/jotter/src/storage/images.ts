export interface FileMeta {
  filename: string;
  addedAt: number;
}

export interface ImageStore {
  store(blob: Blob, originalName?: string): Promise<string>;
  retrieve(filename: string): Promise<Blob | undefined>;
  delete(filename: string): Promise<void>;
  list(): Promise<string[]>;
  listWithMeta(): Promise<FileMeta[]>;
}

function sanitizeName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim() || "file";
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "application/pdf": "pdf",
    "text/plain": "txt",
    "text/csv": "csv",
    "application/json": "json",
    "application/zip": "zip",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "video/mp4": "mp4",
    "video/webm": "webm",
  };
  return map[mime] || mime.split("/")[1]?.replace(/[^a-z0-9]/g, "") || "bin";
}

function deriveBasename(blob: Blob, originalName?: string): { base: string; ext: string } {
  if (originalName) {
    const sanitized = sanitizeName(originalName);
    const dotIdx = sanitized.lastIndexOf(".");
    if (dotIdx > 0) {
      return { base: sanitized.slice(0, dotIdx), ext: sanitized.slice(dotIdx + 1) };
    }
    return { base: sanitized, ext: extFromMime(blob.type) };
  }
  return { base: "pasted", ext: extFromMime(blob.type) };
}

/** In-memory implementation for testing */
export class MemoryImageStore implements ImageStore {
  private files = new Map<string, Blob>();
  private meta = new Map<string, FileMeta>();

  async store(blob: Blob, originalName?: string): Promise<string> {
    const { base, ext } = deriveBasename(blob, originalName);
    let filename = `${base}.${ext}`;
    let counter = 1;
    while (this.files.has(filename)) {
      const existing = this.files.get(filename)!;
      if (existing.size === blob.size) {
        const a = await existing.arrayBuffer();
        const b = await blob.arrayBuffer();
        if (buffersEqual(a, b)) return filename;
      }
      filename = `${base}-${counter++}.${ext}`;
    }
    this.files.set(filename, blob);
    this.meta.set(filename, { filename, addedAt: Date.now() });
    return filename;
  }

  async retrieve(filename: string): Promise<Blob | undefined> {
    return this.files.get(filename);
  }

  async delete(filename: string): Promise<void> {
    this.files.delete(filename);
    this.meta.delete(filename);
  }

  async list(): Promise<string[]> {
    return Array.from(this.files.keys());
  }

  async listWithMeta(): Promise<FileMeta[]> {
    return Array.from(this.meta.values()).sort((a, b) => b.addedAt - a.addedAt);
  }
}

/** OPFS implementation for the browser */
export class OPFSImageStore implements ImageStore {
  private dirHandle: FileSystemDirectoryHandle | null = null;
  private metaCache: Map<string, FileMeta> | null = null;

  private async getDir(): Promise<FileSystemDirectoryHandle> {
    if (!this.dirHandle) {
      const root = await navigator.storage.getDirectory();
      this.dirHandle = await root.getDirectoryHandle("files", { create: true });
    }
    return this.dirHandle;
  }

  private async fileExists(dir: FileSystemDirectoryHandle, name: string): Promise<boolean> {
    try {
      await dir.getFileHandle(name);
      return true;
    } catch {
      return false;
    }
  }

  private async loadMeta(): Promise<Map<string, FileMeta>> {
    if (this.metaCache) return this.metaCache;
    try {
      const dir = await this.getDir();
      const handle = await dir.getFileHandle("_meta.json");
      const file = await handle.getFile();
      const data = JSON.parse(await file.text()) as FileMeta[];
      this.metaCache = new Map(data.map((m) => [m.filename, m]));
    } catch {
      this.metaCache = new Map();
    }
    return this.metaCache;
  }

  private async saveMeta(): Promise<void> {
    const meta = await this.loadMeta();
    const dir = await this.getDir();
    const handle = await dir.getFileHandle("_meta.json", { create: true });
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(Array.from(meta.values())));
    await writable.close();
  }

  async store(blob: Blob, originalName?: string): Promise<string> {
    const { base, ext } = deriveBasename(blob, originalName);
    const dir = await this.getDir();
    let filename = `${base}.${ext}`;
    let counter = 1;

    while (await this.fileExists(dir, filename)) {
      const existing = await dir.getFileHandle(filename);
      const existingFile = await existing.getFile();
      if (existingFile.size === blob.size) {
        const a = await existingFile.arrayBuffer();
        const b = await blob.arrayBuffer();
        if (buffersEqual(a, b)) return filename;
      }
      filename = `${base}-${counter++}.${ext}`;
    }

    const fileHandle = await dir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();

    const meta = await this.loadMeta();
    meta.set(filename, { filename, addedAt: Date.now() });
    await this.saveMeta();

    return filename;
  }

  async retrieve(filename: string): Promise<Blob | undefined> {
    try {
      const dir = await this.getDir();
      const fileHandle = await dir.getFileHandle(filename);
      const file = await fileHandle.getFile();
      return file;
    } catch {
      return undefined;
    }
  }

  async delete(filename: string): Promise<void> {
    try {
      const dir = await this.getDir();
      await dir.removeEntry(filename);
      const meta = await this.loadMeta();
      meta.delete(filename);
      await this.saveMeta();
    } catch {
      // File didn't exist
    }
  }

  async list(): Promise<string[]> {
    const dir = await this.getDir();
    const names: string[] = [];
    for await (const [name] of (dir as any).entries()) {
      if (name !== "_meta.json") names.push(name);
    }
    return names;
  }

  async listWithMeta(): Promise<FileMeta[]> {
    const meta = await this.loadMeta();
    const filenames = await this.list();
    // Ensure all files have metadata (backfill for files added before metadata tracking)
    let dirty = false;
    for (const name of filenames) {
      if (!meta.has(name)) {
        meta.set(name, { filename: name, addedAt: 0 });
        dirty = true;
      }
    }
    // Remove stale metadata entries
    for (const key of meta.keys()) {
      if (!filenames.includes(key)) {
        meta.delete(key);
        dirty = true;
      }
    }
    if (dirty) await this.saveMeta();
    return Array.from(meta.values()).sort((a, b) => b.addedAt - a.addedAt);
  }
}

function buffersEqual(a: ArrayBuffer, b: ArrayBuffer): boolean {
  if (a.byteLength !== b.byteLength) return false;
  const va = new Uint8Array(a);
  const vb = new Uint8Array(b);
  for (let i = 0; i < va.length; i++) {
    if (va[i] !== vb[i]) return false;
  }
  return true;
}
