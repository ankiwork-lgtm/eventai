import type { EventInput, Plan } from "@/lib/schema";

export type StoredPlan = {
  id: string; // crypto.randomUUID()
  createdAt: string; // ISO
  updatedAt: string;
  input: EventInput;
  plan: Plan | null; // null while the plan is still being generated
  progress: ProgressState; // checkbox state, kept SEPARATE from plan
  chat: ChatMessage[]; // refine history
  version: 1; // storage schema version
  /** Snapshot before last refine — enables one-step Undo (P3-T08, DD-16). Additive: version stays 1. */
  lastSnapshot?: {
    plan: Plan | null;
    input: EventInput;
    progress: ProgressState;
  };
};

export type ProgressState = {
  timeline: Record<string, boolean>; // key = taskKey()
  vendors: Record<string, boolean>; // key = vendorItemKey()
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  at: string;
};

/** Lightweight summary of a stored plan, for list views. */
export type StoredPlanMeta = Pick<StoredPlan, "id" | "createdAt" | "updatedAt"> & {
  eventType: EventInput["eventType"];
  eventName?: string;
  date: string;
  city: string;
};
