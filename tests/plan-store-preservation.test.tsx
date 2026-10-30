/**
 * Task 4.2 - Preservation tests for hooks/usePlanStore.ts.
 *
 * Property 3: Preservation - persistence behavior that must survive the
 * Stage 4 refactor: save after the 300 ms debounce, flush on `beforeunload`
 * and when the tab is hidden, and the storage-degraded toast shown once.
 *
 * These run WITHOUT StrictMode (the bug in 4.1 only shows under StrictMode),
 * so they pass on the unfixed hook. fast-check is not installed, so the
 * sequence test uses deterministic seeded generators.
 *
 * **Validates: Requirements 3.6**
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import type { StoredPlan, ProgressState } from "@/lib/types";
import { toggleProgress } from "@/lib/progress";
import { SAVE_DEBOUNCE_MS } from "@/lib/constants";

const { mockInspect, mockSave, mockOnDegraded, mockToastWarning } = vi.hoisted(
  () => ({
    mockInspect: vi.fn(),
    mockSave: vi.fn(),
    mockOnDegraded: vi.fn(),
    mockToastWarning: vi.fn(),
  }),
);

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
      onStorageDegraded: mockOnDegraded,
    },
  };
});

vi.mock("sonner", () => ({ toast: { warning: mockToastWarning } }));

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
        patch: { chat: [{ role: "user", content: `m${seed}-${i}`, at: "t" }] },
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

function apply(result: { current: ReturnType<typeof usePlanStore> }, op: Op) {
  if (op.type === "update") result.current.update(op.patch);
  else result.current.toggle(op.kind, op.key);
}

async function mount() {
  const hook = renderHook(() => usePlanStore("p1"));
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(hook.result.current.status).toBe("ready");
  return hook;
}

function setVisibility(state: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

const SEEDS = [1, 2, 3, 7, 42, 99, 1234, 2024];

beforeEach(() => {
  vi.useFakeTimers();
  mockSave.mockReset();
  mockSave.mockResolvedValue(undefined);
  mockInspect.mockReset();
  mockInspect.mockResolvedValue({ state: "ok", record: BASE });
  mockOnDegraded.mockReset();
  mockOnDegraded.mockImplementation(() => () => {});
  mockToastWarning.mockReset();
  setVisibility("visible");
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("usePlanStore preservation: debounced save", () => {
  it("does not write before 300 ms and writes once after", async () => {
    expect(SAVE_DEBOUNCE_MS).toBe(300);
    const { result } = await mount();

    await act(async () => {
      result.current.toggle("timeline", "a");
    });
    await act(async () => {
      vi.advanceTimersByTime(SAVE_DEBOUNCE_MS - 1);
    });
    expect(mockSave).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(mockSave).toHaveBeenCalledTimes(1);
    const saved = mockSave.mock.calls[0][0] as StoredPlan;
    expect(saved.progress.timeline.a).toBe(true);
  });

  it("restarts the window on each edit (trailing debounce)", async () => {
    const { result } = await mount();

    // Apply the edit and advance time in separate acts so the timer is
    // scheduled before the clock moves.
    await act(async () => {
      result.current.update({ chat: [{ role: "user", content: "1", at: "t" }] });
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    await act(async () => {
      result.current.update({ chat: [{ role: "user", content: "2", at: "t" }] });
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(mockSave).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect((mockSave.mock.calls[0][0] as StoredPlan).chat[0].content).toBe("2");
  });

  it("bumps updatedAt on update and toggle", async () => {
    const { result } = await mount();
    await act(async () => {
      result.current.update({ chat: [] });
    });
    expect(result.current.record!.updatedAt).not.toBe(BASE.updatedAt);
  });

  it.each(SEEDS)(
    "seed %i: update/toggle sequence stores the pure reduction after the debounce",
    async (seed) => {
      const ops = genOps(seed, 7);
      const { result } = await mount();

      for (const op of ops) {
        await act(async () => {
          apply(result, op);
        });
        await act(async () => {
          vi.advanceTimersByTime(SAVE_DEBOUNCE_MS / 6); // stay inside window
        });
      }
      expect(mockSave).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
      });

      expect(mockSave).toHaveBeenCalledTimes(1);
      const saved = mockSave.mock.calls[0][0] as StoredPlan;
      expect(stripUpdatedAt(saved)).toEqual(reduce(ops));
      expect(stripUpdatedAt(result.current.record!)).toEqual(reduce(ops));
    },
  );
});

describe("usePlanStore preservation: flush on lifecycle events", () => {
  it.each(SEEDS)(
    "seed %i: beforeunload flushes the latest edit immediately, once",
    async (seed) => {
      const ops = genOps(seed, 4);
      const { result } = await mount();
      await act(async () => {
        for (const op of ops) apply(result, op);
      });
      expect(mockSave).not.toHaveBeenCalled();

      await act(async () => {
        window.dispatchEvent(new Event("beforeunload"));
      });
      expect(mockSave).toHaveBeenCalledTimes(1);
      expect(stripUpdatedAt(mockSave.mock.calls[0][0] as StoredPlan)).toEqual(
        reduce(ops),
      );

      // The pending debounce timer was cancelled by the flush
      await act(async () => {
        vi.advanceTimersByTime(SAVE_DEBOUNCE_MS * 2);
      });
      expect(mockSave).toHaveBeenCalledTimes(1);
    },
  );

  it("flushes when the tab becomes hidden", async () => {
    const { result } = await mount();
    await act(async () => {
      result.current.toggle("vendors", "b");
    });
    expect(mockSave).not.toHaveBeenCalled();

    setVisibility("hidden");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect((mockSave.mock.calls[0][0] as StoredPlan).progress.vendors.b).toBe(
      true,
    );
  });

  it("does not flush on visibilitychange while the tab is visible", async () => {
    const { result } = await mount();
    await act(async () => {
      result.current.toggle("vendors", "b");
    });

    setVisibility("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(mockSave).not.toHaveBeenCalled();
  });
});

describe("usePlanStore preservation: storage-degraded toast", () => {
  it("registers the degraded listener once, even across re-renders", async () => {
    const { rerender } = await mount();
    rerender();
    rerender();
    expect(mockOnDegraded).toHaveBeenCalledTimes(1);
  });

  it("shows the warning toast with a stable id when storage degrades", async () => {
    await mount();
    expect(mockToastWarning).not.toHaveBeenCalled();

    const listener = mockOnDegraded.mock.calls[0][0] as () => void;
    act(() => listener());

    expect(mockToastWarning).toHaveBeenCalledTimes(1);
    const [message, opts] = mockToastWarning.mock.calls[0];
    expect(String(message)).toMatch(/Storage unavailable/);
    expect(opts).toEqual({ id: "storage-degraded" });
  });

  it("reports a missing record without scheduling any write", async () => {
    mockInspect.mockResolvedValue({ state: "missing" });
    const hook = renderHook(() => usePlanStore("p1"));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(hook.result.current.status).toBe("missing");
    act(() => hook.result.current.toggle("timeline", "a"));
    expect(vi.getTimerCount()).toBe(0);
    expect(mockSave).not.toHaveBeenCalled();
  });
});
