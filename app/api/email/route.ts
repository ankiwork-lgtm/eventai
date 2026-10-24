/**
 * POST /api/email — draft vendor inquiry email (P4-T07, TDD §6.3, PROJECT_SPEC §6)
 *
 * Uses generateStructured (non-streaming) to generate a customized vendor inquiry.
 */

import { errorResponse, parseBody, getClientIp } from "@/lib/api";
import { generateStructured } from "@/lib/ai";
import { MAX_OUTPUT_TOKENS } from "@/lib/ai";
import { EmailRequestSchema, EmailSchema } from "@/lib/schema";
import { buildEmailPrompt, EMAIL_SYSTEM_PROMPT } from "@/lib/prompts";
import { checkRateLimit } from "@/lib/ratelimit";
import { logLlmCall } from "@/lib/observability";

export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  // ── Rate limit (P5-T04) ───────────────────────────────────────────────────
  const rl = checkRateLimit(getClientIp(req), "/api/email");
  if (rl.limited) {
    return errorResponse(
      "RATE_LIMITED",
      "Too many requests. Try again shortly.",
      429,
      {},
      { "Retry-After": String(rl.retryAfterSeconds) },
    );
  }

  let parsed;
  try {
    parsed = await parseBody(req, EmailRequestSchema);
  } catch {
    return errorResponse("INTERNAL", "Unexpected error reading request.", 500);
  }

  if (!parsed.ok) {
    return parsed.response;
  }

  const { vendorType, eventInput, plan } = parsed.data;

  // Trim plan to the matching vendor entry (case-insensitive)
  const matchingVendor = (plan.vendors ?? []).find(
    (v) => v.type.toLowerCase().trim() === vendorType.toLowerCase().trim(),
  );

  if (!matchingVendor) {
    return errorResponse(
      "INVALID_INPUT",
      `Vendor type "${vendorType}" not found in plan`,
      400,
    );
  }

  // Find optional matching budget line
  const matchingBudget = (plan.budget ?? []).find(
    (b) =>
      b.category.toLowerCase().includes(vendorType.toLowerCase()) ||
      vendorType.toLowerCase().includes(b.category.toLowerCase()),
  );

  const startedAt = Date.now();

  try {
    const result = await generateStructured({
      schema: EmailSchema,
      system: EMAIL_SYSTEM_PROMPT,
      prompt: buildEmailPrompt({
        vendor: matchingVendor,
        eventInput,
        summary: plan.summary,
        budgetLine: matchingBudget,
      }),
      temperature: 0.5,
      maxOutputTokens: MAX_OUTPUT_TOKENS.email,
      maxRetries: 1,
    });

    logLlmCall({
      route: "email",
      eventType: eventInput.eventType,
      latencyMs: Date.now() - startedAt,
      usage: result.usage,
      ok: true,
    });

    return Response.json(result.object, { status: 200 });
  } catch (err) {
    logLlmCall({
      route: "email",
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
