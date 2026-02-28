import { describe, it, expect } from "vitest";
import { exportNotesToZip, importFromZip } from "./zip";
import { MemoryImageStore } from "../storage/images";
import type { Note } from "../storage/db";
import JSZip from "jszip";

describe("exportNotesToZip", () => {
  it("creates a zip with .md files and images folder", async () => {
    const store = new MemoryImageStore();
    const imgBlob = new Blob([new Uint8Array([1, 2, 3])], {
      type: "image/png",
    });
    const filename = await store.store(imgBlob);

    const notes: Note[] = [
      {
        id: "1",
        content: `Hello ![pic](jotter-file://${filename})`,
        title: "Hello",
        createdAt: 1,
        updatedAt: 1,
        deleted: false,
        deletedAt: null,
      },
    ];

    const zipBlob = await exportNotesToZip(notes, store);
    const zip = await JSZip.loadAsync(await zipBlob.arrayBuffer());

    // Should have a .md file
    const mdFile = zip.file("Hello.md");
    expect(mdFile).toBeTruthy();
    const mdContent = await mdFile!.async("text");
    expect(mdContent).toContain(`images/${filename}`);
    expect(mdContent).not.toContain("jotter-file://");

    // Should have the image
    const imgFile = zip.file(`images/${filename}`);
    expect(imgFile).toBeTruthy();
  });

  it("handles duplicate note titles", async () => {
    const store = new MemoryImageStore();
    const notes: Note[] = [
      {
        id: "1",
        content: "First",
        title: "Note",
        createdAt: 1,
        updatedAt: 1,
        deleted: false,
        deletedAt: null,
      },
      {
        id: "2",
        content: "Second",
        title: "Note",
        createdAt: 2,
        updatedAt: 2,
        deleted: false,
        deletedAt: null,
      },
    ];

    const zipBlob = await exportNotesToZip(notes, store);
    const zip = await JSZip.loadAsync(await zipBlob.arrayBuffer());

    expect(zip.file("Note.md")).toBeTruthy();
    expect(zip.file("Note-1.md")).toBeTruthy();
  });
});

describe("importFromZip", () => {
  it("imports a .md file", async () => {
    const content = "# Hello\nSome text with images/photo.png reference";
    const file = new File([content], "test.md", { type: "text/markdown" });
    const result = await importFromZip(file);

    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].content).toContain("jotter-file://photo.png");
    expect(result.images).toHaveLength(0);
  });

  it("imports a .zip with .md and images", async () => {
    const zip = new JSZip();
    zip.file("note.md", "Hello images/pic.png world");
    zip.folder("images")!.file("pic.png", new Uint8Array([1, 2]));

    const zipArrayBuffer = await zip.generateAsync({ type: "arraybuffer" });
    const file = new File([zipArrayBuffer], "export.zip", {
      type: "application/zip",
    });
    const result = await importFromZip(file);

    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].content).toContain("jotter-file://pic.png");
    expect(result.images).toHaveLength(1);
    expect(result.images[0].filename).toBe("pic.png");
  });
});
