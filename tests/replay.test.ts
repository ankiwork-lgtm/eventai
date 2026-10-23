import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFixture } from "@/lib/fixtures";
import { replayPlan } from "@/lib/replay";

const plan = getFixture("wedding-mumbai");

describe("replayPlan", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reveals sections in order as growing partial objects", () => {
    const partials: Record<string, unknown>[] = [];
    replayPlan(plan, (p) => partials.push(p as Record<string, unknown>), {
      intervalMs: 400,
    });

    vi.advanceTimersByTime(0);
    expect(partials.map((p) => Object.keys(p))).toEqual([["summary"]]);

    vi.advanceTimersByTime(400);
    vi.advanceTimersByTime(400);
    vi.advanceTimersByTime(400);
    vi.advanceTimersByTime(400);

    expect(partials.map((p) => Object.keys(p))).toEqual([
      ["summary"],
      ["summary", "budget"],
      ["summary", "budget", "timeline"],
      ["summary", "budget", "timeline", "vendors"],
      ["summary", "budget", "timeline", "vendors", "ideas"],
    ]);
    expect(partials[4]).toEqual(plan);
  });

  it("uses the 400 ms default interval", () => {
    const onPartial = vi.fn();
    replayPlan(plan, onPartial);
    vi.advanceTimersByTime(399);
    expect(onPartial).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(onPartial).toHaveBeenCalledTimes(2);
  });

  it("calls onComplete once, after the last section", () => {
    const onComplete = vi.fn();
    replayPlan(plan, vi.fn(), { intervalMs: 100, onComplete });
    vi.advanceTimersByTime(499);
    expect(onComplete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("cancel clears all pending timers and stops further callbacks", () => {
    const onPartial = vi.fn();
    const onComplete = vi.fn();
    const cancel = replayPlan(plan, onPartial, { intervalMs: 100, onComplete });
    vi.advanceTimersByTime(150);
    expect(onPartial).toHaveBeenCalledTimes(2);

    cancel();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(onPartial).toHaveBeenCalledTimes(2);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("cancel is safe to call twice and after completion", () => {
    const cancel = replayPlan(plan, vi.fn(), { intervalMs: 10 });
    vi.advanceTimersByTime(1000);
    expect(() => {
      cancel();
      cancel();
    }).not.toThrow();
  });
});
