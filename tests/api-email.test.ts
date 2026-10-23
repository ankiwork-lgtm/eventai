/**
 * tests/api-email.test.ts (P4-T07)
 *
 * Route-level tests for POST /api/email.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerateStructuredOptions } from "@/lib/ai";
import { EMAIL_SYSTEM_PROMPT } from "@/lib/prompts";
import type { EmailDraft, EventInput, Plan } from "@/lib/schema";
import { resetRateLimitStore } from "@/lib/ratelimit";

type CapturedCall = GenerateStructuredOptions<unknown>;
const generateStructuredCalls: CapturedCall[] = [];

let stubResult: EmailDraft = {
  subject: "Inquiry for Wedding on 15 Jun 2026",
  body: "Dear Catering Team,\n\nWe are organizing a wedding in Mumbai on 15 Jun 2026 for 100 guests.\n\nBest regards,\n[Your Name]\n[Your Phone]",
};

vi.mock("@/lib/ai", () => ({
  generateStructured: (options: CapturedCall) => {
    generateStructuredCalls.push(options);
    return Promise.resolve({ object: stubResult });
  },
  MAX_OUTPUT_TOKENS: { plan: 4000, refine: 4500, email: 600 },
}));

function makePlan(): Plan {
  return {
    summary: "Royal celebration in Mumbai.",
    budget: [
      { category: "Catering", percent: 40, estimatedCost: 400000, tips: "Tasting session" },
      { category: "Photography", percent: 20, estimatedCost: 200000, tips: "Book drone" },
      { category: "Decor", percent: 25, estimatedCost: 250000, tips: "Floral" },
      { category: "Music", percent: 15, estimatedCost: 150000, tips: "DJ" },
    ],
    timeline: [
      { when: "6 months before", task: "Book venue", priority: "high" },
      { when: "4 months before", task: "Hire photographer", priority: "medium" },
      { when: "2 months before", task: "Tasting session", priority: "medium" },
      { when: "1 month before", task: "Final guest list", priority: "high" },
      { when: "1 week before", task: "Confirm delivery", priority: "high" },
      { when: "1 day after", task: "Settlement", priority: "low" },
    ],
    vendors: [
      {
        type: "Catering",
        checklist: ["Menu tasting", "Dietary requirements", "Service staff"],
        budgetRange: "3.5L - 4.5L",
      },
      {
        type: "Photography",
        checklist: ["Portfolio review", "Drone shots", "Album package"],
        budgetRange: "1.8L - 2.2L",
      },
      {
        type: "Decor",
        checklist: ["Mandap design", "Lighting setup", "Floral arrangements"],
        budgetRange: "2L - 3L",
      },
    ],
    ideas: [
      { title: "Theme 1", description: "Desc 1" },
      { title: "Theme 2", description: "Desc 2" },
      { title: "Theme 3", description: "Desc 3" },
      { title: "Theme 4", description: "Desc 4" },
    ],
  };
}

function makeInput(): EventInput {
  return {
    eventType: "wedding",
    name: "Aarav & Meera",
    date: "2026-06-15",
    guestCount: 250,
    totalBudget: 1000000,
    currency: "INR",
    city: "Mumbai",
  };
}

async function postEmail(body: unknown, ip = "127.0.0.1"): Promise<Response> {
  const { POST } = await import("@/app/api/email/route");
  const req = new Request("http://localhost/api/email", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return POST(req);
}

beforeEach(() => {
  generateStructuredCalls.length = 0;
  stubResult = {
    subject: "Inquiry for Wedding on 15 Jun 2026",
    body: "Dear Catering Team,\n\nWe are organizing a wedding in Mumbai on 15 Jun 2026 for 100 guests.\n\nBest regards,\n[Your Name]\n[Your Phone]",
  };
  resetRateLimitStore();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/email — validation and error handling", () => {
  it("returns 400 on malformed body", async () => {
    const res = await postEmail("{ invalid json");
    expect(res.status).toBe(400);
    expect(generateStructuredCalls).toHaveLength(0);
  });

  it("returns 400 when vendorType is missing", async () => {
    const res = await postEmail({
      eventInput: makeInput(),
      plan: makePlan(),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("INVALID_INPUT");
  });

  it("returns 400 when vendorType does not exist in the plan", async () => {
    const res = await postEmail({
      vendorType: "Pyrotechnics & Fireworks",
      eventInput: makeInput(),
      plan: makePlan(),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("INVALID_INPUT");
    expect(data.error.message).toContain("not found in plan");
    expect(generateStructuredCalls).toHaveLength(0);
  });
});

describe("POST /api/email — prompt generation and LLM call", () => {
  it("sends only the matching vendor to the LLM prompt", async () => {
    const res = await postEmail({
      vendorType: "Catering",
      eventInput: makeInput(),
      plan: makePlan(),
    });

    expect(res.status).toBe(200);
    expect(generateStructuredCalls).toHaveLength(1);

    const call = generateStructuredCalls[0];
    expect(call.system).toBe(EMAIL_SYSTEM_PROMPT);
    expect(call.system).toContain("[Your Name]");
    expect(call.system).toContain("[Your Phone]");

    const prompt = call.prompt as string;
    expect(prompt).toContain("Catering");
    expect(prompt).toContain("Menu tasting");
    expect(prompt).toContain("Mumbai");
    expect(prompt).toContain("250"); // guestCount

    // Unrelated vendors should NOT be in the prompt's vendor checklist
    expect(prompt).not.toContain("Mandap design");
    expect(prompt).not.toContain("Drone shots");
  });

  it("returns the generated email draft object", async () => {
    const res = await postEmail({
      vendorType: "Photography",
      eventInput: makeInput(),
      plan: makePlan(),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as EmailDraft;
    expect(data.subject).toBe(stubResult.subject);
    expect(data.body).toBe(stubResult.body);
  });
});

describe("POST /api/email — rate limiting", () => {
  it("allows 20 requests and blocks the 21st with 429 + Retry-After", async () => {
    const body = { vendorType: "Catering", eventInput: makeInput(), plan: makePlan() };
    const ip = "192.168.3.1";
    for (let i = 0; i < 20; i++) {
      const res = await postEmail(body, ip);
      expect(res.status).toBe(200);
    }
    const blocked = await postEmail(body, ip);
    expect(blocked.status).toBe(429);
    const json = (await blocked.json()) as { error: { code: string } };
    expect(json.error.code).toBe("RATE_LIMITED");
    const retryAfter = Number(blocked.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(generateStructuredCalls).toHaveLength(20);
  });
});
