import type { Plan } from "@/lib/schema";
import { parseLocalDate, resolveTaskDate } from "@/lib/dates";

/**
 * lib/timeline.ts — pure timeline grouping (TDD §9.4, Phase 2 P2-T05, Phase 4 P4-T03)
 *
 * Groups timeline items by phase based on numeric lead-time or resolved dates.
 */

type TimelineItem = Plan["timeline"][number];

export const TIMELINE_PHASES = [
  "early",
  "month-of",
  "final-weeks",
  "event-week",
  "after",
  "other",
] as const;

export type TimelinePhase = (typeof TIMELINE_PHASES)[number];

export const PHASE_LABELS: Record<TimelinePhase, string> = {
  early: "Early (>3 months)",
  "month-of": "Month-of",
  "final-weeks": "Final weeks",
  "event-week": "Event week",
  after: "After",
  other: "Other",
};

/**
 * Buckets a single item into a phase from its numeric lead-time fields.
 *
 * Boundaries (resolved in this order):
 *  - daysBefore < 0            → "after"        (post-event, e.g. -1 = day after)
 *  - daysBefore === 0          → "event-week"   (the event day itself)
 *  - daysBefore 1..7           → "event-week"
 *  - daysBefore 8..30          → "final-weeks"
 *  - daysBefore > 30           → by month distance (see below)
 *  - no daysBefore, monthsBefore present:
 *      monthsBefore === 0      → "month-of"
 *      monthsBefore 1..3       → "month-of" when 1, else "final-weeks" handled by months rule
 *      monthsBefore > 3        → "early"
 *  - neither field present     → "other"
 *
 * Month rule (when only monthsBefore is given, or daysBefore > 30):
 *      > 3 months  → "early"
 *      1..3 months → "month-of"
 *      0 months    → "month-of"
 */
export function phaseOf(
  item: Pick<TimelineItem, "monthsBefore" | "daysBefore"> & { when?: string },
  eventDate?: string,
): TimelinePhase {
  const { monthsBefore, daysBefore } = item;

  const hasDays = typeof daysBefore === "number" && Number.isFinite(daysBefore);
  const hasMonths = typeof monthsBefore === "number" && Number.isFinite(monthsBefore);

  if (hasDays) {
    const d = daysBefore as number;
    if (d < 0) return "after";
    if (d <= 7) return "event-week";
    if (d <= 30) return "final-weeks";
    // More than 30 days out: fall through to month-based bucketing.
    const months = hasMonths ? (monthsBefore as number) : Math.round(d / 30);
    return months > 3 ? "early" : "month-of";
  }

  if (hasMonths) {
    const m = monthsBefore as number;
    if (m > 3) return "early";
    return "month-of";
  }

  if (eventDate) {
    const resolved = resolveTaskDate(eventDate, item);
    if (resolved) {
      const eventD = parseLocalDate(eventDate);
      const diffDays = Math.round((eventD.getTime() - resolved.getTime()) / 86_400_000);
      return phaseOf({ daysBefore: diffDays });
    }
  }

  return "other";
}

/** Order used to display phase groups. "other" always comes last. */
export function phaseOrder(phase: TimelinePhase): number {
  return TIMELINE_PHASES.indexOf(phase);
}

export type TimelineGroup = {
  phase: TimelinePhase;
  label: string;
  items: TimelineItem[];
};

/**
 * Groups items by phase, preserving model order within each group and emitting
 * groups in phase order. Empty groups are omitted.
 */
export function groupByPhase(items: TimelineItem[], eventDate?: string): TimelineGroup[] {
  const buckets = new Map<TimelinePhase, TimelineItem[]>();
  for (const item of items) {
    const phase = phaseOf(item, eventDate);
    const list = buckets.get(phase) ?? [];
    list.push(item);
    buckets.set(phase, list);
  }
  return [...buckets.entries()]
    .sort((a, b) => phaseOrder(a[0]) - phaseOrder(b[0]))
    .map(([phase, groupItems]) => ({
      phase,
      label: PHASE_LABELS[phase],
      items: groupItems,
    }));
}
