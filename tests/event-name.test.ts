import { describe, it, expect } from "vitest";
import {
  getEventDisplayName,
  toSafeFilename,
  SAFE_FILENAME_MAX,
} from "@/lib/eventName";

describe("getEventDisplayName", () => {
  it("prefers eventName, trimmed", () => {
    expect(getEventDisplayName({ eventType: "wedding", eventName: "  Maya & Ravi ", name: "Old" })).toBe(
      "Maya & Ravi",
    );
  });
  it("falls back to legacy name", () => {
    expect(getEventDisplayName({ eventType: "wedding", name: " Old " })).toBe("Old");
    expect(getEventDisplayName({ eventType: "wedding", eventName: "   ", name: "Old" })).toBe("Old");
  });
  it("falls back to the event type or the supplied fallback", () => {
    expect(getEventDisplayName({ eventType: "birthday" })).toBe("birthday");
    expect(getEventDisplayName({ eventType: "wedding", eventName: " ", name: "" }, "WEDDING PLAN")).toBe(
      "WEDDING PLAN",
    );
  });
});

describe("toSafeFilename", () => {
  it("handles empty and whitespace-only names", () => {
    expect(toSafeFilename("")).toBe("event");
    expect(toSafeFilename("   \t\n ")).toBe("event");
  });
  it("keeps unicode and collapses whitespace", () => {
    expect(toSafeFilename("  Priya   और  रोहन 💍 ")).toBe("Priya और रोहन 💍");
  });
  it("neutralises path-like names", () => {
    const out = toSafeFilename("../../etc/passwd");
    expect(out).not.toMatch(/[\\/]/);
    expect(out.startsWith(".")).toBe(false);
    expect(toSafeFilename("C:\\Windows\\evil")).not.toMatch(/[\\/:]/);
  });
  it("caps very long names without splitting surrogate pairs", () => {
    const out = toSafeFilename("💍".repeat(500));
    expect(Array.from(out).length).toBeLessThanOrEqual(SAFE_FILENAME_MAX);
    expect(out).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });
  it("keeps ordinary names unchanged", () => {
    expect(toSafeFilename("wedding")).toBe("wedding");
    expect(toSafeFilename("Maya & Ravi")).toBe("Maya & Ravi");
  });
});

describe("toSafeFilename (generated inputs)", () => {
  // Deterministic LCG so failures are reproducible; fast-check is not installed.
  let seed = 123456789;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const alphabet = [
    ..."abcXYZ019 .-_&",
    "/", "\\", ":", "*", "?", '"', "<", ">", "|",
    "\n", "\r", "\t", "\0", "\u001f", "\u007f", "\u0085", "é", "日", "💍",
  ];
  it("never returns separators/control characters or exceeds the cap", () => {
    for (let i = 0; i < 2000; i++) {
      const len = Math.floor(rnd() * (i % 10 === 0 ? 400 : 40));
      let s = "";
      for (let j = 0; j < len; j++) s += alphabet[Math.floor(rnd() * alphabet.length)];
      const out = toSafeFilename(s);
      expect(out).not.toMatch(/[\\/]/);
      expect(out).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
      expect(Array.from(out).length).toBeLessThanOrEqual(SAFE_FILENAME_MAX);
      expect(out.length).toBeGreaterThan(0);
    }
  });
});
