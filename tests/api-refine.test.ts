/**
 * tests/api-refine.test.ts
 *
 * Route-level tests for POST /api/refine (P3-T06).
 *
 * Strategy:
 * - Mock `@/lib/ai` so generateStructured never touches the network.
 * - `@/lib/prompts` and `@/lib/schema` are NOT mocked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerateStructuredOptions } from "@/lib/ai";
import { refineSystemPromptFor, REFINE_RULES } from "@/lib/prompts";
import type { EventType } from "@/lib/schema";
import type { RefineResult } from "@/lib/schema";
import { resetRateLimitStore } from "@/lib/ratelimit";

// ─── Mock lib/ai ────────────────────────────────────────────────────────────

type CapturedCall = GenerateStructuredOptions<unknown>;
const generateStructuredCalls: CapturedCall[] = [];

// Default stub result
let stubResult: RefineResult = {
  plan: makePlan(),
  changeSummary: "No changes made.",
};

vi.mock("@/lib/ai", () => ({
  generateStructured: (options: CapturedCall) => {
    generateStructuredCalls.push(options);
    return Promise.resolve({ object: stubResult });
  },
  MAX_OUTPUT_TOKENS: { plan: 4000, refine: 4500, email: 600 },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makePlan() {
  return {
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
      priority: "medium" as const,
    })),
    vendors: Array.from({ length: 3 }, (_, i) => ({
      type: `Vendor ${i}`,
      checklist: ["a", "b", "c"],
      budgetRange: "10k-20k",
    })),
    ideas: Array.from({ length: 4 }, (_, i) => ({
      title: `Idea ${i}`,
      description: "desc",
    })),
  };
}

function validInput(eventType: EventType = "wedding") {
  return {
    eventType,
    date: "2099-06-15",
    guestCount: 100,
    totalBudget: 100000,
    currency: "INR",
    city: "Mumbai",
  };
}

async function postRefine(body: unknown, ip = "127.0.0.1"): Promise<Response> {
  const { POST } = await import("@/app/api/refine/route");
  const req = new Request("http://localhost/api/refine", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return POST(req);
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  generateStructuredCalls.length = 0;
  stubResult = { plan: makePlan(), changeSummary: "No changes made." };
  resetRateLimitStore();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/refine — bad body", () => {
  it("returns 400 on malformed JSON", async () => {
    const res = await postRefine("{ bad json");
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("INVALID_INPUT");
    expect(generateStructuredCalls).toHaveLength(0);
  });

  it("returns 400 when message is missing", async () => {
    const res = await postRefine({
      plan: makePlan(),
      eventInput: validInput(),
      // message is missing
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("INVALID_INPUT");
  });

  it("returns 400 when message is empty string", async () => {
    const res = await postRefine({
      plan: makePlan(),
      message: "",
      eventInput: validInput(),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when message exceeds 500 chars", async () => {
    const res = await postRefine({
      plan: makePlan(),
      message: "a".repeat(501),
      eventInput: validInput(),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when plan is missing required fields", async () => {
    const res = await postRefine({
      plan: { summary: "oops" }, // incomplete
      message: "Make it cheaper",
      eventInput: validInput(),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/refine — success", () => {
  it("calls generateStructured with the refine system prompt (includes REFINE_RULES)", async () => {
    const res = await postRefine({
      plan: makePlan(),
      message: "Make it cheaper",
      eventInput: validInput("wedding"),
    });

    expect(res.status).toBe(200);
    expect(generateStructuredCalls).toHaveLength(1);

    const passedSystem = generateStructuredCalls[0].system;
    expect(passedSystem).toBe(refineSystemPromptFor("wedding"));
    expect(passedSystem).toContain(REFINE_RULES);
  });

  it("system prompt matches the correct event type", async () => {
    for (const eventType of ["wedding", "birthday", "community"] as const) {
      generateStructuredCalls.length = 0;
      const res = await postRefine({
        plan: makePlan(),
        message: "Add a DJ",
        eventInput: validInput(eventType),
      });
      expect(res.status).toBe(200);
      expect(generateStructuredCalls[0].system).toBe(refineSystemPromptFor(eventType));
    }
  });

  it("truncates history to the last 6 messages", async () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `message ${i}`,
      at: new Date().toISOString(),
    }));

    await postRefine({
      plan: makePlan(),
      message: "Add DJ",
      eventInput: validInput(),
      history,
    });

    const prompt = generateStructuredCalls[0].prompt as string;
    // The last 6 messages (indices 4–9) should appear; earlier ones should not
    expect(prompt).toContain("message 4");
    expect(prompt).toContain("message 9");
    expect(prompt).not.toContain("message 0");
    expect(prompt).not.toContain("message 3");
  });

  it("returns a response matching RefineResultSchema shape", async () => {
    const res = await postRefine({
      plan: makePlan(),
      message: "Make it cheaper",
      eventInput: validInput(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as RefineResult;
    expect(typeof body.changeSummary).toBe("string");
    expect(body.plan).toBeDefined();
    expect(Array.isArray(body.plan.budget)).toBe(true);
  });

  it("wraps the user message in <user_input> tags in the prompt", async () => {
    await postRefine({
      plan: makePlan(),
      message: "Add a photographer",
      eventInput: validInput(),
    });

    const prompt = generateStructuredCalls[0].prompt as string;
    expect(prompt).toContain("<user_input>");
    expect(prompt).toContain("Add a photographer");
    expect(prompt).toContain("</user_input>");
  });
});

describe("POST /api/refine — rate limiting", () => {
  it("allows 20 requests and blocks the 21st with 429 + Retry-After", async () => {
    const body = { plan: makePlan(), message: "Add a DJ", eventInput: validInput() };
    const ip = "192.168.2.1";
    for (let i = 0; i < 20; i++) {
      const res = await postRefine(body, ip);
      expect(res.status).toBe(200);
    }
    const blocked = await postRefine(body, ip);
    expect(blocked.status).toBe(429);
    const json = (await blocked.json()) as { error: { code: string } };
    expect(json.error.code).toBe("RATE_LIMITED");
    const retryAfter = Number(blocked.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(generateStructuredCalls).toHaveLength(20);
  });
});
