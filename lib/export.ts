/**
 * lib/export.ts (P4-T04, TDD §8.6)
 *
 * ICS calendar export for timeline tasks and the main event.
 */

import { createEvents, type EventAttributes } from "ics";
import { parseLocalDate, resolveTaskDate } from "@/lib/dates";
import { getEventDisplayName } from "@/lib/eventName";
import { taskKey } from "@/lib/progress";
import type { EventInput, Plan } from "@/lib/schema";

export type BuildIcsParams = {
  planId: string;
  input: EventInput;
  plan: Plan;
};

/**
 * Builds an iCalendar (RFC 5545) .ics string from a plan.
 * Emits one all-day VEVENT per resolved timeline task, plus one for the main event.
 * Tasks that cannot be resolved to a calendar date are omitted.
 */
export function buildIcs({ planId, input, plan }: BuildIcsParams): string {
  const eventName = getEventDisplayName(input, `${input.eventType} Event`);
  const eventDateObj = parseLocalDate(input.date);
  const events: EventAttributes[] = [];

  // 1. Timeline task events
  for (const item of plan.timeline ?? []) {
    const resolved = resolveTaskDate(input.date, item);
    if (!resolved) continue;

    const key = taskKey(item);
    const isHigh = item.priority === "high";

    const taskEvent: EventAttributes = {
      start: [
        resolved.getFullYear(),
        resolved.getMonth() + 1,
        resolved.getDate(),
      ],
      duration: { days: 1 },
      title: item.task,
      description: `Priority: ${item.priority} · Event: ${eventName}`,
      uid: `${planId}-${key}@eventai`,
      categories: ["EventAI", input.eventType],
      ...(isHigh
        ? {
            alarms: [
              {
                action: "display",
                description: `Reminder: ${item.task}`,
                trigger: { days: 1, before: true },
              },
            ],
          }
        : {}),
    };

    events.push(taskEvent);
  }

  // 2. Main event
  const mainEvent: EventAttributes = {
    start: [
      eventDateObj.getFullYear(),
      eventDateObj.getMonth() + 1,
      eventDateObj.getDate(),
    ],
    duration: { days: 1 },
    title: eventName,
    description: `EventAI Plan: ${plan.summary ?? ""}`.trim(),
    uid: `${planId}-main@eventai`,
    categories: ["EventAI", input.eventType],
  };

  events.push(mainEvent);

  const { error, value } = createEvents(events);
  if (error || !value) {
    throw new Error(error?.message ?? "Failed to generate ICS calendar file");
  }

  return value;
}

/**
 * Triggers a browser download of an .ics calendar file.
 */
export function downloadIcs(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute(
    "download",
    filename.endsWith(".ics") ? filename : `${filename}.ics`,
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
