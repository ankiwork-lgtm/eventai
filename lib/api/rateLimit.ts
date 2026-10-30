import { checkRateLimit } from "@/lib/ratelimit";
import { errorResponse, getClientIp } from "./envelope";

/**
 * Applies the per-route rate limit to the request's client IP.
 * Returns null when allowed, or the 429 envelope response with `Retry-After`.
 */
export function enforceRateLimit(req: Request, route: string): Response | null {
  const rl = checkRateLimit(getClientIp(req), route);
  if (!rl.limited) return null;
  return errorResponse(
    "RATE_LIMITED",
    "Too many requests. Try again shortly.",
    429,
    {},
    { "Retry-After": String(rl.retryAfterSeconds) },
  );
}
