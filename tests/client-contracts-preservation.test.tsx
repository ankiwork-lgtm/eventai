/**
 * tests/client-contracts-preservation.test.tsx
 * Stage 3.2 — Preservation (Property 3: Preservation).
 *
 * Written against UNFIXED code: these tests must PASS before and after Stage 3.
 * Covers the refine, email and mood board success/hidden paths. The "last 6
 * messages" rule is already covered by tests/chat-refiner-history.test.tsx.
 *
 * Validates: Requirements 3.2, 3.7, 3.10
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { ChatRefiner } from "@/components/ChatRefiner";
import { EmailDialog } from "@/components/EmailDialog";
import { MoodBoard } from "@/components/MoodBoard";
import type { StoredPlan } from "@/lib/types";
import type { EventInput, Plan } from "@/lib/schema";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const input = {
  eventType: "wedding",
  date: "2099-06-15",
  guestCount: 100,
  totalBudget: 100000,
  currency: "INR",
  city: "Mumbai",
} as EventInput;

function makePlan(summary: string): Plan {
  return {
    summary,
    budget: ["Venue", "Catering", "Decor", "Music"].map((category) => ({
      category,
      percent: 25,
      estimatedCost: 25000,
      tips: "Book early.",
    })),
    // Fixture edit (task 3.4): the refine result is now validated against PlanSchema
    // (timeline >= 6, vendors >= 3), as the server already does. Assertions unchanged.
    timeline: Array.from({ length: 6 }, (_, i) => ({
      when: `${i + 1} months before`,
      task: `Task ${i + 1}`,
      priority: "medium",
    })),
    vendors: ["Venue", "Caterer", "Decorator"].map((type) => ({
      type,
      checklist: ["Ask for quote", "Check availability", "Sign contract"],
      budgetRange: "10000-20000",
    })),
    ideas: [],
  } as unknown as Plan;
}

function makeRecord(extra: Partial<StoredPlan> = {}): StoredPlan {
  return {
    id: "test-id",
    createdAt: "2099-01-01T00:00:00.000Z",
    updatedAt: "2099-01-01T00:00:00.000Z",
    input,
    plan: makePlan("Original plan."),
    progress: { timeline: {}, vendors: {} },
    chat: [],
    version: 1,
    ...extra,
  } as unknown as StoredPlan;
}

describe("Preservation: ChatRefiner success path", () => {
  it("applies a valid refine result, keeps a snapshot, and posts the message", async () => {
    const result = { changeSummary: "Trimmed the budget.", plan: makePlan("Cheaper plan.") };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(result), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const onRecordChange = vi.fn();
    const record = makeRecord();

    render(<ChatRefiner record={record} onRecordChange={onRecordChange} isStreaming={false} />);
    await userEvent.type(screen.getAllByLabelText("Refine message")[0], "Make it cheaper");
    await userEvent.click(screen.getAllByRole("button", { name: "Send" })[0]);

    await waitFor(() => expect(onRecordChange).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/refine");
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.message).toBe("Make it cheaper");
    expect(sent.plan.summary).toBe("Original plan.");

    const next = onRecordChange.mock.calls[0][0] as StoredPlan;
    expect(next.plan?.summary).toBe("Cheaper plan.");
    expect(next.lastSnapshot?.plan?.summary).toBe("Original plan.");
    expect(next.chat.map((m) => [m.role, m.content])).toEqual([
      ["user", "Make it cheaper"],
      ["assistant", "Trimmed the budget."],
    ]);
  });

  it("Undo restores the snapshot and appends the revert bubble", async () => {
    const original = makeRecord();
    const refined = makeRecord({
      plan: makePlan("Cheaper plan."),
      chat: [
        { role: "user", content: "Make it cheaper", at: "2099-01-02T00:00:00.000Z" },
        { role: "assistant", content: "Trimmed the budget.", at: "2099-01-02T00:00:01.000Z" },
      ],
      lastSnapshot: { plan: original.plan, input: original.input, progress: original.progress },
    });
    const onRecordChange = vi.fn();

    render(<ChatRefiner record={refined} onRecordChange={onRecordChange} isStreaming={false} />);
    await userEvent.click(screen.getAllByRole("button", { name: /^Undo/ })[0]);

    expect(onRecordChange).toHaveBeenCalledTimes(1);
    const next = onRecordChange.mock.calls[0][0] as StoredPlan;
    expect(next.plan?.summary).toBe("Original plan.");
    expect(next.lastSnapshot).toBeUndefined();
    expect(next.chat.at(-1)).toMatchObject({
      role: "assistant",
      content: "Reverted to the previous plan.",
    });
  });

  it("limits the message input to 500 characters", () => {
    render(<ChatRefiner record={makeRecord()} onRecordChange={() => {}} isStreaming={false} />);
    const box = screen.getAllByLabelText("Refine message")[0] as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "a".repeat(600) } });
    expect(box.value).toHaveLength(500);
    expect(screen.getAllByText("500/500").length).toBeGreaterThan(0);
  });
});

describe("Preservation: EmailDialog success path", () => {
  it("posts the request, fills subject/body, and copies 'Subject: …' text", async () => {
    const draft = { subject: "Inquiry for Caterer", body: "Hello, we need catering." };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(draft), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const plan = makePlan("Original plan.");

    render(
      <EmailDialog open onOpenChange={() => {}} vendorType="Caterer" eventInput={input} plan={plan} />,
    );

    await waitFor(() =>
      expect((screen.getByLabelText("Subject") as HTMLInputElement).value).toBe(draft.subject),
    );
    expect((screen.getByLabelText("Email Body") as HTMLTextAreaElement).value).toBe(draft.body);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/email");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      vendorType: "Caterer",
      eventInput: input,
      plan,
    });

    await user.click(screen.getByRole("button", { name: /Copy/ }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(`Subject: ${draft.subject}\n\n${draft.body}`),
    );
    await waitFor(() => expect(screen.getByText("Copied")).toBeTruthy());
  });
});

describe("Preservation: MoodBoard visibility and links", () => {
  const moodInput = { ...input, theme: "garden" } as EventInput;

  it("stays hidden when the server returns an empty array (no key)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("[]", { status: 200 })));
    const { container } = render(<MoodBoard input={moodInput} />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container.querySelector("section")).toBeNull();
  });

  it("stays hidden on a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 500 })));
    const { container } = render(<MoodBoard input={moodInput} />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container.querySelector("section")).toBeNull();
  });

  it("stays hidden when the request rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const { container } = render(<MoodBoard input={moodInput} />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container.querySelector("section")).toBeNull();
  });

  it("renders server images with credit links that open safely", async () => {
    const images = [
      {
        url: "https://images.unsplash.com/a",
        alt: "Fairy lights",
        credit: "Ananya",
        link: "https://unsplash.com/@a?utm_source=eventai",
      },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(images), { status: 200 })));
    const { container } = render(<MoodBoard input={moodInput} />);

    await waitFor(() => expect(container.querySelector("section")).not.toBeNull());
    expect(container.querySelector("img")?.getAttribute("src")).toBe(images[0].url);
    const a = screen.getByRole("link", { name: "Ananya" });
    expect(a.getAttribute("href")).toBe(images[0].link);
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
  });
});

describe("Preservation: /api/moodboard keeps only https image and credit links", () => {
  it("drops results whose image or credit link is not https", async () => {
    const original = process.env.UNSPLASH_ACCESS_KEY;
    process.env.UNSPLASH_ACCESS_KEY = "mock-key";
    const user = (name: string, html: string) => ({ name, links: { html } });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [
            { urls: { small: "https://images.unsplash.com/ok" }, user: user("Good", "https://unsplash.com/@g") },
            { urls: { small: "http://images.unsplash.com/insecure" }, user: user("BadImg", "https://unsplash.com/@b") },
            { urls: { small: "https://images.unsplash.com/x" }, user: user("BadLink", "http://unsplash.com/@c") },
            { urls: { small: "javascript:alert(1)" }, user: user("Js", "https://unsplash.com/@d") },
          ],
        }),
    } as unknown as Response);

    try {
      const { GET } = await import("@/app/api/moodboard/route");
      const res = await GET(
        new Request("http://localhost/api/moodboard?q=garden", {
          headers: { "x-real-ip": "198.51.100.31" },
        }),
      );
      const data = (await res.json()) as { url: string; credit: string; link: string }[];
      expect(res.status).toBe(200);
      expect(data.map((d) => d.credit)).toEqual(["Good"]);
      expect(data[0].url.startsWith("https://")).toBe(true);
      expect(data[0].link.startsWith("https://")).toBe(true);
    } finally {
      if (original === undefined) delete process.env.UNSPLASH_ACCESS_KEY;
      else process.env.UNSPLASH_ACCESS_KEY = original;
    }
  });
});
