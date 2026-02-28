import { describe, it, expect, vi, afterEach } from "vitest";
import { groupByDate, type DateGroup } from "./dates";

describe("groupByDate", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("groups items into Today, Yesterday, This Week, Older", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-25T12:00:00Z"));
    const items = [
      { id: "1", updatedAt: new Date("2026-02-25T10:00:00Z").getTime() },
      { id: "2", updatedAt: new Date("2026-02-25T08:00:00Z").getTime() },
      { id: "3", updatedAt: new Date("2026-02-24T15:00:00Z").getTime() },
      { id: "4", updatedAt: new Date("2026-02-23T10:00:00Z").getTime() },
      { id: "5", updatedAt: new Date("2026-02-15T10:00:00Z").getTime() },
    ];
    const groups = groupByDate(items, (i) => i.updatedAt);
    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday", "This Week", "Older"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["1", "2"]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["3"]);
    expect(groups[2].items.map((i) => i.id)).toEqual(["4"]);
    expect(groups[3].items.map((i) => i.id)).toEqual(["5"]);
  });

  it("omits empty groups", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-25T12:00:00Z"));
    const items = [{ id: "1", updatedAt: new Date("2026-02-25T10:00:00Z").getTime() }];
    const groups = groupByDate(items, (i) => i.updatedAt);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Today");
  });

  it("returns empty array for empty input", () => {
    expect(groupByDate([], () => 0)).toEqual([]);
  });
});
