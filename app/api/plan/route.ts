/**
 * POST /api/plan — streaming structured plan generation
 *
 * Cache Components note (Next.js 16 / cacheComponents: true):
 * - Only GET handlers are subject to prerendering in the Cache Components model.
 * - POST handlers are always dynamic (request-bound); no extra `dynamic` export is needed.
 * - `maxDuration` is still required so Vercel does not time-out the streaming response.
 *
 * Error handling strategy (DD-8):
 * - Pre-stream errors (parse failure, setup errors) → JSON error envelope (400 / 500 / 502).
 * - Mid-stream errors cannot change HTTP status after the first byte; surfaced via useObject's
 *   `onError` callback on the client (DD-8).
 */

import { errorResponse, parseBody, getClientIp } from "@/lib/api";
import { streamPlan } from "@/lib/ai";
import { EventInputSchema } from "@/lib/schema";
import { buildPlanPrompt, systemPromptFor } from "@/lib/prompts";
import { checkRateLimit } from "@/lib/ratelimit";
import { logLlmCall } from "@/lib/observability";

export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  // ── Rate limit (P5-T04) ───────────────────────────────────────────────────
  const rl = checkRateLimit(getClientIp(req), "/api/plan");
  if (rl.limited) {
    return errorResponse(
      "RATE_LIMITED",
      "Too many requests. Try again shortly.",
      429,
      {},
      { "Retry-After": String(rl.retryAfterSeconds) },
    );
  }

  // ── Parse + validate request body ────────────────────────────────────────
  let parsed;
  try {
    parsed = await parseBody(req, EventInputSchema);
  } catch {
    return errorResponse("INTERNAL", "Unexpected error reading request.", 500);
  }

  if (!parsed.ok) {
    return parsed.response;
  }

  const input = parsed.data;

  // ── Stream plan from LLM ──────────────────────────────────────────────────
  const startedAt = Date.now();
  let logged = false;
  const logOnce = (ok: boolean, usage?: { inputTokens?: number; outputTokens?: number }) => {
    if (logged) return;
    logged = true;
    logLlmCall({
      route: "plan",
      eventType: input.eventType,
      latencyMs: Date.now() - startedAt,
      usage,
      ok,
    });
  };

  try {
    const result = streamPlan({
      system: systemPromptFor(input.eventType),
      prompt: buildPlanPrompt(input),
      temperature: 0.7,
      maxRetries: 1,
      maxOutputTokens: 4000,
      // Observability (TDD §13): one structured line after the stream finishes.
      // Only enumerated, non-sensitive fields — never free text, inputs, or keys.
      onFinish: ({ usage, object, error }) => {
        logOnce(error === undefined && object !== undefined, usage);
      },
    });

    // toTextStreamResponse() returns a streaming text/plain Response.
    // The client consumes it with useObject({ api: '/api/plan', schema: PlanSchema }).
    return result.toTextStreamResponse();
  } catch (err) {
    logOnce(false);

    // Provider / setup errors raised before the first byte can be caught here.
    // Do NOT log raw provider errors — they may contain path or key details.
    const msg = err instanceof Error ? err.message.toLowerCase() : "";
    const isProviderError =
      msg.includes("api") ||
      msg.includes("model") ||
      msg.includes("provider") ||
      msg.includes("anthropic") ||
      msg.includes("fetch");

    if (isProviderError) {
      return errorResponse(
        "LLM_ERROR",
        "The AI provider returned an error. Please try again.",
        502,
      );
    }

    return errorResponse(
      "INTERNAL",
      "An unexpected server error occurred.",
      500,
    );
  }
}
