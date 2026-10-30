import { describe, expect, it } from "vitest";
import {
  formatRateLimitMessage,
  isRateLimited,
  parseApiError,
} from "@/lib/client/apiError";

const envelope = (code: string, message: string) =>
  JSON.stringify({ error: { code, message, details: {} } });

describe("parseApiError", () => {
  it("reads code and message from the envelope", async () => {
    const res = new Response(envelope("LLM_ERROR", "Upstream failed"), { status: 502 });
    expect(await parseApiError(res)).toEqual({
      status: 502,
      code: "LLM_ERROR",
      message: "Upstream failed",
      retryAfterSeconds: null,
    });
  });

  it("reads Retry-After when present", async () => {
    const res = new Response(envelope("RATE_LIMITED", "Slow down"), {
      status: 429,
      headers: { "Retry-After": "42" },
    });
    const err = await parseApiError(res);
    expect(err.retryAfterSeconds).toBe(42);
    expect(err.message).toBe("Slow down");
  });

  it("returns null retryAfterSeconds when the header is absent or invalid", async () => {
    const none = await parseApiError(new Response(envelope("INTERNAL", "x"), { status: 500 }));
    expect(none.retryAfterSeconds).toBeNull();
    const bad = await parseApiError(
      new Response(envelope("RATE_LIMITED", "x"), {
        status: 429,
        headers: { "Retry-After": "soon" },
      }),
    );
    expect(bad.retryAfterSeconds).toBeNull();
  });

  it("falls back when JSON has no envelope", async () => {
    const err = await parseApiError(new Response(JSON.stringify({ ok: false }), { status: 500 }));
    expect(err).toEqual({
      status: 500,
      code: null,
      message: "Request failed (500)",
      retryAfterSeconds: null,
    });
  });

  it("falls back when the body is not JSON", async () => {
    const err = await parseApiError(
      new Response("<html>Bad Gateway</html>", {
        status: 502,
        headers: { "Retry-After": "7" },
      }),
    );
    expect(err.code).toBeNull();
    expect(err.message).toBe("Request failed (502)");
    expect(err.retryAfterSeconds).toBe(7);
  });
});

describe("formatRateLimitMessage", () => {
  const base = { status: 429, code: "RATE_LIMITED", message: "m" };

  it("includes the seconds when known", () => {
    expect(formatRateLimitMessage({ ...base, retryAfterSeconds: 30 })).toBe(
      "Too many requests, wait 30 seconds.",
    );
  });

  it("uses a generic message when seconds are unknown", () => {
    expect(formatRateLimitMessage({ ...base, retryAfterSeconds: null })).toBe(
      "Too many requests, please wait a moment.",
    );
  });

  it("detects rate limiting by status or code", () => {
    expect(isRateLimited({ ...base, retryAfterSeconds: null })).toBe(true);
    expect(isRateLimited({ status: 500, code: "INTERNAL", message: "m", retryAfterSeconds: null })).toBe(false);
  });
});
