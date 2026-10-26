"use client";

/**
 * PlanShell (P2-T01/T08/T09/T10, P3-T03, TDD §7.2, §7.3, §8.2, §11, DD-8/9/12/13)
 *
 * The dashboard container. Owns:
 *  - record loading via usePlanStore (DD-13: all storage access in effects)
 *  - the streaming `useObject` call and the once-only submit guard
 *  - the status machine: loading | generating | ready | failed | missing
 *  - active tab mirrored to the `?tab=` query param
 *  - error / retry / cancel flows and empty / corrupt states
 *
 * Presentational tab components read everything through PlanContext.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useObject } from "@ai-sdk/react";
import type { DeepPartial } from "ai";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { PlanProvider, type PlanStatus, type PlanView } from "@/components/PlanContext";
import { PlanHeader } from "@/components/PlanHeader";
import { StreamingBadge } from "@/components/StreamingBadge";
import {
  BudgetSkeleton,
  IdeasSkeleton,
  TimelineSkeleton,
  VendorsSkeleton,
} from "@/components/TabSkeletons";
import { BudgetChart } from "@/components/BudgetChart";
import { Timeline } from "@/components/Timeline";
import { VendorChecklist } from "@/components/VendorChecklist";
import { IdeasGrid } from "@/components/IdeasGrid";
import { EmailDialog } from "@/components/EmailDialog";
import { localRepo, salvageInput } from "@/lib/storage";
import { normalizePlan } from "@/lib/budget";
import { matchDemoScenario } from "@/lib/demo";
import { getFixture } from "@/lib/fixtures";
import { replayPlan } from "@/lib/replay";
import { decodeSharePayload } from "@/lib/share";
import { PlanSchema } from "@/lib/schema";
import type { EventInput, Plan } from "@/lib/schema";
import type { StoredPlan } from "@/lib/types";
import { isSectionEmpty, isSectionStreaming, TAB_SECTIONS, type TabSection } from "@/lib/streaming";
import { usePlanStore } from "@/hooks/usePlanStore";
import { ProgressBar } from "@/components/ProgressBar";
import { ChatRefiner } from "@/components/ChatRefiner";

const TAB_LABELS: Record<TabSection, string> = {
  budget: "Budget",
  timeline: "Timeline",
  vendors: "Vendors",
  ideas: "Ideas",
};

function isValidTab(v: string | null): v is TabSection {
  return v === "budget" || v === "timeline" || v === "vendors" || v === "ideas";
}

/** Local load states before we have a record decision (used for corrupt handling). */
type CorruptState = { kind: "corrupt"; salvagedInput: EventInput | null } | null;

