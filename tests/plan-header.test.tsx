/**
 * PlanHeader: title precedence (typed name, legacy name, fallback), key facts,
 * summary/skeleton and the Export slot. Basic title cases also appear in
 * event-name-preservation.test.tsx; this adds the gaps.
 *
 * **Validates: Requirements 1.18, 2.18**
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PlanHeader } from "@/components/PlanHeader";
import { PlanProvider } from "@/components/PlanContext";
import type { EventInput, Plan } from "@/lib/schema";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const base: EventInput = {
  eventType: "wedding",
  date: "2030-06-15",
  guestCount: 1200,
  totalBudget: 500000,
  currency: "INR",
  city: "Pune",
};

const plan: Plan = {
  summary: "s",
  budget: [],
  timeline: [],
  vendors: [],
  ideas: [],
};

afterEach(cleanup);

const title = () => screen.getByRole("heading", { level: 1 }).textContent;

describe("PlanHeader title", () => {
  it("shows the typed eventName", () => {
    render(<PlanHeader input={{ ...base, eventName: "Asha & Ravi" }} summary="x" isStreaming={false} />);
    expect(title()).toBe("Asha & Ravi");
  });

  it("falls back to the legacy name when eventName is absent", () => {
    render(<PlanHeader input={{ ...base, name: "Legacy Wedding" }} summary="x" isStreaming={false} />);
    expect(title()).toBe("Legacy Wedding");
  });

  it("falls back to the legacy name when eventName is blank", () => {
    render(
      <PlanHeader input={{ ...base, eventName: "  ", name: " Legacy " }} summary="x" isStreaming={false} />,
    );
    expect(title()).toBe("Legacy");
  });

  it("prefers eventName over the legacy name when both differ", () => {
    render(
      <PlanHeader input={{ ...base, eventName: "New", name: "Old" }} summary="x" isStreaming={false} />,
    );
    expect(title()).toBe("New");
  });

  it("uses '{Type} in {City}' when no name is set", () => {
    render(<PlanHeader input={base} summary="x" isStreaming={false} />);
    expect(title()).toBe("Wedding in Pune");
  });
});

describe("PlanHeader details", () => {
  it("renders the key facts", () => {
    render(<PlanHeader input={base} summary="x" isStreaming={false} />);
    expect(screen.getByText("Pune")).toBeTruthy();
    expect(screen.getByText(`${(1200).toLocaleString()} guests`)).toBeTruthy();
    expect((screen.getByRole("link", { name: /new plan/i })).getAttribute("href")).toBe("/");
  });

  it("shows the summary when present", () => {
    render(<PlanHeader input={base} summary="A lovely day" isStreaming={false} />);
    expect(screen.getByText("A lovely day")).toBeTruthy();
  });

  it("shows skeleton lines while streaming without a summary, nothing when idle", () => {
    const { container, rerender } = render(
      <PlanHeader input={base} summary={undefined} isStreaming />,
    );
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3);

    rerender(<PlanHeader input={base} summary="   " isStreaming={false} />);
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0);
    expect(container.querySelector("header p.max-w-prose")).toBeNull();
  });
});

describe("PlanHeader export slot", () => {
  const ctx = (planValue: Plan | null, isStreaming = false) => ({
    input: base,
    plan: planValue,
    progress: { timeline: {}, vendors: {} },
    isStreaming,
    status: "ready" as const,
    toggle: () => {},
  });

  it("hides Export without a plan context", () => {
    render(<PlanHeader input={base} summary="x" isStreaming={false} />);
    expect(screen.queryByRole("button", { name: /export/i })).toBeNull();
  });

  it("hides Export when the context has no plan", () => {
    render(
      <PlanProvider value={ctx(null)}>
        <PlanHeader input={base} summary="x" isStreaming={false} />
      </PlanProvider>,
    );
    expect(screen.queryByRole("button", { name: /export/i })).toBeNull();
  });

  it("enables Export with a complete plan and disables it while streaming", () => {
    const { rerender } = render(
      <PlanProvider value={ctx(plan)}>
        <PlanHeader input={base} summary="x" isStreaming={false} planId="p1" />
      </PlanProvider>,
    );
    expect((screen.getByRole("button", { name: /export/i })).hasAttribute("disabled")).toBe(false);

    rerender(
      <PlanProvider value={ctx(plan, true)}>
        <PlanHeader input={base} summary="x" isStreaming planId="p1" />
      </PlanProvider>,
    );
    expect((screen.getByRole("button", { name: /export/i })).hasAttribute("disabled")).toBe(true);
  });
});
