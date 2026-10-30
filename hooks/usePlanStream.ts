"use client";

/**
 * usePlanStream (task 5.2)
 *
 * Plan generation for the dashboard: the streaming `useObject` call with its
 * once-only submit guard, replay mode (P5-T03) for demo scenarios, completion
 * persistence (P2-T08, P4-T01, DD-9) and the retry / sample / cancel handlers.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useObject } from "@ai-sdk/react";
import type { DeepPartial } from "ai";
import { toast } from "sonner";
import { normalizePlan } from "@/lib/budget";
import { matchDemoScenario } from "@/lib/demo";
import { getFixture } from "@/lib/fixtures";
import { replayPlan } from "@/lib/replay";
import { PlanSchema } from "@/lib/schema";
import type { EventInput, Plan } from "@/lib/schema";
import type { StoredPlan } from "@/lib/types";
import {
  formatRateLimitMessage,
  isRateLimited,
  parseApiError,
  type ApiError,
} from "@/lib/client/apiError";

type Params = {
  storeStatus: string;
  record: StoredPlan | null;
  update: (patch: Partial<StoredPlan>) => void;
  /** Replay a cached fixture instead of calling the API (NEXT_PUBLIC_DEMO_FALLBACK or ?demo=1). */
  demoMode: boolean;
};

export function usePlanStream({ storeStatus, record, update, demoMode }: Params) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [budgetWarnings, setBudgetWarnings] = useState<string[]>([]);
  /** True once a stream has failed mid-flight, keeping the partial visible. */
  const [interrupted, setInterrupted] = useState(false);
  /** Replay mode (P5-T03): a cached fixture revealed section by section, no API call. */
  const [replayObject, setReplayObject] = useState<DeepPartial<Plan> | undefined>();
  const [isReplaying, setIsReplaying] = useState(false);

  const submitted = useRef(false);
  const cancelReplay = useRef<(() => void) | null>(null);
  /** The fixture last replayed, so Retry replays instead of calling the API. */
  const replaySource = useRef<Plan | null>(null);

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
    fetch: planFetch,
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
      toastStreamError(err);
    },
  });

  // ── Auto-submit once when the record has input but no plan ───────────────
  // Replay mode (P5-T03) replaces the API call when demoMode is on, but only
  // for inputs matching a known demo scenario.
  useEffect(() => {
    if (storeStatus !== "ready" || !record) return;
    if (record.plan !== null) return;
    if (submitted.current) return;
    submitted.current = true;
    const scenario = demoMode ? matchDemoScenario(record.input) : undefined;
    if (scenario) {
      // Starting the replay timer is a one-shot sync with an external system (timers) that also sets initial state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      startReplay(getFixture(scenario.id));
      return;
    }
    submit(record.input as EventInput);
  }, [storeStatus, record, submit, demoMode, startReplay]);

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

  /** Clear error state and re-arm the auto-submit guard (after regenerating from salvaged input). */
  const reset = useCallback(() => {
    setErrorMsg(null);
    setInterrupted(false);
    submitted.current = false;
  }, []);

  const object = replayObject ?? streamObject;
  const isStreaming = isLoading || isReplaying;

  return {
    errorMsg,
    interrupted,
    budgetWarnings,
    object,
    isStreaming,
    handleRetry,
    handleLoadSample,
    handleCancel,
    reset,
  };
}

// ─── Rate-limit toast ──────────────────────────────────────────────────────────

/** Error thrown for a non-OK `/api/plan` response, carrying the parsed envelope. */
class PlanRequestError extends Error {
  constructor(readonly apiError: ApiError) {
    super(isRateLimited(apiError) ? formatRateLimitMessage(apiError) : apiError.message);
    this.name = "PlanRequestError";
  }
}

/** `fetch` for useObject: reads failures through `parseApiError` instead of raw text. */
async function planFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (!res.ok) throw new PlanRequestError(await parseApiError(res));
  return res;
}

function toastStreamError(err: Error) {
  if (err instanceof PlanRequestError && isRateLimited(err.apiError)) {
    toast.error(formatRateLimitMessage(err.apiError));
    return;
  }
  toast.error(err.message || "An error occurred while streaming the plan.");
}
