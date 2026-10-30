/**
 * tests/print-view-characterization.test.tsx (task 5.1)
 *
 * Characterization snapshots of /plan/[id]/print, captured on the pre-split code.
 * Task 5.4 splits the page into smaller components; these snapshots must stay
 * byte-identical afterwards. Both the DOM structure (tags, classes, attributes,
 * page-break classes) and the extracted text are snapshotted, plus targeted
 * assertions for the parts the split touches (priority badges, page breaks,
 * auto-print, missing/loading states).
 *
 * Snapshot files live in tests/__snapshots__/. If the DOM changes on purpose,
 * review the diff and update with `vitest run -u`.
 *
 * Inputs use a far-future fixed date so resolved dates and phase grouping are
 * deterministic.
 *
 * **Validates: Requirements 3.9**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";
import React from "react";
import { getFixture } from "@/lib/fixtures";
import type { Plan } from "@/lib/schema";
import type { StoredPlan } from "@/lib/types";

const mockInspect = vi.fn();
vi.mock("@/lib/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage")>();
  return {
    ...actual,
    localRepo: {
      get: vi.fn(),
      inspect: mockInspect,
      save: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([]),
      remove: vi.fn(),
      onStorageDegraded: vi.fn().mockReturnValue(() => {}),
      getLastPlanId: vi.fn().mockReturnValue(null),
    },
  };
});

let searchString = "";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(searchString),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a">) =>
    React.createElement("a", { href, ...props }, children),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

const FIXED_DATE = "2099-06-15";

function record(input: StoredPlan["input"], plan: Plan | null): StoredPlan {
  return {
    id: "print-id",
    createdAt: "2099-01-01T00:00:00.000Z",
    updatedAt: "2099-01-01T00:00:00.000Z",
    input,
    plan,
    progress: { timeline: {}, vendors: {} },
    chat: [],
    version: 1,
  };
}

async function renderPrint() {
  const { default: PrintPage } = await import("@/app/plan/[id]/print/page");
  let utils!: ReturnType<typeof render>;
  await act(async () => {
    utils = render(<PrintPage params={Promise.resolve({ id: "print-id" })} />);
  });
  return utils;
}

/** Text of every element that directly holds text, in document order. */
function textOutline(root: HTMLElement): string {
  const lines: string[] = [];
  const walk = (el: Element, depth: number) => {
    const own = Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent?.trim() ?? "")
      .filter(Boolean)
      .join(" ");
    if (own) lines.push(`${"  ".repeat(depth)}<${el.tagName.toLowerCase()}> ${own}`);
    for (const child of Array.from(el.children)) walk(child, depth + 1);
  };
  walk(root, 0);
  return lines.join("\n");
}

beforeEach(() => {
  mockInspect.mockReset();
  searchString = "";
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SAMPLES = [
  {
    name: "wedding-mumbai (named)",
    input: {
      eventType: "wedding" as const,
      eventName: "Maya & Ravi",
      date: FIXED_DATE,
      guestCount: 200,
      totalBudget: 1_000_000,
      currency: "INR",
      city: "Mumbai",
    },
    plan: getFixture("wedding-mumbai"),
  },
  {
    name: "birthday-superhero (unnamed, USD)",
    input: {
      eventType: "birthday" as const,
      date: FIXED_DATE,
      guestCount: 25,
      totalBudget: 5_000,
      currency: "USD",
      city: "Pune",
    },
    plan: getFixture("birthday-superhero"),
  },
  {
    name: "community-diwali (unnamed)",
    input: {
      eventType: "community" as const,
      date: FIXED_DATE,
      guestCount: 300,
      totalBudget: 200_000,
      currency: "INR",
      city: "Delhi",
    },
    plan: getFixture("community-diwali"),
  },
];

describe("Print view snapshots", () => {
  for (const sample of SAMPLES) {
    it(`${sample.name}: DOM structure is unchanged`, async () => {
      mockInspect.mockResolvedValue({ state: "ok", record: record(sample.input, sample.plan) });
      const { container } = await renderPrint();
      await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeTruthy());
      expect(container).toMatchSnapshot();
    });

    it(`${sample.name}: rendered text is unchanged`, async () => {
      mockInspect.mockResolvedValue({ state: "ok", record: record(sample.input, sample.plan) });
      const { container } = await renderPrint();
      await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeTruthy());
      expect(textOutline(container)).toMatchSnapshot();
    });
  }

  it("minimal plan without ideas: DOM structure and text are unchanged", async () => {
    const base = getFixture("community-diwali");
    const minimal: Plan = {
      ...base,
      summary: "",
      budget: base.budget.slice(0, 2),
      timeline: [
        { when: "Day of", task: "Open gates", priority: "high" },
        { when: "Week before", task: "Confirm stalls", priority: "medium", daysBefore: 7 },
        { when: "Afterwards", task: "Send thanks", priority: "low", daysBefore: -1 },
      ],
      vendors: [{ type: "Caterer", checklist: ["Menu", "Tasting"], budgetRange: "10-20k" }],
      ideas: [],
    };
    mockInspect.mockResolvedValue({
      state: "ok",
      record: record(SAMPLES[2].input, minimal),
    });
    const { container } = await renderPrint();
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeTruthy());
    expect(container).toMatchSnapshot("dom");
    expect(textOutline(container)).toMatchSnapshot("text");
  });
});

