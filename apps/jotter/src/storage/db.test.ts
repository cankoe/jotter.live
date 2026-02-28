import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { NotesDB, type Note } from "./db";

describe("NotesDB", () => {
  let db: NotesDB;

  beforeEach(async () => {
    db = new NotesDB(`test-${Date.now()}-${Math.random()}`);
    await db.open();
  });

  describe("create", () => {
    it("creates a note and returns it with an id", async () => {
      const note = await db.create("Hello world");
      expect(note.id).toBeDefined();
      expect(note.content).toBe("Hello world");
      expect(note.title).toBe("Hello world");
      expect(note.deleted).toBe(false);
      expect(note.deletedAt).toBeNull();
    });

    it("derives title from first line", async () => {
      const note = await db.create("# My Heading\nSome body text");
      expect(note.title).toBe("# My Heading");
    });

    it("uses Untitled for empty content", async () => {
      const note = await db.create("");
      expect(note.title).toBe("Untitled");
    });
  });

  describe("get", () => {
    it("returns a note by id", async () => {
      const created = await db.create("Test note");
      const found = await db.get(created.id);
      expect(found).toEqual(created);
    });

    it("returns undefined for missing id", async () => {
      const found = await db.get("nonexistent");
      expect(found).toBeUndefined();
    });
  });

  describe("update", () => {
    it("updates content and title", async () => {
      const note = await db.create("Original");
      const updated = await db.update(note.id, { content: "Changed" });
      expect(updated.content).toBe("Changed");
      expect(updated.title).toBe("Changed");
      expect(updated.updatedAt).toBeGreaterThanOrEqual(note.updatedAt);
    });
  });

  describe("listActive", () => {
    it("returns non-deleted notes sorted by updatedAt desc", async () => {
      const a = await db.create("First");
      const b = await db.create("Second");
      const c = await db.create("Third");
      await db.softDelete(a.id);

      const active = await db.listActive();
      expect(active.map((n) => n.id)).toEqual([c.id, b.id]);
    });
  });

  describe("softDelete and restore", () => {
    it("moves note to trash", async () => {
      const note = await db.create("To delete");
      await db.softDelete(note.id);
      const found = await db.get(note.id);
      expect(found!.deleted).toBe(true);
      expect(found!.deletedAt).toBeGreaterThan(0);
    });

    it("restores note from trash", async () => {
      const note = await db.create("To restore");
      await db.softDelete(note.id);
      await db.restore(note.id);
      const found = await db.get(note.id);
      expect(found!.deleted).toBe(false);
      expect(found!.deletedAt).toBeNull();
    });
  });

  describe("listTrashed", () => {
    it("returns only deleted notes", async () => {
      await db.create("Active");
      const trashed = await db.create("Trashed");
      await db.softDelete(trashed.id);

      const list = await db.listTrashed();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(trashed.id);
    });
  });

  describe("purgeOldTrashed", () => {
    it("permanently deletes notes trashed more than N days ago", async () => {
      const note = await db.create("Old trash");
      await db.softDelete(note.id);
      // Manually backdate the deletedAt
      await db.update(note.id, {
        deletedAt: Date.now() - 31 * 24 * 60 * 60 * 1000,
      } as any);

      await db.purgeOldTrashed(30);
      const afterPurge = await db.get(note.id);
      expect(afterPurge).toBeUndefined();
    });
  });

  describe("hardDelete", () => {
    it("permanently removes a note", async () => {
      const note = await db.create("Gone forever");
      await db.hardDelete(note.id);
      expect(await db.get(note.id)).toBeUndefined();
    });
  });
});
