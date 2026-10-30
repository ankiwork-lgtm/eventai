"use client";

/**
 * PlanHeader (P2-T02, TDD §9.9)
 *
 * Title, formatted date, guests, budget, countdown, and the streaming-tolerant
 * plan summary. Reserves a slot for the Export menu (filled in Phase 4) and a
 * "New plan" link to `/`.
 */

import Link from "next/link";
import { CalendarIcon, MapPinIcon, UsersIcon, WalletIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ExportMenu } from "@/components/ExportMenu";
import { asCompletePlan, useOptionalPlan } from "@/components/PlanContext";
import { daysUntil } from "@/lib/dates";
import { getEventDisplayName } from "@/lib/eventName";
import { countdownText, formatEventDate, formatMoney } from "@/lib/format";
import type { EventInput } from "@/lib/schema";

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Title: explicit event name, else "{Type} in {City}". */
function headerTitle(input: EventInput): string {
  return getEventDisplayName(input, `${titleCase(input.eventType)} in ${input.city}`);
}

export function PlanHeader({
  input,
  summary,
  isStreaming,
  planId,
}: {
  input: EventInput;
  /** Streaming-tolerant: undefined until the summary key arrives. */
  summary: string | undefined;
  isStreaming: boolean;
  planId?: string;
}) {
  const days = daysUntil(input.date);
  const planCtx = useOptionalPlan();

  return (
    <header className="flex flex-col gap-4 border-b pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {headerTitle(input)}
          </h1>
          <p className="text-sm font-medium text-primary">{countdownText(days)}</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Export menu (Phase 4, P4-T05) */}
          {planCtx?.plan && (
            <ExportMenu
              planId={planId ?? "plan"}
              input={input}
              plan={asCompletePlan(planCtx.plan)}
              disabled={isStreaming}
            />
          )}
          <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
            New plan
          </Link>
        </div>
      </div>

      {/* Key facts */}
      <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <CalendarIcon className="size-4" aria-hidden />
          <dt className="sr-only">Date</dt>
          <dd>{formatEventDate(input.date)}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <MapPinIcon className="size-4" aria-hidden />
          <dt className="sr-only">City</dt>
          <dd>{input.city}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <UsersIcon className="size-4" aria-hidden />
          <dt className="sr-only">Guests</dt>
          <dd>{input.guestCount.toLocaleString()} guests</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <WalletIcon className="size-4" aria-hidden />
          <dt className="sr-only">Budget</dt>
          <dd>{formatMoney(input.totalBudget, input.currency)}</dd>
        </div>
      </dl>

      {/* Summary: streaming-tolerant with a skeleton before it arrives */}
      {summary && summary.trim() ? (
        <p className="max-w-prose text-sm leading-relaxed text-foreground/90">
          {summary}
        </p>
      ) : isStreaming ? (
        <div className="flex max-w-prose flex-col gap-2" aria-hidden>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      ) : null}
    </header>
  );
}
