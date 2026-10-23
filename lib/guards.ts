import type { Plan } from "@/lib/schema";

/**
 * Type guards for DeepPartial plan sections (TDD §8.2, DD-7, Phase 2 shared rules).
 *
 * While a plan streams in, `object` is a DeepPartial<Plan>: array items may be
 * half-built (missing required keys) and values may be `undefined`. Components
 * must never render a partial item that would produce `NaN` or blank required
 * text. These guards narrow a loosely-typed streamed item to a complete one so
 * the tab components can filter with `.filter(isCompleteX)` and get a precise type.
 *
 * Each guard requires ONLY the fields a component actually renders. Optional
 * schema fields (e.g. timeline.monthsBefore) are intentionally not required here.
 */

type BudgetItem = Plan["budget"][number];
type TimelineItem = Plan["timeline"][number];
type Vendor = Plan["vendors"][number];
type Idea = Plan["ideas"][number];

/** A streamed array whose items are each an unknown partial. */
type MaybeItem = Record<string, unknown> | null | undefined;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function isCompleteBudgetItem(item: MaybeItem): item is BudgetItem {
  if (!item) return false;
  return (
    isNonEmptyString(item.category) &&
    isFiniteNumber(item.percent) &&
    isFiniteNumber(item.estimatedCost) &&
    typeof item.tips === "string"
  );
}

export function isCompleteTimelineItem(item: MaybeItem): item is TimelineItem {
  if (!item) return false;
  return (
    isNonEmptyString(item.when) &&
    isNonEmptyString(item.task) &&
    (item.priority === "high" ||
      item.priority === "medium" ||
      item.priority === "low")
  );
}

export function isCompleteVendor(item: MaybeItem): item is Vendor {
  if (!item) return false;
  // checklist items that have arrived are kept; an in-progress string tail is dropped.
  const checklist = Array.isArray(item.checklist)
    ? item.checklist.filter(isNonEmptyString)
    : [];
  return (
    isNonEmptyString(item.type) &&
    isNonEmptyString(item.budgetRange) &&
    checklist.length > 0
  );
}

export function isCompleteIdea(item: MaybeItem): item is Idea {
  if (!item) return false;
  return isNonEmptyString(item.title) && isNonEmptyString(item.description);
}

/**
 * Returns the completed checklist strings that have fully streamed in for a vendor.
 * Keeps whatever has arrived (Phase 2 rule: render partial checklists with what's there).
 */
export function completedChecklist(item: MaybeItem): string[] {
  if (!item || !Array.isArray(item.checklist)) return [];
  return item.checklist.filter(isNonEmptyString);
}
