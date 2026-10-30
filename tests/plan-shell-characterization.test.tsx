/**
 * tests/plan-shell-characterization.test.tsx (task 5.1)
 *
 * Characterization tests for PlanShell, written on the pre-split code so task 5.2
 * can be checked against them. Cases already covered elsewhere are NOT repeated:
 *
 *   tests/plan-page.test.tsx              loading->ready, "Plan not found", corrupt view
 *                                         + Delete button present, ?tab=ideas landing,
 *                                         once-only submit (Strict Mode), onFinish save,
 *                                         mid-stream banner + Retry, pre-stream failed view,
 *                                         Retry, Cancel, ?demo=1 replay, env fallback,
 *                                         non-scenario demo, "Use sample plan" shown/hidden,
 *                                         Cancel during replay
 *   tests/plan-replay-integration.test.tsx real replay + persisted fixture for all 3 scenarios
 *
 * Added here: corrupt record Delete + Regenerate actions, invalid share link,
 * read-only shared view, `?tab=` mirroring on tab change, and streaming a partial
 * plan into all four tabs.
 *
 * **Validates: Requirements 3.1, 3.4, 3.5, 3.6, 3.8**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import type { StoredPlan } from "@/lib/types";
import { encodeSharePayload } from "@/lib/share";

// ─── Mocks (same strategy as tests/plan-page.test.tsx) ───────────────────────

const mockSubmit = vi.fn();
let mockObject: Record<string, unknown> | undefined;
let mockIsLoading = false;

vi.mock("@ai-sdk/react", () => ({
  useObject: () => ({
    submit: mockSubmit,
    stop: vi.fn(),
    clear: vi.fn(),
    object: mockObject,
    isLoading: mockIsLoading,
    error: undefined,
  }),
}));

const mockInspect = vi.fn();
const mockSave = vi.fn<(record: StoredPlan) => Promise<void>>();
const mockRemove = vi.fn();
vi.mock("@/lib/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage")>();
  return {
    ...actual,
    localRepo: {
      get: vi.fn(),
      inspect: mockInspect,
      save: mockSave,
      list: vi.fn().mockResolvedValue([]),
      remove: mockRemove,
      onStorageDegraded: vi.fn().mockReturnValue(() => {}),
      getLastPlanId: vi.fn().mockReturnValue(null),
    },
  };
});

const mockReplace = vi.fn();
const mockPush = vi.fn();
const mockRefresh = vi.fn();
let searchString = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, refresh: mockRefresh }),
  usePathname: () => "/plan/test-id-001",
  useSearchParams: () => new URLSearchParams(searchString),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a">) =>
    React.createElement("a", { href, ...props }, children),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
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

// ─── Fixtures ────────────────────────────────────────────────────────────────

const validInput = {
  eventType: "wedding" as const,
  date: "2099-06-15",
  guestCount: 100,
  totalBudget: 500000,
  currency: "INR",
  city: "Mumbai",
};

const planData = {
  summary: "A lovely event.",
  budget: Array.from({ length: 4 }, (_, i) => ({
    category: `Cat${i}`,
    percent: 25,
    estimatedCost: 125000,
    tips: "Save money",
  })),
  timeline: Array.from({ length: 6 }, (_, i) => ({
    when: `${i} months before`,
    monthsBefore: 6,
    task: `Task${i}`,
    priority: "high" as const,
  })),
  vendors: Array.from({ length: 3 }, (_, i) => ({
    type: `Vendor${i}`,
    checklist: ["a", "b", "c"],
    budgetRange: "1-2k",
  })),
  ideas: Array.from({ length: 4 }, (_, i) => ({
    title: `Idea${i}`,
    description: "desc",
  })),
};

function makeRecord(plan: typeof planData | null) {
  return {
    id: "test-id-001",
    createdAt: "2099-01-01T00:00:00.000Z",
    updatedAt: "2099-01-01T00:00:00.000Z",
    input: validInput,
    plan,
    progress: { timeline: {}, vendors: {} },
    chat: [],
    version: 1 as const,
  };
}

async function renderPage(id = "test-id-001") {
  const { default: PlanPage } = await import("@/app/plan/[id]/page");
  await act(async () => {
    render(<PlanPage params={Promise.resolve({ id })} />);
  });
}

beforeEach(() => {
  mockSubmit.mockClear();
  mockInspect.mockReset();
  mockSave.mockReset().mockResolvedValue(undefined);
  mockRemove.mockReset().mockResolvedValue(undefined);
  mockReplace.mockClear();
  mockPush.mockClear();
  mockRefresh.mockClear();
  mockObject = undefined;
  mockIsLoading = false;
  searchString = "";
});
afterEach(cleanup);

// ─── Corrupt record recovery ─────────────────────────────────────────────────

describe("PlanShell corrupt record actions", () => {
  it("Delete removes the record and navigates home", async () => {
    mockInspect.mockResolvedValueOnce({ state: "missing" });
    mockInspect.mockResolvedValueOnce({ state: "corrupt", raw: "{bad" });
    const user = userEvent.setup();
    await renderPage();

    await user.click(await screen.findByRole("button", { name: /delete/i }));

    await waitFor(() => expect(mockRemove).toHaveBeenCalledWith("test-id-001"));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"));
  });

  it("offers no Regenerate when the input cannot be salvaged", async () => {
    mockInspect.mockResolvedValueOnce({ state: "missing" });
    mockInspect.mockResolvedValueOnce({ state: "corrupt", raw: "{bad" });
    await renderPage();

    await screen.findByText(/couldn't load this plan/i);
    expect(screen.queryByRole("button", { name: /regenerate from input/i })).toBeNull();
  });

  it("Regenerate from input saves a fresh plan-less record with the same id and refreshes", async () => {
    mockInspect.mockResolvedValueOnce({ state: "missing" });
    mockInspect.mockResolvedValueOnce({
      state: "corrupt",
      raw: JSON.stringify({ input: validInput, plan: "garbage" }),
    });
    const user = userEvent.setup();
    await renderPage();

    await user.click(await screen.findByRole("button", { name: /regenerate from input/i }));

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    const saved = mockSave.mock.calls[0][0];
    expect(saved.id).toBe("test-id-001");
    expect(saved.plan).toBeNull();
    expect(saved.input.city).toBe("Mumbai");
    expect(saved.progress).toEqual({ timeline: {}, vendors: {} });
    expect(saved.chat).toEqual([]);
    expect(saved.version).toBe(1);
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
  });
});

// ─── Shared links ────────────────────────────────────────────────────────────

describe("PlanShell shared links", () => {
  it("shows 'Invalid shared plan link' for a corrupted hash", async () => {
    window.location.hash = "#s=not-a-valid-payload";
    mockInspect.mockResolvedValue({ state: "missing" });
    await renderPage("shared");

    expect(await screen.findByText("Invalid shared plan link")).toBeTruthy();
    expect(screen.getByRole("link", { name: /back to home/i }).getAttribute("href")).toBe("/");
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("shows 'Invalid shared plan link' for the 'shared' id with no hash", async () => {
    mockInspect.mockResolvedValue({ state: "missing" });
    await renderPage("shared");

    expect(await screen.findByText("Invalid shared plan link")).toBeTruthy();
  });

  it("renders a valid shared plan read-only: banner, no refine panel, no Draft email, no API call", async () => {
    window.location.hash = `#s=${encodeSharePayload({ input: validInput, plan: planData })}`;
    mockInspect.mockResolvedValue({ state: "missing" });
    await renderPage("shared");

    expect(await screen.findByText(/viewing shared plan \(read-only mode\)/i)).toBeTruthy();
    expect(screen.getByRole("heading", { name: /wedding in mumbai/i })).toBeTruthy();
    expect(screen.queryByText("Refine plan")).toBeNull();

    // Vendors tab: checklists render but "Draft email" is withheld.
    searchString = "tab=vendors";
    cleanup();
    await renderPage("shared");
    await screen.findByText("Vendor0");
    expect(screen.queryByRole("button", { name: /draft email/i })).toBeNull();

    expect(mockSubmit).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("a stored (non-shared) plan shows no read-only banner and does offer the refine panel", async () => {
    mockInspect.mockResolvedValue({ state: "ok", record: makeRecord(planData) });
    await renderPage();

    await screen.findByRole("heading", { name: /wedding in mumbai/i });
    expect(screen.queryByText(/read-only mode/i)).toBeNull();
    expect(screen.getAllByText("Refine plan").length).toBeGreaterThan(0);
  });
});

// ─── ?tab= mirroring ─────────────────────────────────────────────────────────

describe("PlanShell tab mirroring", () => {
  it("defaults to the Budget tab and falls back to it for an invalid ?tab=", async () => {
    searchString = "tab=bogus";
    mockInspect.mockResolvedValue({ state: "ok", record: makeRecord(planData) });
    await renderPage();

    await screen.findByRole("heading", { name: /wedding in mumbai/i });
    expect(screen.getByRole("tab", { name: /budget/i }).getAttribute("data-active")).not.toBeNull();
    expect(screen.getByRole("tab", { name: /timeline/i }).getAttribute("data-active")).toBeNull();
  });

  it("clicking a tab writes ?tab=<section> via router.replace without scrolling", async () => {
    mockInspect.mockResolvedValue({ state: "ok", record: makeRecord(planData) });
    const user = userEvent.setup();
    await renderPage();

    await user.click(await screen.findByRole("tab", { name: /timeline/i }));
    expect(mockReplace).toHaveBeenLastCalledWith("/plan/test-id-001?tab=timeline", {
      scroll: false,
    });

    await user.click(screen.getByRole("tab", { name: /vendors/i }));
    expect(mockReplace).toHaveBeenLastCalledWith("/plan/test-id-001?tab=vendors", {
      scroll: false,
    });
  });

  it("preserves other query params when switching tabs", async () => {
    searchString = "demo=1&tab=budget";
    mockInspect.mockResolvedValue({ state: "ok", record: makeRecord(planData) });
    const user = userEvent.setup();
    await renderPage();

    await user.click(await screen.findByRole("tab", { name: /ideas/i }));
    const url = mockReplace.mock.calls.at(-1)![0] as string;
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("tab")).toBe("ideas");
    expect(params.get("demo")).toBe("1");
  });
});

// ─── Streaming into the four tabs ────────────────────────────────────────────

describe("PlanShell streaming into the four tabs", () => {
  const sections = [
    { tab: "budget", text: "Cat0" },
    { tab: "timeline", text: "Task0" },
    { tab: "vendors", text: "Vendor0" },
    { tab: "ideas", text: "Idea0" },
  ] as const;

  for (const { tab, text } of sections) {
    it(`streamed ${tab} content is shown on the ${tab} tab while generating`, async () => {
      searchString = `tab=${tab}`;
      mockIsLoading = true;
      mockObject = planData;
      mockInspect.mockResolvedValue({ state: "ok", record: makeRecord(null) });
      await renderPage();

      await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
      expect(await screen.findByText(text)).toBeTruthy();
      // Generating: Cancel is offered and nothing is persisted yet.
      expect(screen.getByRole("button", { name: /cancel/i })).toBeTruthy();
      expect(mockSave).not.toHaveBeenCalled();
    });
  }

  it("shows the four tab triggers and the streamed summary in the header", async () => {
    mockIsLoading = true;
    mockObject = { summary: "Streaming summary text" };
    mockInspect.mockResolvedValue({ state: "ok", record: makeRecord(null) });
    await renderPage();

    await screen.findByText("Streaming summary text");
    for (const name of [/budget/i, /timeline/i, /vendors/i, /ideas/i]) {
      expect(screen.getByRole("tab", { name })).toBeTruthy();
    }
  });

  it("a section that has not streamed yet shows its skeleton instead of content", async () => {
    searchString = "tab=timeline";
    mockIsLoading = true;
    mockObject = { summary: "only a summary so far", budget: planData.budget };
    mockInspect.mockResolvedValue({ state: "ok", record: makeRecord(null) });
    await renderPage();

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
    await screen.findByText("only a summary so far");
    expect(screen.queryByText("Task0")).toBeNull();
  });

  it("does not offer the refine panel until a plan exists", async () => {
    mockIsLoading = true;
    mockObject = planData;
    mockInspect.mockResolvedValue({ state: "ok", record: makeRecord(null) });
    await renderPage();

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Refine plan")).toBeNull();
  });
});
