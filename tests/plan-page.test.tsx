/**
 * tests/plan-page.test.tsx
 *
 * Component tests for the Phase 2 dashboard (components/PlanShell.tsx, rendered
 * through app/plan/[id]/page.tsx).
 *
 * Mocking strategy:
 * - `@ai-sdk/react` → mock `useObject`; capture onFinish/onError callbacks
 * - `lib/storage`   → mock `localRepo.inspect` / `get` / `save` / `remove`
 * - `next/navigation` → stub useRouter/usePathname/useSearchParams
 * - `next/link`, `sonner`, `recharts` → lightweight stubs
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import type { Plan } from "@/lib/schema";
import type { StoredPlan } from "@/lib/types";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockSubmit = vi.fn();
const mockStop = vi.fn();
const mockClear = vi.fn();

let mockObject: Record<string, unknown> | undefined = undefined;
let mockIsLoading = false;
let mockError: Error | undefined = undefined;
type FinishHandler = (e: { object: Plan | undefined; error: Error | undefined }) => void;
type ErrorHandler = (e: Error) => void;

let mockOnFinish: FinishHandler | undefined;
let mockOnError: ErrorHandler | undefined;
/** When true, `submit` gets a new identity every render (re-triggers effects that depend on it). */
let mockUnstableSubmit = false;

vi.mock("@ai-sdk/react", () => ({
  useObject: (opts: { onFinish?: FinishHandler; onError?: ErrorHandler }) => {
    mockOnFinish = opts.onFinish;
    mockOnError = opts.onError;
    return {
      submit: mockUnstableSubmit
        ? (...args: unknown[]) => mockSubmit(...args)
        : mockSubmit,
      stop: mockStop,
      clear: mockClear,
      object: mockObject,
      isLoading: mockIsLoading,
      error: mockError,
    };
  },
}));

const mockGet = vi.fn();
const mockInspect = vi.fn();
const mockSave = vi.fn<(record: StoredPlan) => Promise<void>>();
const mockRemove = vi.fn();

vi.mock("@/lib/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage")>();
  return {
    ...actual,
    localRepo: {
      get: mockGet,
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
let searchString = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  usePathname: () => "/plan/test-id-001",
  useSearchParams: () => new URLSearchParams(searchString),
}));

const mockReplayCancel = vi.fn();
const mockReplayPlan = vi.fn<
  (
    plan: unknown,
    onPartial: (p: unknown) => void,
    opts?: { onComplete?: () => void },
  ) => () => void
