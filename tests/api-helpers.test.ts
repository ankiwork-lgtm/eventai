/**
 * Unit tests for the shared API helpers in lib/api/ (task 2.4).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { APICallError } from "ai";
import {
  MAX_BODY_BYTES,
  createLlmLogOnce,
  enforceRateLimit,
  mapError,
  readJsonBody,
  withLlmLogging,
} from "@/lib/api";
import { ROUTE_LIMITS, resetRateLimitStore } from "@/lib/ratelimit";

const jsonReq = (body: string) =>
  new Request("http://localhost/api/x", { method: "POST", body });

describe("enforceRateLimit", () => {
  beforeEach(() => resetRateLimitStore());

  it("returns null until the limit, then a 429 envelope with Retry-After", async () => {
    const route = "/api/plan";
    const req = () =>
      new Request("http://localhost/api/plan", { headers: { "x-real-ip": "1.2.3.4" } });
    for (let i = 0; i < ROUTE_LIMITS[route].limit; i++) {
      expect(enforceRateLimit(req(), route)).toBeNull();
    }
    const res = enforceRateLimit(req(), route);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
    expect(Number(res!.headers.get("Retry-After"))).toBeGreaterThan(0);
    const body = await res!.json();
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(body.error.message).toBe("Too many requests. Try again shortly.");
  });
});

describe("readJsonBody", () => {
  const schema = z.object({ a: z.number() });

  it("returns parsed data for valid JSON", async () => {
    const r = await readJsonBody(jsonReq('{"a":1}'), schema);
    expect(r).toEqual({ ok: true, data: { a: 1 } });
  });

  it("returns 413 over 50 KB", async () => {
    const r = await readJsonBody(jsonReq("x".repeat(MAX_BODY_BYTES + 1)), schema);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(413);
  });

  it("returns 400 for invalid JSON and for schema failures", async () => {
    for (const body of ["{nope", '{"a":"x"}']) {
      const r = await readJsonBody(jsonReq(body), schema);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.response.status).toBe(400);
        expect((await r.response.json()).error.code).toBe("INVALID_INPUT");
      }
    }
  });
});

describe("mapError", () => {
  it("maps provider errors to 502 LLM_ERROR", async () => {
    const res = mapError(
      new APICallError({ message: "boom", url: "u", requestBodyValues: {} }),
    );
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("LLM_ERROR");
  });

  it("maps internal errors to 500 INTERNAL", async () => {
    const res = mapError(new Error("zzz"));
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("INTERNAL");
  });

  it("does not leak the raw message", async () => {
    const res = mapError(new Error("secret-key-123"));
    expect(JSON.stringify(await res.json())).not.toContain("secret-key-123");
  });
});

describe("withLlmLogging / createLlmLogOnce", () => {
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    spy = vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => spy.mockRestore());

  const lines = () => spy.mock.calls.map((c: unknown[]) => JSON.parse(String(c[0])));

  it("logs ok with usage and returns the result", async () => {
    const out = await withLlmLogging({ route: "refine", eventType: "wedding" }, async () => ({
      usage: { inputTokens: 3, outputTokens: 4 },
      v: 1,
    }));
    expect(out.v).toBe(1);
    expect(lines()).toHaveLength(1);
    expect(lines()[0]).toMatchObject({
      route: "refine",
      eventType: "wedding",
      inputTokens: 3,
      outputTokens: 4,
      ok: true,
    });
  });

  it("logs ok:false and rethrows on failure", async () => {
    const err = new Error("x");
    await expect(
      withLlmLogging({ route: "email", eventType: "birthday" }, async () => {
        throw err;
      }),
    ).rejects.toBe(err);
    expect(lines()).toHaveLength(1);
    expect(lines()[0]).toMatchObject({ route: "email", ok: false });
  });

  it("createLlmLogOnce logs only the first call", () => {
    const log = createLlmLogOnce("plan", "wedding");
    log(true);
    log(false);
    expect(lines()).toHaveLength(1);
    expect(lines()[0].ok).toBe(true);
  });
});
