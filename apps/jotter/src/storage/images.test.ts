import { describe, it, expect, beforeEach } from "vitest";
import { MemoryImageStore } from "./images";

describe("ImageStore", () => {
  let store: MemoryImageStore;

  beforeEach(() => {
    store = new MemoryImageStore();
  });

  it("stores a file with original name", async () => {
    const data = new Uint8Array([137, 80, 78, 71]);
    const blob = new Blob([data], { type: "image/png" });
    const filename = await store.store(blob, "screenshot.png");
    expect(filename).toBe("screenshot.png");
  });

  it("uses fallback name for clipboard paste (no name)", async () => {
    const data = new Uint8Array([137, 80, 78, 71]);
    const blob = new Blob([data], { type: "image/png" });
    const filename = await store.store(blob);
    expect(filename).toBe("pasted.png");
  });

  it("adds incrementing number for duplicate names with different content", async () => {
    const blob1 = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    const blob2 = new Blob([new Uint8Array([4, 5, 6])], { type: "image/png" });
    const f1 = await store.store(blob1, "photo.png");
    const f2 = await store.store(blob2, "photo.png");
    expect(f1).toBe("photo.png");
    expect(f2).toBe("photo-1.png");
  });

  it("deduplicates identical content with same name", async () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    const blob1 = new Blob([data], { type: "image/jpeg" });
    const blob2 = new Blob([data], { type: "image/jpeg" });
    const f1 = await store.store(blob1, "pic.jpg");
    const f2 = await store.store(blob2, "pic.jpg");
    expect(f1).toBe("pic.jpg");
    expect(f2).toBe("pic.jpg");
  });

  it("retrieves a stored file", async () => {
    const data = new Uint8Array([10, 20, 30]);
    const blob = new Blob([data], { type: "image/png" });
    const filename = await store.store(blob, "test.png");
    const retrieved = await store.retrieve(filename);
    expect(retrieved).toBeDefined();
  });

  it("returns undefined for missing files", async () => {
    const result = await store.retrieve("nonexistent.png");
    expect(result).toBeUndefined();
  });

  it("deletes a file", async () => {
    const blob = new Blob([new Uint8Array([5, 6])], { type: "image/png" });
    const filename = await store.store(blob, "delete-me.png");
    await store.delete(filename);
    const result = await store.retrieve(filename);
    expect(result).toBeUndefined();
  });

  it("lists all stored filenames", async () => {
    const b1 = new Blob([new Uint8Array([1])], { type: "image/png" });
    const b2 = new Blob([new Uint8Array([2])], { type: "application/pdf" });
    const f1 = await store.store(b1, "image.png");
    const f2 = await store.store(b2, "report.pdf");
    const list = await store.list();
    expect(list).toContain(f1);
    expect(list).toContain(f2);
  });
});
