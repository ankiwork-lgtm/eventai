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

import { createLlmLogOnce, enforceRateLimit, mapError, readJsonBody } from "@/lib/api";
import { streamPlan } from "@/lib/ai";
import { EventInputSchema } from "@/lib/schema";
import { buildPlanPrompt, systemPromptFor } from "@/lib/prompts";
import { MAX_RETRIES } from "@/lib/constants";

// Must stay a literal (Next needs it statically analyzable). Equals MAX_DURATION_S
// in lib/constants.ts; tests/constants.test.ts enforces this.
export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  // ── Rate limit (P5-T04) ───────────────────────────────────────────────────
  const limited = enforceRateLimit(req, "/api/plan");
  if (limited) return limited;

  // ── Parse + validate request body ────────────────────────────────────────
  const parsed = await readJsonBody(req, EventInputSchema);

  if (!parsed.ok) {
    return parsed.response;
  }

  const input = parsed.data;

  // ── Stream plan from LLM ──────────────────────────────────────────────────
  const logOnce = createLlmLogOnce("plan", input.eventType);

  try {
    const result = streamPlan({
      system: systemPromptFor(input.eventType),
      prompt: buildPlanPrompt(input),
      maxRetries: MAX_RETRIES,
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
    return mapError(err);
  }
}
