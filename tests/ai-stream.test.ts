/**
 * tests/ai-stream.test.ts
 *
 * Exercises the REAL `streamPlan` / `generateStructured` wrappers from lib/ai.ts
 * against the AI SDK's `MockLanguageModelV4` (no network). Other suites mock
 * `@/lib/ai` entirely, so this is the only place the wrappers themselves run.
 */

import { describe, it, expect, vi } from "vitest";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";
import { generateStructured, streamPlan } from "@/lib/ai";
import type { StreamPlanFinish } from "@/lib/ai";
import { PlanSchema } from "@/lib/schema";
import type { Plan } from "@/lib/schema";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const plan: Plan = {
  summary: "A lovely event.",
  budget: Array.from({ length: 4 }, (_, i) => ({
    category: `Cat ${i}`,
    percent: 25,
    estimatedCost: 1000,
    tips: "Save money",
  })),
  timeline: Array.from({ length: 6 }, (_, i) => ({
    when: `${i} months before`,
    monthsBefore: i,
    task: `Task ${i}`,
    priority: "high" as const,
  })),
  vendors: Array.from({ length: 3 }, (_, i) => ({
    type: `Vendor ${i}`,
    checklist: ["a", "b", "c"],
    budgetRange: "1-2k",
  })),
  ideas: [{ title: "Idea", description: "desc" }],
};

const USAGE = {
  inputTokens: { total: 11, noCache: 11, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 22, text: 22, reasoning: undefined },
};

type StreamPart = Awaited<ReturnType<MockLanguageModelV4["doStream"]>>["stream"] extends
  ReadableStream<infer P>
  ? P
  : never;

/** Splits `text` into text-delta chunks of `size` characters. */
function textStream(text: string, size = 25, finish = true): StreamPart[] {
  const chunks: StreamPart[] = [{ type: "text-start", id: "t" }];
  for (let i = 0; i < text.length; i += size) {
    chunks.push({ type: "text-delta", id: "t", delta: text.slice(i, i + size) });
  }
  chunks.push({ type: "text-end", id: "t" });
  if (finish) {
    chunks.push({
      type: "finish",
      finishReason: { unified: "stop", raw: "stop" },
      usage: USAGE,
    });
  }
  return chunks;
}

function mockModel(chunks: StreamPart[]) {
  return new MockLanguageModelV4({
    doStream: async () => ({ stream: simulateReadableStream({ chunks }) }),
  });
}

const baseOptions = { system: "sys", prompt: "prompt", maxRetries: 0 } as const;

// ─── streamPlan ───────────────────────────────────────────────────────────────

