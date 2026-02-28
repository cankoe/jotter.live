import JSZip from "jszip";
import type { Note } from "../storage/db";
import type { ImageStore } from "../storage/images";

const JOTTER_FILE_RE = /jotter-file:\/\/([^\s)]+)/g;

/**
 * Export notes as a .zip blob.
 * - Each note becomes a .md file at the root
 * - jotter-file:// references are rewritten to relative images/filename paths
 * - Referenced images are included in an images/ folder
 */
export async function exportNotesToZip(
  notes: Note[],
  imageStore: ImageStore
): Promise<Blob> {
  const zip = new JSZip();
  const imageRefs = new Set<string>();

  for (const note of notes) {
    // Rewrite jotter-file:// to relative images/ path
    const mdContent = note.content.replace(JOTTER_FILE_RE, (_, filename) => {
      imageRefs.add(filename);
      return `images/${filename}`;
    });

    // Use title as filename, sanitized
    const safeName = sanitizeFilename(note.title || "Untitled");
    let filename = `${safeName}.md`;
    // Handle duplicate filenames
    let counter = 1;
    while (zip.file(filename)) {
      filename = `${safeName}-${counter++}.md`;
    }
    zip.file(filename, mdContent);
  }

  // Add referenced images
  const imgFolder = zip.folder("images");
  for (const ref of imageRefs) {
    const blob = await imageStore.retrieve(ref);
    if (blob && imgFolder) {
      const arrayBuffer = await blob.arrayBuffer();
      imgFolder.file(ref, arrayBuffer);
    }
  }

  const buf = await zip.generateAsync({ type: "arraybuffer" });
  return new Blob([buf], { type: "application/zip" });
}

function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "") // Remove illegal chars
      .replace(/^[.# ]+/, "") // Remove leading dots, hashes, spaces
      .substring(0, 100) // Limit length
      .trim() || "Untitled"
  );
}

/**
 * Import from a .zip or .md file.
 * Returns an array of notes to create and images to store.
 */
export async function importFromZip(file: File): Promise<{
  notes: { title: string; content: string }[];
  images: { filename: string; blob: Blob }[];
}> {
  if (file.name.endsWith(".zip")) {
    return parseZipFile(file);
  } else if (file.name.endsWith(".md")) {
    const text = await file.text();
    return {
      notes: [{ title: deriveTitle(text), content: rewriteRelativeImages(text) }],
      images: [],
    };
  }
  throw new Error(`Unsupported file type: ${file.name}`);
}

async function parseZipFile(file: File): Promise<{
  notes: { title: string; content: string }[];
  images: { filename: string; blob: Blob }[];
}> {
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const notes: { title: string; content: string }[] = [];
  const images: { filename: string; blob: Blob }[] = [];

  // Extract images first
  for (const [path, zipEntry] of Object.entries(zip.files)) {
    if (path.startsWith("images/") && !zipEntry.dir) {
      const filename = path.replace("images/", "");
      const arrayBuf = await zipEntry.async("arraybuffer");
      images.push({ filename, blob: new Blob([arrayBuf]) });
    }
  }

  // Extract .md files
  for (const [path, zipEntry] of Object.entries(zip.files)) {
    if (path.endsWith(".md") && !zipEntry.dir) {
      const text = await zipEntry.async("text");
      notes.push({
        title: deriveTitle(text),
        content: rewriteRelativeImages(text),
      });
    }
  }

  return { notes, images };
}

/**
 * Export entire workspace: all notes + all files in the store.
 * Structure: notes/*.md + files/* + metadata.json
 */
export async function exportWorkspace(
  notes: Note[],
  trashedNotes: Note[],
  fileStore: ImageStore
): Promise<Blob> {
  const zip = new JSZip();

  // Metadata: note IDs, timestamps, deleted state
  const metadata = {
    version: 1,
    exportedAt: Date.now(),
    notes: [...notes, ...trashedNotes].map((n) => ({
      id: n.id,
      title: n.title,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
      deleted: n.deleted,
      deletedAt: n.deletedAt,
    })),
  };
  zip.file("metadata.json", JSON.stringify(metadata, null, 2));

  // All notes as markdown
  const notesFolder = zip.folder("notes")!;
  for (const note of [...notes, ...trashedNotes]) {
    const safeName = sanitizeFilename(note.title || "Untitled");
    let filename = `${safeName}.md`;
    let counter = 1;
    while (notesFolder.file(filename)) {
      filename = `${safeName}-${counter++}.md`;
    }
    notesFolder.file(filename, note.content);
  }

  // All files from the store
  const filesFolder = zip.folder("files")!;
  const allFiles = await fileStore.list();
  for (const name of allFiles) {
    const blob = await fileStore.retrieve(name);
    if (blob) {
      filesFolder.file(name, await blob.arrayBuffer());
    }
  }

  const buf = await zip.generateAsync({ type: "arraybuffer" });
  return new Blob([buf], { type: "application/zip" });
}

/**
 * Import a full workspace zip. Returns notes to create and files to store.
 * Supports both workspace format (notes/ + files/) and legacy format (.md at root + images/).
 */
export async function importWorkspace(file: File): Promise<{
  notes: { title: string; content: string }[];
  files: { filename: string; blob: Blob }[];
}> {
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);

  const notes: { title: string; content: string }[] = [];
  const files: { filename: string; blob: Blob }[] = [];

  // Detect format: workspace (has notes/ folder) or legacy (has .md at root)
  const hasNotesFolder = Object.keys(zip.files).some((p) => p.startsWith("notes/"));

  if (hasNotesFolder) {
    // Workspace format
    for (const [path, entry] of Object.entries(zip.files)) {
      if (path.startsWith("notes/") && path.endsWith(".md") && !entry.dir) {
        const text = await entry.async("text");
        notes.push({ title: deriveTitle(text), content: text });
      }
      if (path.startsWith("files/") && !entry.dir) {
        const name = path.replace("files/", "");
        const arrayBuf = await entry.async("arraybuffer");
        files.push({ filename: name, blob: new Blob([arrayBuf]) });
      }
    }
  } else {
    // Legacy format (root .md + images/)
    const parsed = await parseZipFile(file);
    notes.push(...parsed.notes);
    files.push(...parsed.images.map((i) => ({ filename: i.filename, blob: i.blob })));
  }

  return { notes, files };
}

function deriveTitle(content: string): string {
  return content.split("\n")[0]?.trim() || "Untitled";
}

/** Rewrite images/filename references back to jotter-file:// */
function rewriteRelativeImages(content: string): string {
  return content.replace(/images\/([^\s)]+)/g, "jotter-file://$1");
}
