import { describe, expect, it } from "vitest";
import {
  daysUntil,
  formatDisplayDate,
  formatIsoDate,
  parseLocalDate,
  resolveTaskDate,
  resolveWithClamp,
  sortTimeline,
} from "@/lib/dates";

describe("lib/dates", () => {
  it("parseLocalDate parses YYYY-MM-DD as local date without UTC shifts", () => {
    const d = parseLocalDate("2026-03-15");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2); // 0-indexed March is 2
    expect(d.getDate()).toBe(15);
  });

  it("formatDisplayDate formats correctly", () => {
    const d = parseLocalDate("2026-03-12");
    expect(formatDisplayDate(d)).toBe("12 Mar 2026");
  });

  it("formatIsoDate formats correctly", () => {
    const d = parseLocalDate("2026-03-12");
    expect(formatIsoDate(d)).toBe("2026-03-12");
  });

  it("daysUntil calculates days correctly", () => {
    const today = parseLocalDate("2026-03-01");
    expect(daysUntil("2026-03-10", today)).toBe(9);
    expect(daysUntil("2026-03-01", today)).toBe(0);
    expect(daysUntil("2026-02-25", today)).toBe(-4);
  });

  it("resolveTaskDate handles 31 Mar − 1 month (leap/non-leap month boundary)", () => {
    // 31 Mar 2026 − 1 month = 28 Feb 2026 (non-leap year)
    const res = resolveTaskDate("2026-03-31", { monthsBefore: 1 });
    expect(res).not.toBeNull();
    expect(formatIsoDate(res!)).toBe("2026-02-28");
  });

  it("resolveTaskDate handles leap year (29 Feb)", () => {
    // 31 Mar 2024 − 1 month = 29 Feb 2024 (leap year)
    const res = resolveTaskDate("2024-03-31", { monthsBefore: 1 });
    expect(res).not.toBeNull();
    expect(formatIsoDate(res!)).toBe("2024-02-29");
  });

  it("resolveTaskDate handles negative daysBefore (dates after the event)", () => {
    // Event: 2026-03-15, daysBefore: -2 -> 2026-03-17
    const res = resolveTaskDate("2026-03-15", { daysBefore: -2 });
    expect(res).not.toBeNull();
    expect(formatIsoDate(res!)).toBe("2026-03-17");
  });

  it("resolveTaskDate falls back to parsing 'when' label with regex", () => {
    const resWeeks = resolveTaskDate("2026-03-22", { when: "3 weeks before" });
    expect(resWeeks).not.toBeNull();
    expect(formatIsoDate(resWeeks!)).toBe("2026-03-01");

    const resMonths = resolveTaskDate("2026-05-15", { when: "2 months before" });
    expect(resMonths).not.toBeNull();
    expect(formatIsoDate(resMonths!)).toBe("2026-03-15");

    const resDays = resolveTaskDate("2026-03-15", { when: "5 days before" });
    expect(resDays).not.toBeNull();
    expect(formatIsoDate(resDays!)).toBe("2026-03-10");

    const resUnresolvable = resolveTaskDate("2026-03-15", { when: "TBD" });
    expect(resUnresolvable).toBeNull();
  });

  it("resolveWithClamp clamps past dates to today and sets overdue: true", () => {
    const today = parseLocalDate("2026-03-10");
    // Task resolved to 2026-02-15 (in the past relative to today)
    const resPast = resolveWithClamp(
      "2026-03-15",
      { daysBefore: 28 }, // 2026-03-15 - 28 days = 2026-02-15
      today,
    );
    expect(resPast.overdue).toBe(true);
    expect(formatIsoDate(resPast.date!)).toBe("2026-03-10");

    // Task in the future
    const resFuture = resolveWithClamp(
      "2026-03-15",
      { daysBefore: 2 }, // 2026-03-13
      today,
    );
    expect(resFuture.overdue).toBe(false);
    expect(formatIsoDate(resFuture.date!)).toBe("2026-03-13");
  });

  it("sortTimeline stably sorts items chronologically and places unresolvable at end", () => {
    const items = [
      { task: "Task 1 (unresolvable)", when: "Ongoing" },
      { task: "Task 2 (1 month before)", monthsBefore: 1 },
      { task: "Task 3 (3 months before)", monthsBefore: 3 },
      { task: "Task 4 (1 week before)", daysBefore: 7 },
      { task: "Task 5 (unresolvable 2)", when: "Whenever" },
    ];
    const sorted = sortTimeline(items, "2026-06-01");
    expect(sorted.map((s) => s.task)).toEqual([
      "Task 3 (3 months before)", // March
      "Task 2 (1 month before)",  // May
      "Task 4 (1 week before)",   // Late May
      "Task 1 (unresolvable)",
      "Task 5 (unresolvable 2)",
    ]);
  });

  it("works consistently across simulated timezones without off-by-one errors", () => {
    // Tests parseLocalDate and formatting
    const d1 = parseLocalDate("2026-04-01");
    expect(d1.getDate()).toBe(1);
    expect(d1.getMonth()).toBe(3);
    expect(d1.getFullYear()).toBe(2026);
    expect(formatIsoDate(d1)).toBe("2026-04-01");
  });
});
