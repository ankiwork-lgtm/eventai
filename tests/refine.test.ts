import { describe, it, expect } from "vitest";
import { applyRefinement, applyUndo } from "@/lib/refine";
import { taskKey, vendorItemKey } from "@/lib/progress";
import type { StoredPlan } from "@/lib/types";
import type { RefineResult } from "@/lib/schema";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makePlan() {
  return {
    summary: "Test event.",
    budget: [
      { category: "Venue", percent: 40, estimatedCost: 40000, tips: "Negotiate" },
      { category: "Catering", percent: 30, estimatedCost: 30000, tips: "Buffet" },
      { category: "Decor", percent: 20, estimatedCost: 20000, tips: "DIY" },
      { category: "Misc", percent: 10, estimatedCost: 10000, tips: "Buffer" },
    ],
    timeline: [
      { when: "6 months before", task: "Book the venue", priority: "high" as const },
      { when: "3 months before", task: "Hire photographer", priority: "medium" as const },
    ],
    vendors: [
      {
        type: "Catering",
        checklist: ["Confirm headcount", "Taste test", "Sign contract"],
        budgetRange: "10k-20k",
      },
    ],
    ideas: [
      { title: "Idea 1", description: "desc 1" },
      { title: "Idea 2", description: "desc 2" },
      { title: "Idea 3", description: "desc 3" },
      { title: "Idea 4", description: "desc 4" },
    ],
  };
}

function makeRecord(overrides: Partial<StoredPlan> = {}): StoredPlan {
  const plan = makePlan();
  return {
    id: "test-id",
    createdAt: "2099-01-01T00:00:00.000Z",
    updatedAt: "2099-01-01T00:00:00.000Z",
    input: {
      eventType: "wedding",
      date: "2099-06-15",
      guestCount: 100,
      totalBudget: 100000,
      currency: "INR",
      city: "Mumbai",
    },
    plan,
    progress: {
      timeline: {
        [taskKey(plan.timeline[0])]: true,  // "Book the venue" ticked
      },
      vendors: {
        [vendorItemKey("Catering", "Confirm headcount")]: true,
      },
    },
    chat: [],
    version: 1,
    ...overrides,
  };
}

function makeAssistantMsg(content = "Done") {
  return { role: "assistant" as const, content, at: new Date().toISOString() };
}

// ─── applyRefinement ──────────────────────────────────────────────────────────

