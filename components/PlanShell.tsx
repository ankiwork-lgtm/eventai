"use client";

/**
 * PlanShell (P2-T01/T08/T09/T10, P3-T03, TDD §7.2, §7.3, §8.2, §11, DD-8/9/12/13)
 *
 * The dashboard container. Composes:
 *  - usePlanLoader: record loading, share-link decode, corrupt-record probe
 *  - usePlanStream: generation, replay / demo mode, retry / cancel
 *  - PlanStateViews: loading, not found, corrupt, invalid link
 *  - PlanTabs: tab list and content
 * and owns the status machine (loading | generating | ready | failed | missing)
 * plus the active tab mirrored to the `?tab=` query param.
 *
 * Presentational tab components read everything through PlanContext.
 */

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PlanProvider, type PlanStatus, type PlanView } from "@/components/PlanContext";
import { PlanHeader } from "@/components/PlanHeader";
import {
  CenteredSkeleton,
  CorruptPlanView,
  InvalidShareLinkView,
  PlanNotFoundView,
} from "@/components/PlanStateViews";
import { PlanTabs } from "@/components/PlanTabs";
import { EmailDialog } from "@/components/EmailDialog";
import { localRepo } from "@/lib/storage";
import { matchDemoScenario } from "@/lib/demo";
import type { EventInput } from "@/lib/schema";
import type { StoredPlan } from "@/lib/types";
import { TAB_SECTIONS, type TabSection } from "@/lib/streaming";
import { usePlanLoader } from "@/hooks/usePlanLoader";
import { usePlanStream } from "@/hooks/usePlanStream";
import { ProgressBar } from "@/components/ProgressBar";
import { ChatRefiner } from "@/components/ChatRefiner";

function isValidTab(v: string | null): v is TabSection {
  return v !== null && (TAB_SECTIONS as readonly string[]).includes(v);
}

export function PlanShell({ id }: { id: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const {
    storeStatus,
    record,
    update,
    toggle,
    cancelPendingSave,
    corruptState,
    setCorruptState,
    sharedRecord,
    sharedError,
  } = usePlanLoader(id);

  // Replay mode (P5-T03) replaces the API call when NEXT_PUBLIC_DEMO_FALLBACK=true
  // or ?demo=1 is present, but only for inputs matching a known demo scenario.
  const demoMode =
    process.env.NEXT_PUBLIC_DEMO_FALLBACK === "true" ||
    searchParams.get("demo") === "1";

  const {
    errorMsg,
    interrupted,
    budgetWarnings,
    object,
    isStreaming,
    handleRetry,
    handleLoadSample,
    handleCancel,
    reset: resetStream,
  } = usePlanStream({ storeStatus, record, update, demoMode });

  const [emailVendor, setEmailVendor] = useState<string | null>(null);

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
  const handleDelete = useCallback(async () => {
    cancelPendingSave();
    await localRepo.remove(id);
    router.push("/");
  }, [id, router, cancelPendingSave]);

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
      resetStream();
      // Reload the page so usePlanStore re-reads the fresh record
      router.refresh();
    },
    [id, router, setCorruptState, resetStream],
  );

  const effectiveRecord = sharedRecord ?? record;
  const isReadOnly = !!sharedRecord;

  // Current plan view: streaming partial while live, persisted plan otherwise.
  // After streaming ends the persisted plan wins, so chat refinements (which
  // update the record) are not masked by the stale streamed object.
  const plan: PlanView = isStreaming
    ? (object ?? effectiveRecord?.plan ?? null)
    : (effectiveRecord?.plan ?? object ?? null);
  const canLoadSample =
    !isReadOnly && !!record && matchDemoScenario(record.input) !== undefined;

  const status: PlanStatus = useMemo(() => {
    if (sharedRecord) return "ready";
    if (storeStatus === "loading") return "loading";
    if (storeStatus === "missing") return "missing";
    if (errorMsg && !isStreaming && !plan) return "failed";
    if (isStreaming) return "generating";
    return "ready";
  }, [sharedRecord, storeStatus, errorMsg, isStreaming, plan]);

  // ── Render: loading ───────────────────────────────────────────────────────
  if (storeStatus === "loading") {
    return <CenteredSkeleton />;
  }

  // ── Render: shared link error ─────────────────────────────────────────────
  if (sharedError) {
    return <InvalidShareLinkView />;
  }

  // ── Render: corrupt ───────────────────────────────────────────────────────
  if (corruptState && !sharedRecord) {
    return (
      <CorruptPlanView
        salvagedInput={corruptState.salvagedInput}
        onDelete={handleDelete}
        onRegenerate={handleRegenerateFromInput}
      />
    );
  }

  // ── Render: missing (no stored record and no shared record) ───────────────
  if (!effectiveRecord) {
    return <PlanNotFoundView />;
  }

  const input = effectiveRecord.input as EventInput;
  const summary = plan?.summary ?? undefined;

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
        planId: id,
        input,
        plan,
        progress: effectiveRecord.progress,
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

          <ProgressBar plan={effectiveRecord.plan} progress={effectiveRecord.progress} />

          <PlanTabs
            activeTab={activeTab}
            onTabChange={setTab}
            plan={plan}
            object={object}
            record={effectiveRecord}
            input={input}
            isStreaming={isStreaming}
            budgetWarnings={budgetWarnings}
            toggle={toggle}
            isReadOnly={isReadOnly}
            onDraftEmail={setEmailVendor}
          />
        </main>

        {/* ChatRefiner — desktop side panel + mobile floating button (P3-T07), hidden in read-only */}
        {!isReadOnly && effectiveRecord.plan && (
          <ChatRefiner
            record={effectiveRecord}
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
