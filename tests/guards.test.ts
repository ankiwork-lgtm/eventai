import { describe, it, expect } from "vitest";
import {
  completedChecklist,
  isCompleteBudgetItem,
  isCompleteIdea,
  isCompleteTimelineItem,
  isCompleteVendor,
} from "@/lib/guards";

describe("isCompleteBudgetItem", () => {
  it("accepts a fully-streamed item", () => {
    expect(
      isCompleteBudgetItem({
        category: "Venue",
        percent: 40,
        estimatedCost: 400000,
        tips: "Book early",
      }),
    ).toBe(true);
  });

  it("rejects an item missing estimatedCost (half-streamed, prevents NaN)", () => {
    expect(
      isCompleteBudgetItem({ category: "Venue", percent: 40, tips: "x" }),
    ).toBe(false);
  });

  it("rejects null/undefined and non-finite numbers", () => {
    expect(isCompleteBudgetItem(null)).toBe(false);
    expect(isCompleteBudgetItem(undefined)).toBe(false);
    expect(
      isCompleteBudgetItem({
        category: "V",
        percent: Number.NaN,
        estimatedCost: 1,
        tips: "x",
      }),
    ).toBe(false);
  });

  it("accepts empty-string tips (tips is optional-ish text)", () => {
    expect(
      isCompleteBudgetItem({
        category: "V",
        percent: 1,
        estimatedCost: 1,
        tips: "",
      }),
    ).toBe(true);
  });
});

describe("isCompleteTimelineItem", () => {
  it("accepts a valid item", () => {
    expect(
      isCompleteTimelineItem({ when: "6 months before", task: "Book venue", priority: "high" }),
    ).toBe(true);
  });
  it("rejects an invalid priority", () => {
    expect(
      isCompleteTimelineItem({ when: "soon", task: "x", priority: "urgent" }),
    ).toBe(false);
  });
  it("rejects missing task", () => {
    expect(isCompleteTimelineItem({ when: "soon", priority: "low" })).toBe(false);
  });
});

describe("isCompleteVendor", () => {
  it("accepts a vendor with at least one checklist item", () => {
    expect(
      isCompleteVendor({ type: "Caterer", budgetRange: "1-2L", checklist: ["Taste test"] }),
    ).toBe(true);
  });
  it("rejects a vendor whose checklist has not started", () => {
    expect(
      isCompleteVendor({ type: "Caterer", budgetRange: "1-2L", checklist: [] }),
    ).toBe(false);
  });
});

describe("completedChecklist", () => {
  it("keeps only the fully-arrived strings", () => {
    expect(
      completedChecklist({ type: "C", budgetRange: "x", checklist: ["a", "", "b"] }),
    ).toEqual(["a", "b"]);
  });
});

describe("isCompleteIdea", () => {
  it("requires both title and description", () => {
    expect(isCompleteIdea({ title: "Photo booth", description: "Fun corner" })).toBe(true);
    expect(isCompleteIdea({ title: "Photo booth" })).toBe(false);
  });
});
