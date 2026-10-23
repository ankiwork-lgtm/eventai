import { describe, it, expect } from "vitest";
import { groupByPhase, phaseOf } from "@/lib/timeline";

describe("phaseOf", () => {
  it("daysBefore -1 → After (post-event)", () => {
    expect(phaseOf({ daysBefore: -1 })).toBe("after");
  });

  it("daysBefore 0 → Event week (the event day)", () => {
    expect(phaseOf({ daysBefore: 0 })).toBe("event-week");
  });

  it("daysBefore within a week → Event week", () => {
    expect(phaseOf({ daysBefore: 7 })).toBe("event-week");
  });

  it("daysBefore 8..30 → Final weeks", () => {
    expect(phaseOf({ daysBefore: 8 })).toBe("final-weeks");
    expect(phaseOf({ daysBefore: 30 })).toBe("final-weeks");
  });

  it("monthsBefore > 3 → Early", () => {
    expect(phaseOf({ monthsBefore: 6 })).toBe("early");
    expect(phaseOf({ monthsBefore: 4 })).toBe("early");
  });

  it("monthsBefore 1..3 → Month-of", () => {
    expect(phaseOf({ monthsBefore: 1 })).toBe("month-of");
    expect(phaseOf({ monthsBefore: 3 })).toBe("month-of");
  });

  it("monthsBefore 0 → Month-of", () => {
    expect(phaseOf({ monthsBefore: 0 })).toBe("month-of");
  });

  it("no numeric fields → Other (fallback group)", () => {
    expect(phaseOf({})).toBe("other");
  });

  it("daysBefore > 30 falls back to month-distance bucketing", () => {
    expect(phaseOf({ daysBefore: 120 })).toBe("early"); // ~4 months
    expect(phaseOf({ daysBefore: 45 })).toBe("month-of"); // ~1.5 months
  });
});

describe("groupByPhase", () => {
  const items = [
    { when: "6 months before", monthsBefore: 6, task: "Book venue", priority: "high" as const },
    { when: "day after", daysBefore: -1, task: "Return rentals", priority: "low" as const },
    { when: "event day", daysBefore: 0, task: "Enjoy", priority: "high" as const },
    { when: "someday", task: "Misc", priority: "low" as const },
  ];

  it("emits groups in phase order, Other last, preserving model order within a group", () => {
    const groups = groupByPhase(items);
    const phases = groups.map((g) => g.phase);
    expect(phases).toEqual(["early", "event-week", "after", "other"]);
  });

  it("places daysBefore:-1 in After and 0 in Event week", () => {
    const groups = groupByPhase(items);
    const after = groups.find((g) => g.phase === "after")!;
    const eventWeek = groups.find((g) => g.phase === "event-week")!;
    expect(after.items[0].task).toBe("Return rentals");
    expect(eventWeek.items[0].task).toBe("Enjoy");
  });

  it("omits empty groups", () => {
    const groups = groupByPhase([
      { when: "soon", daysBefore: 2, task: "x", priority: "low" as const },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].phase).toBe("event-week");
  });
});