describe("streamPlan", () => {
  it("streams text that concatenates to the full plan JSON", async () => {
    const result = streamPlan({
      ...baseOptions,
      model: mockModel(textStream(JSON.stringify(plan))),
    });

    let text = "";
    for await (const chunk of result.textStream) text += chunk;

    expect(JSON.parse(text)).toEqual(plan);
  });

  it("emits parseable partial JSON prefixes as the stream progresses", async () => {
    const result = streamPlan({
      ...baseOptions,
      model: mockModel(textStream(JSON.stringify(plan), 40)),
    });

    const partials: unknown[] = [];
    for await (const partial of result.partialOutputStream) partials.push(partial);

    expect(partials.length).toBeGreaterThan(1);
    // Early partials are incomplete objects; the first one must not already be the full plan.
    expect(partials[0]).not.toEqual(plan);
    expect((partials[0] as Partial<Plan>).timeline).toBeUndefined();
    // Every partial is a plain object (never a thrown parse error on a truncated chunk).
    for (const p of partials) expect(typeof p).toBe("object");
    // Sections arrive in order: summary is present before timeline starts.
    const firstWithTimeline = partials.findIndex((p) => (p as Partial<Plan>).timeline);
    expect(firstWithTimeline).toBeGreaterThan(0);
    expect((partials[firstWithTimeline - 1] as Partial<Plan>).summary).toBe(plan.summary);
    // The stream converges on the complete plan.
    expect(partials[partials.length - 1]).toEqual(plan);
  });

  it("calls onFinish once with mapped usage, the final object and no error", async () => {
    const onFinish = vi.fn<(e: StreamPlanFinish) => void>();
    const result = streamPlan({
      ...baseOptions,
      model: mockModel(textStream(JSON.stringify(plan))),
      onFinish,
    });

    await result.consumeStream();

    expect(onFinish).toHaveBeenCalledTimes(1);
    const event = onFinish.mock.calls[0][0];
    expect(event.usage).toEqual({ inputTokens: 11, outputTokens: 22 });
    expect(event.object).toEqual(plan);
    expect(event.error).toBeUndefined();
  });

  it("does not require an onFinish callback", async () => {
    const result = streamPlan({
      ...baseOptions,
      model: mockModel(textStream(JSON.stringify(plan))),
    });

    await expect(result.consumeStream()).resolves.not.toThrow();
  });

  it("propagates the abort signal to the model call", async () => {
    const model = mockModel(textStream(JSON.stringify(plan)));
    const controller = new AbortController();

    const result = streamPlan({ ...baseOptions, model, abortSignal: controller.signal });
    await result.consumeStream();

    expect(model.doStreamCalls).toHaveLength(1);
    expect(model.doStreamCalls[0].abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("stops streaming and skips onFinish when aborted before the first chunk", async () => {
    const onFinish = vi.fn();
    const controller = new AbortController();
    controller.abort();

    const result = streamPlan({
      ...baseOptions,
      model: mockModel(textStream(JSON.stringify(plan))),
      abortSignal: controller.signal,
      onFinish,
    });

    let text = "";
    try {
      for await (const chunk of result.textStream) text += chunk;
    } catch {
      // An aborted stream may surface as a rejection; both outcomes are acceptable.
    }

    expect(text).toBe("");
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("reports a failed stream through onFinish with no object (route logs ok=false)", async () => {
    const onFinish = vi.fn<(e: StreamPlanFinish) => void>();
    const chunks: StreamPart[] = [
      { type: "text-start", id: "t" },
      { type: "text-delta", id: "t", delta: '{"summary":"par' },
      { type: "error", error: new Error("upstream exploded") },
    ];

    const result = streamPlan({
      ...baseOptions,
      model: mockModel(chunks),
      onFinish,
    });

    // Mid-stream failures surface as `error` parts on the full stream (DD-8).
    const errors: unknown[] = [];
    for await (const part of result.fullStream) {
      if (part.type === "error") errors.push(part.error);
    }

    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe("upstream exploded");

    // `streamPlan` always passes `error: undefined`, so callers (app/api/plan/route.ts)
    // detect failure via `object === undefined`.
    expect(onFinish).toHaveBeenCalledTimes(1);
    const event = onFinish.mock.calls[0][0];
    expect(event.object).toBeUndefined();
    expect(event.error).toBeUndefined();
  });

  it("passes system, prompt and an output-token cap to the model", async () => {
    const model = mockModel(textStream(JSON.stringify(plan)));

    await streamPlan({ ...baseOptions, system: "S-PROMPT", prompt: "U-PROMPT", model })
      .consumeStream();

    const call = model.doStreamCalls[0];
    expect(call.maxOutputTokens).toBeGreaterThan(0);
    const serialized = JSON.stringify(call.prompt);
    expect(serialized).toContain("S-PROMPT");
    expect(serialized).toContain("U-PROMPT");
  });

  it("honours a custom schema and maxOutputTokens override", async () => {
    const model = mockModel(textStream(JSON.stringify(plan)));

    await streamPlan({
      ...baseOptions,
      model,
      schema: PlanSchema,
      maxOutputTokens: 1234,
    }).consumeStream();

    expect(model.doStreamCalls[0].maxOutputTokens).toBe(1234);
  });
});

// ─── generateStructured ───────────────────────────────────────────────────────

describe("generateStructured", () => {
  const Schema = z.object({ title: z.string(), count: z.number() });

  function generateModel(text: string) {
    return new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [{ type: "text", text }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: USAGE,
        warnings: [],
      }),
    });
  }

  it("returns the parsed object and usage", async () => {
    const result = await generateStructured({
      schema: Schema,
      prompt: "p",
      system: "s",
      maxRetries: 0,
      maxOutputTokens: 1000,
      model: generateModel(JSON.stringify({ title: "Hi", count: 3 })),
    });

    expect(result.object).toEqual({ title: "Hi", count: 3 });
    expect(result.usage.inputTokens).toBe(11);
    expect(result.usage.outputTokens).toBe(22);
  });

  it("rejects when the model output does not satisfy the schema", async () => {
    await expect(
      generateStructured({
        schema: Schema,
        prompt: "p",
        maxRetries: 0,
        maxOutputTokens: 1000,
        model: generateModel(JSON.stringify({ title: 1 })),
      }),
    ).rejects.toThrow();
  });
});