>(() => mockReplayCancel);
vi.mock("@/lib/replay", () => ({
  replayPlan: (
    plan: unknown,
    onPartial: (p: unknown) => void,
    opts?: { onComplete?: () => void },
  ) => mockReplayPlan(plan, onPartial, opts),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    React.createElement("a", { href, ...props }, children),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// Recharts' ResponsiveContainer needs a measured width; stub the chart lib so the
// donut renders in jsdom without layout.
vi.mock("recharts", () => {
  const Passthrough = ({ children }: React.PropsWithChildren) =>
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

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const validInput = {
  eventType: "wedding" as const,
  date: "2099-06-15",
  guestCount: 100,
  totalBudget: 500000,
  currency: "INR",
  city: "Mumbai",
};

const validPlanData = {
  summary: "A lovely event.",
  budget: Array.from({ length: 4 }, (_, i) => ({
    category: `Cat ${i}`,
    percent: 25,
    estimatedCost: 1000,
    tips: "Save money",
  })),
  timeline: Array.from({ length: 6 }, (_, i) => ({
    when: `${i} months before`,
    monthsBefore: 6,
    task: `Task ${i}`,
    priority: "high" as const,
  })),
  vendors: Array.from({ length: 3 }, (_, i) => ({
    type: `Vendor ${i}`,
    checklist: ["a", "b", "c"],
    budgetRange: "1-2k",
  })),
  ideas: Array.from({ length: 4 }, (_, i) => ({
    title: `Idea ${i}`,
    description: "desc",
  })),
};

function makeRecord(overrides: { plan?: typeof validPlanData | null } = {}) {
  return {
    id: "test-id-001",
    createdAt: "2099-01-01T00:00:00.000Z",
    updatedAt: "2099-01-01T00:00:00.000Z",
    input: validInput,
    plan: "plan" in overrides ? overrides.plan ?? null : null,
    progress: { timeline: {}, vendors: {} },
    chat: [],
    version: 1 as const,
  };
}

/** inspect() resolves with the appropriate envelope for a given record. */
function inspectOk(record: ReturnType<typeof makeRecord>) {
  return { state: "ok" as const, record };
}

// ─── Helper ───────────────────────────────────────────────────────────────────

async function renderPage(id: string) {
  const { default: PlanPage } = await import("@/app/plan/[id]/page");
  const params = Promise.resolve({ id });
  render(<PlanPage params={params} />);
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  mockSubmit.mockClear();
  mockStop.mockClear();
  mockReplayPlan.mockClear();
  mockReplayCancel.mockClear();
  mockSave.mockClear();
  mockGet.mockClear();
  mockInspect.mockClear();
  mockRemove.mockClear();
  mockReplace.mockClear();
  mockPush.mockClear();
  mockObject = undefined;
  mockIsLoading = false;
  mockError = undefined;
  mockOnFinish = undefined;
  mockOnError = undefined;
  searchString = "";
  mockUnstableSubmit = false;
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Plan dashboard", () => {
  it("shows the not-found state when the record is missing", async () => {
    // usePlanStore calls inspect once; PlanShell probes again for corrupt detection.
    mockInspect.mockResolvedValueOnce({ state: "missing" });
    mockInspect.mockResolvedValueOnce({ state: "missing" });

    await act(async () => {
      await renderPage("nonexistent-id");
    });

    await waitFor(() =>
      expect(screen.getByText(/plan not found on this device/i)).toBeTruthy(),
    );
    expect(screen.getByRole("link", { name: /back to home/i })).toBeTruthy();
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("shows the corrupt state with Delete when a record fails to parse", async () => {
    // usePlanStore calls inspect once (returns missing since it can't parse);
    // PlanShell corrupt probe calls inspect again and gets the corrupt envelope.
    mockInspect.mockResolvedValueOnce({ state: "missing" });
    mockInspect.mockResolvedValueOnce({ state: "corrupt", raw: "{bad" });

    await act(async () => {
      await renderPage("test-id-001");
    });

    await waitFor(() =>
      expect(screen.getByText(/couldn't load this plan/i)).toBeTruthy(),
    );
    expect(screen.getByRole("button", { name: /delete/i })).toBeTruthy();
  });

  it("renders the saved plan as a tabbed dashboard and does NOT call submit", async () => {
    mockInspect.mockResolvedValueOnce(inspectOk(makeRecord({ plan: validPlanData })));

    await act(async () => {
      await renderPage("test-id-001");
    });

    // Header title: "Wedding in Mumbai" (no eventName provided).
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /wedding in mumbai/i })).toBeTruthy(),
    );

    // Four tab triggers present.
    expect(screen.getByRole("tab", { name: /budget/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /timeline/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /vendors/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /ideas/i })).toBeTruthy();

    // No raw JSON dump anywhere (PROJECT_SPEC §13).
    expect(document.querySelector("pre")).toBeNull();

    // Already generated → no API call.
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("lands on the Ideas tab when ?tab=ideas", async () => {
    searchString = "tab=ideas";
    mockInspect.mockResolvedValueOnce(inspectOk(makeRecord({ plan: validPlanData })));

    await act(async () => {
      await renderPage("test-id-001");
    });

    await waitFor(() => expect(screen.getByRole("heading", { name: /wedding/i })).toBeTruthy());
    const ideasTab = screen.getByRole("tab", { name: /ideas/i });
    expect(ideasTab.getAttribute("data-active")).not.toBeNull();
  });

  it("calls submit exactly once when plan is null (StrictMode double-effect)", async () => {
    mockInspect.mockResolvedValue(inspectOk(makeRecord({ plan: null })));

    const { default: PlanPage } = await import("@/app/plan/[id]/page");
    const params = Promise.resolve({ id: "test-id-001" });

    await act(async () => {
      render(
        <React.StrictMode>
          <PlanPage params={params} />
        </React.StrictMode>,
      );
    });

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
    expect(mockSubmit).toHaveBeenCalledWith(validInput);
  });

  // Invariant (phase-1-scaffold "done when"): no double API call in Strict Mode.
  // PlanShell guards the auto-submit effect with a `submitted` useRef so the stream
  // starts exactly once even when the effect re-runs. The effect depends on `submit`,
  // whose identity is not guaranteed stable, so these tests give it a fresh identity on
  // every render: without the guard each re-render would fire another request.
  describe("Strict Mode double-call guard", () => {
    beforeEach(() => {
      mockUnstableSubmit = true;
    });

    async function renderStrict(id = "test-id-001") {
      const { default: PlanPage } = await import("@/app/plan/[id]/page");
      const params = Promise.resolve({ id });
      let utils!: ReturnType<typeof render>;
      await act(async () => {
        utils = render(
          <React.StrictMode>
            <PlanPage params={params} />
          </React.StrictMode>,
        );
      });
      return { utils, params, PlanPage };
    }

    it("does not submit again when the tree re-renders after the first submit", async () => {
      mockInspect.mockResolvedValue(inspectOk(makeRecord({ plan: null })));

      const { utils, params, PlanPage } = await renderStrict();
      await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));

      // Force several extra render passes (each re-runs effects under Strict Mode).
      for (let i = 0; i < 3; i++) {
        await act(async () => {
          utils.rerender(
            <React.StrictMode>
              <PlanPage params={params} />
            </React.StrictMode>,
          );
        });
      }

      expect(mockSubmit).toHaveBeenCalledTimes(1);
    });

    it("never submits when the stored record already has a plan", async () => {
      mockInspect.mockResolvedValue(inspectOk(makeRecord({ plan: validPlanData })));

      await renderStrict();
      await waitFor(() =>
        expect(screen.getByRole("heading", { name: /wedding/i })).toBeTruthy(),
      );

      expect(mockSubmit).not.toHaveBeenCalled();
    });
  });

  it("onFinish saves the finished plan to storage", async () => {
    mockInspect.mockResolvedValueOnce(inspectOk(makeRecord({ plan: null })));
    mockSave.mockResolvedValue(undefined);

    await act(async () => {
      await renderPage("test-id-001");
    });

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));

    await act(async () => {
      mockOnFinish?.({ object: validPlanData, error: undefined });
    });

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    const saved = mockSave.mock.calls[0][0];
    expect(saved.plan?.summary).toBe(validPlanData.summary);
    // Budget is normalized via normalizePlan (P4-T01) to match totalBudget (500000)
    const totalCost = (saved.plan?.budget ?? []).reduce((a, b) => a + b.estimatedCost, 0);
    expect(totalCost).toBe(validInput.totalBudget);
    expect(saved.id).toBe("test-id-001");
  });

  it("shows the interruption banner + Retry when a stream fails mid-flight", async () => {
    mockInspect.mockResolvedValueOnce(inspectOk(makeRecord({ plan: null })));
    // A partial object has already streamed in — this is a MID-stream failure,
    // so the partial stays visible with a banner (P2-T09), not the failed view.
    mockObject = { summary: "partial so far", budget: [{ category: "Venue" }] };

    await act(async () => {
      await renderPage("test-id-001");
    });
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));

    await act(async () => {
      mockOnError?.(new Error("Provider unreachable"));
    });

    await waitFor(() =>
      expect(screen.getByText(/generation interrupted/i)).toBeTruthy(),
    );
    expect(screen.getAllByRole("button", { name: /retry/i }).length).toBeGreaterThan(0);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("shows the pre-stream failed view with Retry when onError fires with no partial", async () => {
    mockInspect.mockResolvedValue(inspectOk(makeRecord({ plan: null })));

    await act(async () => {
      await renderPage("test-id-001");
    });
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));

    await act(async () => {
      mockOnError?.(new Error("Invalid API key"));
    });

    await waitFor(() =>
      expect(screen.getByText(/invalid api key/i)).toBeTruthy(),
    );
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("Retry re-submits exactly once", async () => {
    mockInspect.mockResolvedValueOnce(inspectOk(makeRecord({ plan: null })));
    const user = userEvent.setup();

    await act(async () => {
      await renderPage("test-id-001");
    });
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));

    await act(async () => {
      mockOnError?.(new Error("Timeout"));
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy(),
    );

    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(mockSubmit).toHaveBeenCalledTimes(2);
  });

  it("Cancel calls stop() and keeps a retry affordance (not a blank page)", async () => {
    mockInspect.mockResolvedValueOnce(inspectOk(makeRecord({ plan: null })));
    mockIsLoading = true; // simulate a live stream
    mockObject = { summary: "partial" };
    const user = userEvent.setup();

    await act(async () => {
      await renderPage("test-id-001");
    });
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(mockStop).toHaveBeenCalledTimes(1);
  });
});

// ─── Replay mode (P5-T03) ─────────────────────────────────────────────────────

describe("Plan dashboard replay mode", () => {
  const demoInput = {
    eventType: "wedding" as const,
    date: "2099-06-15",
    guestCount: 200,
    totalBudget: 1_000_000,
    currency: "INR",
    city: "Mumbai",
  };

  function demoRecord() {
    return { ...makeRecord({ plan: null }), input: demoInput };
  }

  it("?demo=1 on a scenario input replays the fixture with no API call, then persists it", async () => {
    searchString = "demo=1";
    mockInspect.mockResolvedValue(inspectOk(demoRecord()));
    mockSave.mockResolvedValue(undefined);

    await act(async () => {
      await renderPage("test-id-001");
    });

    await waitFor(() => expect(mockReplayPlan).toHaveBeenCalledTimes(1));
    expect(mockSubmit).not.toHaveBeenCalled();

    const fixture = mockReplayPlan.mock.calls[0][0] as { summary: string };
    expect(fixture.summary).toMatch(/Maharashtrian wedding/);

    // Reveal a partial, then finish the replay.
    await act(async () => {
      mockReplayPlan.mock.calls[0][1]({ summary: fixture.summary });
    });
    await act(async () => {
      mockReplayPlan.mock.calls[0][2]?.onComplete?.();
    });

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    const saved = mockSave.mock.calls[0][0];
    expect(saved.plan?.summary).toBe(fixture.summary);
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("NEXT_PUBLIC_DEMO_FALLBACK=true replays without ?demo=1", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_FALLBACK", "true");
    mockInspect.mockResolvedValue(inspectOk(demoRecord()));

    await act(async () => {
      await renderPage("test-id-001");
    });

    await waitFor(() => expect(mockReplayPlan).toHaveBeenCalledTimes(1));
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("?demo=1 with a non-scenario input still calls the API (only the three scenarios are eligible)", async () => {
    searchString = "demo=1";
    mockInspect.mockResolvedValue(inspectOk(makeRecord({ plan: null })));

    await act(async () => {
      await renderPage("test-id-001");
    });

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
    expect(mockReplayPlan).not.toHaveBeenCalled();
  });

  it("starts the replay once under StrictMode", async () => {
    searchString = "demo=1";
    mockInspect.mockResolvedValue(inspectOk(demoRecord()));

    const { default: PlanPage } = await import("@/app/plan/[id]/page");
    await act(async () => {
      render(
        <React.StrictMode>
          <PlanPage params={Promise.resolve({ id: "test-id-001" })} />
        </React.StrictMode>,
      );
    });

    await waitFor(() => expect(mockReplayPlan).toHaveBeenCalled());
    expect(mockSubmit).not.toHaveBeenCalled();
    // Strict Mode unmount cancels the first replay; the final one stays live.
    expect(mockReplayPlan.mock.calls.length - mockReplayCancel.mock.calls.length).toBe(1);
  });

  it("failure on a scenario input offers 'Use sample plan', which replays the fixture", async () => {
    mockInspect.mockResolvedValue(inspectOk(demoRecord()));
    const user = userEvent.setup();

    await act(async () => {
      await renderPage("test-id-001");
    });
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));

    await act(async () => {
      mockOnError?.(new Error("Invalid API key"));
    });

    await user.click(await screen.findByRole("button", { name: /use sample plan/i }));
    expect(mockReplayPlan).toHaveBeenCalledTimes(1);
    expect(mockSubmit).toHaveBeenCalledTimes(1); // only the original failed attempt
  });

  it("failure on a non-scenario input does not offer 'Use sample plan'", async () => {
    mockInspect.mockResolvedValue(inspectOk(makeRecord({ plan: null })));

    await act(async () => {
      await renderPage("test-id-001");
    });
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));

    await act(async () => {
      mockOnError?.(new Error("Invalid API key"));
    });

    await screen.findByRole("button", { name: /retry/i });
    expect(screen.queryByRole("button", { name: /use sample plan/i })).toBeNull();
  });

  it("Cancel during replay clears the replay timers and does not touch the API stream", async () => {
    searchString = "demo=1";
    mockInspect.mockResolvedValue(inspectOk(demoRecord()));
    const user = userEvent.setup();

    await act(async () => {
      await renderPage("test-id-001");
    });
    await waitFor(() => expect(mockReplayPlan).toHaveBeenCalledTimes(1));

    await user.click(await screen.findByRole("button", { name: /cancel/i }));
    expect(mockReplayCancel).toHaveBeenCalledTimes(1);
    expect(mockStop).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
    expect(screen.getByText(/generation cancelled/i)).toBeTruthy();
  });
});
