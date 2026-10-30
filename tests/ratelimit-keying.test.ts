/**
 * tests/ratelimit-keying.test.ts
 *
 * Limiter keying: any IP string form is limited per route, and the route
 * used for pruning always matches the route checked.
 *
 * **Validates: Requirements 1.13, 2.13, 2.19, 3.3**
 */
import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, resetRateLimitStore, ROUTE_LIMITS } from "@/lib/ratelimit";

beforeEach(() => resetRateLimitStore());

describe("limiter key handling", () => {
  it.each([
    ["IPv4", "203.0.113.7"],
    ["compressed IPv6", "2001:db8::1"],
    ["loopback IPv6", "::1"],
    ["full IPv6", "2001:0db8:0000:0000:0000:0000:0000:0001"],
    ["IPv4-mapped IPv6", "::ffff:192.0.2.1"],
    ["unknown", "unknown"],
  ])("blocks request N+1 for %s", (_n, ip) => {
    const { limit } = ROUTE_LIMITS["/api/plan"]!;
    for (let i = 0; i < limit; i++) expect(checkRateLimit(ip, "/api/plan", () => 0).limited).toBe(false);
    expect(checkRateLimit(ip, "/api/plan", () => 0).limited).toBe(true);
  });

  it("shares one bucket for all callers using 'unknown'", () => {
    const { limit } = ROUTE_LIMITS["/api/plan"]!;
    for (let i = 0; i < limit; i++) checkRateLimit("unknown", "/api/plan", () => 0);
    expect(checkRateLimit("unknown", "/api/plan", () => 0).limited).toBe(true);
  });

  it("property: for generated IP strings and every route, request N+1 is blocked", () => {
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const alphabet = ["0", "1", "a", "f", ":", ":", ".", "::", "/api/plan", "ffff"];
    for (let iter = 0; iter < 200; iter++) {
      resetRateLimitStore();
      const len = 1 + Math.floor(rnd() * 8);
      let ip = "";
      for (let i = 0; i < len; i++) ip += alphabet[Math.floor(rnd() * alphabet.length)];
      for (const [route, cfg] of Object.entries(ROUTE_LIMITS)) {
        for (let i = 0; i < cfg.limit; i++) expect(checkRateLimit(ip, route, () => 0).limited).toBe(false);
        expect(checkRateLimit(ip, route, () => 0).limited).toBe(true);
      }
    }
  });
});
