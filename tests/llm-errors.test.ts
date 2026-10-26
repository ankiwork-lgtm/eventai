/**
 * tests/llm-errors.test.ts — classifyLlmError()
 *
 * Confirms the typed classifier returns "provider" for AI SDK errors and for the
 * substring-heuristic fallback, and "internal" for genuine server bugs.
 */

import { describe, it, expect } from "vitest";
import { APICallError, AISDKError } from "ai";
import { classifyLlmError } from "@/lib/llm-errors";

describe("classifyLlmError", () => {
  it("classifies an APICallError as a provider error", () => {
    const err = new APICallError({
      message: "something went wrong upstream",
      url: "https://api.anthropic.com/v1/messages",
      requestBodyValues: {},
      statusCode: 503,
      isRetryable: true,
    });
    expect(classifyLlmError(err)).toBe("provider");
  });

  it("classifies any AISDKError subclass as a provider error", () => {
    // A minimal AISDKError — the base class every SDK error extends.
    const err = new AISDKError({
      name: "AI_TestError",
      message: "no object generated",
    });
    expect(classifyLlmError(err)).toBe("provider");
  });

  it.each([
    "fetch failed",
    "model is overloaded",
    "provider timeout",
    "anthropic rate limit",
    "schema validation failed",
    "could not generate object",
    "network error",
    "token budget exceeded",
  ])("classifies plain Error with provider hint %j as provider", (message) => {
    expect(classifyLlmError(new Error(message))).toBe("provider");
  });

  it("is case-insensitive for the substring heuristic", () => {
    expect(classifyLlmError(new Error("FETCH FAILED"))).toBe("provider");
  });

  it("classifies an unrelated Error as internal", () => {
    expect(classifyLlmError(new Error("cannot read properties of undefined"))).toBe(
      "internal",
    );
  });

  it("classifies non-Error throwables as internal", () => {
    expect(classifyLlmError("boom")).toBe("internal");
    expect(classifyLlmError(null)).toBe("internal");
    expect(classifyLlmError(undefined)).toBe("internal");
    expect(classifyLlmError({ message: "fetch failed" })).toBe("internal");
  });
});
