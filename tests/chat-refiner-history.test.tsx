/**
 * tests/chat-refiner-history.test.tsx
 * G1-T02 — ChatRefiner sends at most HISTORY_SEND_LIMIT history entries.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { ChatRefiner, HISTORY_SEND_LIMIT } from "@/components/ChatRefiner";
import type { StoredPlan, ChatMessage } from "@/lib/types";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function makeRecord(chatLength: number): StoredPlan {
  const chat: ChatMessage[] = Array.from({ length: chatLength }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `msg-${i}`,
    at: new Date(2099, 0, 1, 0, 0, i).toISOString(),
  }));
  return {
    id: "test-id",
    createdAt: "2099-01-01T00:00:00.000Z",
    updatedAt: "2099-01-01T00:00:00.000Z",
    input: {
      eventType: "wedding",
      date: "2099-06-15",
      guestCount: 100,
      totalBudget: 100000,
      currency: "INR",
      city: "Mumbai",
    },
    plan: {
      summary: "Test event.",
      budget: [],
      timeline: [],
      vendors: [],
      ideas: [],
    },
    progress: { timeline: {}, vendors: {} },
    chat,
    version: 1,
  } as unknown as StoredPlan;
}

describe("ChatRefiner — history trim", () => {
  it("sends only the last HISTORY_SEND_LIMIT messages to /api/refine", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 500, ok: false });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ChatRefiner
        record={makeRecord(20)}
        onRecordChange={() => {}}
        isStreaming={false}
      />,
    );


    const input = screen.getByLabelText("Refine message");
    await userEvent.type(input, "Make it cheaper");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/refine");
    const body = JSON.parse((init as RequestInit).body as string);

    expect(HISTORY_SEND_LIMIT).toBe(6);
    expect(body.history).toHaveLength(HISTORY_SEND_LIMIT);
    expect(body.history[0].content).toBe("msg-14");
    expect(body.history[HISTORY_SEND_LIMIT - 1].content).toBe("msg-19");
  });
});
