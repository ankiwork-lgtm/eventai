/**
 * AI SDK Integration Layer (`lib/ai.ts`)
 *
 * SDK Findings & API Notes (ai v7.0.146, @ai-sdk/anthropic v4.0.84, @ai-sdk/react v4.x):
 * -------------------------------------------------------------------------------------
 * 1. API Names & Signatures:
 *    - `streamText` / `generateText` with `output: Output.object({ schema })` is the
 *      current API for structured generation in ai v7 (`streamObject` / `generateObject`
 *      are deprecated).
 *    - Token option is named `maxOutputTokens` (not `maxTokens`).
 *    - Retries option is named `maxRetries`.
 *    - Stream response helper: `result.toTextStreamResponse(init?: ResponseInit)` returns
 *      a `Response` streaming plain text chunks of partial JSON.
 *
 * 2. Anthropic Provider (@ai-sdk/anthropic):
 *    - Default export `anthropic` automatically reads `process.env.ANTHROPIC_API_KEY`.
 *    - Calling `anthropic(modelId)` returns a `LanguageModel` instance.
 *    - Custom configuration can be passed via `createAnthropic({ apiKey: ... })`.
 *
 * 3. Client Stream Compatibility (`useObject` in @ai-sdk/react 4.x):
 *    - `useObject` expects a chunked text stream of partial JSON over `response.body`.
 *    - Routes (such as `POST /api/plan` in P1-T07) should call `streamText(...)` with
 *      `output: Output.object(...)` and return `result.toTextStreamResponse()`.
 *    - Mid-stream errors cannot update HTTP headers after byte 1; `useObject` handles
 *      partial streams and errors via its `onError` / `error` hook states (DD-8).
 *
 * 4. JSON Schema Array Bounds (DD-6):
 *    - Anthropic tool calling accepts JSON Schema `minItems` / `maxItems`, so schemas are
 *      passed to `Output.object` unchanged. If a provider ever rejects them, strip the
 *      bounds at the call sites in `streamPlan` / `generateStructured` and rely on prompt text.
 *
 * 5. Temperature (model-specific):
 *    - claude-haiku-5-5 / claude-sonnet-5-5 / claude-opus-5-5 do not support `temperature`.
 *      The parameter is omitted from all calls to avoid SDK warnings.
 */

// Hard guard: this module reads server-only secrets (ANTHROPIC_API_KEY, LLM_MODEL).
// Importing it from a Client Component is a build-time error, not a silent bundle leak.
import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, streamText, Output, type LanguageModel } from "ai";
import { type z } from "zod";
import { PlanSchema, type Plan } from "@/lib/schema";
import { MAX_RETRIES } from "@/lib/constants";

/** Default fallback LLM model name */
export const DEFAULT_LLM_MODEL = "claude-sonnet-5-5";

// Re-exported for existing importers (tests/api.test.ts).
export { MAX_RETRIES };

/** Max output token budgets per call type */
export const MAX_OUTPUT_TOKENS = {
  plan: 8000,
  refine: 4500,
  email: 600,
} as const;

/**
 * Returns a LanguageModel instance.
 * When ANTHROPIC_BASE_URL points to an OpenAI-compatible gateway (e.g. IBM ICA /v1),
 * we use the @ai-sdk/openai provider so the request format matches the gateway's API.
 * Otherwise we fall back to the native @ai-sdk/anthropic provider.
 */
export function getModel(modelId?: string): LanguageModel {
  const modelName = modelId ?? process.env.LLM_MODEL ?? DEFAULT_LLM_MODEL;
  const baseURL = process.env.ANTHROPIC_BASE_URL;
  if (baseURL) {
    const openai = createOpenAI({
      baseURL,
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    return openai(modelName);
  }
  return anthropic(modelName);
}

/**
 * Token usage reported by the SDK on stream completion.
 * Mirrors `LanguageModelUsage` (ai v7): both fields may be `undefined`.
 */
export type LlmUsage = {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
};

/**
 * Payload passed to `streamPlan`'s onFinish (subset of the SDK event we need).
 * A failed or aborted stream is signalled by `object === undefined`; `streamPlan`
 * itself never sets `error` (the SDK's finish event carries none).
 */
export type StreamPlanFinish = {
  usage: LlmUsage;
  object: Plan | undefined;
  error?: unknown;
};

export type StreamPlanOptions = {
  prompt: string;
  system: string;
  schema?: z.ZodType<Plan>;
  model?: LanguageModel;
  maxRetries?: number;
  maxOutputTokens?: number;
  abortSignal?: AbortSignal;
  /** Called once the stream completes, with token usage and the final object. */
  onFinish?: (event: StreamPlanFinish) => void;
};

/**
 * Thin wrapper for streaming a structured event plan response.
 * Compatible with `useObject` client hook when calling `.toTextStreamResponse()`.
 *
 * Uses `streamText` + `Output.object` (ai v7 current API; `streamObject` is deprecated).
 */
export function streamPlan(options: StreamPlanOptions) {
  const model = options.model ?? getModel();
  const schema = options.schema ?? PlanSchema;

  return streamText({
    model,
    output: Output.object({ schema }),
    system: options.system,
    prompt: options.prompt,
    maxRetries: options.maxRetries ?? MAX_RETRIES,
    maxOutputTokens: options.maxOutputTokens ?? MAX_OUTPUT_TOKENS.plan,
    abortSignal: options.abortSignal,
    onFinish: options.onFinish
      ? ({ usage, output }) =>
          options.onFinish!({
            usage: {
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
            },
            object: output as Plan | undefined,
          })
      : undefined,
  });
}

export type GenerateStructuredOptions<T> = {
  schema: z.ZodType<T>;
  prompt: string;
  system?: string;
  model?: LanguageModel;
  maxRetries?: number;
  /** Required: each caller must pick its own budget (see `MAX_OUTPUT_TOKENS`). */
  maxOutputTokens: number;
  abortSignal?: AbortSignal;
};

/**
 * Thin wrapper for non-streaming structured object generation.
 *
 * Uses `generateText` + `Output.object` (ai v7 current API; `generateObject` is deprecated).
 */
export async function generateStructured<T>(options: GenerateStructuredOptions<T>) {
  const model = options.model ?? getModel();
  const schema = options.schema;

  const result = await generateText({
    model,
    output: Output.object({ schema }),
    system: options.system,
    prompt: options.prompt,
    maxRetries: options.maxRetries ?? MAX_RETRIES,
    maxOutputTokens: options.maxOutputTokens,
    abortSignal: options.abortSignal,
  });

  return {
    object: result.output as T,
    usage: result.usage,
  };
}
