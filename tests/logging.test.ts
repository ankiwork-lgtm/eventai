/**
 * tests/logging.test.ts (P5-T06, TDD §13)
 *
 * Verifies structured observability logging across all three LLM routes:
 * 1. POST /api/plan
 * 2. POST /api/refine
 * 3. POST /api/email
 *
 * Requirements:
 * - Exactly one structured line per LLM call.
 * - Exact keys: { route, eventType, latencyMs, inputTokens, outputTokens, ok }.
 * - No user free text (eventName, preferences, notes, message, vendorType, etc.) in any log.
 * - Handles success, error, and mid-stream abort/error.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatLlmLogLine, logLlmCall, type LlmLogLine } from "@/lib/observability";
import { resetRateLimitStore } from "@/lib/ratelimit";
import type { StreamPlanOptions, GenerateStructuredOptions } from "@/lib/ai";
import type { EventInput, Plan, RefineResult, EmailDraft } from "@/lib/schema";

const EXPECTED_KEYS = ["route", "eventType", "latencyMs", "inputTokens", "outputTokens", "ok"].sort();

// ─── Mock lib/ai ────────────────────────────────────────────────────────────

let streamPlanImpl: (opts: StreamPlanOptions) => unknown;
let generateStructuredImpl: (opts: GenerateStructuredOptions<unknown>) => Promise<unknown>;

vi.mock("@/lib/ai", () => ({
  streamPlan: (opts: StreamPlanOptions) => streamPlanImpl(opts),
  generateStructured: (opts: GenerateStructuredOptions<unknown>) => generateStructuredImpl(opts),
  MAX_OUTPUT_TOKENS: { plan: 4000, refine: 4500, email: 600 },
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeValidPlan(): Plan {
  return {
    summary: "Royal celebration in Mumbai.",
    budget: [
      { category: "Venue", percent: 40, estimatedCost: 400000, tips: "Negotiate" },
      { category: "Catering", percent: 30, estimatedCost: 300000, tips: "Buffet" },
      { category: "Decor", percent: 20, estimatedCost: 200000, tips: "Floral" },
      { category: "Misc", percent: 10, estimatedCost: 100000, tips: "Buffer" },
    ],
    timeline: [
      { when: "6 months before", task: "Book venue", priority: "high" },
      { when: "4 months before", task: "Hire catering", priority: "medium" },
      { when: "2 months before", task: "Tasting session", priority: "medium" },
      { when: "1 month before", task: "Final guest list", priority: "high" },
      { when: "1 week before", task: "Confirm delivery", priority: "high" },
      { when: "1 day after", task: "Settlement", priority: "low" },
    ],
    vendors: [
      { type: "Catering", checklist: ["Menu tasting", "Dietary needs", "Service staff"], budgetRange: "3L - 4L" },
      { type: "Photography", checklist: ["Portfolio review", "Drone shots", "Album package"], budgetRange: "1.5L - 2L" },
      { type: "Decor", checklist: ["Mandap design", "Lighting setup", "Floral arrangements"], budgetRange: "2L - 3L" },
    ],
    ideas: [
      { title: "Idea 1", description: "Desc 1" },
      { title: "Idea 2", description: "Desc 2" },
      { title: "Idea 3", description: "Desc 3" },
      { title: "Idea 4", description: "Desc 4" },
    ],
  };
}

// ─── Observability Unit Tests ────────────────────────────────────────────────

describe("lib/observability — formatLlmLogLine & logLlmCall", () => {
  it("formats log line with exactly the 6 required keys", () => {
    const line = formatLlmLogLine({
      route: "plan",
      eventType: "wedding",
      latencyMs: 142.6,
      usage: { inputTokens: 500, outputTokens: 1200 },
      ok: true,
    });

    expect(Object.keys(line).sort()).toEqual(EXPECTED_KEYS);
    expect(line).toEqual({
      route: "plan",
      eventType: "wedding",
      latencyMs: 143,
      inputTokens: 500,
      outputTokens: 1200,
      ok: true,
    });
  });

  it("handles null / missing token usage gracefully", () => {
    const line = formatLlmLogLine({
      route: "refine",
      eventType: "birthday",
      latencyMs: 50,
      ok: false,
    });

    expect(Object.keys(line).sort()).toEqual(EXPECTED_KEYS);
    expect(line).toEqual({
      route: "refine",
      eventType: "birthday",
      latencyMs: 50,
      inputTokens: null,
      outputTokens: null,
      ok: false,
    });
  });

  it("emits valid JSON to console.log", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logLlmCall({
      route: "email",
      eventType: "community",
      latencyMs: 80,
      inputTokens: 150,
      outputTokens: 40,
      ok: true,
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const loggedStr = spy.mock.calls[0][0];
    const parsed = JSON.parse(loggedStr);
    expect(Object.keys(parsed).sort()).toEqual(EXPECTED_KEYS);
    expect(parsed.route).toBe("email");
    expect(parsed.ok).toBe(true);
    spy.mockRestore();
  });
});

// ─── Route Logging Integration Tests ─────────────────────────────────────────

describe("LLM Routes Structured Logging (Observability finish)", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let capturedLogs: LlmLogLine[] = [];
  let rawConsoleOutput: string[] = [];

  beforeEach(() => {
    resetRateLimitStore();
    capturedLogs = [];
    rawConsoleOutput = [];
    consoleSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      const msg = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
      rawConsoleOutput.push(msg);
      try {
        const parsed = JSON.parse(msg);
        capturedLogs.push(parsed);
      } catch {
        // Not a JSON log
      }
    });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    vi.restoreAllMocks();
  });

  // ── Plan Route Logging ────────────────────────────────────────────────────
  describe("POST /api/plan logging", () => {
    const SECRET_TEXT_1 = "SUPER_SECRET_WEDDING_CELEBRATION_NAME_999";
    const SECRET_TEXT_2 = "CONFIDENTIAL_FAMILY_TRADITION_DETAILS_888";

    function makePlanInput(): EventInput {
      return {
        eventType: "wedding",
        name: SECRET_TEXT_1,
        culturalTraditions: SECRET_TEXT_2,
        date: "2099-06-15",
        guestCount: 150,
        totalBudget: 800000,
        currency: "INR",
        city: "Mumbai",
      };
    }

    it("logs exactly one structured line on success with exact keys and no free text", async () => {
      streamPlanImpl = (opts: StreamPlanOptions) => {
        if (opts.onFinish) {
          opts.onFinish({
            usage: { inputTokens: 450, outputTokens: 2100 },
            object: makeValidPlan(),
            error: undefined,
          });
        }
        return {
          toTextStreamResponse: () =>
            new Response("{}", {
              status: 200,
              headers: { "content-type": "text/plain; charset=utf-8" },
            }),
        };
      };

      const { POST } = await import("@/app/api/plan/route");
      const req = new Request("http://localhost/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(makePlanInput()),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      expect(capturedLogs).toHaveLength(1);
      const log = capturedLogs[0];
      expect(Object.keys(log).sort()).toEqual(EXPECTED_KEYS);
      expect(log.route).toBe("plan");
      expect(log.eventType).toBe("wedding");
      expect(log.ok).toBe(true);
      expect(log.inputTokens).toBe(450);
      expect(log.outputTokens).toBe(2100);
      expect(typeof log.latencyMs).toBe("number");

      for (const raw of rawConsoleOutput) {
        expect(raw).not.toContain(SECRET_TEXT_1);
        expect(raw).not.toContain(SECRET_TEXT_2);
      }
    });

    it("logs ok:false on mid-stream error or abort with exact keys", async () => {
      streamPlanImpl = (opts: StreamPlanOptions) => {
        if (opts.onFinish) {
          opts.onFinish({
            usage: { inputTokens: 200, outputTokens: 50 },
            object: undefined,
            error: new Error("Stream aborted by client"),
          });
        }
        return {
          toTextStreamResponse: () =>
            new Response("{}", {
              status: 200,
              headers: { "content-type": "text/plain; charset=utf-8" },
            }),
        };
      };

      const { POST } = await import("@/app/api/plan/route");
      const req = new Request("http://localhost/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(makePlanInput()),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      expect(capturedLogs).toHaveLength(1);
      const log = capturedLogs[0];
      expect(Object.keys(log).sort()).toEqual(EXPECTED_KEYS);
      expect(log.route).toBe("plan");
      expect(log.ok).toBe(false);
      expect(log.inputTokens).toBe(200);
      expect(log.outputTokens).toBe(50);
    });

    it("logs ok:false on synchronous LLM provider setup error", async () => {
      streamPlanImpl = () => {
        throw new Error("Anthropic API connection error");
      };

      const { POST } = await import("@/app/api/plan/route");
      const req = new Request("http://localhost/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(makePlanInput()),
      });

      const res = await POST(req);
      expect(res.status).toBe(502);

      expect(capturedLogs).toHaveLength(1);
      const log = capturedLogs[0];
      expect(Object.keys(log).sort()).toEqual(EXPECTED_KEYS);
      expect(log.route).toBe("plan");
      expect(log.ok).toBe(false);
      expect(log.inputTokens).toBeNull();
      expect(log.outputTokens).toBeNull();
    });

    it("does not log LLM calls on 400 validation error", async () => {
      const { POST } = await import("@/app/api/plan/route");
      const req = new Request("http://localhost/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventType: "wedding", guestCount: -5 }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      expect(capturedLogs).toHaveLength(0);
    });
  });

  // ── Refine Route Logging ──────────────────────────────────────────────────
  describe("POST /api/refine logging", () => {
    const SECRET_MESSAGE = "SECRET_USER_PROMPT_CUT_EXPENSES_999";

    function makeRefinePayload() {
      return {
        plan: makeValidPlan(),
        message: SECRET_MESSAGE,
        eventInput: {
          eventType: "birthday" as const,
          date: "2099-06-15",
          guestCount: 30,
          totalBudget: 100000,
          currency: "INR",
          city: "Pune",
        },
      };
    }

    it("logs exactly one structured line on success with tokens and no user message", async () => {
      generateStructuredImpl = () =>
        Promise.resolve({
          object: {
            plan: makeValidPlan(),
            changeSummary: "Updated",
          } as RefineResult,
          usage: { inputTokens: 800, outputTokens: 1500 },
        });

      const { POST } = await import("@/app/api/refine/route");
      const req = new Request("http://localhost/api/refine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(makeRefinePayload()),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      expect(capturedLogs).toHaveLength(1);
      const log = capturedLogs[0];
      expect(Object.keys(log).sort()).toEqual(EXPECTED_KEYS);
      expect(log.route).toBe("refine");
      expect(log.eventType).toBe("birthday");
      expect(log.ok).toBe(true);
      expect(log.inputTokens).toBe(800);
      expect(log.outputTokens).toBe(1500);

      for (const raw of rawConsoleOutput) {
        expect(raw).not.toContain(SECRET_MESSAGE);
      }
    });

    it("logs ok:false on provider error without leaking free text", async () => {
      generateStructuredImpl = () =>
        Promise.reject(new Error("Anthropic 503 Provider unavailable"));

      const { POST } = await import("@/app/api/refine/route");
      const req = new Request("http://localhost/api/refine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(makeRefinePayload()),
      });

      const res = await POST(req);
      expect(res.status).toBe(502);

      expect(capturedLogs).toHaveLength(1);
      const log = capturedLogs[0];
      expect(Object.keys(log).sort()).toEqual(EXPECTED_KEYS);
      expect(log.route).toBe("refine");
      expect(log.ok).toBe(false);
      expect(log.inputTokens).toBeNull();
      expect(log.outputTokens).toBeNull();

      for (const raw of rawConsoleOutput) {
        expect(raw).not.toContain(SECRET_MESSAGE);
      }
    });
  });

  // ── Email Route Logging ───────────────────────────────────────────────────
  describe("POST /api/email logging", () => {
    const SECRET_CLIENT_NAME = "SECRET_PERSON_NAME_777";

    function makeEmailPayload() {
      return {
        vendorType: "Catering",
        eventInput: {
          eventType: "community" as const,
          name: SECRET_CLIENT_NAME,
          date: "2099-06-15",
          guestCount: 200,
          totalBudget: 50000,
          currency: "INR",
          city: "Pune",
        },
        plan: makeValidPlan(),
      };
    }

    it("logs exactly one structured line without vendorType or IP or client name", async () => {
      generateStructuredImpl = () =>
        Promise.resolve({
          object: {
            subject: "Inquiry",
            body: "Hello",
          } as EmailDraft,
          usage: { inputTokens: 300, outputTokens: 120 },
        });

      const { POST } = await import("@/app/api/email/route");
      const req = new Request("http://localhost/api/email", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
        body: JSON.stringify(makeEmailPayload()),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      expect(capturedLogs).toHaveLength(1);
      const log = capturedLogs[0];
      expect(Object.keys(log).sort()).toEqual(EXPECTED_KEYS);
      expect(log.route).toBe("email");
      expect(log.eventType).toBe("community");
      expect(log.ok).toBe(true);
      expect(log.inputTokens).toBe(300);
      expect(log.outputTokens).toBe(120);

      // Verify no extra keys like vendorType or ip exist in the log
      expect((log as Record<string, unknown>).vendorType).toBeUndefined();
      expect((log as Record<string, unknown>).ip).toBeUndefined();

      for (const raw of rawConsoleOutput) {
        expect(raw).not.toContain(SECRET_CLIENT_NAME);
      }
    });

    it("logs ok:false on error with exact 6 keys", async () => {
      generateStructuredImpl = () =>
        Promise.reject(new Error("Anthropic fetch failed"));

      const { POST } = await import("@/app/api/email/route");
      const req = new Request("http://localhost/api/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(makeEmailPayload()),
      });

      const res = await POST(req);
      expect(res.status).toBe(502);

      expect(capturedLogs).toHaveLength(1);
      const log = capturedLogs[0];
      expect(Object.keys(log).sort()).toEqual(EXPECTED_KEYS);
      expect(log.route).toBe("email");
      expect(log.ok).toBe(false);
      expect(log.inputTokens).toBeNull();
      expect(log.outputTokens).toBeNull();
    });
  });
});
