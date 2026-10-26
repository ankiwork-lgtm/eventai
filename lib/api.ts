import { type z } from "zod";

export type ErrorCode = "INVALID_INPUT" | "RATE_LIMITED" | "LLM_ERROR" | "INTERNAL";

export type ErrorEnvelope = {
  error: {
    code: ErrorCode;
    message: string;
    details: unknown;
  };
};

/**
 * Max permitted JSON request body size: 50 KB (51,200 bytes).
 */
export const MAX_BODY_BYTES = 50 * 1024;

/**
 * Returns a standardized JSON error response envelope per TDD §6.0.
 * Optional `extraHeaders` are merged into the response (e.g. `Retry-After`).
 */
export function errorResponse(
  code: ErrorCode,
  message: string,
  status: number,
  details?: unknown,
  extraHeaders?: Record<string, string>,
): Response {
  const body: ErrorEnvelope = {
    error: {
      code,
      message,
      details: details ?? {},
    },
  };

  return Response.json(body, {
    status,
    headers: {
      "content-type": "application/json",
      ...extraHeaders,
    },
  });
}

export type ParseBodyResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: Response };

/**
 * Safely parses and validates incoming JSON request bodies:
 * - Rejects bodies > 50 KB with HTTP 413 (INVALID_INPUT)
 * - Rejects malformed JSON with HTTP 400 (INVALID_INPUT)
 * - Rejects schema validation failures with HTTP 400 (INVALID_INPUT) and `issues` in details
 */
export async function parseBody<T>(
  req: Request,
  schema: z.ZodType<T>,
): Promise<ParseBodyResult<T>> {
  let text: string;
  try {
    text = await req.text();
  } catch {
    return {
      ok: false,
      response: errorResponse("INVALID_INPUT", "Failed to read request body", 400),
    };
  }

  const byteLength = Buffer.byteLength(text, "utf8");
  if (byteLength > MAX_BODY_BYTES) {
    return {
      ok: false,
      response: errorResponse(
        "INVALID_INPUT",
        `Request body exceeds ${MAX_BODY_BYTES / 1024} KB limit`,
        413,
      ),
    };
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return {
      ok: false,
      response: errorResponse("INVALID_INPUT", "Malformed JSON body", 400),
    };
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    return {
      ok: false,
      response: errorResponse("INVALID_INPUT", "Invalid request input", 400, {
        issues: result.error.issues,
      }),
    };
  }

  return { ok: true, data: result.data };
}

/**
 * Extracts client IP from the x-forwarded-for header (first entry), falling back to x-real-ip or "unknown".
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}
