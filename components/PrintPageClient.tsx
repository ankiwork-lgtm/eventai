"use client";

/**
 * PrintPageClient — body of /plan/[id]/print (P4-T06, PROJECT_SPEC §8, TDD §8.6, DD-2, §7.1)
 * Rendered by the thin Server Component in app/plan/[id]/print/page.tsx,
 * which exports the route metadata.
 *
 * Print-optimised view for export / Save as PDF.
 * Loads the stored plan, renders header, summary, budget table, timeline,
 * vendors, and ideas with clean print styling and page breaks.
 */

import React, { useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PrinterIcon, ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlanStore } from "@/hooks/usePlanStore";
import { groupByPhase } from "@/lib/timeline";
import { getEventDisplayName } from "@/lib/eventName";
import { PRINT_DELAY_MS } from "@/lib/constants";
import { PrintHeader } from "@/components/print/PrintHeader";
import { BudgetTable } from "@/components/print/BudgetTable";
import { TimelineSection } from "@/components/print/TimelineSection";
import { VendorList } from "@/components/print/VendorList";
import { IdeasList } from "@/components/print/IdeasList";

function PrintViewContent({ id }: { id: string }) {
  const searchParams = useSearchParams();
  const { status, record } = usePlanStore(id);

  const autoPrint = searchParams.get("auto") === "1";

  useEffect(() => {
    if (status === "ready" && record?.plan && autoPrint) {
      const timer = setTimeout(() => {
        window.print();
      }, PRINT_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [status, record, autoPrint]);

  if (status === "loading") {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <Skeleton className="h-10 w-3/4 mb-4" />
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-2/3 mb-8" />
        <Skeleton className="h-48 w-full mb-8" />
      </div>
    );
  }

  if (status === "missing" || !record || !record.plan) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <h1 className="text-xl font-semibold mb-2">Plan not found</h1>
        <p className="text-sm text-muted-foreground mb-6">
          This plan could not be found or has not been generated yet.
        </p>
        <Link href={`/plan/${id}`} className="text-sm underline">
          Back to plan dashboard
        </Link>
      </div>
    );
  }

  const { input, plan } = record;
  const eventName = getEventDisplayName(input, `${input.eventType.toUpperCase()} PLAN`);
  const timelineGroups = groupByPhase(plan.timeline ?? [], input.date);

  return (
    <div className="min-h-screen w-full bg-white text-black p-8 sm:p-12 print:p-0 print:m-0 max-w-4xl mx-auto">
      {/* Top action bar (hidden in print) */}
      <div className="print:hidden mb-8 flex items-center justify-between border-b pb-4">
        <Link
          href={`/plan/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-neutral-600 hover:text-black"
        >
          <ArrowLeftIcon className="size-4" />
          Back to dashboard
        </Link>
        <Button onClick={() => window.print()} className="gap-2">
          <PrinterIcon className="size-4" />
          Print / Save as PDF
        </Button>
      </div>

      <PrintHeader eventName={eventName} input={input} summary={plan.summary} />

      <BudgetTable budget={plan.budget} currency={input.currency} totalBudget={input.totalBudget} />

      <TimelineSection groups={timelineGroups} eventDate={input.date} />

      <VendorList vendors={plan.vendors} />

      <IdeasList ideas={plan.ideas} />

      {/* Print Footer */}
      <footer className="border-t border-neutral-300 pt-4 text-center text-xs text-neutral-500">
        <p>EventAI — Intelligent Event Planning & Budgeting</p>
      </footer>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body {
            background-color: white !important;
            color: black !important;
          }
          nav, header > .print\\:hidden, .print\\:hidden {
            display: none !important;
          }
          .page-break-before {
            page-break-before: always;
          }
          .break-inside-avoid {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          @page {
            margin: 1.5cm;
            size: A4 portrait;
          }
        }
      `}</style>
    </div>
  );
}

function PrintPageShell({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  return <PrintViewContent id={id} />;
}

export function PrintPageClient({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <React.Suspense fallback={<div className="p-8 text-sm">Loading print view…</div>}>
      <PrintPageShell params={params} />
    </React.Suspense>
  );
}
