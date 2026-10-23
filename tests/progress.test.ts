import { describe, it, expect } from "vitest";
import {
  computeProgress,
  toggleProgress,
  pruneProgress,
  taskKey,
  vendorItemKey,
} from "@/lib/progress";
import type { Plan } from "@/lib/schema";
import type { ProgressState } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyProgress(): ProgressState {
  return { timeline: {}, vendors: {} };
}

/** Minimal valid plan with 2 timeline tasks and 2 vendor items (1 vendor). */
function makePlan(overrides?: Partial<Plan>): Plan {
  return {
    summary: "Test event",
    budget: [
      { category: "Venue", percent: 40, estimatedCost: 40000, tips: "Negotiate" },
      { category: "Catering", percent: 30, estimatedCost: 30000, tips: "Buffet" },
      { category: "Decor", percent: 20, estimatedCost: 20000, tips: "DIY" },
      { category: "Misc", percent: 10, estimatedCost: 10000, tips: "Buffer" },
    ],
    timeline: [
      { when: "6 months before", task: "Book the venue", priority: "high" },
      { when: "3 months before", task: "Hire photographer", priority: "medium" },
    ],
    vendors: [
      {
        type: "Catering",
        checklist: ["Confirm headcount", "Taste test"],
        budgetRange: "10k-20k",
      },
    ],
    ideas: [
      { title: "Idea 1", description: "desc 1" },
      { title: "Idea 2", description: "desc 2" },
      { title: "Idea 3", description: "desc 3" },
      { title: "Idea 4", description: "desc 4" },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeProgress
// ---------------------------------------------------------------------------

describe("computeProgress", () => {
  it("returns zeros for null plan (no divide-by-zero)", () => {
    const result = computeProgress(null, emptyProgress());
    expect(result.percent).toBe(0);
    expect(result.done).toBe(0);
    expect(result.total).toBe(0);
    expect(result.timeline).toEqual({ done: 0, total: 0 });
    expect(result.vendors).toEqual({ done: 0, total: 0 });
  });

  it("returns 0% when nothing is ticked", () => {
    const plan = makePlan();
    const result = computeProgress(plan, emptyProgress());
    // 2 timeline + 2 vendor items = 4 total
    expect(result.total).toBe(4);
    expect(result.done).toBe(0);
    expect(result.percent).toBe(0);
    expect(result.timeline).toEqual({ done: 0, total: 2 });
    expect(result.vendors).toEqual({ done: 0, total: 2 });
  });

  it("counts only keys present in the current plan", () => {
    const plan = makePlan();
    // Inject a stale key that doesn't correspond to any plan item
    const progress: ProgressState = {
      timeline: { stale_key_abc: true },
      vendors: { another_stale_key: true },
    };
    const result = computeProgress(plan, progress);
    expect(result.done).toBe(0);
    expect(result.percent).toBe(0);
  });

  it("calculates correct percent when some items are ticked", () => {
    const plan = makePlan();
    const tlKey = taskKey(plan.timeline[0]);
    const progress: ProgressState = {
      timeline: { [tlKey]: true },
      vendors: {},
    };
    // 1 of 4 done = 25%
    const result = computeProgress(plan, progress);
    expect(result.done).toBe(1);
    expect(result.percent).toBe(25);
    expect(result.timeline).toEqual({ done: 1, total: 2 });
    expect(result.vendors).toEqual({ done: 0, total: 2 });
  });

  it("returns 100% when everything is ticked", () => {
    const plan = makePlan();
    const progress: ProgressState = {
      timeline: Object.fromEntries(plan.timeline.map((t) => [taskKey(t), true])),
      vendors: Object.fromEntries(
        plan.vendors.flatMap((v) =>
          v.checklist.map((item) => [vendorItemKey(v.type, item), true]),
        ),
      ),
    };
    const result = computeProgress(plan, progress);
    expect(result.done).toBe(result.total);
    expect(result.percent).toBe(100);
  });

  it("percent rounds to nearest integer", () => {
    // 3 timeline + 0 vendor items = 3 total; tick 1 → 33%
    const plan = makePlan({
      timeline: [
        { when: "6 months before", task: "Task A", priority: "high" },
        { when: "3 months before", task: "Task B", priority: "medium" },
        { when: "1 month before", task: "Task C", priority: "low" },
      ],
      vendors: [{ type: "Misc", checklist: ["a", "b", "c"], budgetRange: "1k" }],
    });
    // total = 3 + 3 = 6; tick 1 → 16.67% → rounds to 17
    const tlKey = taskKey(plan.timeline[0]);
    const result = computeProgress(plan, { timeline: { [tlKey]: true }, vendors: {} });
    expect(result.percent).toBe(17);
  });
});

// ---------------------------------------------------------------------------
// toggleProgress
// ---------------------------------------------------------------------------

describe("toggleProgress", () => {
  it("toggles a timeline key from false → true", () => {
    const progress = emptyProgress();
    const key = "abc123";
    const next = toggleProgress(progress, "timeline", key);
    expect(next.timeline[key]).toBe(true);
  });

  it("toggles a timeline key from true → false", () => {
    const progress: ProgressState = { timeline: { abc123: true }, vendors: {} };
    const next = toggleProgress(progress, "timeline", "abc123");
    expect(next.timeline["abc123"]).toBe(false);
  });

  it("toggles a vendors key", () => {
    const progress = emptyProgress();
    const next = toggleProgress(progress, "vendors", "xyz789");
    expect(next.vendors["xyz789"]).toBe(true);
  });

  it("is immutable — original object is unchanged", () => {
    const progress = emptyProgress();
    toggleProgress(progress, "timeline", "key1");
    expect(progress.timeline["key1"]).toBeUndefined();
  });

  it("does not affect the other bucket", () => {
    const progress: ProgressState = { timeline: { t1: true }, vendors: { v1: true } };
    const next = toggleProgress(progress, "timeline", "t1");
    expect(next.vendors).toEqual({ v1: true });
  });
});

// ---------------------------------------------------------------------------
// pruneProgress
// ---------------------------------------------------------------------------

describe("pruneProgress", () => {
  it("removes orphan keys not in the current plan", () => {
    const plan = makePlan();
    const progress: ProgressState = {
      timeline: { orphan_tl: true },
      vendors: { orphan_v: true },
    };
    const pruned = pruneProgress(plan, progress);
    expect(pruned.timeline).toEqual({});
    expect(pruned.vendors).toEqual({});
  });

  it("keeps keys that are still present in the plan", () => {
    const plan = makePlan();
    const tlKey = taskKey(plan.timeline[0]);
    const vKey = vendorItemKey(plan.vendors[0].type, plan.vendors[0].checklist[0]);
    const progress: ProgressState = {
      timeline: { [tlKey]: true, orphan: true },
      vendors: { [vKey]: true, stale: false },
    };
    const pruned = pruneProgress(plan, progress);
    expect(pruned.timeline).toEqual({ [tlKey]: true });
    expect(pruned.vendors).toEqual({ [vKey]: true });
  });

  it("ticks survive when only `when` changes (task text unchanged)", () => {
    const plan = makePlan();
    const tlKey = taskKey(plan.timeline[0]); // key derived from task text only
    const progress: ProgressState = { timeline: { [tlKey]: true }, vendors: {} };

    // Simulate a refine that only changes `when`
    const refinedPlan = makePlan({
      timeline: [
        { when: "5 months before", task: "Book the venue", priority: "high" }, // when changed
        { when: "3 months before", task: "Hire photographer", priority: "medium" },
      ],
    });

    const pruned = pruneProgress(refinedPlan, progress);
    // The tick must still be present because task text is the same
    expect(pruned.timeline[tlKey]).toBe(true);
  });
});
