/**
 * Client-safe helpers for reading the server error envelope
 * (`{ error: { code, message, details } }`) and the `Retry-After` header.
 * Must not import server-only modules.
 */

export type ApiError = {
  status: number;
  /** `error.code` from the envelope, or null when absent. */
  code: string | null;
  /** Server message when present, otherwise a generic fallback. */
  message: string;
  /** Whole seconds from `Retry-After`, or null when absent or invalid. */
  retryAfterSeconds: number | null;
};

function parseRetryAfter(value: string | null): number | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Reads an error response without throwing, whatever its body looks like. */
export async function parseApiError(res: Response): Promise<ApiError> {
  const retryAfterSeconds = parseRetryAfter(res.headers.get("Retry-After"));
  let code: string | null = null;
  let message: string | null = null;

  try {
    const body: unknown = await res.json();
    const err = isRecord(body) ? body.error : undefined;
    if (isRecord(err)) {
      if (typeof err.code === "string") code = err.code;
      if (typeof err.message === "string" && err.message.trim()) {
        message = err.message;
      }
    }
  } catch {
    // Non-JSON or unreadable body: fall back to generic values.
  }

  return {
    status: res.status,
    code,
    message: message ?? `Request failed (${res.status})`,
    retryAfterSeconds,
  };
}

export function isRateLimited(err: ApiError): boolean {
  return err.status === 429 || err.code === "RATE_LIMITED";
}

/** User-facing text for a rate-limited error. */
export function formatRateLimitMessage(err: ApiError): string {
  return err.retryAfterSeconds
    ? `Too many requests, wait ${err.retryAfterSeconds} seconds.`
    : "Too many requests, please wait a moment.";
}
