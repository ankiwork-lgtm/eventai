"use client";

/**
 * Timeline (P2-T05, P3-T04, TDD §9.4)
 *
 * Groups items by phase (lib/timeline.ts phaseOf) in model order. Real
 * chronological sort by resolved date is P4-T03. Rows show an interactive
 * checkbox (disabled while streaming), the task, the `when` label, and a
 * priority badge whose text ("High"/"Medium"/"Low") carries the signal so
 * colour is never the only cue. Open / Done / priority filters are functional.
 */

import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { isCompleteTimelineItem } from "@/lib/guards";
import { groupByPhase } from "@/lib/timeline";
import { formatDisplayDate, resolveWithClamp, sortTimeline } from "@/lib/dates";
import { buildIcs, downloadIcs } from "@/lib/export";
import { taskKey } from "@/lib/progress";
import { useOptionalPlan } from "@/components/PlanContext";
import type { Plan } from "@/lib/schema";
import type { ProgressState } from "@/lib/types";

type TimelineItem = Plan["timeline"][number];

const PRIORITY_LABEL: Record<TimelineItem["priority"], string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

const PRIORITY_VARIANT: Record<
  TimelineItem["priority"],
  "destructive" | "secondary" | "outline"
> = {
  high: "destructive",
  medium: "secondary",
  low: "outline",
};

type StatusFilter = "all" | "open" | "done";
type PriorityFilter = "all" | TimelineItem["priority"];

export function Timeline({
  items,
  eventDate,
  progress,
  onToggle,
  isStreaming = false,
}: {
  items: readonly (Partial<TimelineItem> | null | undefined)[] | undefined;
  eventDate?: string;
  progress?: ProgressState;
  onToggle?: (kind: keyof ProgressState, key: string) => void;
  isStreaming?: boolean;
}) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [priority, setPriority] = useState<PriorityFilter>("all");
  const planCtx = useOptionalPlan();

  const handleExportIcs = () => {
    if (!planCtx?.input || !planCtx?.plan) return;
    try {
      const icsData = buildIcs({
        planId: "plan",
        input: planCtx.input,
        plan: planCtx.plan as Plan,
      });
      const name = planCtx.input.name?.trim() || planCtx.input.eventType;
      downloadIcs(`${name}-schedule.ics`, icsData);
      toast.success("Calendar downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to download calendar");
    }
  };

  const complete = (items ?? []).filter(isCompleteTimelineItem);

  // Sort chronologically by real date if eventDate is provided (P4-T03)
  const sorted = eventDate ? sortTimeline(complete, eventDate) : complete;

  // Status filter (functional in P3)
  const statusFiltered =
    status === "all"
      ? sorted
      : sorted.filter((item) => {
          const key = taskKey(item);
          const isDone = progress?.timeline[key] ?? false;
          return status === "done" ? isDone : !isDone;
        });

  const filtered =
    priority === "all"
      ? statusFiltered
      : statusFiltered.filter((item) => item.priority === priority);

  const groups = groupByPhase(filtered, eventDate);

  if (complete.length === 0) {
    return <p className="text-sm text-muted-foreground">No timeline tasks yet.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Filters and Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1" role="group" aria-label="Status filter">
            {(["all", "open", "done"] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={status === s}
                onClick={() => setStatus(s)}
                className="min-h-[40px] rounded-md px-2 py-1 capitalize transition-colors aria-pressed:bg-muted aria-pressed:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                {s}
              </button>
            ))}
          </div>
          <div
            className="flex items-center gap-1"
            role="group"
            aria-label="Priority filter"
          >
            {(["all", "high", "medium", "low"] as const).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={priority === p}
                onClick={() => setPriority(p)}
                className="min-h-[40px] rounded-md px-2 py-1 capitalize transition-colors aria-pressed:bg-muted aria-pressed:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {planCtx?.input && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportIcs}
            disabled={isStreaming}
            className="gap-1.5"
          >
            <CalendarIcon className="size-4" />
            Add to calendar (.ics)
          </Button>
        )}
      </div>

      {groups.length === 0 && (
        <p className="text-sm text-muted-foreground">No tasks match the selected filters.</p>
      )}

      {groups.map((group) => (
        <section key={group.phase} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground">
            {group.label}
          </h3>
          <ul className="flex flex-col divide-y rounded-lg border">
            {group.items.map((item, i) => {
              const key = taskKey(item);
              const isDone = progress?.timeline[key] ?? false;
              const dateResult = eventDate ? resolveWithClamp(eventDate, item) : null;

              return (
                <li
                  key={`${group.phase}-${i}`}
                  className={`flex items-start gap-3 px-3 py-2.5 transition-colors ${
                    isDone ? "opacity-60" : ""
                  }`}
                >
                  <Checkbox
                    id={`tl-${key}-${i}`}
                    className="mt-0.5"
                    checked={isDone}
                    disabled={isStreaming || !onToggle}
                    onCheckedChange={() => onToggle?.("timeline", key)}
                    aria-label={`Mark "${item.task}" done`}
                  />
                  <div className="flex flex-1 flex-col gap-0.5">
                    <label
                      htmlFor={`tl-${key}-${i}`}
                      className={`cursor-pointer text-sm select-none ${
                        isDone ? "line-through text-muted-foreground" : ""
                      }`}
                    >
                      {item.task}
                    </label>
                    <span className="text-xs text-muted-foreground">
                      {dateResult?.date
                        ? `${formatDisplayDate(dateResult.date)} · ${item.when}`
                        : item.when}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {dateResult?.overdue && (
                      <Badge
                        variant="outline"
                        className="border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                      >
                        Start now
                      </Badge>
                    )}
                    <Badge variant={PRIORITY_VARIANT[item.priority]}>
                      {PRIORITY_LABEL[item.priority]}
                    </Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
