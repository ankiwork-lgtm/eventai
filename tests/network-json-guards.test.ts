/**
 * Task 3.4: network JSON guards never throw for any JSON value.
 * fast-check is not installed, so inputs come from a deterministic generator.
 * Validates: Requirements 1.8, 2.8, 2.19, 3.10
 */
import { describe, it, expect } from "vitest";
import {
  RefineResultSchema,
  MoodBoardImageSchema,
  UnsplashResponseSchema,
  UnsplashResultSchema,
  parseMoodBoardImages,
} from "@/lib/schema";

// Small deterministic PRNG (mulberry32).
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KEYS = ["url", "alt", "credit", "link", "results", "urls", "small", "regular", "user", "links", "html", "plan", "changeSummary", "name"];
const STRINGS = ["", "x", "https://a.com/i.jpg", "http://a.com", "javascript:alert(1)", "{\"a\":1}", "not a url"];

function genJson(rand: () => number, depth = 0): unknown {
  const pick = Math.floor(rand() * (depth > 3 ? 5 : 7));
  switch (pick) {
    case 0:
      return null;
    case 1:
      return rand() < 0.5;
    case 2:
      return Math.floor(rand() * 2000) - 1000;
    case 3:
    case 4:
      return STRINGS[Math.floor(rand() * STRINGS.length)];
    case 5:
      return Array.from({ length: Math.floor(rand() * 4) }, () => genJson(rand, depth + 1));
    default: {
      const o: Record<string, unknown> = {};
      const n = Math.floor(rand() * 5);
      for (let i = 0; i < n; i++) o[KEYS[Math.floor(rand() * KEYS.length)]] = genJson(rand, depth + 1);
      return o;
    }
  }
}

describe("network JSON guards", () => {
  it("never throw and return a typed object or a failure for any JSON value", () => {
    const rand = rng(12345);
    for (let i = 0; i < 1000; i++) {
      const v = genJson(rand);
      for (const schema of [RefineResultSchema, MoodBoardImageSchema, UnsplashResponseSchema, UnsplashResultSchema]) {
        const r = schema.safeParse(v);
        expect(typeof r.success).toBe("boolean");
      }
      const imgs = parseMoodBoardImages(v);
      expect(Array.isArray(imgs)).toBe(true);
      for (const img of imgs) {
        expect(img.url.startsWith("https://")).toBe(true);
        expect(img.link.startsWith("https://")).toBe(true);
      }
    }
  });

  it("skips malformed mood board items individually", () => {
    const good = { url: "https://a.com/i.jpg", alt: "a", credit: "c", link: "https://a.com" };
    const out = parseMoodBoardImages([null, good, { ...good, url: "javascript:x" }, { ...good, link: "http://a.com" }]);
    expect(out).toEqual([good]);
  });

  it("treats a non-array Unsplash results field as empty", () => {
    const r = UnsplashResponseSchema.safeParse({ results: "nope" });
    expect(r.success && r.data.results).toEqual([]);
  });
});