describe("Print view behavior", () => {
  const sample = SAMPLES[0];

  beforeEach(() => {
    mockInspect.mockResolvedValue({ state: "ok", record: record(sample.input, sample.plan) });
  });

  it("renders four numbered sections in order with the document header", async () => {
    await renderPrint();
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeTruthy());
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Maya & Ravi");
    const h2s = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(h2s).toEqual([
      "1. Budget Allocation",
      "2. Master Timeline & Milestones",
      "3. Vendor Sourcing & Deliverables",
      "4. Creative Themes & Recommendations",
    ]);
    expect(screen.getByText(/EventAI — Intelligent Event Planning & Budgeting/)).toBeTruthy();
  });

  it("keeps the page-break classes on timeline and vendor sections", async () => {
    const { container } = await renderPrint();
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeTruthy());
    const sections = Array.from(container.querySelectorAll("section"));
    expect(sections).toHaveLength(4);
    expect(sections.map((s) => s.classList.contains("page-break-before"))).toEqual([
      false,
      true,
      true,
      false,
    ]);
    expect(sections.every((s) => s.classList.contains("break-inside-avoid"))).toBe(true);
    // The action bar is hidden when printing.
    expect(container.querySelector(".print\\:hidden")).toBeTruthy();
  });

  it("budget table lists every item plus a total row", async () => {
    const { container } = await renderPrint();
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeTruthy());
    const bodyRows = container.querySelectorAll("table tbody tr");
    expect(bodyRows).toHaveLength(sample.plan.budget.length);
    const footCells = container.querySelectorAll("table tfoot td");
    expect(footCells[0].textContent).toBe("Total");
    expect(footCells[2].textContent).toBe("100.0%");
  });

  it("colors priority badges by level (high red, medium amber, other neutral)", async () => {
    const plan: Plan = {
      ...sample.plan,
      timeline: [
        { when: "a", task: "T-high", priority: "high", monthsBefore: 5 },
        { when: "b", task: "T-med", priority: "medium", monthsBefore: 5 },
        { when: "c", task: "T-low", priority: "low", monthsBefore: 5 },
      ],
    };
    mockInspect.mockResolvedValue({ state: "ok", record: record(sample.input, plan) });
    const { container } = await renderPrint();
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeTruthy());
    const badge = (text: string) =>
      Array.from(container.querySelectorAll("li span")).find(
        (s) => s.textContent === text && s.className.includes("uppercase"),
      )!;
    expect(badge("high").className).toContain("bg-red-100");
    expect(badge("medium").className).toContain("bg-amber-100");
    expect(badge("low").className).toContain("bg-neutral-100");
  });

  it("omits the ideas section when the plan has no ideas", async () => {
    mockInspect.mockResolvedValue({
      state: "ok",
      record: record(sample.input, { ...sample.plan, ideas: [] }),
    });
    await renderPrint();
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeTruthy());
    expect(screen.queryByText(/4\. Creative Themes/)).toBeNull();
  });

  it("falls back to '<TYPE> PLAN' when no name was entered", async () => {
    mockInspect.mockResolvedValue({
      state: "ok",
      record: record(SAMPLES[1].input, SAMPLES[1].plan),
    });
    await renderPrint();
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeTruthy());
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("BIRTHDAY PLAN");
  });

  it("shows 'Plan not found' with a back link when the plan has not been generated", async () => {
    mockInspect.mockResolvedValue({ state: "ok", record: record(sample.input, null) });
    await renderPrint();
    await waitFor(() => expect(screen.getByText("Plan not found")).toBeTruthy());
    expect(screen.getByRole("link", { name: /back to plan dashboard/i }).getAttribute("href")).toBe(
      "/plan/print-id",
    );
  });

  it("shows 'Plan not found' when the record is missing", async () => {
    mockInspect.mockResolvedValue({ state: "missing" });
    await renderPrint();
    await waitFor(() => expect(screen.getByText("Plan not found")).toBeTruthy());
  });

  it("calls window.print after the delay only when ?auto=1", async () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    searchString = "auto=1";
    await renderPrint();
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeTruthy());
    expect(printSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1), { timeout: 3000 });
  });

  it("does not auto-print without ?auto=1", async () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    await renderPrint();
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeTruthy());
    await new Promise((r) => setTimeout(r, 800));
    expect(printSpy).not.toHaveBeenCalled();
  });
});
