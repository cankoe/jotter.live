import { describe, it, expect } from "vitest";
import { searchNotes } from "./search";

const notes = [
  { id: "1", content: "Meeting with #design team about new logo", title: "Meeting" },
  { id: "2", content: "Buy groceries: milk, eggs, bread", title: "Buy groceries" },
  { id: "3", content: "Project #dev ideas for Q2 planning", title: "Project ideas" },
  { id: "4", content: "Phone number: 555-1234", title: "Phone number" },
];

describe("searchNotes", () => {
  it("returns all notes for empty query", () => { expect(searchNotes(notes, "")).toEqual(notes); });
  it("matches content case-insensitively", () => { expect(searchNotes(notes, "meeting").map(n => n.id)).toEqual(["1"]); });
  it("matches hashtags", () => { expect(searchNotes(notes, "#design").map(n => n.id)).toEqual(["1"]); });
  it("matches partial words", () => { expect(searchNotes(notes, "groc").map(n => n.id)).toEqual(["2"]); });
  it("matches title", () => { expect(searchNotes(notes, "Phone").map(n => n.id)).toEqual(["4"]); });
  it("returns empty for no matches", () => { expect(searchNotes(notes, "xyzzy")).toEqual([]); });
});
