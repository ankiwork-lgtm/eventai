/**
 * tests/client-contracts-bug.test.tsx
 * Stage 3.1 — Bug condition exploration (Property 1: Bug Condition).
 *
 * Written against UNFIXED code: these tests are EXPECTED TO FAIL until Stage 3
 * lands. Counterexamples are documented in each test.
 *
 * Validates: Requirements 1.8, 1.12, 2.8, 2.12, 2.19
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
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
});

const input: EventInput = {
  eventType: "wedding",
  date: "2099-06-15",
  guestCount: 100,
  totalBudget: 100000,
  currency: "INR",
  city: "Mumbai",
} as EventInput;

const plan = {
  summary: "Test event.",
  budget: [],
  timeline: [],
  vendors: [],
  ideas: [],
} as unknown as Plan;

function makeRecord(): StoredPlan {
  return {
    id: "test-id",
    createdAt: "2099-01-01T00:00:00.000Z",
    updatedAt: "2099-01-01T00:00:00.000Z",
    input,
    plan,
    progress: { timeline: {}, vendors: {} },
    chat: [],
    version: 1,
  } as unknown as StoredPlan;
}

function envelope429(message: string, retryAfter: string) {
  return new Response(
    JSON.stringify({ error: { code: "RATE_LIMITED", message } }),
    { status: 429, headers: { "Retry-After": retryAfter, "content-type": "application/json" } },
  );
}

async function sendRefine(onRecordChange = vi.fn()) {
  render(<ChatRefiner record={makeRecord()} onRecordChange={onRecordChange} isStreaming={false} />);
  await userEvent.type(screen.getAllByLabelText("Refine message")[0], "Make it cheaper");
  await userEvent.click(screen.getAllByRole("button", { name: "Send" })[0]);
  return onRecordChange;
}

describe("Bug condition: ChatRefiner network JSON", () => {
  it("rejects a 200 response with the wrong shape without applying it", async () => {
    // Counterexample: body `{"unexpected":true}` is cast to RefineResult and applied.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ unexpected: true }), { status: 200 }),
      ),
    );
    const onRecordChange = await sendRefine();

    await waitFor(() =>
      expect(screen.getAllByText("Something went wrong. Please try again.").length).toBeGreaterThan(0),
    );
    expect(onRecordChange).not.toHaveBeenCalled();
  });

  it("rejects a 200 response with a wrong-typed changeSummary", async () => {
    // Counterexample: {"changeSummary": 42, "plan": "nope"} is cast and applied.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ changeSummary: 42, plan: "nope" }), { status: 200 }),
      ),
    );
    const onRecordChange = await sendRefine();

    await waitFor(() =>
      expect(screen.getAllByText("Something went wrong. Please try again.").length).toBeGreaterThan(0),
    );
    expect(onRecordChange).not.toHaveBeenCalled();
  });

  it("handles a non-JSON 200 body with the generic error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>oops</html>", { status: 200 })),
    );
    const onRecordChange = await sendRefine();

    await waitFor(() =>
      expect(screen.getAllByText("Something went wrong. Please try again.").length).toBeGreaterThan(0),
    );
    expect(onRecordChange).not.toHaveBeenCalled();
  });
});

describe("Bug condition: ChatRefiner 429 envelope", () => {
  it("shows the server message and retry seconds, not a generic message", async () => {
    // Counterexample: 429 + envelope + Retry-After: 17 renders the hard-coded
    // "Rate limited — please wait and try again." with no seconds.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(envelope429("Slow down for the refine endpoint.", "17")),
    );
    await sendRefine();

    await waitFor(() => expect(screen.getAllByText(/17/).length).toBeGreaterThan(0));
    expect(screen.queryAllByText(/Server error 429/).length).toBe(0);
  });

  it("does not surface 'Server error <status>' for a non-429 envelope error", async () => {
    // Counterexample: 500 + envelope message is discarded in favour of "Server error 500".
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: "INTERNAL", message: "Refine service unavailable" } }),
          { status: 500 },
        ),
      ),
    );
    await sendRefine();

    await waitFor(() =>
      expect(screen.getAllByText(/Refine service unavailable/).length).toBeGreaterThan(0),
    );
  });
});

describe("Bug condition: MoodBoard network JSON", () => {
  const moodInput = { ...input, theme: "garden" } as EventInput;

  it("does not crash and stays hidden for non-array JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ not: "an array" }), { status: 200 })),
    );
    const { container } = render(<MoodBoard input={moodInput} />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container.querySelector("section")).toBeNull();
  });

  it("skips malformed items instead of rendering them", async () => {
    // Counterexample: [{}, null-ish, {url:"javascript:..."}] passes Array.isArray
    // and is stored; items missing url/link are rendered (or crash on null).
    const bad = [
      { url: "https://images.unsplash.com/ok", alt: "ok", credit: "A", link: "https://unsplash.com/a" },
      { url: 42, alt: null, credit: {}, link: "javascript:alert(1)" },
      {},
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(bad), { status: 200 })),
    );
    const { container } = render(<MoodBoard input={moodInput} />);

    await waitFor(() => expect(container.querySelector("section")).not.toBeNull());
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
  });

  it("handles null items in the array without a render crash", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify([null, 1, "x"]), { status: 200 })),
    );
    const { container } = render(<MoodBoard input={moodInput} />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    // Expected: no valid images, section hidden.
    await waitFor(() => expect(container.querySelector("section")).toBeNull());
  });
});

describe("Bug condition: EmailDialog", () => {
  it("shows a loading indicator while the first fetch is pending", async () => {
    // Counterexample: `loading` starts false and the effect never sets it true,
    // so the editable form renders while the request is in flight.
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    render(
      <EmailDialog open onOpenChange={() => {}} vendorType="Caterer" eventInput={input} plan={plan} />,
    );

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.getByText(/Drafting email/i)).toBeTruthy();
  });

  it("shows error.message from the server envelope", async () => {
    // Counterexample: effect path throws `Failed to generate email (502)` and
    // ignores the envelope message.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: "UPSTREAM", message: "Email model is overloaded" } }),
          { status: 502 },
        ),
      ),
    );
    render(
      <EmailDialog open onOpenChange={() => {}} vendorType="Caterer" eventInput={input} plan={plan} />,
    );

    await waitFor(() => expect(screen.getByText(/Email model is overloaded/)).toBeTruthy());
  });
});
