/**
 * tests/ratelimit.test.ts (P5-T04)
 *
 * Unit tests for lib/ratelimit.ts:
 * - Allows the first N requests within the window
 * - Blocks the N+1th request and returns retryAfterSeconds
 * - Refills after the window expires (fake clock)
 * - Separate buckets per IP and per route
 * - resetRateLimitStore() prevents cross-test contamination
 */

import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, resetRateLimitStore, ROUTE_LIMITS } from "@/lib/ratelimit";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Advance a mutable clock reference by `ms` milliseconds. */
function makeClock(startMs = 0): { now: () => number; advance: (ms: number) => void } {
  let t = startMs;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  resetRateLimitStore();
});

// ── Core sliding-window semantics ─────────────────────────────────────────────

describe("checkRateLimit — /api/plan (limit: 5 per 10 min)", () => {
  const ROUTE = "/api/plan";
  const LIMIT = ROUTE_LIMITS[ROUTE]!.limit; // 5
  const WINDOW = ROUTE_LIMITS[ROUTE]!.windowMs; // 600_000 ms

  it("allows the first N requests", () => {
    const clock = makeClock(1_000_000);
    for (let i = 0; i < LIMIT; i++) {
      const result = checkRateLimit("1.2.3.4", ROUTE, clock.now);
      expect(result.limited).toBe(false);
      expect(result.retryAfterSeconds).toBe(0);
    }
  });

  it("blocks the N+1th request", () => {
    const clock = makeClock(1_000_000);
    for (let i = 0; i < LIMIT; i++) {
      checkRateLimit("1.2.3.4", ROUTE, clock.now);
    }
    const blocked = checkRateLimit("1.2.3.4", ROUTE, clock.now);
    expect(blocked.limited).toBe(true);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("retryAfterSeconds is at most windowMs/1000", () => {
    const clock = makeClock(1_000_000);
    for (let i = 0; i < LIMIT; i++) {
      checkRateLimit("1.2.3.4", ROUTE, clock.now);
    }
    const blocked = checkRateLimit("1.2.3.4", ROUTE, clock.now);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(WINDOW / 1000);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("allows requests again after the window expires (fake clock)", () => {
    const clock = makeClock(1_000_000);
    for (let i = 0; i < LIMIT; i++) {
      checkRateLimit("1.2.3.4", ROUTE, clock.now);
    }
    // Should be blocked now
    expect(checkRateLimit("1.2.3.4", ROUTE, clock.now).limited).toBe(true);

    // Advance past the full window
    clock.advance(WINDOW + 1);

    // All old requests have expired; should be allowed again
    const after = checkRateLimit("1.2.3.4", ROUTE, clock.now);
    expect(after.limited).toBe(false);
  });

  it("allows N more requests after one request expires", () => {
    const clock = makeClock(1_000_000);
    // Make one request, then advance enough for just that one to expire
    checkRateLimit("1.2.3.4", ROUTE, clock.now); // request #1 at t=0
    clock.advance(1000); // t+1s: make requests 2-5
    for (let i = 0; i < LIMIT - 1; i++) {
      checkRateLimit("1.2.3.4", ROUTE, clock.now);
    }
    // All 5 slots used; blocked
    expect(checkRateLimit("1.2.3.4", ROUTE, clock.now).limited).toBe(true);

    // Advance past the first request's window expiry
    clock.advance(WINDOW);
    // Request #1 has expired; one slot opens
    const result = checkRateLimit("1.2.3.4", ROUTE, clock.now);
    expect(result.limited).toBe(false);
  });
});

// ── Bucket isolation ──────────────────────────────────────────────────────────

describe("checkRateLimit — bucket isolation", () => {
  it("maintains separate buckets per IP", () => {
    const ROUTE = "/api/plan";
    const LIMIT = ROUTE_LIMITS[ROUTE]!.limit;
    const clock = makeClock(2_000_000);

    // Exhaust limit for IP A
    for (let i = 0; i < LIMIT; i++) {
      checkRateLimit("10.0.0.1", ROUTE, clock.now);
    }
    expect(checkRateLimit("10.0.0.1", ROUTE, clock.now).limited).toBe(true);

    // IP B is unaffected
    const resultB = checkRateLimit("10.0.0.2", ROUTE, clock.now);
    expect(resultB.limited).toBe(false);
  });

  it("maintains separate buckets per route for the same IP", () => {
    const clock = makeClock(3_000_000);
    const PLAN_LIMIT = ROUTE_LIMITS["/api/plan"]!.limit; // 5

    // Exhaust /api/plan for one IP
    for (let i = 0; i < PLAN_LIMIT; i++) {
      checkRateLimit("5.5.5.5", "/api/plan", clock.now);
    }
    expect(checkRateLimit("5.5.5.5", "/api/plan", clock.now).limited).toBe(true);

    // /api/refine bucket for the same IP is untouched
    const refineResult = checkRateLimit("5.5.5.5", "/api/refine", clock.now);
    expect(refineResult.limited).toBe(false);
  });
});

// ── Unknown route passthrough ─────────────────────────────────────────────────

describe("checkRateLimit — unknown route", () => {
  it("never limits an unknown route", () => {
    const clock = makeClock(4_000_000);
    for (let i = 0; i < 100; i++) {
      const result = checkRateLimit("9.9.9.9", "/api/unknown", clock.now);
      expect(result.limited).toBe(false);
    }
  });
});

// ── /api/refine and /api/email higher limits ──────────────────────────────────

describe("checkRateLimit — /api/refine (limit: 20 per 10 min)", () => {
  it("allows 20 and blocks 21", () => {
    const clock = makeClock(5_000_000);
    const LIMIT = ROUTE_LIMITS["/api/refine"]!.limit; // 20
    for (let i = 0; i < LIMIT; i++) {
      expect(checkRateLimit("7.7.7.7", "/api/refine", clock.now).limited).toBe(false);
    }
    expect(checkRateLimit("7.7.7.7", "/api/refine", clock.now).limited).toBe(true);
  });
});

describe("checkRateLimit — /api/email (limit: 20 per 10 min)", () => {
  it("allows 20 and blocks 21", () => {
    const clock = makeClock(6_000_000);
    const LIMIT = ROUTE_LIMITS["/api/email"]!.limit; // 20
    for (let i = 0; i < LIMIT; i++) {
      expect(checkRateLimit("8.8.8.8", "/api/email", clock.now).limited).toBe(false);
    }
    expect(checkRateLimit("8.8.8.8", "/api/email", clock.now).limited).toBe(true);
  });
});
