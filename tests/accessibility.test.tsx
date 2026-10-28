/**
 * tests/accessibility.test.tsx  (P5-T07)
 *
 * Unit tests for the ARIA fixes and accessibility requirements described in
 * TDD §7.5:
 *  - ProgressBar: role=progressbar with aria-valuenow/min/max and label
 *  - VendorChecklist: every checkbox has an associated <label>
 *  - Timeline: every checkbox has an associated <label>
 *  - BudgetChart: chart div has role=img with a text aria-label
 *  - StreamingBadge: uses motion-safe:animate-spin (not animate-spin) for
 *    prefers-reduced-motion compliance
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// vi.mock calls must be at the module's top level (they are hoisted by vitest).
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

// ─── ProgressBar ─────────────────────────────────────────────────────────────

describe("ProgressBar ARIA", () => {
  it("renders a main progressbar with aria-valuenow / aria-valuemin / aria-valuemax", async () => {
    const { ProgressBar } = await import("@/components/ProgressBar");

    const plan = {
      summary: "S",
      budget: [],
      timeline: [
        { task: "T1", when: "1m before", monthsBefore: 1, priority: "high" as const },
        { task: "T2", when: "2m before", monthsBefore: 2, priority: "low" as const },
      ],
      vendors: [],
      ideas: [],
    };
    const progress = {
      timeline: { T1: true },
      vendors: {},
    };

    render(<ProgressBar plan={plan} progress={progress} />);

    const bars = screen.getAllByRole("progressbar");
    // There must be at least one progressbar element
    expect(bars.length).toBeGreaterThanOrEqual(1);

    const main = bars[0];
    // aria-valuemin and aria-valuemax must be present
    expect(main.getAttribute("aria-valuemin")).toBe("0");
    expect(main.getAttribute("aria-valuemax")).toBe("100");
    // aria-valuenow must be a numeric string
    const valuenow = main.getAttribute("aria-valuenow");
    expect(valuenow).not.toBeNull();
    expect(Number(valuenow)).toBeGreaterThanOrEqual(0);
    expect(Number(valuenow)).toBeLessThanOrEqual(100);
    // accessible label must be present (aria-label or aria-labelledby)
    const label =
      main.getAttribute("aria-label") ?? main.getAttribute("aria-labelledby");
    expect(label).toBeTruthy();
  });

  it("renders nothing when the plan has no tasks", async () => {
    const { ProgressBar } = await import("@/components/ProgressBar");

    const emptyPlan = {
      summary: "S",
      budget: [],
      timeline: [],
      vendors: [],
      ideas: [],
    };
    const { container } = render(
      <ProgressBar plan={emptyPlan} progress={{ timeline: {}, vendors: {} }} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

// ─── VendorChecklist labels ───────────────────────────────────────────────────

describe("VendorChecklist ARIA: every checkbox has a label", () => {
  it("every expanded checkbox is associated with a <label> or aria-label", async () => {
    const { VendorChecklist } = await import("@/components/VendorChecklist");

    const vendors = [
      {
        type: "Caterer",
        budgetRange: "₹50k–₹80k",
        checklist: ["Book venue", "Confirm menu", "Final headcount"],
      },
    ];

    render(
      <VendorChecklist
        vendors={vendors}
        progress={{ timeline: {}, vendors: {} }}
        isStreaming={false}
      />,
    );

    // The panel is collapsed initially; base-ui removes it from the DOM.
    // Expand it so the checkboxes mount, then assert label pairing in the DOM.
    const trigger = screen.getByRole("button", { name: /caterer/i });
    expect(trigger.textContent).toContain("0");
    expect(trigger.textContent).toContain("3");

    const user = userEvent.setup();
    await user.click(trigger);

    // Wait for the panel to mount, then assert label pairing against the real
    // underlying form control. base-ui's Checkbox renders a hidden native
    // <input type="checkbox"> that carries our `id` prop; the role="checkbox"
    // span is a separate presentational element with its own base-ui id, so we
    // pair labels against the inputs (which is what assistive tech uses).
    await screen.findAllByRole("checkbox");
    const inputs = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    );
    expect(inputs.length).toBe(3);

    for (const input of inputs) {
      const id = input.getAttribute("id");
      const ariaLabel = input.getAttribute("aria-label");
      const label = id ? document.querySelector(`label[for="${id}"]`) : null;
      // Every checkbox input must have a linked <label> or an aria-label.
      expect(label !== null || ariaLabel !== null).toBe(true);
      if (label) expect(label.textContent?.trim()).toBeTruthy();
    }
  });
});

// ─── Timeline labels ──────────────────────────────────────────────────────────

describe("Timeline ARIA: every checkbox has a label", () => {
  it("every checkbox is associated with a <label> or aria-label", async () => {
    const { Timeline } = await import("@/components/Timeline");

    const items = [
      {
        task: "Book venue",
        when: "6 months before",
        monthsBefore: 6,
        priority: "high" as const,
      },
      {
        task: "Send invites",
        when: "3 months before",
        monthsBefore: 3,
        priority: "medium" as const,
      },
    ];

    render(
      <Timeline
        items={items}
        progress={{ timeline: {}, vendors: {} }}
        isStreaming={false}
      />,
    );

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBeGreaterThan(0);

    for (const checkbox of checkboxes) {
      const id = checkbox.getAttribute("id");
      if (id) {
        const label = document.querySelector(`label[for="${id}"]`);
        const ariaLabel = checkbox.getAttribute("aria-label");
        // Either a linked label or an aria-label must be present
        expect(label !== null || ariaLabel !== null).toBe(true);
      } else {
        const ariaLabel =
          checkbox.getAttribute("aria-label") ??
          checkbox.getAttribute("aria-labelledby");
        expect(ariaLabel).toBeTruthy();
      }
    }
  });
});

// ─── BudgetChart text alternative ────────────────────────────────────────────

describe("BudgetChart ARIA: chart has a text alternative", () => {
  it("renders a div with role=img and a descriptive aria-label", async () => {
    const { BudgetChart } = await import("@/components/BudgetChart");

    const items = [
      { category: "Venue", percent: 40, estimatedCost: 40000, tips: "Book early" },
      { category: "Catering", percent: 35, estimatedCost: 35000, tips: "Taste test" },
      { category: "Decor", percent: 25, estimatedCost: 25000, tips: "DIY options" },
    ];

    render(
      <BudgetChart
        items={items}
        currency="INR"
        total={100000}
        isStreaming={false}
      />,
    );

    const chartImg = screen.getByRole("img");
    expect(chartImg).toBeDefined();

    const ariaLabel = chartImg.getAttribute("aria-label") ?? "";
    // Label should mention all categories
    expect(ariaLabel).toContain("Venue");
    expect(ariaLabel).toContain("Catering");
    expect(ariaLabel).toContain("Decor");
    // And mention percentages
    expect(ariaLabel).toContain("40%");
    expect(ariaLabel).toContain("35%");
    expect(ariaLabel).toContain("25%");
  });
});

// ─── StreamingBadge reduced-motion ───────────────────────────────────────────

describe("StreamingBadge reduced motion", () => {
  it("uses motion-safe:animate-spin instead of bare animate-spin", async () => {
    const { StreamingBadge } = await import("@/components/StreamingBadge");
    const { container } = render(<StreamingBadge />);

    // The spinning icon must use motion-safe:animate-spin to respect
    // prefers-reduced-motion; plain animate-spin should NOT be present.
    const spinningEl = container.querySelector(".motion-safe\\:animate-spin");
    const bareSpinEl = container.querySelector(
      "svg.animate-spin, [class~='animate-spin']:not([class*='motion-safe'])",
    );

    expect(spinningEl).not.toBeNull();
    expect(bareSpinEl).toBeNull();
  });

  it("has role=status and aria-label", async () => {
    const { StreamingBadge } = await import("@/components/StreamingBadge");
    render(<StreamingBadge />);

    const badge = screen.getByRole("status");
    expect(badge).toBeDefined();
    expect(badge.getAttribute("aria-label")).toBe("Generating");
  });
});

// --- Dialog focus management (G2-T02) ----------------------------------------

describe("EmailDialog focus management", () => {
  const eventInput = {
    eventType: "wedding" as const,
    date: "2099-06-15",
    guestCount: 100,
    totalBudget: 100000,
    currency: "INR",
    city: "Mumbai",
  };
  const plan = { summary: "S", budget: [], timeline: [], vendors: [], ideas: [] };

  /** Host owning the open state, mirroring how PlanShell opens the dialog. */
  async function renderHost() {
    const { EmailDialog } = await import("@/components/EmailDialog");
    function Host() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Draft email
          </button>
          <EmailDialog
            open={open}
            onOpenChange={setOpen}
            vendorType="Caterer"
            eventInput={eventInput}
            plan={plan}
          />
        </>
      );
    }
    render(<Host />);
    return screen.getByRole("button", { name: "Draft email" });
  }

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ subject: "Inquiry", body: "Hello" }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("moves focus inside the dialog when it opens", async () => {
    const user = userEvent.setup();
    const trigger = await renderHost();

    await user.click(trigger);
    const dialog = await screen.findByRole("dialog");

    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    expect(document.activeElement).not.toBe(trigger);
  });

  it("keeps focus inside the dialog while tabbing", async () => {
    const user = userEvent.setup();
    const trigger = await renderHost();

    await user.click(trigger);
    const dialog = await screen.findByRole("dialog");
    await screen.findByLabelText("Subject");

    // Tab past the last control. base-ui parks focus on a hidden focus-guard
    // sentinel at the dialog edge and immediately redirects it back inside.
    for (let i = 0; i < 10; i++) {
      await user.tab();
      await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
      expect(document.activeElement).not.toBe(trigger);
    }
  });

  it("returns focus to the trigger when closed with Escape", async () => {
    const user = userEvent.setup();
    const trigger = await renderHost();

    await user.click(trigger);
    await screen.findByRole("dialog");

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("returns focus to the trigger when closed with the Close button", async () => {
    const user = userEvent.setup();
    const trigger = await renderHost();

    await user.click(trigger);
    const dialog = await screen.findByRole("dialog");

    await user.click(within(dialog).getAllByRole("button", { name: "Close" })[0]);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
