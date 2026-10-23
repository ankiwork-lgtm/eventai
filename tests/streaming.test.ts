import { describe, it, expect } from "vitest";
import { isSectionEmpty, isSectionStreaming } from "@/lib/streaming";

describe("isSectionStreaming", () => {
  it("is false for every section once streaming has finished", () => {
    const obj = { summary: "x", budget: [{}], timeline: [{}], vendors: [{}], ideas: [{}] };
    for (const s of ["summary", "budget", "timeline", "vendors", "ideas"] as const) {
      expect(isSectionStreaming(s, obj, false)).toBe(false);
    }
  });

  it("marks a section done once the next section's key arrives", () => {
    // budget has arrived but timeline has not → budget still streaming.
    const obj = { summary: "x", budget: [{ category: "V" }] };
    expect(isSectionStreaming("budget", obj, true)).toBe(true);
    // Now timeline has started → budget is done.
    const obj2 = { ...obj, timeline: [{ task: "t" }] };
    expect(isSectionStreaming("budget", obj2, true)).toBe(false);
  });

  it("keeps the last section (ideas) pending until the stream finishes", () => {
    const obj = {
      summary: "x",
      budget: [{}],
      timeline: [{}],
      vendors: [{}],
      ideas: [{ title: "i" }],
    };
    expect(isSectionStreaming("ideas", obj, true)).toBe(true);
    expect(isSectionStreaming("ideas", obj, false)).toBe(false);
  });

  it("treats empty arrays as not-yet-arrived", () => {
    const obj = { summary: "x", budget: [] };
    // budget key present but empty → next section (timeline) absent → budget pending
    expect(isSectionStreaming("budget", obj, true)).toBe(true);
  });
});

describe("isSectionEmpty", () => {
  it("is true when the key is absent, empty, or null", () => {
    expect(isSectionEmpty("budget", undefined)).toBe(true);
    expect(isSectionEmpty("budget", {})).toBe(true);
    expect(isSectionEmpty("budget", { budget: [] })).toBe(true);
  });
  it("is false once content is present", () => {
    expect(isSectionEmpty("budget", { budget: [{ category: "V" }] })).toBe(false);
    expect(isSectionEmpty("summary", { summary: "x" })).toBe(false);
  });
});
