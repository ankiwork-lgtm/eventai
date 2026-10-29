/**
 * tests/plan-replay-integration.test.tsx (P5-T03)
 *
 * Runs PlanShell with the REAL lib/replay and the REAL fixture (only storage,
 * navigation and the useObject network hook are stubbed) to show that a demo
 * scenario streams in section by section with zero API/network activity.
 */

import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";
import React from "react";
import { DEMO_SCENARIOS } from "@/lib/demo";
import { getFixture } from "@/lib/fixtures";

const mockSubmit = vi.fn();
vi.mock("@ai-sdk/react", () => ({
  useObject: () => ({
    submit: mockSubmit,
    stop: vi.fn(),
    clear: vi.fn(),
    object: undefined,
    isLoading: false,
    error: undefined,
  }),
}));

const mockInspect = vi.fn();
const mockSave = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage")>();
  return {
    ...actual,
    localRepo: {
      get: vi.fn(),
      inspect: mockInspect,
      save: mockSave,
      list: vi.fn().mockResolvedValue([]),
      remove: vi.fn(),
      onStorageDegraded: vi.fn().mockReturnValue(() => {}),
      getLastPlanId: vi.fn().mockReturnValue(null),
    },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/plan/demo-id",
  useSearchParams: () => new URLSearchParams("demo=1"),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a">) =>
    React.createElement("a", { href, ...props }, children),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
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

// The first dynamic import of the page pulls in the whole dashboard module graph, which
// took ~5s of the first test's 15s budget and made it time out on a loaded machine.
// Pay that cost once here, outside any single test's timeout.
beforeAll(async () => {
  await import("@/app/plan/[id]/page");
}, 60_000);

describe("PlanShell replay (real replayPlan + real fixture)", () => {
  for (const scenario of DEMO_SCENARIOS) {
    it(`${scenario.id}: streams in with no network call and persists the fixture`, async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("network must not be used in replay mode"));
      const fixture = getFixture(scenario.id);
      const input = scenario.buildInput(new Date());
      mockSave.mockClear();
      mockSubmit.mockClear();
      mockInspect.mockResolvedValue({
        state: "ok",
        record: {
          id: "demo-id",
          createdAt: "2099-01-01T00:00:00.000Z",
          updatedAt: "2099-01-01T00:00:00.000Z",
          input,
          plan: null,
          progress: { timeline: {}, vendors: {} },
          chat: [],
          version: 1,
        },
      });

      const { default: PlanPage } = await import("@/app/plan/[id]/page");
      await act(async () => {
        render(<PlanPage params={Promise.resolve({ id: "demo-id" })} />);
      });

      // First section (summary) appears while the rest is still pending: not saved yet.
      await waitFor(() =>
        expect(screen.getByText(fixture.summary.slice(0, 40), { exact: false })).toBeTruthy(),
      );
      expect(mockSave).not.toHaveBeenCalled();

      // After the full replay the completed fixture is persisted.
      await waitFor(() => expect(mockSave).toHaveBeenCalled(), { timeout: 6000 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const saved = mockSave.mock.calls.at(-1)![0] as any;
      expect(saved.plan.summary).toBe(fixture.summary);
      expect(saved.plan.timeline).toEqual(fixture.timeline);
      expect(saved.plan.budget).toEqual(fixture.budget);

      expect(mockSubmit).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    }, 15000);
  }
});
