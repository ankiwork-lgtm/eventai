/**
 * POST /api/refine — chat-based plan refinement (P3-T06, TDD §6.2, DD-10)
 *
 * Uses generateObject (non-streaming) for reliable schema validation.
 * Provider failure → 502 LLM_ERROR.
 */

import { enforceRateLimit, mapError, readJsonBody, withLlmLogging } from "@/lib/api";
import { generateStructured } from "@/lib/ai";
import { MAX_OUTPUT_TOKENS } from "@/lib/ai";
import { RefineRequestSchema, RefineResultSchema } from "@/lib/schema";
import { buildRefinePrompt, refineSystemPromptFor } from "@/lib/prompts";
import { MAX_RETRIES, REFINE_HISTORY_LIMIT } from "@/lib/constants";

// Must stay a literal (Next needs it statically analyzable). Equals MAX_DURATION_S
// in lib/constants.ts; tests/constants.test.ts enforces this.
export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  // ── Rate limit (P5-T04) ───────────────────────────────────────────────────
  const limited = enforceRateLimit(req, "/api/refine");
  if (limited) return limited;

  // ── Parse + validate request body ────────────────────────────────────────
  const parsed = await readJsonBody(req, RefineRequestSchema);

  if (!parsed.ok) {
    return parsed.response;
  }

  const { plan, message, eventInput, history = [] } = parsed.data;

  // Truncate history to the last REFINE_HISTORY_LIMIT messages
  const trimmedHistory = history.slice(-REFINE_HISTORY_LIMIT);

  try {
    // Observability (TDD §13): one structured log line per call.
    const result = await withLlmLogging(
      { route: "refine", eventType: eventInput.eventType },
      () =>
        generateStructured({
          schema: RefineResultSchema,
          system: refineSystemPromptFor(eventInput.eventType),
          prompt: buildRefinePrompt(plan, message, eventInput, trimmedHistory),
          maxOutputTokens: MAX_OUTPUT_TOKENS.refine,
          maxRetries: MAX_RETRIES,
        }),
    );

    return Response.json(result.object, { status: 200 });
  } catch (err) {
    return mapError(err);
  }
}
