"use client";

/**
 * ProgressBar (P3-T05, TDD §9.8, §7.5)
 *
 * Derives stats from computeProgress and renders:
 *  - A main shadcn Progress bar with ARIA roles and labels.
 *  - A "X of Y tasks" label.
 *  - Two thin sub-bars for Timeline and Vendors.
 *  - Hidden when the plan is still empty (total === 0).
 *
 * No internal state — purely derived from props.
 */

import { Progress } from "@/components/ui/progress";
import { computeProgress } from "@/lib/progress";
import type { Plan } from "@/lib/schema";
import type { ProgressState } from "@/lib/types";

export function ProgressBar({
  plan,
  progress,
}: {
  plan: Plan | null | undefined;
  progress: ProgressState;
}) {
  const stats = computeProgress(plan ?? null, progress);

  // Hidden while the plan is empty
  if (stats.total === 0) return null;

  return (
    <div className="flex flex-col gap-2" aria-label="Plan completion progress">
      {/* Main bar */}
      <div className="flex items-center justify-between gap-3">
        <Progress
          value={stats.percent}
          className="h-2 flex-1"
          role="progressbar"
          aria-valuenow={stats.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${stats.percent}% complete — ${stats.done} of ${stats.total} tasks done`}
        />
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {stats.done} of {stats.total} tasks
        </span>
      </div>

      {/* Sub-bars */}
      <div className="flex gap-4">
        <SubBar label="Timeline" done={stats.timeline.done} total={stats.timeline.total} />
        <SubBar label="Vendors" done={stats.vendors.done} total={stats.vendors.total} />
      </div>
    </div>
  );
}

function SubBar({
  label,
  done,
  total,
}: {
  label: string;
  done: number;
  total: number;
}) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="flex flex-1 flex-col gap-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">
          {done}/{total}
        </span>
      </div>
      <Progress
        value={pct}
        className="h-1"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${done} of ${total} done`}
      />
    </div>
  );
}
