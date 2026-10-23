import type { DeepPartial } from "ai";
import type { Plan } from "@/lib/schema";
import { PLAN_SECTIONS } from "@/lib/streaming";

/**
 * lib/replay.ts (P5-T03, TDD §12.2)
 *
 * Replays a cached plan as a fake stream: reveals summary → budget → timeline →
 * vendors → ideas as growing partial objects, one section per interval, so the
 * dashboard looks live without any API call.
 */

export type ReplayOptions = {
  /** Delay between section reveals. Default 400 ms. */
  intervalMs?: number;
  /** Called once, one interval after the last section is revealed. */
  onComplete?: () => void;
};

/**
 * Starts a replay. The first section is delivered on the next tick; each
 * following section arrives `intervalMs` later. Returns a cancel function that
 * clears every pending timer (safe to call repeatedly, or after completion).
 */
export function replayPlan(
  plan: Plan,
  onPartial: (partial: DeepPartial<Plan>) => void,
  { intervalMs = 400, onComplete }: ReplayOptions = {},
): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  let cancelled = false;

  PLAN_SECTIONS.forEach((_, index) => {
    timers.push(
      setTimeout(() => {
        if (cancelled) return;
        const partial: Record<string, unknown> = {};
        for (const key of PLAN_SECTIONS.slice(0, index + 1)) {
          partial[key] = plan[key];
        }
        onPartial(partial as DeepPartial<Plan>);
      }, index * intervalMs),
    );
  });

  timers.push(
    setTimeout(() => {
      if (cancelled) return;
      onComplete?.();
    }, PLAN_SECTIONS.length * intervalMs),
  );

  return () => {
    cancelled = true;
    timers.forEach(clearTimeout);
    timers.length = 0;
  };
}
