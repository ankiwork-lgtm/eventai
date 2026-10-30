/**
 * POST /api/email — draft vendor inquiry email (P4-T07, TDD §6.3, PROJECT_SPEC §6)
 *
 * Uses generateStructured (non-streaming) to generate a customized vendor inquiry.
 */

import {
  enforceRateLimit,
  errorResponse,
  mapError,
  readJsonBody,
  withLlmLogging,
} from "@/lib/api";
import { generateStructured } from "@/lib/ai";
import { MAX_OUTPUT_TOKENS } from "@/lib/ai";
import { EmailRequestSchema, EmailSchema } from "@/lib/schema";
import { buildEmailPrompt, EMAIL_SYSTEM_PROMPT } from "@/lib/prompts";
import { MAX_RETRIES } from "@/lib/constants";

// Must stay a literal (Next needs it statically analyzable). Equals MAX_DURATION_S
// in lib/constants.ts; tests/constants.test.ts enforces this.
export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  // ── Rate limit (P5-T04) ───────────────────────────────────────────────────
  const limited = enforceRateLimit(req, "/api/email");
  if (limited) return limited;

  const parsed = await readJsonBody(req, EmailRequestSchema);

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

  try {
    const result = await withLlmLogging(
      { route: "email", eventType: eventInput.eventType },
      () =>
        generateStructured({
          schema: EmailSchema,
          system: EMAIL_SYSTEM_PROMPT,
          prompt: buildEmailPrompt({
            vendor: matchingVendor,
            eventInput,
            summary: plan.summary,
            budgetLine: matchingBudget,
          }),
          maxOutputTokens: MAX_OUTPUT_TOKENS.email,
          maxRetries: MAX_RETRIES,
        }),
    );

    return Response.json(result.object, { status: 200 });
  } catch (err) {
    return mapError(err);
  }
}
