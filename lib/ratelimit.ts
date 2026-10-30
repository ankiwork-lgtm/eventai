/**
 * lib/ratelimit.ts — in-memory sliding-window rate limiter (P5-T04)
 *
 * Keyed by route, then ip (nested maps). Each bucket stores the timestamps of recent
 * requests in a sliding window. On every check, timestamps older than
 * `windowMs` are pruned, then the count is compared against `limit`.
 *
 * Limitations (documented in README):
 * - In-memory only: does not share state across Vercel instances.
 * - Best-effort protection; a global hard cap should be set in the Anthropic
 *   console (monthly spend limit).
 *
 * Clock is injectable for deterministic unit testing with fake timers.
 */

export type RateLimitConfig = {
  /** Max requests allowed in the window */
  limit: number;
  /** Window duration in milliseconds */
  windowMs: number;
};

export type RateLimitResult = {
  limited: boolean;
  /** Seconds until the oldest request in the window expires (only when limited) */
  retryAfterSeconds: number;
};

export type ClockFn = () => number;

/** Per-route limits (P5-T04 spec) */
export const ROUTE_LIMITS: Record<string, RateLimitConfig> = {
  "/api/plan": { limit: 5, windowMs: 10 * 60 * 1000 },
  "/api/refine": { limit: 20, windowMs: 10 * 60 * 1000 },
  "/api/email": { limit: 20, windowMs: 10 * 60 * 1000 },
  "/api/moodboard": { limit: 30, windowMs: 10 * 60 * 1000 },
};

/** Bucket: an array of request timestamps in ascending order. */
type Bucket = number[];

/**
 * Global store: route ? ip ? timestamps.
 * Nested maps avoid composite string keys, so IPv6 addresses containing "::"
 * can never corrupt route recovery. The shared "unknown" IP is just another ip key.
 */
const store = new Map<string, Map<string, Bucket>>();

/**
 * Prune all buckets whose window has fully expired.
 * Called after each check so the map cannot grow unboundedly.
 */
function pruneStore(now: number): void {
  for (const [route, ips] of store) {
    const cfg = ROUTE_LIMITS[route];
    if (!cfg) {
      store.delete(route);
      continue;
    }
    const cutoff = now - cfg.windowMs;
    for (const [ip, bucket] of ips) {
      const fresh = bucket.filter((t) => t > cutoff);
      if (fresh.length === 0) ips.delete(ip);
      else ips.set(ip, fresh);
    }
    if (ips.size === 0) store.delete(route);
  }
}

/**
 * Check and record a request for the given ip + route combination.
 *
 * @param ip     Client IP (from getClientIp)
 * @param route  Canonical route path, e.g. "/api/plan"
 * @param clock  Optionally inject `Date.now` replacement for testing
 */
export function checkRateLimit(
  ip: string,
  route: string,
  clock: ClockFn = Date.now,
): RateLimitResult {
  const cfg = Object.hasOwn(ROUTE_LIMITS, route) ? ROUTE_LIMITS[route] : undefined;
  if (!cfg) {
    // Unknown route - do not limit
    return { limited: false, retryAfterSeconds: 0 };
  }

  const now = clock();
  const cutoff = now - cfg.windowMs;

  let ips = store.get(route);
  if (!ips) {
    ips = new Map();
    store.set(route, ips);
  }
  const bucket = (ips.get(ip) ?? []).filter((t) => t > cutoff);

  if (bucket.length >= cfg.limit) {
    const retryAfterMs = bucket[0]! + cfg.windowMs - now;
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    // Persist pruned bucket (do NOT record this request)
    ips.set(ip, bucket);
    pruneStore(now);
    return { limited: true, retryAfterSeconds };
  }

  bucket.push(now);
  ips.set(ip, bucket);
  pruneStore(now);
  return { limited: false, retryAfterSeconds: 0 };
}
/**
 * Reset the entire store.
 * Intended for use in tests only — clears all buckets so test suites
 * cannot cross-contaminate each other through shared limiter state.
 */
export function resetRateLimitStore(): void {
  store.clear();
}