export function PlanShell({ id }: { id: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ── usePlanStore owns loading + persistence ──────────────────────────────
  const { status: storeStatus, record, update, toggle } = usePlanStore(id);

  const [corruptState, setCorruptState] = useState<CorruptState>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [budgetWarnings, setBudgetWarnings] = useState<string[]>([]);
  const [emailVendor, setEmailVendor] = useState<string | null>(null);
  const [sharedRecord, setSharedRecord] = useState<StoredPlan | null>(null);
  const [sharedError, setSharedError] = useState(false);
  /** True once a stream has failed mid-flight, keeping the partial visible. */
  const [interrupted, setInterrupted] = useState(false);
  /** Replay mode (P5-T03): a cached fixture revealed section by section, no API call. */
  const [replayObject, setReplayObject] = useState<DeepPartial<Plan> | undefined>();
  const [isReplaying, setIsReplaying] = useState(false);

  const submitted = useRef(false);
  const cancelReplay = useRef<(() => void) | null>(null);
  /** The fixture last replayed, so Retry replays instead of calling the API. */
  const replaySource = useRef<Plan | null>(null);

  // Detect shared link or corrupt records
  useEffect(() => {
    if (id === "shared" || (typeof window !== "undefined" && window.location.hash.startsWith("#s="))) {
      const hash = typeof window !== "undefined" ? window.location.hash : "";
      const decoded = decodeSharePayload(hash);
      if (decoded) {
        const now = new Date().toISOString();
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSharedRecord({
          id: "shared",
          input: decoded.input,
          plan: decoded.plan,
          progress: { timeline: {}, vendors: {} },
          chat: [],
          version: 1,
          createdAt: now,
          updatedAt: now,
        });
        return;
      } else if (id === "shared" || hash.startsWith("#s=")) {
        setSharedError(true);
        return;
      }
    }

    if (storeStatus !== "missing") return;
    localRepo.inspect(id).then((result) => {
      if (result.state === "corrupt") {
        setCorruptState({ kind: "corrupt", salvagedInput: salvageInput(result.raw) });
      }
    });
  }, [id, storeStatus]);

  // ── Persist a completed plan (P2-T08, P4-T01, DD-9) ──────────────────────
  const onPlanComplete = useCallback((plan: ReturnType<typeof PlanSchema.parse>) => {
    const totalBudget = record?.input.totalBudget ?? 0;
    const { plan: finalPlan, warnings } = normalizePlan(plan, totalBudget);
    if (warnings.length > 0) {
      setBudgetWarnings(warnings);
    }
    update({ plan: finalPlan });
  }, [record?.input.totalBudget, update]);

  const startReplay = useCallback(
    (fixture: Plan) => {
      cancelReplay.current?.();
      replaySource.current = fixture;
      setErrorMsg(null);
      setInterrupted(false);
      setReplayObject(undefined);
      setIsReplaying(true);
      cancelReplay.current = replayPlan(fixture, setReplayObject, {
        onComplete: () => {
          cancelReplay.current = null;
          setIsReplaying(false);
          setReplayObject(undefined);
          onPlanComplete(fixture);
        },
      });
    },
    [onPlanComplete],
  );

  // Cancel pending replay timers on unmount. Resetting `submitted` lets the
  // auto-start effect restart the replay if React Strict Mode re-mounts us.
  useEffect(
    () => () => {
      if (cancelReplay.current) {
        cancelReplay.current();
        cancelReplay.current = null;
        submitted.current = false;
      }
    },
    [],
  );

  const { submit, object: streamObject, isLoading, stop } = useObject({
    api: "/api/plan",
    schema: PlanSchema,
    onFinish({ object: finished, error: finishError }) {
      if (finishError || !finished) {
        const msg =
          finishError?.message ??
          "The plan stream ended without a valid response. Please retry.";
        setErrorMsg(msg);
        setInterrupted(true);
        toast.error(msg);
        return;
      }
      setErrorMsg(null);
      setInterrupted(false);
      onPlanComplete(finished);
    },
    onError(err) {
      const msg = err.message ?? "An error occurred while streaming the plan.";
      setErrorMsg(msg);
      setInterrupted(true);
      maybeToastRateLimit(err);
    },
  });

  // ── Auto-submit once when the record has input but no plan ───────────────
  // Replay mode (P5-T03) replaces the API call when NEXT_PUBLIC_DEMO_FALLBACK=true
  // or ?demo=1 is present, but only for inputs matching a known demo scenario.
  const demoMode =
    process.env.NEXT_PUBLIC_DEMO_FALLBACK === "true" ||
    searchParams.get("demo") === "1";

  useEffect(() => {
    if (storeStatus !== "ready" || !record) return;
    if (record.plan !== null) return;
    if (submitted.current) return;
    submitted.current = true;
    const scenario = demoMode ? matchDemoScenario(record.input) : undefined;
    if (scenario) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      startReplay(getFixture(scenario.id));
      return;
    }
    submit(record.input as EventInput);
  }, [storeStatus, record, submit, demoMode, startReplay]);

  // ── Tab state mirrored to ?tab= ──────────────────────────────────────────
  const rawTab = searchParams.get("tab");
  const activeTab: TabSection = isValidTab(rawTab) ? rawTab : "budget";

  const setTab = useCallback(
    (value: TabSection) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", value);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleRetry = useCallback(() => {
    if (!record) return;
    submitted.current = true;
    if (replaySource.current) {
      startReplay(replaySource.current);
      return;
    }
    setErrorMsg(null);
    setInterrupted(false);
    submit(record.input as EventInput);
  }, [record, submit, startReplay]);

  const handleLoadSample = useCallback(() => {
    if (!record) return;
    const scenario = matchDemoScenario(record.input);
    if (!scenario) return;
    submitted.current = true;
    stop();
    startReplay(getFixture(scenario.id));
  }, [record, stop, startReplay]);

  const handleCancel = useCallback(() => {
    if (cancelReplay.current) {
      cancelReplay.current();
      cancelReplay.current = null;
      setIsReplaying(false);
    } else {
      stop();
    }
    setErrorMsg("Generation cancelled.");
    setInterrupted(true);
  }, [stop]);

  const handleDelete = useCallback(async () => {
    await localRepo.remove(id);
    router.push("/");
  }, [id, router]);

  const handleRegenerateFromInput = useCallback(
    async (salvaged: EventInput) => {
      const now = new Date().toISOString();
      const fresh: StoredPlan = {
        id,
        input: salvaged,
        plan: null,
        progress: { timeline: {}, vendors: {} },
        chat: [],
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      await localRepo.save(fresh);
      setCorruptState(null);
      setErrorMsg(null);
      setInterrupted(false);
      submitted.current = false;
      // Reload the page so usePlanStore re-reads the fresh record
      router.refresh();
    },
    [id, router],
  );

  const effectiveRecord = sharedRecord ?? record;
  const isReadOnly = !!sharedRecord;

  // Current plan view: streaming partial while live, persisted plan otherwise.
  // After streaming ends the persisted plan wins, so chat refinements (which
  // update the record) are not masked by the stale streamed object.
  const object = replayObject ?? streamObject;
  const isStreaming = isLoading || isReplaying;
  const plan: PlanView = isStreaming
    ? (object ?? effectiveRecord?.plan ?? null)
    : (effectiveRecord?.plan ?? object ?? null);
  const canLoadSample =
    !isReadOnly && !!record && matchDemoScenario(record.input) !== undefined;

  const status: PlanStatus = useMemo(() => {
    if (sharedRecord) return "ready";
    if (storeStatus === "loading") return "loading";
    if (storeStatus === "missing" && !corruptState) return "missing";
    if (storeStatus === "missing" && corruptState) return "missing";
    if (errorMsg && !isStreaming && !plan) return "failed";
    if (isStreaming) return "generating";
    return "ready";
  }, [sharedRecord, storeStatus, corruptState, errorMsg, isStreaming, plan]);

  // ── Render: loading ───────────────────────────────────────────────────────
  if (storeStatus === "loading") {
    return <CenteredSkeleton />;
  }

  // ── Render: shared link error ─────────────────────────────────────────────
  if (sharedError) {
    return (
      <CenteredMessage
        title="Invalid shared plan link"
        body="This share link appears to be incomplete, modified, or corrupted."
      >
        <Link href="/" className={buttonVariants({ variant: "default" })}>
          Back to home
        </Link>
      </CenteredMessage>
    );
  }

  // ── Render: corrupt ───────────────────────────────────────────────────────
  if (corruptState && !sharedRecord) {
    return (
      <CenteredMessage
        title="Couldn't load this plan"
        body="The saved data for this plan is corrupted and can't be read."
      >
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="destructive" onClick={handleDelete}>
            Delete
          </Button>
          {corruptState.salvagedInput && (
            <Button onClick={() => handleRegenerateFromInput(corruptState.salvagedInput!)}>
              Regenerate from input
            </Button>
          )}
        </div>
      </CenteredMessage>
    );
  }

  // ── Render: missing ───────────────────────────────────────────────────────
  if (storeStatus === "missing" && !sharedRecord) {
    return (
      <CenteredMessage
        title="Plan not found on this device"
        body="This plan ID does not exist in your browser's local storage."
      >
        <Link href="/" className={buttonVariants({ variant: "default" })}>
          Back to home
        </Link>
      </CenteredMessage>
    );
  }

  const input = effectiveRecord!.input as EventInput;
  const summary = (plan as { summary?: string } | null)?.summary ?? undefined;

  // ── Render: pre-stream failure ────────────────────────────────────────────
  if (status === "failed") {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
        <PlanHeader input={input} summary={undefined} isStreaming={false} />
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
        >
          <p className="text-sm font-medium text-destructive">
            {errorMsg ?? "The plan could not be generated."}
          </p>
          <div className="flex items-center gap-2">
            <Button onClick={handleRetry}>Retry</Button>
            {canLoadSample && (
              <Button variant="outline" onClick={handleLoadSample}>
                Use sample plan
              </Button>
            )}
          </div>
        </div>
      </main>
    );
  }

  // ── Render: ready / generating dashboard ─────────────────────────────────
  return (
    <PlanProvider
      value={{
        input,
        plan,
        progress: effectiveRecord!.progress,
        isStreaming,
        status,
        toggle,
      }}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-6 px-4 py-10">
        <main className="flex min-w-0 flex-1 flex-col gap-6">
          {isReadOnly && (
            <div
              role="status"
              className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-sm text-blue-700 dark:text-blue-400"
            >
              Viewing shared plan (read-only mode)
            </div>
          )}

          <PlanHeader input={input} summary={summary} isStreaming={isStreaming} planId={id} />

          {/* Mid-stream interruption banner (P2-T09) */}
          {interrupted && errorMsg && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
            >
              <span className="font-medium text-amber-700 dark:text-amber-400">
                Generation interrupted — {errorMsg}
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleRetry}>
                  Retry
                </Button>
                {canLoadSample && (
                  <Button size="sm" variant="outline" onClick={handleLoadSample}>
                    Use sample plan
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Cancel while generating */}
          {isStreaming && (
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
          )}

          <ProgressBar plan={effectiveRecord!.plan} progress={effectiveRecord!.progress} />

          <Tabs value={activeTab} onValueChange={(v) => setTab(v as TabSection)}>
            <TabsList className="w-full overflow-x-auto">
              {TAB_SECTIONS.map((section) => (
                <TabsTrigger key={section} value={section} className="gap-1.5">
                  {TAB_LABELS[section]}
                  {isSectionStreaming(section, object, isStreaming) && (
                    <StreamingBadge />
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="budget" className="pt-4">
              {isSectionEmpty("budget", object) && !effectiveRecord!.plan ? (
                <BudgetSkeleton />
              ) : (
                <BudgetChart
                  items={(plan as PlanView & { budget?: unknown })?.budget as never}
                  currency={input.currency}
                  total={input.totalBudget}
                  isStreaming={isStreaming}
                  warnings={budgetWarnings}
                />
              )}
            </TabsContent>

            <TabsContent value="timeline" className="pt-4">
              {isSectionEmpty("timeline", object) && !effectiveRecord!.plan ? (
                <TimelineSkeleton />
              ) : (
                <Timeline
                  items={(plan as PlanView & { timeline?: unknown })?.timeline as never}
                  eventDate={input.date}
                  progress={effectiveRecord!.progress}
                  onToggle={toggle}
                  isStreaming={isStreaming}
                />
              )}
            </TabsContent>

            <TabsContent value="vendors" className="pt-4">
              {isSectionEmpty("vendors", object) && !effectiveRecord!.plan ? (
                <VendorsSkeleton />
              ) : (
                <VendorChecklist
                  vendors={(plan as PlanView & { vendors?: unknown })?.vendors as never}
                  progress={effectiveRecord!.progress}
                  onToggle={toggle}
                  isStreaming={isStreaming}
                  onDraftEmail={isReadOnly ? undefined : (type) => setEmailVendor(type)}
                />
              )}
            </TabsContent>

            <TabsContent value="ideas" className="pt-4">
              {isSectionEmpty("ideas", object) && !effectiveRecord!.plan ? (
                <IdeasSkeleton />
              ) : (
                <IdeasGrid
                  ideas={(plan as PlanView & { ideas?: unknown })?.ideas as never}
                />
              )}
            </TabsContent>
          </Tabs>
        </main>

        {/* ChatRefiner — desktop side panel + mobile floating button (P3-T07), hidden in read-only */}
        {!isReadOnly && effectiveRecord!.plan && (
          <ChatRefiner
            record={effectiveRecord!}
            onRecordChange={update}
            isStreaming={isStreaming}
          />
        )}

        {/* Email Dialog (P4-T07) */}
        {emailVendor && effectiveRecord?.plan && (
          <EmailDialog
            open={!!emailVendor}
            onOpenChange={(isOpen) => {
              if (!isOpen) setEmailVendor(null);
            }}
            vendorType={emailVendor}
            eventInput={input}
            plan={effectiveRecord.plan}
          />
        )}
      </div>
    </PlanProvider>
  );
}

// ─── Rate-limit toast ──────────────────────────────────────────────────────────

function maybeToastRateLimit(err: Error) {
  const msg = err.message ?? "";
  const is429 = /429|too many requests|rate.?limit/i.test(msg);
  if (!is429) {
    toast.error(msg || "An error occurred while streaming the plan.");
    return;
  }
  const retryMatch = /retry-?after[^\d]*(\d+)/i.exec(msg) ?? /(\d+)\s*seconds?/i.exec(msg);
  const seconds = retryMatch ? Number(retryMatch[1]) : null;
  toast.error(
    seconds
      ? `Too many requests, wait ${seconds} seconds.`
      : "Too many requests, please wait a moment.",
  );
}

// ─── Small presentational helpers ─────────────────────────────────────────────

function CenteredSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-10">
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-4 w-full max-w-prose" />
      <Skeleton className="h-4 w-4/5 max-w-prose" />
      <Skeleton className="mt-4 h-8 w-80" />
      <Skeleton className="h-64 w-full" />
    </main>
  );
}

function CenteredMessage({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-4 px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground">{body}</p>
      {children}
    </main>
  );
}
