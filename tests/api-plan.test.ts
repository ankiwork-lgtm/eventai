/**
 * tests/api-plan.test.ts
 *
 * Route-level tests for POST /api/plan (P1-T11).
 *
 * Strategy:
 * - Mock `@/lib/ai` so `streamPlan` never touches the network. The mock records
 *   the options it was called with (so we can inspect the `system` prompt) and
 *   returns a stub whose `toTextStreamResponse()` yields a plain 200 Response.
 * - `@/lib/prompts` and `@/lib/schema` are NOT mocked: we assert against the real
 *   `systemPromptFor(type)` output, proving the route wires the correct event-type
 *   prompt through to the LLM layer.
 *
 * Covered "Done when" criteria:
 * - 400 on a bad request body (schema failure).
 * - The system prompt passed to the LLM matches the event type for all three types.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamPlanOptions } from "@/lib/ai";
import { systemPromptFor } from "@/lib/prompts";
import { EVENT_TYPES, type EventInput, type EventType } from "@/lib/schema";
import { resetRateLimitStore } from "@/lib/ratelimit";

// ─── Mock lib/ai ────────────────────────────────────────────────────────────

/** Records the options passed to the most recent streamPlan() call. */
const streamPlanCalls: StreamPlanOptions[] = [];

vi.mock("@/lib/ai", () => ({
  streamPlan: (options: StreamPlanOptions) => {
    streamPlanCalls.push(options);
    return {
      toTextStreamResponse: () =>
        new Response("{}", {
          status: 200,
          headers: { "content-type": "text/plain; charset=utf-8" },
        }),
    };
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function postPlan(body: unknown, ip = "127.0.0.1"): Promise<Response> {
  const { POST } = await import("@/app/api/plan/route");
  const req = new Request("http://localhost/api/plan", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return POST(req);
}

/** A valid EventInput for the given type. Far-future date so `notInPast` passes. */
function validInput(eventType: EventType): EventInput {
  return {
    eventType,
    date: "2099-06-15",
    guestCount: 100,
    totalBudget: 500000,
    currency: "INR",
    city: "Mumbai",
  };
}

// ─── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  streamPlanCalls.length = 0;
  resetRateLimitStore();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/plan — bad body", () => {
  it("returns 400 with INVALID_INPUT when the body fails schema validation", async () => {
    // guestCount 0 and negative budget both violate EventInputSchema
    const res = await postPlan({
      eventType: "wedding",
      date: "2099-06-15",
      guestCount: 0,
      totalBudget: -100,
      city: "Mumbai",
    });

    expect(res.status).toBe(400);
    const json = (await res.json()) as {
      error: { code: string; details?: { issues?: unknown[] } };
    };
    expect(json.error.code).toBe("INVALID_INPUT");
    expect(Array.isArray(json.error.details?.issues)).toBe(true);

    // A rejected body must never reach the LLM layer.
    expect(streamPlanCalls).toHaveLength(0);
  });

  it("returns 400 with INVALID_INPUT on malformed JSON", async () => {
    const res = await postPlan("{ not valid json");
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("INVALID_INPUT");
    expect(streamPlanCalls).toHaveLength(0);
  });
});

describe("POST /api/plan — system prompt matches event type", () => {
  it.each(EVENT_TYPES)(
    "passes the %s system prompt through to streamPlan",
    async (eventType) => {
      const res = await postPlan(validInput(eventType));

      expect(res.status).toBe(200);
      expect(streamPlanCalls).toHaveLength(1);

      const passedSystem = streamPlanCalls[0].system;
      // Exact match against the real prompt builder for this type.
      expect(passedSystem).toBe(systemPromptFor(eventType));

      // And it must NOT be any other event type's prompt.
      for (const other of EVENT_TYPES) {
        if (other === eventType) continue;
        expect(passedSystem).not.toBe(systemPromptFor(other));
      }
    },
  );

  it("forwards a non-empty prompt alongside the system prompt", async () => {
    await postPlan(validInput("wedding"));
    expect(streamPlanCalls).toHaveLength(1);
    expect(typeof streamPlanCalls[0].prompt).toBe("string");
    expect(streamPlanCalls[0].prompt.length).toBeGreaterThan(0);
  });
});

describe("POST /api/plan — rate limiting", () => {
  it("allows 5 requests and blocks the 6th with 429 + Retry-After", async () => {
    const input = validInput("wedding");
    const ip = "192.168.1.1";
    for (let i = 0; i < 5; i++) {
      const res = await postPlan(input, ip);
      expect(res.status).toBe(200);
    }
    const blocked = await postPlan(input, ip);
    expect(blocked.status).toBe(429);
    const json = (await blocked.json()) as { error: { code: string } };
    expect(json.error.code).toBe("RATE_LIMITED");
    expect(blocked.headers.get("Retry-After")).not.toBeNull();
    const retryAfter = Number(blocked.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThan(0);
    // The LLM should NOT have been called for the blocked request
    expect(streamPlanCalls).toHaveLength(5);
  });

  it("does not rate-limit a different IP", async () => {
    const input = validInput("wedding");
    const ipA = "10.0.0.10";
    const ipB = "10.0.0.11";
    for (let i = 0; i < 5; i++) {
      await postPlan(input, ipA);
    }
    // ipA is now limited
    expect((await postPlan(input, ipA)).status).toBe(429);
    // ipB still allowed
    expect((await postPlan(input, ipB)).status).toBe(200);
  });
});
