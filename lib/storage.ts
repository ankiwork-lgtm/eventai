import { z } from "zod";
import { EventInputBaseSchema, PlanSchema } from "@/lib/schema";
import type { EventInputBase } from "@/lib/schema";
import type { StoredPlan, StoredPlanMeta } from "@/lib/types";

/**
 * Result of inspecting a stored key (P2-T10). Distinguishes a key that is simply
 * absent ("missing") from one that exists but fails to parse/validate ("corrupt").
 * When corrupt, the raw string is returned so the UI can try to salvage `input`
 * for a "Regenerate from input" action.
 */
export type InspectResult =
  | { state: "missing" }
  | { state: "ok"; record: StoredPlan }
  | { state: "corrupt"; raw: string };

/** Async on purpose (DD-3): a DB-backed implementation can replace localStorage with no call-site changes. */
export interface PlanRepository {
  list(): Promise<StoredPlanMeta[]>;
  get(id: string): Promise<StoredPlan | null>;
  save(p: StoredPlan): Promise<void>;
  remove(id: string): Promise<void>;
  /** Distinguishes missing vs corrupt for an id (P2-T10). */
  inspect(id: string): Promise<InspectResult>;
}

export type LocalRepo = PlanRepository & {
  /**
   * Registers a callback fired ONCE, the first time localStorage proves unusable
   * (private mode, quota, disabled). If already degraded, fires immediately.
   * Returns an unsubscribe function.
   */
  onStorageDegraded(cb: () => void): () => void;
  /** Sync read of the last-opened plan id (for useSyncExternalStore on the landing page). */
  getLastPlanId(): string | null;
};

// Storage layout (TDD §5.4)
const INDEX_KEY = "eventai:v1:index";
const LAST_KEY = "eventai:v1:last";
const planKey = (id: string) => `eventai:v1:plan:${id}`;

/**
 * Read-side validation schema for a stored record.
 * DECISION: `input` is validated with EventInputBaseSchema (no "date not in the past"
 * refinement). A plan saved for a future event date must keep loading after that date
 * has passed; the future-date rule only applies when the user submits the form/API.
 */
const StoredPlanSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  input: EventInputBaseSchema,
  plan: PlanSchema.nullable(),
  progress: z.object({
    timeline: z.record(z.string(), z.boolean()),
    vendors: z.record(z.string(), z.boolean()),
  }),
  chat: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
      at: z.string(),
    }),
  ),
  version: z.literal(1),
  // Additive field (P3-T08, DD-16); optional so old records still parse.
  lastSnapshot: z
    .object({
      plan: PlanSchema.nullable(),
      input: EventInputBaseSchema,
      progress: z.object({
        timeline: z.record(z.string(), z.boolean()),
        vendors: z.record(z.string(), z.boolean()),
      }),
    })
    .optional(),
});

export function createLocalRepo(): LocalRepo {
  // In-memory fallback; holds raw strings so it mirrors localStorage semantics.
  const memory = new Map<string, string>();
  const listeners = new Set<() => void>();
  let degraded = false;

  function markDegraded(): void {
    if (degraded) return;
    degraded = true;
    // Deferred so a callback (e.g. a toast) never runs in the middle of a React render
    // when degradation is first detected from a render-time read.
    queueMicrotask(() => {
      listeners.forEach((cb) => cb());
      listeners.clear();
    });
  }

  function readRaw(key: string): string | null {
    const mem = memory.get(key);
    if (mem !== undefined) return mem; // newer than anything still in localStorage
    try {
      return window.localStorage.getItem(key);
    } catch {
      markDegraded();
      return null;
    }
  }

  function writeRaw(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
      memory.delete(key);
    } catch {
      markDegraded();
      memory.set(key, value);
    }
  }

  function removeRaw(key: string): void {
    memory.delete(key);
    try {
      window.localStorage.removeItem(key);
    } catch {
      markDegraded();
    }
  }

  function readIndex(): string[] {
    const raw = readRaw(INDEX_KEY);
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((x): x is string => typeof x === "string")
        : [];
    } catch {
      return [];
    }
  }

  function inspectPlan(id: string): InspectResult {
    const raw = readRaw(planKey(id));
    if (raw === null) return { state: "missing" };
    try {
      const result = StoredPlanSchema.safeParse(JSON.parse(raw));
      if (result.success) return { state: "ok", record: result.data };
      console.warn(`[storage] Stored plan ${id} failed validation; treating as corrupt.`);
    } catch {
      console.warn(`[storage] Stored plan ${id} is not valid JSON; treating as corrupt.`);
    }
    return { state: "corrupt", raw };
  }

  function readPlan(id: string): StoredPlan | null {
    const result = inspectPlan(id);
    return result.state === "ok" ? result.record : null;
  }

  return {
    async list() {
      const metas: StoredPlanMeta[] = [];
      for (const id of readIndex()) {
        const p = readPlan(id);
        if (!p) continue;
        metas.push({
          id: p.id,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          eventType: p.input.eventType,
          eventName: p.input.eventName,
          date: p.input.date,
          city: p.input.city,
        });
      }
      // Array.prototype.sort is stable, so ties keep index order (already most recent first).
      return metas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async get(id) {
      return readPlan(id);
    },

    async inspect(id) {
      return inspectPlan(id);
    },

    async save(p) {
      writeRaw(planKey(p.id), JSON.stringify(p));
      writeRaw(INDEX_KEY, JSON.stringify([p.id, ...readIndex().filter((x) => x !== p.id)]));
      writeRaw(LAST_KEY, p.id);
    },

    async remove(id) {
      removeRaw(planKey(id));
      writeRaw(INDEX_KEY, JSON.stringify(readIndex().filter((x) => x !== id)));
      if (readRaw(LAST_KEY) === id) removeRaw(LAST_KEY);
    },

    onStorageDegraded(cb) {
      if (degraded) {
        cb();
        return () => {};
      }
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },

    getLastPlanId() {
      return readRaw(LAST_KEY);
    },
  };
}

export const localRepo: LocalRepo = createLocalRepo();

/**
 * Best-effort recovery of a usable EventInputBase from a corrupt raw record (P2-T10).
 * Returns the parsed input when the `input` field still validates against the
 * base schema (no future-date rule), otherwise null. Enables a safe
 * "Regenerate from input" action without resurrecting a broken plan.
 */
export function salvageInput(raw: string): EventInputBase | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const input = (parsed as { input?: unknown }).input;
    const result = EventInputBaseSchema.safeParse(input);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
