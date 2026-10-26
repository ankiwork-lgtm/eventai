/**
 * tests/a11y-axe.test.tsx  (gap fix: automated accessibility audit)
 *
 * Runs axe-core over the key dashboard components and asserts zero violations.
 * This complements the targeted ARIA assertions in accessibility.test.tsx with a
 * broad automated sweep (colour-independent cues, label associations, roles,
 * name/role/value, etc.).
 *
 * recharts is mocked (it cannot render meaningfully in jsdom) and PlanContext is
 * stubbed so components render standalone.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import React from "react";

vi.mock("@/components/PlanContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/PlanContext")>();
  return { ...actual, useOptionalPlan: () => null };
});

vi.mock("recharts", () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", null, children);
  const Noop = () => null;
  return {
    ResponsiveContainer: Passthrough,
    PieChart: Passthrough,
    BarChart: Passthrough,
    Pie: Passthrough,
    Bar: Passthrough,
    Cell: Noop,
    Tooltip: Noop,
    XAxis: Noop,
    YAxis: Noop,
  };
});

afterEach(cleanup);

const progress = { timeline: {}, vendors: {} };

describe("axe: ProgressBar", () => {
  it("has no accessibility violations", async () => {
    const { ProgressBar } = await import("@/components/ProgressBar");
    const plan = {
      summary: "S",
      budget: [],
      timeline: [
        { task: "Book venue", when: "6m before", monthsBefore: 6, priority: "high" as const },
        { task: "Send invites", when: "3m before", monthsBefore: 3, priority: "low" as const },
      ],
      vendors: [],
      ideas: [],
    };
    const { container } = render(
      <ProgressBar plan={plan} progress={{ timeline: { "Book venue": true }, vendors: {} }} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("axe: Timeline", () => {
  it("has no accessibility violations", async () => {
    const { Timeline } = await import("@/components/Timeline");
    const items = [
      { task: "Book venue", when: "6 months before", monthsBefore: 6, priority: "high" as const },
      { task: "Send invites", when: "3 months before", monthsBefore: 3, priority: "medium" as const },
      { task: "Confirm catering", when: "1 month before", monthsBefore: 1, priority: "low" as const },
    ];
    const { container } = render(
      <Timeline items={items} progress={progress} isStreaming={false} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("axe: BudgetChart", () => {
  it("has no accessibility violations", async () => {
    const { BudgetChart } = await import("@/components/BudgetChart");
    const items = [
      { category: "Venue", percent: 40, estimatedCost: 40000, tips: "Book early" },
      { category: "Catering", percent: 35, estimatedCost: 35000, tips: "Taste test" },
      { category: "Decor", percent: 25, estimatedCost: 25000, tips: "DIY options" },
    ];
    const { container } = render(
      <BudgetChart items={items} currency="INR" total={100000} isStreaming={false} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("axe: VendorChecklist (expanded)", () => {
  it("has no accessibility violations once the panel is open", async () => {
    const { VendorChecklist } = await import("@/components/VendorChecklist");
    const vendors = [
      {
        type: "Caterer",
        budgetRange: "50k-80k",
        checklist: ["Book venue", "Confirm menu", "Final headcount"],
      },
    ];
    const { container } = render(
      <VendorChecklist vendors={vendors} progress={progress} isStreaming={false} />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /caterer/i }));
    await screen.findAllByRole("checkbox");

    expect(await axe(container)).toHaveNoViolations();
  });
});