describe("applyRefinement", () => {
  it("applies the new plan to the record", () => {
    const record = makeRecord();
    const newPlan = { ...makePlan(), summary: "Updated plan." };
    const result: RefineResult = { plan: newPlan, changeSummary: "Updated summary." };

    const next = applyRefinement(record, result, makeAssistantMsg("Updated summary."));
    expect(next.plan?.summary).toBe("Updated plan.");
  });

  it("keeps input.totalBudget unchanged when newTotalBudget is absent", () => {
    const record = makeRecord();
    const result: RefineResult = { plan: makePlan(), changeSummary: "No budget change." };

    const next = applyRefinement(record, result, makeAssistantMsg());
    expect(next.input.totalBudget).toBe(100000);
  });

  it("applies newTotalBudget to input.totalBudget when present", () => {
    const record = makeRecord();
    const result: RefineResult = {
      plan: makePlan(),
      changeSummary: "Budget cut to 80k.",
      newTotalBudget: 80000,
    };

    const next = applyRefinement(record, result, makeAssistantMsg("Budget cut to 80k."));
    expect(next.input.totalBudget).toBe(80000);
  });

  it("prunes progress keys that no longer exist in the refined plan", () => {
    const record = makeRecord();
    // New plan replaces "Book the venue" with "Book new venue"
    const newPlan = {
      ...makePlan(),
      timeline: [
        { when: "6 months before", task: "Book new venue", priority: "high" as const },
        { when: "3 months before", task: "Hire photographer", priority: "medium" as const },
      ],
    };
    const result: RefineResult = { plan: newPlan, changeSummary: "Venue changed." };

    const next = applyRefinement(record, result, makeAssistantMsg());
    // The old "Book the venue" key should be pruned
    const oldKey = taskKey({ task: "Book the venue" });
    expect(next.progress.timeline[oldKey]).toBeUndefined();
  });

  it("keeps ticks on tasks that are unchanged in the refined plan", () => {
    const record = makeRecord();
    // Preserve "Hire photographer" but change "Book the venue"
    const newPlan = {
      ...makePlan(),
      timeline: [
        { when: "5 months before", task: "Book the venue", priority: "high" as const }, // only `when` changed
        { when: "3 months before", task: "Hire photographer", priority: "medium" as const },
      ],
    };
    const result: RefineResult = { plan: newPlan, changeSummary: "Timeline shifted." };

    const next = applyRefinement(record, result, makeAssistantMsg());
    // "Book the venue" tick should survive (only `when` changed)
    const venueKey = taskKey({ task: "Book the venue" });
    expect(next.progress.timeline[venueKey]).toBe(true);
  });

  it("appends the assistant message to chat", () => {
    const record = makeRecord();
    const result: RefineResult = { plan: makePlan(), changeSummary: "Done." };
    const msg = makeAssistantMsg("Done.");

    const next = applyRefinement(record, result, msg);
    expect(next.chat).toHaveLength(1);
    expect(next.chat[0].content).toBe("Done.");
  });

  it("saves lastSnapshot of the previous state (for Undo)", () => {
    const record = makeRecord();
    const result: RefineResult = { plan: makePlan(), changeSummary: "Change." };

    const next = applyRefinement(record, result, makeAssistantMsg());
    expect(next.lastSnapshot).toBeDefined();
    expect(next.lastSnapshot!.plan).toEqual(record.plan);
    expect(next.lastSnapshot!.input.totalBudget).toBe(100000);
    expect(next.lastSnapshot!.progress).toEqual(record.progress);
  });

  it("is immutable — original record is unchanged", () => {
    const record = makeRecord();
    const originalPlan = record.plan;
    const result: RefineResult = { plan: { ...makePlan(), summary: "New." }, changeSummary: "" };

    applyRefinement(record, result, makeAssistantMsg());
    expect(record.plan).toBe(originalPlan);
  });
});

// ─── applyUndo ────────────────────────────────────────────────────────────────

describe("applyUndo", () => {
  it("restores plan, input and progress from lastSnapshot", () => {
    const original = makeRecord();
    const result: RefineResult = {
      plan: { ...makePlan(), summary: "Changed." },
      changeSummary: "Changed.",
      newTotalBudget: 80000,
    };
    const afterRefine = applyRefinement(original, result, makeAssistantMsg("Changed."));
    const afterUndo = applyUndo(afterRefine, makeAssistantMsg("Reverted."));

    expect(afterUndo.plan?.summary).toBe(original.plan?.summary);
    expect(afterUndo.input.totalBudget).toBe(100000);
    expect(afterUndo.progress).toEqual(original.progress);
  });

  it("clears lastSnapshot after undo", () => {
    const record = makeRecord();
    const refined = applyRefinement(record, { plan: makePlan(), changeSummary: "" }, makeAssistantMsg());
    const undone = applyUndo(refined, makeAssistantMsg("Reverted."));
    expect(undone.lastSnapshot).toBeUndefined();
  });

  it("appends the reverted bubble to chat", () => {
    const record = makeRecord();
    const refined = applyRefinement(record, { plan: makePlan(), changeSummary: "X" }, makeAssistantMsg("X"));
    const undone = applyUndo(refined, makeAssistantMsg("Reverted to previous plan."));

    expect(undone.chat).toHaveLength(2);
    expect(undone.chat[1].content).toBe("Reverted to previous plan.");
  });

  it("returns the record unchanged if there is no snapshot", () => {
    const record = makeRecord();
    const undone = applyUndo(record, makeAssistantMsg("Reverted."));
    expect(undone).toBe(record); // same reference
  });
});
