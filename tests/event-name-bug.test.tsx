/**
 * Bug condition exploration: the typed event name (`eventName`) is ignored by
 * print title, .ics filename, .ics entries and the Timeline export, which all
 * read the legacy `name` field.
 *
 * Property 1: Bug Condition - Event name ignored in print and export
 * **Validates: Requirements 1.1, 1.23, 2.1, 2.23**
 *
 * These tests are EXPECTED TO FAIL on unfixed code.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { buildIcs } from "@/lib/export";
import type { EventInput, Plan } from "@/lib/schema";
import type { StoredPlan } from "@/lib/types";

const downloadIcsMock = vi.fn();

vi.mock("@/lib/export", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/export")>();
  return {
    ...actual,
    downloadIcs: (...args: unknown[]) => downloadIcsMock(...args),
  };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let searchString = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/plan/p1/print",
  useSearchParams: () => new URLSearchParams(searchString),
}));

const NAME = "Maya & Ravi";

/** Pre-fulfilled thenable so React.use() reads it synchronously (no Suspense flush). */
function resolvedParams<T>(value: T): Promise<T> {
  const p = Promise.resolve(value) as Promise<T> & { status?: string; value?: T };
  p.status = "fulfilled";
  p.value = value;
  return p;
}

const input: EventInput = {
  eventType: "wedding",
  eventName: NAME, // typed in the intake form; legacy `name` is absent
  date: "2030-06-15",
  guestCount: 100,
  totalBudget: 500000,
  currency: "INR",
  city: "Pune",
};

const plan: Plan = {
  summary: "A lovely wedding",
  budget: [{ category: "Venue", estimatedCost: 250000, percent: 50, tips: "Book early" }],
  timeline: [
    { task: "Book venue", monthsBefore: 6, priority: "high", when: "6 months before" },
  ],
  vendors: [],
  ideas: [],
};

let storeRecord: StoredPlan | null = null;
vi.mock("@/hooks/usePlanStore", () => ({
  usePlanStore: () => ({ status: "ready", record: storeRecord }),
}));

beforeEach(() => {
  downloadIcsMock.mockClear();
  searchString = "";
  storeRecord = {
    id: "p1",
    createdAt: "2030-01-01T00:00:00.000Z",
    updatedAt: "2030-01-01T00:00:00.000Z",
    input,
    plan,
    progress: { timeline: {}, budget: {} },
  } as unknown as StoredPlan;
});
afterEach(cleanup);

describe("Bug condition: eventName ignored", () => {
  it("print page title shows the typed event name", async () => {
    const { default: PrintPage } = await import("@/app/plan/[id]/print/page");
    render(
      <React.Suspense fallback={null}>
        <PrintPage params={resolvedParams({ id: "p1" })} />
      </React.Suspense>,
    );
    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading.textContent).toContain(NAME);
  });

  it("buildIcs includes the typed event name in the main event", () => {
    const ics = buildIcs({ planId: "p1", input, plan });
    expect(ics).toContain("Maya & Ravi");
  });

  it("ExportMenu names the .ics file after the typed event name", async () => {
    const { ExportMenu } = await import("@/components/ExportMenu");
    const user = userEvent.setup();
    render(<ExportMenu planId="p1" input={input} plan={plan} />);
    await user.click(screen.getByRole("button", { name: /export/i }));
    await user.click(screen.getByRole("menuitem", { name: /download calendar/i }));
    expect(downloadIcsMock).toHaveBeenCalled();
    expect(downloadIcsMock.mock.calls[0][0]).toContain(NAME);
  });

  it("Timeline export names the .ics file and entries after the typed event name", async () => {
    const { Timeline } = await import("@/components/Timeline");
    const { PlanProvider } = await import("@/components/PlanContext");
    const user = userEvent.setup();
    render(
      <PlanProvider
        value={{
          input,
          plan,
          progress: { timeline: {}, budget: {} } as never,
          isStreaming: false,
          status: "ready",
          toggle: () => {},
        }}
      >
        <Timeline items={plan.timeline} eventDate={input.date} />
      </PlanProvider>,
    );
    await user.click(screen.getByRole("button", { name: /add to calendar/i }));
    expect(downloadIcsMock).toHaveBeenCalled();
    const [filename, content] = downloadIcsMock.mock.calls[0] as [string, string];
    expect(filename).toContain(NAME);
    expect(content).toContain(NAME);
  });
});
