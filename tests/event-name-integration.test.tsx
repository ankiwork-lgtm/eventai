/**
 * Integration: intake -> dashboard -> export with a typed event name.
 *
 * Types "Maya & Ravi" into the real IntakeForm (via LandingClient), persists
 * through the real localRepo (jsdom localStorage), then checks that the dashboard
 * header, share link, .ics (filename + content) and print view all show the name.
 *
 * **Validates: Requirements 1.19, 2.19**
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { decodeSharePayload } from "@/lib/share";
import { localRepo } from "@/lib/storage";
import type { StoredPlan } from "@/lib/types";

const NAME = "Maya & Ravi";

const { push, downloadIcsMock } = vi.hoisted(() => ({
  push: vi.fn(),
  downloadIcsMock: vi.fn(),
}));

vi.mock("@ai-sdk/react", () => ({
  useObject: () => ({
    submit: vi.fn(),
    stop: vi.fn(),
    clear: vi.fn(),
    object: undefined,
    isLoading: false,
    error: undefined,
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/plan/x",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a">) =>
    React.createElement("a", { href, ...props }, children),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
}));
vi.mock("@/lib/export", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/export")>();
  return { ...actual, downloadIcs: downloadIcsMock };
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

import { LandingClient } from "@/components/LandingClient";

function localDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const planData = {
  summary: "A lovely event.",
  budget: Array.from({ length: 4 }, (_, i) => ({
    category: `Cat${i}`,
    percent: 25,
    estimatedCost: 200000,
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
  ideas: Array.from({ length: 4 }, (_, i) => ({ title: `Idea${i}`, description: "desc" })),
};

/** Pre-fulfilled thenable so React.use() reads it synchronously. */
function resolvedParams<T>(value: T): Promise<T> {
  const p = Promise.resolve(value) as Promise<T> & { status?: string; value?: T };
  p.status = "fulfilled";
  p.value = value;
  return p;
}

beforeEach(() => {
  window.localStorage.clear();
  window.location.hash = "";
  push.mockClear();
  downloadIcsMock.mockReset();
});
afterEach(cleanup);

describe("event name: intake -> dashboard -> export", () => {
  it("carries the typed name through header, share link, .ics and print view", async () => {
    // 1. Intake: type the name and submit through the real form + localRepo.
    const user = userEvent.setup();
    render(<LandingClient />);
    await user.type(screen.getByLabelText(/event name/i), NAME);
    await user.type(screen.getByLabelText(/event date/i), localDate(30));
    await user.type(screen.getByLabelText(/number of guests/i), "120");
    await user.type(screen.getByLabelText(/total budget/i), "800000");
    await user.type(screen.getByLabelText(/city/i), "Mumbai");
    await user.click(screen.getByRole("button", { name: /generate my plan/i }));

    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    const id = (push.mock.calls[0][0] as string).split("/").pop()!;
    cleanup();

    // 2. Persist a generated plan on the stored record (generation is out of scope).
    const stored = JSON.parse(window.localStorage.getItem(`eventai:v1:plan:${id}`)!);
    expect(stored.input.eventName).toBe(NAME);
    const record: StoredPlan = { ...stored, plan: planData };
    await localRepo.save(record);

    // 3. Dashboard header shows the typed name.
    const { default: PlanPage } = await import("@/app/plan/[id]/page");
    await act(async () => {
      render(<PlanPage params={Promise.resolve({ id })} />);
    });
    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading.textContent).toBe(NAME);

    // 4. Share link decodes to the same name.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    await user.click(screen.getByRole("button", { name: /export/i }));
    await user.click(screen.getByRole("menuitem", { name: /copy link/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const url = String(writeText.mock.calls[0][0]);
    const hash = url.slice(url.indexOf("#"));
    expect(decodeSharePayload(hash)?.input.eventName).toBe(NAME);

    // 5. Calendar download: filename and content carry the name.
    await user.click(screen.getByRole("button", { name: /export/i }));
    await user.click(screen.getByRole("menuitem", { name: /download calendar/i }));
    expect(downloadIcsMock).toHaveBeenCalledTimes(1);
    const [filename, content] = downloadIcsMock.mock.calls[0] as [string, string];
    expect(filename).toContain(NAME);
    expect(filename.endsWith(".ics")).toBe(true);
    expect(content).toContain(NAME);
    cleanup();

    // 6. Print view reads the same persisted record.
    const { default: PrintPage } = await import("@/app/plan/[id]/print/page");
    render(
      <React.Suspense fallback={null}>
        <PrintPage params={resolvedParams({ id })} />
      </React.Suspense>,
    );
    const printHeading = await screen.findByRole("heading", { level: 1 });
    expect(printHeading.textContent).toContain(NAME);
  });
});
