import { classifyLlmError } from "@/lib/llm-errors";
import { errorResponse } from "./envelope";

/**
 * Maps an error thrown by the LLM layer to a response: provider errors → 502
 * LLM_ERROR, anything else → 500 INTERNAL. The raw error is never exposed.
 */
export function mapError(err: unknown): Response {
  if (classifyLlmError(err) === "provider") {
    return errorResponse(
      "LLM_ERROR",
      "The AI provider returned an error. Please try again.",
      502,
    );
  }
  return errorResponse("INTERNAL", "An unexpected server error occurred.", 500);
}
