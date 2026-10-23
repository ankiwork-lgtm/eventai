import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

import { LandingClient } from "@/components/LandingClient";

function localDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

beforeEach(() => {
  window.localStorage.clear();
  push.mockClear();
});
afterEach(cleanup);

describe("LandingClient", () => {
  it("saves a record and navigates to /plan/<uuid> on submit", async () => {
    const user = userEvent.setup();
    render(<LandingClient />);

    await user.type(screen.getByLabelText(/event date/i), localDate(5));
    await user.type(screen.getByLabelText(/number of guests/i), "120");
    await user.type(screen.getByLabelText(/total budget/i), "800000");
    await user.type(screen.getByLabelText(/city/i), "Mumbai");
    await user.click(screen.getByRole("button", { name: /generate my plan/i }));

    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    const url = push.mock.calls[0][0] as string;
    expect(url).toMatch(/^\/plan\/[0-9a-f-]{36}$/);
    const id = url.split("/").pop()!;

    const stored = JSON.parse(window.localStorage.getItem(`eventai:v1:plan:${id}`)!);
    expect(stored).toMatchObject({
      id,
      plan: null,
      version: 1,
      chat: [],
      progress: { timeline: {}, vendors: {} },
      input: { city: "Mumbai", guestCount: 120 },
    });
    expect(window.localStorage.getItem("eventai:v1:last")).toBe(id);
  });

  it("shows a Resume link only when a last plan exists", () => {
    const { unmount } = render(<LandingClient />);
    expect(screen.queryByRole("link", { name: /resume last plan/i })).toBeNull();
    unmount();

    window.localStorage.setItem("eventai:v1:last", "abc");
    render(<LandingClient />);
    expect(
      screen.getByRole("link", { name: /resume last plan/i }).getAttribute("href"),
    ).toBe("/plan/abc");
  });

  it("fills the form when a demo scenario is clicked and submits successfully", async () => {
    const user = userEvent.setup();
    render(<LandingClient />);

    await user.click(
      screen.getByRole("button", { name: /fill form with mumbai wedding/i })
    );

    // Click submit
    await user.click(screen.getByRole("button", { name: /generate my plan/i }));

    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    const url = push.mock.calls[0][0] as string;
    expect(url).toMatch(/^\/plan\/[0-9a-f-]{36}$/);
    const id = url.split("/").pop()!;

    const stored = JSON.parse(window.localStorage.getItem(`eventai:v1:plan:${id}`)!);
    expect(stored).toMatchObject({
      id,
      plan: null,
      input: {
        eventType: "wedding",
        city: "Mumbai",
        guestCount: 200,
        totalBudget: 1000000,
        currency: "INR",
        culturalTraditions: "Maharashtrian wedding, 2-day ceremony",
      },
    });
  });

  it("navigates immediately to /plan/<uuid>?demo=1 when instant cached generate is clicked", async () => {
    const user = userEvent.setup();
    render(<LandingClient />);

    await user.click(
      screen.getByRole("button", {
        name: /generate instantly \(cached\): superhero birthday/i,
      })
    );

    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    const url = push.mock.calls[0][0] as string;
    expect(url).toMatch(/^\/plan\/[0-9a-f-]{36}\?demo=1$/);
    const id = url.split("?")[0].split("/").pop()!;

    const stored = JSON.parse(window.localStorage.getItem(`eventai:v1:plan:${id}`)!);
    expect(stored).toMatchObject({
      id,
      input: {
        eventType: "birthday",
        city: "Pune",
        guestCount: 25,
        totalBudget: 60000,
        theme: "Superhero",
      },
    });
  });
});
