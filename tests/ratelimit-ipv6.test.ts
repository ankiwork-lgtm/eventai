/**
 * tests/ratelimit-ipv6.test.ts
 *
 * Bug condition exploration (Property 1): IPv6 clients bypass the rate limit.
 * The store key is `${ip}::${route}` and pruneStore recovers the route with
 * key.split("::")[1]. For IPv6 addresses containing "::" the recovered route
 * is wrong, so the bucket is deleted right after it is saved.
 *
 * EXPECTED TO FAIL on unfixed code.
 *
 * **Validates: Requirements 1.13, 2.13, 2.19**
 */

import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, resetRateLimitStore, ROUTE_LIMITS } from "@/lib/ratelimit";

const ROUTE = "/api/plan";
const LIMIT = ROUTE_LIMITS[ROUTE]!.limit; // 5

beforeEach(() => {
  resetRateLimitStore();
});

describe("IPv6 clients are rate limited on /api/plan", () => {
  it.each(["::1", "2001:db8::1"])("blocks request %#: the 6th request from %s", (ip) => {
    const results = Array.from({ length: LIMIT + 1 }, () => checkRateLimit(ip, ROUTE, () => 0));
    expect(results.slice(0, LIMIT).every((r) => !r.limited)).toBe(true);
    expect(results[LIMIT]!.limited).toBe(true);
  });
});
