/**
 * tests/a11y-preservation.test.tsx (task 9.2)
 *
 * Preservation tests for Stage 9. They pass on the unfixed code and must keep
 * passing after 9.3 to 9.5. They only cover what is NOT already asserted in:
 *  - tests/export-menu.test.tsx (open, close, Escape, outside click, actions)
 *  - tests/accessibility.test.tsx (labels, StreamingBadge motion-safe, dialog focus)
 *  - tests/a11y-axe.test.tsx (axe sweeps, contrast)
 *  - tests/demo-scenarios.test.tsx (chip labels and callbacks)
 *
 * Added here:
 *  - ExportMenu: trigger name/aria, Tab reaches every item, keyboard activation,
 *    visible focus classes, axe with the menu open
 *  - Print tables: header and cell text, so scope/caption in 9.4 does not alter it
 *  - DemoScenarios: keyboard activation, focus classes, axe
 *  - BudgetChart: animation off for reduced motion and while streaming
 *
 * **Validates: Requirements 3.13**
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { axe } from "vitest-axe";
import { ExportMenu } from "@/components/ExportMenu";
import { DemoScenarios } from "@/components/DemoScenarios";
import { BudgetChart } from "@/components/BudgetChart";
import { BudgetTable } from "@/components/print/BudgetTable";
import { VendorList } from "@/components/print/VendorList";
import { DEMO_SCENARIOS } from "@/lib/demo";
import { formatMoney } from "@/lib/format";
import { getFixture } from "@/lib/fixtures";
import type { EventInput } from "@/lib/schema";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a">) =>
    React.createElement("a", { href, ...props }, children),
}));

// Record the props passed to <Pie> so the animation flag can be observed.
const pieProps: Array<{ isAnimationActive?: boolean }> = [];
vi.mock("recharts", () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", null, children);
  const Noop = () => null;
  return {
    ResponsiveContainer: Passthrough,
    PieChart: Passthrough,
    BarChart: Passthrough,
    Pie: (props: { isAnimationActive?: boolean; children?: React.ReactNode }) => {
      pieProps.push({ isAnimationActive: props.isAnimationActive });
      return React.createElement("div", null, props.children);
    },
    Bar: Passthrough,
    Cell: Noop,
    Tooltip: Noop,
    XAxis: Noop,
    YAxis: Noop,
  };
});

afterEach(() => {
  cleanup();
  pieProps.length = 0;
  vi.unstubAllGlobals();
});

const input: EventInput = {
  eventType: "wedding",
  date: "2099-06-15",
  guestCount: 100,
  totalBudget: 500000,
  currency: "INR",
  city: "Pune",
};
const plan = getFixture("wedding-mumbai");
const trigger = () => screen.getByRole("button", { name: /export/i });

// ─── ExportMenu ───────────────────────────────────────────────────────────────

describe("ExportMenu preservation", () => {
  it("trigger has the accessible name 'Export' and menu semantics", () => {
    render(<ExportMenu planId="p1" input={input} plan={plan} />);
    expect(trigger().textContent).toContain("Export");
    expect(trigger().getAttribute("aria-haspopup")).toBeTruthy();
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
  });

  it("opens from the keyboard with Enter and with Space", async () => {
    const user = userEvent.setup();
    render(<ExportMenu planId="p1" input={input} plan={plan} />);
    await user.tab();
    expect(document.activeElement).toBe(trigger());
    await user.keyboard("{Enter}");
    expect(screen.getByRole("menu")).toBeTruthy();
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("menu")).toBeNull();
    await user.keyboard(" ");
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("every menu item is reachable from the keyboard, in visual order", async () => {
    const user = userEvent.setup();
    render(<ExportMenu planId="p1" input={input} plan={plan} />);
    await user.click(trigger());
    const items = screen.getAllByRole("menuitem");
    expect(items.map((i) => i.textContent?.trim())).toEqual([
      "Download calendar (.ics)",
      "Print / Save as PDF",
      "Copy link",
    ]);
    // ARIA menu pattern: roving focus via arrow keys (Tab closes the menu).
    trigger().focus();
    for (const item of items) {
      await user.keyboard("{ArrowDown}");
      expect(document.activeElement).toBe(item);
    }
  });

  it("menu items activate from the keyboard (Enter on Copy link)", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<ExportMenu planId="p1" input={input} plan={plan} />);
    await user.click(trigger());
    screen.getByRole("menuitem", { name: /copy link/i }).focus();
    await user.keyboard("{Enter}");
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it("trigger and menu items keep visible focus and hover styling", async () => {
    const user = userEvent.setup();
    render(<ExportMenu planId="p1" input={input} plan={plan} />);
    expect(trigger().className).toContain("focus-visible:ring");
    await user.click(trigger());
    for (const item of screen.getAllByRole("menuitem")) {
      expect(item.className).toContain("hover:bg-muted");
    }
  });

  it("has no axe violations closed or open", async () => {
    const user = userEvent.setup();
    const { container } = render(<ExportMenu planId="p1" input={input} plan={plan} />);
    expect(await axe(container)).toHaveNoViolations();
    await user.click(trigger());
    expect(await axe(container)).toHaveNoViolations();
  });
});

// ─── Print tables: visible text must not change when 9.4 adds scope/caption ──

describe("Print view text preservation", () => {
  it("budget table header cells keep their visible text", () => {
    const { container } = render(
      <BudgetTable budget={plan.budget} currency="INR" totalBudget={1_000_000} />,
    );
    const headers = Array.from(container.querySelectorAll("thead th")).map((th) =>
      th.textContent?.trim(),
    );
    expect(headers).toEqual(["Category", "Cost", "%", "Guidance & Tips"]);
  });

  it("budget table body cells keep category, money, percent and tips text", () => {
    const { container } = render(
      <BudgetTable budget={plan.budget} currency="INR" totalBudget={1_000_000} />,
    );
    const rows = Array.from(container.querySelectorAll("tbody tr"));
    expect(rows).toHaveLength(plan.budget.length);
    rows.forEach((row, i) => {
      const cells = Array.from(row.querySelectorAll("td")).map((td) => td.textContent);
      const item = plan.budget[i];
      expect(cells).toEqual([
        item.category,
        formatMoney(item.estimatedCost, "INR"),
        `${item.percent}%`,
        item.tips,
      ]);
    });
    const foot = Array.from(container.querySelectorAll("tfoot td")).map((td) => td.textContent);
    expect(foot).toEqual(["Total", formatMoney(1_000_000, "INR"), "100.0%", ""]);
  });

  it("budget section keeps its heading", () => {
    render(<BudgetTable budget={plan.budget} currency="INR" totalBudget={1_000_000} />);
    expect(screen.getByRole("heading", { level: 2 }).textContent?.trim()).toBe(
      "1. Budget Allocation",
    );
  });

  it("vendor list keeps vendor names, budget ranges and each checklist item as text", () => {
    const { container } = render(<VendorList vendors={plan.vendors} />);
    const cards = Array.from(container.querySelectorAll("h3")).map((h) => h.textContent);
    expect(cards).toEqual(plan.vendors.map((v) => v.type));
    for (const vendor of plan.vendors) {
      expect(screen.getAllByText(vendor.budgetRange).length).toBeGreaterThan(0);
      for (const item of vendor.checklist) {
        expect(screen.getAllByText(item).length).toBeGreaterThan(0);
      }
    }
    const itemCount = plan.vendors.reduce((n, v) => n + v.checklist.length, 0);
    expect(container.querySelectorAll("li")).toHaveLength(itemCount);
  });
});

// ─── DemoScenarios ────────────────────────────────────────────────────────────

describe("DemoScenarios preservation", () => {
  it("buttons are real, focusable buttons with visible focus styling", () => {
    render(<DemoScenarios onSelectScenario={vi.fn()} onInstantGenerate={vi.fn()} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(DEMO_SCENARIOS.length * 2);
    for (const b of buttons) {
      expect(b.getAttribute("type")).toBe("button");
      expect(b.className).toContain("focus-visible:ring");
    }
  });

  it("scenario buttons are operable by keyboard", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onInstant = vi.fn();
    render(<DemoScenarios onSelectScenario={onSelect} onInstantGenerate={onInstant} />);
    const card = screen.getByTestId(`demo-scenario-${DEMO_SCENARIOS[0].id}`);
    const [fill, instant] = within(card).getAllByRole("button");
    fill.focus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith(DEMO_SCENARIOS[0]);
    instant.focus();
    await user.keyboard(" ");
    expect(onInstant).toHaveBeenCalledWith(DEMO_SCENARIOS[0]);
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <DemoScenarios onSelectScenario={vi.fn()} onInstantGenerate={vi.fn()} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

// ─── BudgetChart reduced motion ───────────────────────────────────────────────

function stubReducedMotion(matches: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? matches : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe("BudgetChart reduced motion preservation", () => {
  const items = [
    { category: "Venue", percent: 60, estimatedCost: 60000, tips: "a" },
    { category: "Food", percent: 40, estimatedCost: 40000, tips: "b" },
  ];
  const lastAnimate = () => pieProps[pieProps.length - 1].isAnimationActive;

  it("animates when motion is allowed and the plan is not streaming", () => {
    stubReducedMotion(false);
    render(<BudgetChart items={items} currency="INR" total={100000} isStreaming={false} />);
    expect(lastAnimate()).toBe(true);
  });

  it("does not animate when the user prefers reduced motion", () => {
    stubReducedMotion(true);
    render(<BudgetChart items={items} currency="INR" total={100000} isStreaming={false} />);
    expect(lastAnimate()).toBe(false);
  });

  it("does not animate while streaming", () => {
    stubReducedMotion(false);
    render(<BudgetChart items={items} currency="INR" total={100000} isStreaming />);
    expect(lastAnimate()).toBe(false);
  });

  it("pie/bar toggle buttons keep aria-pressed and visible focus styling", () => {
    stubReducedMotion(false);
    render(<BudgetChart items={items} currency="INR" total={100000} isStreaming={false} />);
    const pie = screen.getByRole("button", { name: /pie/i });
    const bar = screen.getByRole("button", { name: /bar/i });
    expect(pie.getAttribute("aria-pressed")).toBe("true");
    expect(bar.getAttribute("aria-pressed")).toBe("false");
    expect(pie.className).toContain("focus-visible:ring");
  });
});
