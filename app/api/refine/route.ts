/**
 * POST /api/refine — chat-based plan refinement (P3-T06, TDD §6.2, DD-10)
 *
 * Uses generateObject (non-streaming) for reliable schema validation.
 * Provider failure → 502 LLM_ERROR.
 */

import { errorResponse, parseBody, getClientIp } from "@/lib/api";
import { generateStructured } from "@/lib/ai";
import { MAX_OUTPUT_TOKENS } from "@/lib/ai";
import { RefineRequestSchema, RefineResultSchema } from "@/lib/schema";
import { buildRefinePrompt, refineSystemPromptFor } from "@/lib/prompts";
import { checkRateLimit } from "@/lib/ratelimit";
import { logLlmCall } from "@/lib/observability";

export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  // ── Rate limit (P5-T04) ───────────────────────────────────────────────────
  const rl = checkRateLimit(getClientIp(req), "/api/refine");
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
    parsed = await parseBody(req, RefineRequestSchema);
  } catch {
    return errorResponse("INTERNAL", "Unexpected error reading request.", 500);
  }

  if (!parsed.ok) {
    return parsed.response;
  }

  const { plan, message, eventInput, history = [] } = parsed.data;

  // Truncate history to last 6 messages
  const trimmedHistory = history.slice(-6);

  const startedAt = Date.now();

  try {
    const result = await generateStructured({
      schema: RefineResultSchema,
      system: refineSystemPromptFor(eventInput.eventType),
      prompt: buildRefinePrompt(plan, message, eventInput, trimmedHistory),
      maxOutputTokens: MAX_OUTPUT_TOKENS.refine,
      maxRetries: 1,
    });

    // Observability (TDD §13)
    logLlmCall({
      route: "refine",
      eventType: eventInput.eventType,
      latencyMs: Date.now() - startedAt,
      usage: result.usage,
      ok: true,
    });

    return Response.json(result.object, { status: 200 });
  } catch (err) {
    console.error("[POST /api/refine error]:", err);

    logLlmCall({
      route: "refine",
      eventType: eventInput.eventType,
      latencyMs: Date.now() - startedAt,
      ok: false,
    });

    const msg = err instanceof Error ? err.message.toLowerCase() : "";
    const isProviderError =
      msg.includes("api") ||
      msg.includes("model") ||
      msg.includes("provider") ||
      msg.includes("anthropic") ||
      msg.includes("fetch") ||
      msg.includes("schema") ||
      msg.includes("validation") ||
      msg.includes("generate") ||
      msg.includes("token");

    if (isProviderError) {
      return errorResponse(
        "LLM_ERROR",
        "The AI provider returned an error. Please try again.",
        502,
      );
    }

    return errorResponse("INTERNAL", "An unexpected server error occurred.", 500);
  }
}
