"use client";

/**
 * PlanContext (TDD §7.3, DD-12: no global store)
 *
 * A plain React context that exposes the current plan view to the presentational
 * tab components so they stay dumb. `PlanShell` owns all state (loading, the
 * streaming `useObject`, persistence) and feeds it in here.
 *
 * `plan` is a streaming-tolerant DeepPartial<Plan> during generation and the full
 * persisted Plan afterwards; components must tolerate `undefined` fields and
 * half-streamed array items (filter with lib/guards.ts). A single selector,
 * `usePlan().plan`, returns whichever is current (P2-T08).
 */

import { createContext, useContext } from "react";
import type { DeepPartial } from "ai";
import type { EventInput, Plan } from "@/lib/schema";
import type { ProgressState } from "@/lib/types";

/** Status machine for the dashboard (P2-T01). */
export type PlanStatus =
  | "loading" // reading the stored record
  | "generating" // streaming from the API
  | "ready" // a plan (partial or final) is available to show
  | "failed" // generation failed
  | "missing"; // no record on this device

/** The plan shape components consume: full Plan or a streamed partial. */
export type PlanView = Plan | DeepPartial<Plan> | null | undefined;

export type PlanContextValue = {
  /** The event input that produced this plan. */
  input: EventInput | null;
  /** Current plan view: streaming partial or persisted full plan. */
  plan: PlanView;
  /** Checkbox progress — wired via usePlanStore (P3-T03). */
  progress: ProgressState;
  /** True while the stream is in flight. */
  isStreaming: boolean;
  /** Dashboard status machine. */
  status: PlanStatus;
  /** Toggle a checkbox key in progress (P3-T03). */
  toggle: (kind: keyof ProgressState, key: string) => void;
};

const PlanCtx = createContext<PlanContextValue | null>(null);

export function PlanProvider({
  value,
  children,
}: {
  value: PlanContextValue;
  children: React.ReactNode;
}) {
  return <PlanCtx.Provider value={value}>{children}</PlanCtx.Provider>;
}

/** Access the current plan context. Throws if used outside a PlanProvider. */
export function usePlan(): PlanContextValue {
  const ctx = useContext(PlanCtx);
  if (ctx === null) {
    throw new Error("usePlan() must be used within a <PlanProvider>");
  }
  return ctx;
}

/** Access the current plan context optionally without throwing. */
export function useOptionalPlan(): PlanContextValue | null {
  return useContext(PlanCtx);
}
