export interface DateGroup<T> { label: string; items: T[]; }

export function groupByDate<T>(items: T[], getTimestamp: (item: T) => number): DateGroup<T>[] {
  if (items.length === 0) return [];
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const weekStart = todayStart - now.getDay() * 86400000;
  const buckets: Record<string, T[]> = { Today: [], Yesterday: [], "This Week": [], Older: [] };
  for (const item of items) {
    const ts = getTimestamp(item);
    if (ts >= todayStart) buckets.Today.push(item);
    else if (ts >= yesterdayStart) buckets.Yesterday.push(item);
    else if (ts >= weekStart) buckets["This Week"].push(item);
    else buckets.Older.push(item);
  }
  return ["Today", "Yesterday", "This Week", "Older"]
    .filter((l) => buckets[l].length > 0)
    .map((label) => ({ label, items: buckets[label] }));
}
