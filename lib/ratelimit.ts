/**
 * lib/ratelimit.ts — in-memory sliding-window rate limiter (P5-T04)
 *
 * Keyed by `${ip}::${route}`. Each bucket stores the timestamps of recent
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

/** Global store: key → timestamps */
const store = new Map<string, Bucket>();

/**
 * Prune all entries whose window has fully expired (all timestamps are stale).
 * Called after each check so the map cannot grow unboundedly.
 */
function pruneStore(now: number): void {
  for (const [key, bucket] of store) {
    // Find the freshest config for this key's route
    const route = key.split("::")[1] ?? "";
    const cfg = ROUTE_LIMITS[route];
    if (!cfg) {
      store.delete(key);
      continue;
    }
    const cutoff = now - cfg.windowMs;
    // Remove timestamps older than the window
    const fresh = bucket.filter((t) => t > cutoff);
    if (fresh.length === 0) {
      store.delete(key);
    } else {
      store.set(key, fresh);
    }
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
  const cfg = ROUTE_LIMITS[route];
  if (!cfg) {
    // Unknown route — do not limit
    return { limited: false, retryAfterSeconds: 0 };
  }

  const now = clock();
  const cutoff = now - cfg.windowMs;
  const key = `${ip}::${route}`;

  // Get or create bucket, filter to current window
  const raw = store.get(key) ?? [];
  const bucket = raw.filter((t) => t > cutoff);

  if (bucket.length >= cfg.limit) {
    // Oldest timestamp in the window tells us when the next slot opens
    const oldest = bucket[0]!;
    const retryAfterMs = oldest + cfg.windowMs - now;
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));

    // Persist pruned bucket (do NOT record this request)
    store.set(key, bucket);
    pruneStore(now);
    return { limited: true, retryAfterSeconds };
  }

  // Record this request
  bucket.push(now);
  store.set(key, bucket);
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
