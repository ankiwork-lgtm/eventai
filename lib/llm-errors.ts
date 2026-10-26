/**
 * lib/llm-errors.ts — LLM error classification for API routes.
 *
 * Replaces the per-route `msg.includes("api") || msg.includes("fetch") || …`
 * heuristic with a typed check against AI SDK error classes, falling back to the
 * substring heuristic only when the error is not a recognised SDK error.
 *
 * "provider" → surface as HTTP 502 LLM_ERROR ("the AI provider returned an error").
 * "internal" → surface as HTTP 500 INTERNAL ("an unexpected server error occurred").
 *
 * Raw errors must never be logged or returned to the client — they can contain
 * request paths, prompt fragments, or key material (TDD §6, §13).
 */

import { AISDKError, APICallError } from "ai";

export type LlmErrorKind = "provider" | "internal";

/**
 * Substring fallback for non-SDK errors (e.g. a bare `fetch` TypeError thrown
 * before the SDK wraps it, or a gateway-shaped error). Kept deliberately broad:
 * a false "provider" classification is safer than a 500 that hides a retryable
 * upstream failure from the user.
 */
const PROVIDER_HINTS = [
  "api",
  "model",
  "provider",
  "anthropic",
  "fetch",
  "network",
  "timeout",
  "schema",
  "validation",
  "generate",
  "token",
] as const;

function matchesProviderHint(message: string): boolean {
  const lower = message.toLowerCase();
  return PROVIDER_HINTS.some((hint) => lower.includes(hint));
}

/**
 * Classify an error thrown while calling the LLM.
 *
 * Any AI SDK error (`AISDKError` is the base class for every SDK error, including
 * `APICallError`, `NoObjectGeneratedError`, `TypeValidationError`, load/retry
 * errors, etc.) is treated as a provider error: the request reached, or failed
 * against, the model layer and is the user's problem to retry, not a server bug.
 * Everything else falls back to the substring heuristic, then defaults to internal.
 */
export function classifyLlmError(err: unknown): LlmErrorKind {
  // APICallError.isInstance / AISDKError.isInstance are robust across duplicated
  // module copies (they brand-check rather than rely on `instanceof`).
  if (APICallError.isInstance(err) || AISDKError.isInstance(err)) {
    return "provider";
  }

  if (err instanceof Error && matchesProviderHint(err.message)) {
    return "provider";
  }

  return "internal";
}
