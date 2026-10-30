/**
 * Preservation: records that carry only the legacy `name`, both fields with the
 * same value, or no custom name at all must keep producing the same names in
 * the print title, .ics content, .ics filenames, Timeline export and header.
 *
 * Property 3: Preservation - Legacy `name` records and plans without a custom name
 * **Validates: Requirements 3.4, 3.9**
 *
 * These tests MUST PASS on unfixed code. fast-check is not installed, so the
 * properties are expressed as parameterized vitest cases (no dependency added).
 *
 * Not covered here on purpose: `eventName`-only records on print/export (that
 * is the bug, see event-name-bug.test.tsx) and records where `name` and
 * `eventName` differ (the winner changes with the fix).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { buildIcs } from "@/lib/export";
import { EventInputBaseSchema, type EventInput, type Plan } from "@/lib/schema";
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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/plan/p1/print",
  useSearchParams: () => new URLSearchParams(""),
}));

/** Pre-fulfilled thenable so React.use() reads it synchronously. */
function resolvedParams<T>(value: T): Promise<T> {
  const p = Promise.resolve(value) as Promise<T> & { status?: string; value?: T };
  p.status = "fulfilled";
  p.value = value;
  return p;
}

const baseInput: EventInput = {
  eventType: "wedding",
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

function makeInput(fields: { name?: string; eventName?: string }): EventInput {
  return { ...baseInput, ...fields };
}

/**
 * Cases where print / .ics / filenames read `name` (legacy) today and must keep
 * doing so for these records. `label` is the name expected in .ics content and
 * print title; `file` is the name used in "<file>-schedule.ics".
 */
const nameSurfaceCases: Array<{
  title: string;
  fields: { name?: string; eventName?: string };
  label: string;
  printTitle: string;
  file: string;
}> = [
  {
    title: "legacy name only",
    fields: { name: "Asha Wedding" },
    label: "Asha Wedding",
    printTitle: "Asha Wedding",
    file: "Asha Wedding",
  },
  {
    title: "legacy name only, padded with whitespace",
    fields: { name: "  Asha Wedding  " },
    label: "Asha Wedding",
    printTitle: "Asha Wedding",
    file: "Asha Wedding",
  },
  {
    title: "name and eventName with the same value",
    fields: { name: "Asha Wedding", eventName: "Asha Wedding" },
    label: "Asha Wedding",
    printTitle: "Asha Wedding",
    file: "Asha Wedding",
  },
  {
    title: "neither field",
    fields: {},
    label: "wedding Event",
    printTitle: "WEDDING PLAN",
    file: "wedding",
  },
  {
    title: "whitespace-only legacy name",
    fields: { name: "   " },
    label: "wedding Event",
    printTitle: "WEDDING PLAN",
    file: "wedding",
  },
];

beforeEach(() => {
  downloadIcsMock.mockClear();
});
afterEach(cleanup);

describe("Preservation: stored records still load (3.4)", () => {
  it.each([
    ["legacy name only", { name: "Asha Wedding" }],
    ["eventName only", { eventName: "Asha Wedding" }],
    ["both", { name: "Asha Wedding", eventName: "Asha Wedding" }],
    ["neither", {}],
  ])("stored-record schema accepts %s", (_title, fields) => {
    const parsed = EventInputBaseSchema.safeParse(makeInput(fields));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe((fields as { name?: string }).name);
      expect(parsed.data.eventName).toBe((fields as { eventName?: string }).eventName);
    }
  });
});

describe("Preservation: .ics output for existing records (3.9)", () => {
  it.each(nameSurfaceCases)("buildIcs: $title", ({ fields, label }) => {
    const ics = buildIcs({ planId: "p1", input: makeInput(fields), plan });
    expect(ics).toContain(`SUMMARY:${label}`);
    expect(ics).toContain(`Event: ${label}`);
    expect(ics).toContain("SUMMARY:Book venue");
    expect(ics).toContain("UID:p1-main@eventai");
  });
});

describe("Preservation: ExportMenu .ics filename (3.9)", () => {
  it.each(nameSurfaceCases)("ExportMenu: $title", async ({ fields, file }) => {
    const { ExportMenu } = await import("@/components/ExportMenu");
    const user = userEvent.setup();
    render(<ExportMenu planId="p1" input={makeInput(fields)} plan={plan} />);
    await user.click(screen.getByRole("button", { name: /export/i }));
    await user.click(screen.getByRole("menuitem", { name: /download calendar/i }));
    expect(downloadIcsMock).toHaveBeenCalledTimes(1);
    expect(downloadIcsMock.mock.calls[0][0]).toBe(`${file}-schedule.ics`);
  });
});

describe("Preservation: Timeline export (3.9)", () => {
  it.each(nameSurfaceCases)("Timeline: $title", async ({ fields, file, label }) => {
    const { Timeline } = await import("@/components/Timeline");
    const { PlanProvider } = await import("@/components/PlanContext");
    const user = userEvent.setup();
    const input = makeInput(fields);
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
    expect(downloadIcsMock).toHaveBeenCalledTimes(1);
    const [filename, content] = downloadIcsMock.mock.calls[0] as [string, string];
    expect(filename).toBe(`${file}-schedule.ics`);
    expect(content).toContain(`SUMMARY:${label}`);
  });
});

describe("Preservation: print view title (3.9)", () => {
  it.each(nameSurfaceCases)("print page: $title", async ({ fields, printTitle }) => {
    storeRecord = {
      id: "p1",
      createdAt: "2030-01-01T00:00:00.000Z",
      updatedAt: "2030-01-01T00:00:00.000Z",
      input: makeInput(fields),
      plan,
      progress: { timeline: {}, budget: {} },
    } as unknown as StoredPlan;
    const { default: PrintPage } = await import("@/app/plan/[id]/print/page");
    render(
      <React.Suspense fallback={null}>
        <PrintPage params={resolvedParams({ id: "p1" })} />
      </React.Suspense>,
    );
    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading.textContent).toBe(printTitle);
    // Same sections as before: summary text still rendered.
    expect(screen.getAllByText(/Book venue/).length).toBeGreaterThan(0);
  });
});

describe("Preservation: dashboard header title (3.4)", () => {
  it.each([
    ["eventName only", { eventName: "Asha Wedding" }, "Asha Wedding"],
    ["both, same value", { name: "Asha Wedding", eventName: "Asha Wedding" }, "Asha Wedding"],
    ["eventName padded", { eventName: "  Asha Wedding " }, "Asha Wedding"],
    ["neither", {}, "Wedding in Pune"],
    ["whitespace-only eventName", { eventName: "   " }, "Wedding in Pune"],
  ])("PlanHeader: %s", async (_title, fields, expected) => {
    const { PlanHeader } = await import("@/components/PlanHeader");
    render(
      <PlanHeader input={makeInput(fields)} summary="s" isStreaming={false} planId="p1" />,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(expected);
  });
});
