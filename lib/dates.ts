/**
 * lib/dates.ts (P1-T04, P4-T02, TDD §8.5, DD-5, DD-15)
 *
 * Date parsing, resolution, clamping, sorting, and formatting.
 * Always parses dates as local calendar dates (never UTC) to prevent timezone off-by-one errors.
 */

import { format, subDays, subMonths, subWeeks } from "date-fns";

const MS_PER_DAY = 86_400_000;

/**
 * Parses YYYY-MM-DD as a LOCAL calendar date (DD-15), never as UTC.
 */
export function parseLocalDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Formats a Date as "d MMM yyyy" (e.g. "12 Mar 2026").
 */
export function formatDisplayDate(date: Date): string {
  return format(date, "d MMM yyyy");
}

/**
 * Formats a Date as "yyyy-MM-dd".
 */
export function formatIsoDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/**
 * Whole calendar days from `today` (local) until `dateStr` (local YYYY-MM-DD).
 * Negative if the date is in the past. `today` is injectable for tests.
 */
export function daysUntil(dateStr: string, today: Date = new Date()): number {
  const target = parseLocalDate(dateStr);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - start.getTime()) / MS_PER_DAY);
}

export type LeadTimeInput = {
  monthsBefore?: number;
  daysBefore?: number;
  when?: string;
};

/**
 * Resolves a timeline task's calendar date from the event date and lead time.
 *
 * Rules:
 * - date = eventDate − monthsBefore months − daysBefore days.
 * - Negative daysBefore gives a date after the event (e.g. daysBefore: -1 is 1 day after).
 * - If both numeric fields are missing/undefined, parses `when` with
 *   `/(\d+)\s*(month|week|day)s?\s*before/i`.
 * - If unresolvable, returns null.
 */
export function resolveTaskDate(
  eventDate: string | Date,
  t: LeadTimeInput,
): Date | null {
  const baseDate =
    typeof eventDate === "string" ? parseLocalDate(eventDate) : eventDate;

  const hasMonths =
    typeof t.monthsBefore === "number" && Number.isFinite(t.monthsBefore);
  const hasDays =
    typeof t.daysBefore === "number" && Number.isFinite(t.daysBefore);

  if (hasMonths || hasDays) {
    let d = baseDate;
    if (hasMonths) {
      d = subMonths(d, t.monthsBefore!);
    }
    if (hasDays) {
      d = subDays(d, t.daysBefore!);
    }
    return d;
  }

  if (t.when) {
    const match = t.when.match(/(\d+)\s*(month|week|day)s?\s*before/i);
    if (match) {
      const count = parseInt(match[1], 10);
      const unit = match[2].toLowerCase();
      if (unit === "month") return subMonths(baseDate, count);
      if (unit === "week") return subWeeks(baseDate, count);
      if (unit === "day") return subDays(baseDate, count);
    }
  }

  return null;
}

export type ClampedDateResult = {
  date: Date | null;
  overdue: boolean;
};

/**
 * Resolves task date and clamps any date before today to today with `overdue: true`.
 * Short-notice events trigger this clamp.
 */
export function resolveWithClamp(
  eventDate: string | Date,
  t: LeadTimeInput,
  today: Date = new Date(),
): ClampedDateResult {
  const resolved = resolveTaskDate(eventDate, t);
  if (!resolved) {
    return { date: null, overdue: false };
  }

  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );

  if (resolved.getTime() < todayStart.getTime()) {
    return { date: todayStart, overdue: true };
  }

  return { date: resolved, overdue: false };
}

/**
 * Stable sort by resolved task date.
 * Rule:
 * - Tasks with resolved dates are sorted chronologically (earliest to latest).
 * - Tasks with identical resolved dates maintain their relative order.
 * - Tasks with no resolvable date are placed at the end in their original relative order.
 */
export function sortTimeline<T extends LeadTimeInput>(
  items: readonly T[],
  eventDate: string,
): T[] {
  const indexed = items.map((item, index) => ({
    item,
    index,
    date: resolveTaskDate(eventDate, item),
  }));

  indexed.sort((a, b) => {
    if (a.date && b.date) {
      const diff = a.date.getTime() - b.date.getTime();
      if (diff !== 0) return diff;
      return a.index - b.index;
    }
    if (a.date && !b.date) return -1;
    if (!a.date && b.date) return 1;
    return a.index - b.index;
  });

  return indexed.map((x) => x.item);
}
