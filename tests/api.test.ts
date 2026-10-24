import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  errorResponse,
  getClientIp,
  MAX_BODY_BYTES,
  parseBody,
  type ErrorEnvelope,
} from "@/lib/api";
import {
  DEFAULT_LLM_MODEL,
  getModel,
  MAX_OUTPUT_TOKENS,
  MAX_OUTPUT_TOKENS_EMAIL,
  MAX_OUTPUT_TOKENS_PLAN,
  MAX_OUTPUT_TOKENS_REFINE,
  MAX_RETRIES,
  schemaForLLM,
} from "@/lib/ai";

const SimpleSchema = z.object({
  title: z.string().min(1),
  count: z.number().int().positive(),
});

describe("lib/api errorResponse", () => {
  it("formats error envelope according to TDD §6.0", async () => {
    const res = errorResponse("RATE_LIMITED", "Too many requests", 429, { retryAfter: 60 });
    expect(res.status).toBe(429);
    expect(res.headers.get("content-type")).toContain("application/json");

    const json = (await res.json()) as ErrorEnvelope;
    expect(json).toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests",
        details: { retryAfter: 60 },
      },
    });
  });

  it("defaults details to empty object when omitted", async () => {
    const res = errorResponse("INTERNAL", "Server error", 500);
    expect(res.status).toBe(500);

    const json = (await res.json()) as ErrorEnvelope;
    expect(json).toEqual({
      error: {
        code: "INTERNAL",
        message: "Server error",
        details: {},
      },
    });
  });
});

describe("lib/api parseBody", () => {
  it("rejects oversized body (> 50 KB) with 413 INVALID_INPUT", async () => {
    const largeString = "a".repeat(MAX_BODY_BYTES + 100);
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: largeString, count: 1 }),
    });

    const result = await parseBody(req, SimpleSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(413);
      const json = (await result.response.json()) as ErrorEnvelope;
      expect(json.error.code).toBe("INVALID_INPUT");
      expect(json.error.message).toContain("50 KB");
    }
  });

  it("rejects malformed JSON with 400 INVALID_INPUT", async () => {
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ not valid json: 123",
    });

    const result = await parseBody(req, SimpleSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      const json = (await result.response.json()) as ErrorEnvelope;
      expect(json.error.code).toBe("INVALID_INPUT");
      expect(json.error.message).toContain("JSON");
    }
  });

  it("rejects schema validation failure with 400 and issues in details", async () => {
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "", count: -5 }),
    });

    const result = await parseBody(req, SimpleSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      const json = (await result.response.json()) as ErrorEnvelope;
      expect(json.error.code).toBe("INVALID_INPUT");
      expect(json.error.details).toBeDefined();
      const details = json.error.details as { issues: z.ZodIssue[] };
      expect(Array.isArray(details.issues)).toBe(true);
      expect(details.issues.length).toBeGreaterThan(0);
    }
  });

  it("returns parsed data for valid request payload", async () => {
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "My Party", count: 10 }),
    });

    const result = await parseBody(req, SimpleSchema);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ title: "My Party", count: 10 });
    }
  });
});

describe("lib/api getClientIp", () => {
  it("extracts the first IP from x-forwarded-for header", () => {
    const req = new Request("http://localhost/api/test", {
      headers: { "x-forwarded-for": "203.0.113.195, 70.41.3.18, 150.172.238.178" },
    });
    expect(getClientIp(req)).toBe("203.0.113.195");
  });

  it("handles whitespace in x-forwarded-for", () => {
    const req = new Request("http://localhost/api/test", {
      headers: { "x-forwarded-for": "   198.51.100.1  , 10.0.0.1" },
    });
    expect(getClientIp(req)).toBe("198.51.100.1");
  });

  it("falls back to x-real-ip when x-forwarded-for is missing", () => {
    const req = new Request("http://localhost/api/test", {
      headers: { "x-real-ip": "192.0.2.1" },
    });
    expect(getClientIp(req)).toBe("192.0.2.1");
  });

  it("returns unknown when no IP headers are present", () => {
    const req = new Request("http://localhost/api/test");
    expect(getClientIp(req)).toBe("unknown");
  });
});

describe("lib/ai constants and helpers", () => {
  it("exports correct constants per spec", () => {
    expect(DEFAULT_LLM_MODEL).toBe("claude-sonnet-5-5");
    expect(MAX_RETRIES).toBe(1);
    expect(MAX_OUTPUT_TOKENS.plan).toBe(8000);
    expect(MAX_OUTPUT_TOKENS.refine).toBe(4500);
    expect(MAX_OUTPUT_TOKENS.email).toBe(600);
    expect(MAX_OUTPUT_TOKENS_PLAN).toBe(8000);
    expect(MAX_OUTPUT_TOKENS_REFINE).toBe(4500);
    expect(MAX_OUTPUT_TOKENS_EMAIL).toBe(600);
  });

  it("getModel returns language model instance", () => {
    const model = getModel();
    expect(model).toBeDefined();
    expect((model as { modelId?: string }).modelId).toBe("claude-sonnet-5-5");
  });

  it("getModel supports custom model identifier", () => {
    const model = getModel("claude-3-5-haiku-20241022");
    expect((model as { modelId?: string }).modelId).toBe("claude-3-5-haiku-20241022");
  });

  it("schemaForLLM passes through schema (DD-6)", () => {
    const testSchema = z.object({ test: z.string() });
    expect(schemaForLLM(testSchema)).toBe(testSchema);
  });
});
