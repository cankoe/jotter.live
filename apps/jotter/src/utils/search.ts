export interface Searchable { id: string; content: string; title: string; }

export function searchNotes<T extends Searchable>(notes: T[], query: string): T[] {
  if (!query.trim()) return notes;
  const lower = query.toLowerCase();
  return notes.filter(n => n.content.toLowerCase().includes(lower) || n.title.toLowerCase().includes(lower));
}
