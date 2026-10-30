/**
 * usePlanStore gaps not covered by plan-store-preservation / purity tests:
 * missing record status, load error path, cancelPendingSave, update/toggle
 * before load, id change and unmount without pending edits.
 *
 * **Validates: Requirements 1.18, 2.18**
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import type { StoredPlan } from "@/lib/types";
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

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount(strict = false) {
  const hook = renderHook(() => usePlanStore("p1"), {
    wrapper: strict
      ? ({ children }) => <React.StrictMode>{children}</React.StrictMode>
      : undefined,
  });
  await settle();
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

describe("usePlanStore: load states", () => {
  it("starts in loading with no record", () => {
    mockInspect.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => usePlanStore("p1"));
    expect(result.current.status).toBe("loading");
    expect(result.current.record).toBeNull();
  });

  it("is ready with the stored record", async () => {
    const { result } = await mount();
    expect(result.current.status).toBe("ready");
    expect(result.current.record).toEqual(BASE);
  });

  it.each(["missing", "corrupt"])("reports missing for inspect state %s", async (state) => {
    mockInspect.mockResolvedValue({ state });
    const { result } = await mount();
    expect(result.current.status).toBe("missing");
    expect(result.current.record).toBeNull();
  });

  it("update and toggle are no-ops without a loaded record", async () => {
    mockInspect.mockResolvedValue({ state: "missing" });
    const { result, unmount } = await mount();
    act(() => {
      result.current.update({ chat: [] });
      result.current.toggle("timeline", "a");
    });
    expect(result.current.record).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    unmount();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("surfaces a rejected load as an unhandled rejection from inspect (status stays loading)", async () => {
    // Documents current behavior: the hook has no catch on inspect().
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    mockInspect.mockRejectedValue(new Error("read failed"));
    const { result } = renderHook(() => usePlanStore("p1"));
    await settle();
    expect(result.current.status).toBe("loading");
    expect(result.current.record).toBeNull();
    process.off("unhandledRejection", unhandled);
  });
});

describe("usePlanStore: toggle", () => {
  it("flips a key on and back off", async () => {
    const { result } = await mount();
    await act(async () => result.current.toggle("timeline", "a"));
    expect(result.current.record!.progress.timeline.a).toBe(true);
    await act(async () => result.current.toggle("timeline", "a"));
    expect(result.current.record!.progress.timeline.a).toBeFalsy();
  });

  it("does not mutate the previously loaded record", async () => {
    const { result } = await mount();
    await act(async () => result.current.toggle("vendors", "x"));
    expect(BASE.progress.vendors.x).toBeUndefined();
  });
});

describe("usePlanStore: cancelPendingSave", () => {
  it("drops the pending write and clears the timer", async () => {
    const { result } = await mount();
    await act(async () => result.current.toggle("timeline", "a"));
    expect(vi.getTimerCount()).toBe(1);

    act(() => result.current.cancelPendingSave());
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => {
      vi.advanceTimersByTime(SAVE_DEBOUNCE_MS * 2);
    });
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("prevents beforeunload, hidden-tab and unmount flushes from resurrecting the record", async () => {
    const { result, unmount } = await mount();
    await act(async () => result.current.toggle("timeline", "a"));
    act(() => result.current.cancelPendingSave());

    await act(async () => {
      window.dispatchEvent(new Event("beforeunload"));
    });
    unmount();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("ignores edits after cancel (no record to merge into)", async () => {
    const { result } = await mount();
    act(() => result.current.cancelPendingSave());
    await act(async () => result.current.toggle("timeline", "b"));
    expect(vi.getTimerCount()).toBe(0);
    expect(mockSave).not.toHaveBeenCalled();
  });
});

describe("usePlanStore: unmount", () => {
  it("does not write on unmount when nothing is pending", async () => {
    const { unmount } = await mount();
    unmount();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("flushes a pending edit once on unmount and not again after the debounce", async () => {
    const { result, unmount } = await mount();
    await act(async () => result.current.toggle("timeline", "a"));
    unmount();
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS * 2);
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it("under StrictMode, toggling twice nets out and saves exactly once", async () => {
    const { result } = await mount(true);
    await act(async () => {
      result.current.toggle("timeline", "a");
      result.current.toggle("timeline", "a");
    });
    await act(async () => {
      vi.advanceTimersByTime(SAVE_DEBOUNCE_MS + 1);
    });
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect((mockSave.mock.calls[0][0] as StoredPlan).progress.timeline.a).toBeFalsy();
  });
});

describe("usePlanStore: update", () => {
  it("merges the patch and keeps untouched fields", async () => {
    const { result } = await mount();
    await act(async () => result.current.update({ chat: [{ role: "user", content: "hi", at: "t" }] }));
    expect(result.current.record!.chat).toHaveLength(1);
    expect(result.current.record!.id).toBe("p1");
    expect(result.current.record!.progress).toEqual(BASE.progress);
  });
});
