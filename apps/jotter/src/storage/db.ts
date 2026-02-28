import { openDB, type IDBPDatabase } from "idb";

export interface Note {
  id: string;
  content: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
  deletedAt: number | null;
}

function deriveTitle(content: string): string {
  const firstLine = content.split("\n")[0]?.trim();
  return firstLine || "Untitled";
}

export class NotesDB {
  private db: IDBPDatabase | null = null;
  private dbName: string;
  private lastTimestamp = 0;

  constructor(dbName = "jotter") {
    this.dbName = dbName;
  }

  /** Returns a monotonically increasing timestamp to guarantee ordering. */
  private now(): number {
    const ts = Date.now();
    this.lastTimestamp = ts > this.lastTimestamp ? ts : this.lastTimestamp + 1;
    return this.lastTimestamp;
  }

  async open(): Promise<void> {
    this.db = await openDB(this.dbName, 1, {
      upgrade(db) {
        const store = db.createObjectStore("notes", { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
        store.createIndex("deleted", "deleted");
        store.createIndex("createdAt", "createdAt");
      },
    });
  }

  private getDB(): IDBPDatabase {
    if (!this.db) throw new Error("Database not opened. Call open() first.");
    return this.db;
  }

  async create(content: string): Promise<Note> {
    const now = this.now();
    const note: Note = {
      id: crypto.randomUUID(),
      content,
      title: deriveTitle(content),
      createdAt: now,
      updatedAt: now,
      deleted: false,
      deletedAt: null,
    };
    await this.getDB().put("notes", note);
    return note;
  }

  async get(id: string): Promise<Note | undefined> {
    return this.getDB().get("notes", id);
  }

  async update(
    id: string,
    changes: Partial<Pick<Note, "content" | "deletedAt">>
  ): Promise<Note> {
    const db = this.getDB();
    const note = await db.get("notes", id);
    if (!note) throw new Error(`Note ${id} not found`);

    const updated: Note = {
      ...note,
      ...changes,
      title:
        changes.content !== undefined
          ? deriveTitle(changes.content)
          : note.title,
      updatedAt: this.now(),
    };
    await db.put("notes", updated);
    return updated;
  }

  async listActive(): Promise<Note[]> {
    const all = await this.getDB().getAll("notes");
    return all
      .filter((n) => !n.deleted)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async listTrashed(): Promise<Note[]> {
    const all = await this.getDB().getAll("notes");
    return all
      .filter((n) => n.deleted)
      .sort((a, b) => b.deletedAt! - a.deletedAt!);
  }

  async softDelete(id: string): Promise<void> {
    const db = this.getDB();
    const note = await db.get("notes", id);
    if (!note) return;
    note.deleted = true;
    note.deletedAt = this.now();
    await db.put("notes", note);
  }

  async restore(id: string): Promise<void> {
    const db = this.getDB();
    const note = await db.get("notes", id);
    if (!note) return;
    note.deleted = false;
    note.deletedAt = null;
    await db.put("notes", note);
  }

  async hardDelete(id: string): Promise<void> {
    await this.getDB().delete("notes", id);
  }

  async purgeOldTrashed(days: number): Promise<number> {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const all = await this.getDB().getAll("notes");
    const toDelete = all.filter(
      (n) => n.deleted && n.deletedAt !== null && n.deletedAt < cutoff
    );
    const tx = this.getDB().transaction("notes", "readwrite");
    for (const note of toDelete) {
      tx.store.delete(note.id);
    }
    await tx.done;
    return toDelete.length;
  }

  async getAll(): Promise<Note[]> {
    return this.getDB().getAll("notes");
  }
}
