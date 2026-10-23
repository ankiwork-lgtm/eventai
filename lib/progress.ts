import { hash } from "@/lib/hash";
import type { Plan } from "@/lib/schema";
import type { ProgressState } from "@/lib/types";

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

/** Lowercase, collapse all internal whitespace to a single space, trim ends. */
export function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Stable content-hash keys
//
// NOTE on duplicate task texts: two timeline entries with the same `task`
// text (after normalisation) produce the same key. This is an accepted MVP
// limitation (TDD §5.3 risk R5); toggling one tick toggles both visually.
// ---------------------------------------------------------------------------

/**
 * Key for a timeline task. Excludes `when` so that date-shift refines (which
 * only update the `when` label) preserve existing ticks.
 */
export function taskKey(task: { task: string }): string {
  return hash(normalize(task.task));
}

/**
 * Key for a single vendor checklist item.
 * Combines vendor type and item text so two different vendors can have
 * checklist items with the same wording without colliding.
 */
export function vendorItemKey(vendorType: string, item: string): string {
  return hash(normalize(vendorType) + "|" + normalize(item));
}

// ---------------------------------------------------------------------------
// Progress computation
// ---------------------------------------------------------------------------

export type ProgressSummary = {
  done: number;
  total: number;
  percent: number;
  timeline: { done: number; total: number };
  vendors: { done: number; total: number };
};

/**
 * Derive progress stats from the current plan and the persisted tick state.
 * Only keys that are present in the current plan are counted.
 * Empty plan → percent 0, no divide-by-zero.
 */
export function computeProgress(
  plan: Plan | null,
  progress: ProgressState,
): ProgressSummary {
  if (!plan) {
    return {
      done: 0,
      total: 0,
      percent: 0,
      timeline: { done: 0, total: 0 },
      vendors: { done: 0, total: 0 },
    };
  }

  // Timeline
  const timelineKeys = plan.timeline.map((t) => taskKey(t));
  const tlTotal = timelineKeys.length;
  const tlDone = timelineKeys.filter((k) => progress.timeline[k]).length;

  // Vendors (all items across all vendor sections)
  const vendorKeys = plan.vendors.flatMap((v) =>
    v.checklist.map((item) => vendorItemKey(v.type, item)),
  );
  const vTotal = vendorKeys.length;
  const vDone = vendorKeys.filter((k) => progress.vendors[k]).length;

  const total = tlTotal + vTotal;
  const done = tlDone + vDone;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  return {
    done,
    total,
    percent,
    timeline: { done: tlDone, total: tlTotal },
    vendors: { done: vDone, total: vTotal },
  };
}

// ---------------------------------------------------------------------------
// Toggle (immutable)
// ---------------------------------------------------------------------------

/**
 * Returns a new ProgressState with the given key toggled.
 * `kind` is either "timeline" or "vendors".
 */
export function toggleProgress(
  progress: ProgressState,
  kind: keyof ProgressState,
  key: string,
): ProgressState {
  return {
    ...progress,
    [kind]: {
      ...progress[kind],
      [key]: !progress[kind][key],
    },
  };
}

// ---------------------------------------------------------------------------
// Prune orphan keys after a refine
// ---------------------------------------------------------------------------

/**
 * Drops keys from progress that no longer correspond to any item in the
 * current plan. Called after a refine so stale ticks don't accumulate.
 */
export function pruneProgress(plan: Plan, progress: ProgressState): ProgressState {
  const validTimeline = new Set(plan.timeline.map((t) => taskKey(t)));
  const validVendors = new Set(
    plan.vendors.flatMap((v) => v.checklist.map((item) => vendorItemKey(v.type, item))),
  );

  const timeline: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(progress.timeline)) {
    if (validTimeline.has(k)) timeline[k] = v;
  }

  const vendors: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(progress.vendors)) {
    if (validVendors.has(k)) vendors[k] = v;
  }

  return { timeline, vendors };
}
