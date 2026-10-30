/**
 * Task 7.1: bug condition exploration tests (Stage 7, security configuration).
 *
 * Property 1: Bug Condition - production CSP allows 'unsafe-eval'; oversized
 * share payloads are decompressed and parsed without a cap.
 *
 * These tests are EXPECTED TO FAIL on unfixed code. Do not "fix" them here.
 *
 * Validates: Requirements 1.14, 1.15, 2.14, 2.15, 2.19
 *
 * Cap choice: design.md names SHARE_HASH_MAX_CHARS / SHARE_DECOMPRESSED_MAX_BYTES
 * but gives no numbers, so 200 KB decompressed is used (documented default).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import LZString from "lz-string";
import { decodeSharePayload, encodeSharePayload } from "@/lib/share";

const DECOMPRESSED_CAP_BYTES = 200 * 1024;

async function productionCsp(): Promise<string> {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "production");
  const mod = await import("@/next.config");
  const routes = await mod.default.headers!();
  const catchAll = routes.find((r) => r.source === "/:path*")!;
  return catchAll.headers.find((h) => h.key === "Content-Security-Policy")!
    .value;
}

describe("Bug condition: production CSP (1.15 / 2.15)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("script-src has no 'unsafe-eval' when NODE_ENV=production", async () => {
    const csp = await productionCsp();
    const scriptSrc = csp
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith("script-src"));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });
});

describe("Bug condition: oversized share payloads (1.14 / 2.14 / 2.19)", () => {
  const input = {
    eventType: "wedding",
    eventName: "Sneha & Rohan",
    date: "2026-08-20",
    guestCount: 300,
    totalBudget: 2500000,
    currency: "INR",
    city: "Udaipur",
  };
  const plan = {
    summary: "A grand palace wedding in Udaipur.",
    budget: [
      { category: "Venue", percent: 50, estimatedCost: 1250000, tips: "Book early" },
      { category: "Catering", percent: 30, estimatedCost: 750000, tips: "Live stations" },
      { category: "Decor", percent: 15, estimatedCost: 375000, tips: "Lights" },
      { category: "Misc", percent: 5, estimatedCost: 125000, tips: "Contingency" },
    ],
    timeline: [
      { when: "6 months before", task: "Book palace", priority: "high" },
      { when: "3 months before", task: "Finalize menu", priority: "medium" },
      { when: "1 month before", task: "Invitations", priority: "high" },
      { when: "2 weeks before", task: "Fittings", priority: "medium" },
      { when: "1 day before", task: "Rehearsal", priority: "low" },
      { when: "1 day after", task: "Check-out", priority: "low" },
    ],
    vendors: [
      { type: "Venue", checklist: ["Lawn", "Rooms", "Power"], budgetRange: "10L-15L" },
      { type: "Catering", checklist: ["Thali", "Dessert", "Drinks"], budgetRange: "6L-8L" },
      { type: "Decor", checklist: ["Mandap", "Arch", "Tables"], budgetRange: "3L-4L" },
    ],
    ideas: [
      { title: "Royal Entry", description: "Vintage car arrival" },
      { title: "Folk Music", description: "Local musicians" },
      { title: "Fireworks", description: "Eco-friendly display" },
    ],
  };

  // Valid payload plus an unknown key (zod strips it), so without a cap the
  // decoder would happily accept it. Highly repetitive => tiny compressed hash.
  function oversizedHash(padBytes: number): string {
    const json = JSON.stringify({ input, plan, pad: "A".repeat(padBytes) });
    expect(json.length).toBeGreaterThan(DECOMPRESSED_CAP_BYTES);
    return LZString.compressToEncodedURIComponent(json);
  }

  it("sanity: a normal payload still round-trips", () => {
    const hash = encodeSharePayload({ input, plan } as never);
    expect(decodeSharePayload(hash)).not.toBeNull();
  });

  it("rejects a hash whose decompressed size exceeds the cap", () => {
    const hash = oversizedHash(DECOMPRESSED_CAP_BYTES * 5);
    expect(decodeSharePayload(`#s=${hash}`)).toBeNull();
  });

  it("rejects oversized payloads before JSON.parse runs", () => {
    const hash = oversizedHash(DECOMPRESSED_CAP_BYTES * 5);
    const parseSpy = vi.spyOn(JSON, "parse");
    try {
      decodeSharePayload(hash);
      expect(parseSpy).not.toHaveBeenCalled();
    } finally {
      parseSpy.mockRestore();
    }
  });
});
