/**
 * tests/api-contracts-preservation.test.ts (task 2.2)
 *
 * Preservation (Property 3): IPv4 rate limiting and the response contracts of
 * /api/plan, /api/refine and /api/email. Observed on UNFIXED code; these must
 * keep passing after the limiter key fix (2.3) and the API helper refactor (2.4).
 *
 * Existing tests already cover: 400 on bad body, prompt wiring, and the
 * "N allowed then 429 + Retry-After" path per route. This file adds what they
 * do not: exact error envelopes, 413, 500 / 502, the moodboard limit, and
 * limiter behavior across many IPv4 addresses.
 *
 * (fast-check is not installed, so the property is checked over a deterministic
 * spread of IPv4 addresses.)
 *
 * **Validates: Requirements 3.2, 3.3, 3.11**
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_BODY_BYTES } from "@/lib/api";
import { checkRateLimit, resetRateLimitStore, ROUTE_LIMITS } from "@/lib/ratelimit";

// ─── Controllable mock of lib/ai ────────────────────────────────────────────

const ai = vi.hoisted(() => ({
  error: null as unknown,
  calls: 0,
}));

vi.mock("@/lib/ai", () => ({
  streamPlan: () => {
    ai.calls++;
    if (ai.error) throw ai.error;
    return { toTextStreamResponse: () => new Response("{}", { status: 200 }) };
  },
  generateStructured: () => {
    ai.calls++;
    if (ai.error) return Promise.reject(ai.error);
    return Promise.resolve({ object: { ok: true } });
  },
  MAX_OUTPUT_TOKENS: { plan: 4000, refine: 4500, email: 600 },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const input = {
  eventType: "wedding",
  date: "2099-06-15",
  guestCount: 100,
  totalBudget: 500000,
  currency: "INR",
  city: "Mumbai",
};

const plan = {
  summary: "Test event plan.",
  budget: [
    { category: "Venue", percent: 40, estimatedCost: 40000, tips: "Negotiate" },
    { category: "Catering", percent: 30, estimatedCost: 30000, tips: "Buffet" },
    { category: "Decor", percent: 20, estimatedCost: 20000, tips: "DIY" },
    { category: "Misc", percent: 10, estimatedCost: 10000, tips: "Buffer" },
  ],
  timeline: Array.from({ length: 6 }, (_, i) => ({
    when: `${6 - i} months before`,
    task: `Task ${i}`,
    priority: "medium",
  })),
  vendors: Array.from({ length: 3 }, (_, i) => ({
    type: `Vendor ${i}`,
    checklist: ["a", "b", "c"],
    budgetRange: "10k-20k",
  })),
  ideas: Array.from({ length: 4 }, (_, i) => ({ title: `Idea ${i}`, description: "desc" })),
};

type Route = "plan" | "refine" | "email";

const validBodies: Record<Route, unknown> = {
  plan: input,
  refine: { plan, message: "Make it cheaper", eventInput: input },
  email: { vendorType: "Vendor 0", eventInput: input, plan },
};

async function post(route: Route, body: unknown, ip = "10.1.1.1"): Promise<Response> {
  const handlers = {
    plan: () => import("@/app/api/plan/route"),
    refine: () => import("@/app/api/refine/route"),
    email: () => import("@/app/api/email/route"),
  };
  const { POST } = await handlers[route]();
  return POST(
    new Request(`http://localhost/api/${route}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

type Envelope = { error: { code: string; message: string; details: unknown } };

beforeEach(() => {
  ai.error = null;
  ai.calls = 0;
  resetRateLimitStore();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Limiter: configuration and IPv4 behavior ───────────────────────────────

describe("limiter configuration is unchanged", () => {
  it("has the documented limits per 10 minutes", () => {
    const tenMin = 10 * 60 * 1000;
    expect(ROUTE_LIMITS["/api/plan"]).toEqual({ limit: 5, windowMs: tenMin });
    expect(ROUTE_LIMITS["/api/refine"]).toEqual({ limit: 20, windowMs: tenMin });
    expect(ROUTE_LIMITS["/api/email"]).toEqual({ limit: 20, windowMs: tenMin });
    expect(ROUTE_LIMITS["/api/moodboard"]).toEqual({ limit: 30, windowMs: tenMin });
  });
});

// Deterministic spread of IPv4 addresses, including edge values.
const IPV4S = [
  "0.0.0.0",
  "1.2.3.4",
  "10.0.0.1",
  "127.0.0.1",
  "172.16.254.1",
  "192.168.0.255",
  "203.0.113.77",
  "255.255.255.255",
  ...Array.from({ length: 24 }, (_, i) => `${(i * 37) % 256}.${(i * 91) % 256}.${(i * 13) % 256}.${(i * 7 + 1) % 256}`),
];

describe.each(Object.entries(ROUTE_LIMITS))("IPv4 limiting on %s", (route, cfg) => {
  it.each(IPV4S)("allows exactly %s's configured count, then blocks", (ip) => {
    resetRateLimitStore();
    const t0 = 1_000_000;
    for (let i = 0; i < cfg.limit; i++) {
      expect(checkRateLimit(ip, route, () => t0)).toEqual({ limited: false, retryAfterSeconds: 0 });
    }
    // Repeated attempts stay blocked and never consume extra capacity.
    for (let i = 0; i < 3; i++) {
      const r = checkRateLimit(ip, route, () => t0);
      expect(r.limited).toBe(true);
      expect(r.retryAfterSeconds).toBe(cfg.windowMs / 1000);
    }
    // Window expiry restores access.
    expect(checkRateLimit(ip, route, () => t0 + cfg.windowMs + 1).limited).toBe(false);
  });

  it("reports the time until the oldest request expires", () => {
    const t0 = 5_000_000;
    checkRateLimit("9.9.9.9", route, () => t0);
    for (let i = 1; i < cfg.limit; i++) checkRateLimit("9.9.9.9", route, () => t0 + 60_000);
    const r = checkRateLimit("9.9.9.9", route, () => t0 + 120_000);
    expect(r).toEqual({ limited: true, retryAfterSeconds: (cfg.windowMs - 120_000) / 1000 });
  });
});

describe("the shared 'unknown' IP bucket", () => {
  it("is limited like any other key", () => {
    for (let i = 0; i < 5; i++) expect(checkRateLimit("unknown", "/api/plan", () => 0).limited).toBe(false);
    expect(checkRateLimit("unknown", "/api/plan", () => 0).limited).toBe(true);
  });
});

// ─── Route contracts: error envelopes ───────────────────────────────────────

describe.each<Route>(["plan", "refine", "email"])("POST /api/%s error contract", (route) => {
  it("400 malformed JSON: Malformed JSON body", async () => {
    const res = await post(route, "{ nope");
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({
      error: { code: "INVALID_INPUT", message: "Malformed JSON body", details: {} },
    });
    expect(ai.calls).toBe(0);
  });

  it("400 schema failure: Invalid request input with issues array", async () => {
    const res = await post(route, {});
    expect(res.status).toBe(400);
    const json = (await res.json()) as Envelope;
    expect(json.error.code).toBe("INVALID_INPUT");
    expect(json.error.message).toBe("Invalid request input");
    expect(Array.isArray((json.error.details as { issues: unknown[] }).issues)).toBe(true);
    expect(ai.calls).toBe(0);
  });

  it("413 body over 50 KB: exact message, LLM not called", async () => {
    const res = await post(route, JSON.stringify({ pad: "a".repeat(MAX_BODY_BYTES + 1) }));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({
      error: { code: "INVALID_INPUT", message: "Request body exceeds 50 KB limit", details: {} },
    });
    expect(ai.calls).toBe(0);
  });

  it("429 after the limit: RATE_LIMITED envelope with Retry-After", async () => {
    const limit = ROUTE_LIMITS[`/api/${route}`]!.limit;
    for (let i = 0; i < limit; i++) {
      expect((await post(route, validBodies[route], "10.9.9.9")).status).toBe(200);
    }
    const res = await post(route, validBodies[route], "10.9.9.9");
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: { code: "RATE_LIMITED", message: "Too many requests. Try again shortly.", details: {} },
    });
    const retry = Number(res.headers.get("Retry-After"));
    expect(Number.isInteger(retry)).toBe(true);
    expect(retry).toBeGreaterThanOrEqual(1);
    expect(retry).toBeLessThanOrEqual(600);
    expect(ai.calls).toBe(limit);
  });

  it("429 is evaluated before body validation", async () => {
    const limit = ROUTE_LIMITS[`/api/${route}`]!.limit;
    for (let i = 0; i < limit; i++) await post(route, "{ nope", "10.8.8.8");
    const res = await post(route, "{ nope", "10.8.8.8");
    expect(res.status).toBe(429);
  });

  it("502 when the provider fails", async () => {
    ai.error = new Error("Anthropic API request failed");
    const res = await post(route, validBodies[route]);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: {
        code: "LLM_ERROR",
        message: "The AI provider returned an error. Please try again.",
        details: {},
      },
    });
  });

  it("500 on an unclassified internal error, without leaking the message", async () => {
    ai.error = new Error("zzz secret-internal-detail");
    const res = await post(route, validBodies[route]);
    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(JSON.parse(text)).toEqual({
      error: { code: "INTERNAL", message: "An unexpected server error occurred.", details: {} },
    });
    expect(text).not.toContain("secret-internal-detail");
  });
});

describe("POST /api/email specific 400", () => {
  it("unknown vendor type keeps its exact message", async () => {
    const res = await post("email", { ...(validBodies.email as object), vendorType: "Fireworks" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { code: "INVALID_INPUT", message: 'Vendor type "Fireworks" not found in plan', details: {} },
    });
    expect(ai.calls).toBe(0);
  });
});

describe("success responses", () => {
  it("refine and email return the generated object with 200", async () => {
    for (const route of ["refine", "email"] as const) {
      const res = await post(route, validBodies[route]);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    }
  });

  it("plan returns the stream response with 200", async () => {
    const res = await post("plan", validBodies.plan);
    expect(res.status).toBe(200);
  });
});

describe("limits are tracked per route and per IPv4 at route level", () => {
  it("exhausting /api/plan does not affect /api/email for the same IP", async () => {
    for (let i = 0; i < 5; i++) await post("plan", validBodies.plan, "10.7.7.7");
    expect((await post("plan", validBodies.plan, "10.7.7.7")).status).toBe(429);
    expect((await post("email", validBodies.email, "10.7.7.7")).status).toBe(200);
  });
});
