import type { DeepPartial } from "ai";
import type { Plan } from "@/lib/schema";

/**
 * lib/streaming.ts — section reveal logic (P2-T03, TDD §8.2)
 *
 * The plan streams in key order: summary → budget → timeline → vendors → ideas.
 * A section is considered "done" when the NEXT section's key has started
 * arriving, or when streaming has finished. The last section (ideas) is only
 * done once streaming finishes.
 *
 * Pure so it can be unit-tested and shared between the shell and the tabs.
 */

export const PLAN_SECTIONS = [
  "summary",
  "budget",
  "timeline",
  "vendors",
  "ideas",
] as const;

export type PlanSection = (typeof PLAN_SECTIONS)[number];

/** Tab keys shown in the dashboard (summary lives in the header, not a tab). */
export const TAB_SECTIONS = ["budget", "timeline", "vendors", "ideas"] as const;
export type TabSection = (typeof TAB_SECTIONS)[number];

function hasArrived(object: DeepPartial<Plan> | null | undefined, key: PlanSection): boolean {
  if (!object) return false;
  const value = (object as Record<string, unknown>)[key];
  if (value === undefined || value === null) return false;
  // An empty array means the key exists but nothing has streamed into it yet.
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.length > 0;
  return true;
}

/**
 * True while `section` is still streaming: the stream is live, and the next
 * section's key has not started arriving yet. When `isStreaming` is false,
 * nothing is pending.
 */
export function isSectionStreaming(
  section: PlanSection,
  object: DeepPartial<Plan> | null | undefined,
  isStreaming: boolean,
): boolean {
  if (!isStreaming) return false;
  const index = PLAN_SECTIONS.indexOf(section);
  const next = PLAN_SECTIONS[index + 1];
  // Last section: pending until the whole stream finishes.
  if (next === undefined) return true;
  // Pending until the next section's key appears.
  return !hasArrived(object, next);
}

/**
 * True when a tab has no data to render yet (its key is still undefined/empty).
 * Used to decide between a skeleton and real content (P2-T03).
 */
export function isSectionEmpty(
  section: PlanSection,
  object: DeepPartial<Plan> | null | undefined,
): boolean {
  return !hasArrived(object, section);
}
