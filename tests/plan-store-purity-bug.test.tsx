/**
 * Task 4.1 - Bug condition exploration for hooks/usePlanStore.ts.
 *
 * Property 1: Bug Condition - side effects inside `setRecord` updaters and a
 * debounce timer that is not cleared / flushed on unmount.
 *
 * These tests are EXPECTED TO FAIL on the unfixed hook. They encode the
 * expected behavior (Requirements 2.6): pure updaters, at most one write per
 * debounce window, and no lost edit or leaked timer on unmount.
 *
 * fast-check is not installed, so sequences come from a small seeded
 * generator (deterministic, reproducible).
 *
 * **Validates: Requirements 1.6, 2.6**
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import type { StoredPlan, ProgressState } from "@/lib/types";
import { toggleProgress } from "@/lib/progress";
import { SAVE_DEBOUNCE_MS } from "@/lib/constants";

const { mockInspect, mockSave } = vi.hoisted(() => ({
  mockInspect: vi.fn(),
  mockSave: vi.fn(),
}));

vi.mock("@/lib/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage")>();
  return {
    ...actual,
    localRepo: {
      list: vi.fn(),
      get: vi.fn(),
      remove: vi.fn(),
      getLastPlanId: vi.fn(() => null),
      inspect: mockInspect,
      save: mockSave,
      onStorageDegraded: vi.fn(() => () => {}),
    },
  };
});

vi.mock("sonner", () => ({ toast: { warning: vi.fn() } }));

import { usePlanStore } from "@/hooks/usePlanStore";

const BASE: StoredPlan = {
  id: "p1",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  input: {} as StoredPlan["input"],
  plan: null,
  progress: { timeline: {}, vendors: {} },
  chat: [],
  version: 1,
};

type Op =
  | { type: "update"; patch: Partial<StoredPlan> }
  | { type: "toggle"; kind: keyof ProgressState; key: string };

/** Small LCG so sequences are deterministic without a PBT library. */
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function genOps(seed: number, length: number): Op[] {
  const rnd = makeRng(seed);
  const keys = ["a", "b", "c"];
  const ops: Op[] = [];
  for (let i = 0; i < length; i++) {
    if (rnd() < 0.5) {
      ops.push({
        type: "toggle",
        kind: rnd() < 0.5 ? "timeline" : "vendors",
        key: keys[Math.floor(rnd() * keys.length)],
      });
    } else {
      ops.push({
        type: "update",
        patch: {
          chat: [{ role: "user", content: `m${seed}-${i}`, at: "t" }],
        },
      });
    }
  }
  return ops;
}

/** Pure reference reduction (ignores updatedAt). */
function reduce(ops: Op[]): Omit<StoredPlan, "updatedAt"> {
  let rec: StoredPlan = { ...BASE };
  for (const op of ops) {
    rec =
      op.type === "update"
        ? { ...rec, ...op.patch }
        : { ...rec, progress: toggleProgress(rec.progress, op.kind, op.key) };
  }
  const { updatedAt: _u, ...rest } = rec;
  void _u;
  return rest;
}

function stripUpdatedAt(r: StoredPlan): Omit<StoredPlan, "updatedAt"> {
  const { updatedAt: _u, ...rest } = r;
  void _u;
  return rest;
}

const SEEDS = [1, 2, 3, 7, 42, 99, 1234, 2024];

async function mountStrict() {
  const hook = renderHook(() => usePlanStore("p1"), {
    wrapper: ({ children }) => (
      <React.StrictMode>{children}</React.StrictMode>
    ),
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(hook.result.current.status).toBe("ready");
  return hook;
}

beforeEach(() => {
  vi.useFakeTimers();
  mockSave.mockReset();
  mockSave.mockResolvedValue(undefined);
  mockInspect.mockReset();
  mockInspect.mockResolvedValue({ state: "ok", record: BASE });
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
});

function apply(
  result: { current: ReturnType<typeof usePlanStore> },
  op: Op,
) {
  if (op.type === "update") result.current.update(op.patch);
  else result.current.toggle(op.kind, op.key);
}

describe("usePlanStore purity under StrictMode (bug condition)", () => {
  it.each(SEEDS)(
    "seed %i: one window of ops => at most one write, persisted record equals pure reduction",
    async (seed) => {
      const ops = genOps(seed, 6);
      const { result } = await mountStrict();

      for (const op of ops) {
        await act(async () => {
          apply(result, op);
          vi.advanceTimersByTime(SAVE_DEBOUNCE_MS / 6); // stay inside window
        });
      }
      // Nothing may be written inside the window
      expect(mockSave).toHaveBeenCalledTimes(0);

      await act(async () => {
        vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
      });

      expect(mockSave.mock.calls.length).toBeLessThanOrEqual(1);
      expect(mockSave).toHaveBeenCalledTimes(1);
      const saved = mockSave.mock.calls.at(-1)![0] as StoredPlan;
      expect(stripUpdatedAt(saved)).toEqual(reduce(ops));
      // No timer left after the single write
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(SEEDS)(
    "seed %i: ops batched in one act leave exactly one pending timer and one write",
    async (seed) => {
      const ops = genOps(seed, 8);
      const { result } = await mountStrict();

      await act(async () => {
        for (const op of ops) apply(result, op);
      });
      // Updaters must not each schedule their own timers (StrictMode runs
      // them twice); at most one debounce timer may be pending.
      expect(vi.getTimerCount()).toBeLessThanOrEqual(1);

      await act(async () => {
        vi.advanceTimersByTime(SAVE_DEBOUNCE_MS + 1);
      });
      expect(mockSave).toHaveBeenCalledTimes(1);
      const saved = mockSave.mock.calls[0][0] as StoredPlan;
      expect(stripUpdatedAt(saved)).toEqual(reduce(ops));
    },
  );

  it("updater functions are pure: no ref write or timer happens inside setRecord updater", async () => {
    // Spy on setTimeout; in StrictMode a pure updater run twice must not
    // cause more than one scheduleSave per call to update().
    const spy = vi.spyOn(globalThis, "setTimeout");
    const { result } = await mountStrict();
    spy.mockClear();

    await act(async () => {
      result.current.toggle("timeline", "a");
    });
    // One logical edit => one scheduled timer (updater purity).
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe("usePlanStore unmount with a pending save (bug condition)", () => {
  it.each(SEEDS)(
    "seed %i: unmount flushes the latest edit and leaves no timer",
    async (seed) => {
      const ops = genOps(seed, 4);
      const { result, unmount } = await mountStrict();

      await act(async () => {
        for (const op of ops) apply(result, op);
      });
      expect(mockSave).toHaveBeenCalledTimes(0); // still pending

      unmount();

      // Expected: edit persisted at unmount time (no waiting for a timer)
      expect(mockSave).toHaveBeenCalledTimes(1);
      const saved = mockSave.mock.calls[0][0] as StoredPlan;
      expect(stripUpdatedAt(saved)).toEqual(reduce(ops));
      // Expected: no timer survives the component
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
