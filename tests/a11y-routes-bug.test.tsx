/**
 * tests/a11y-routes-bug.test.tsx (task 9.1)
 *
 * Bug condition exploration for Stage 9 (group G). These tests encode the
 * EXPECTED behaviour and are meant to FAIL on the unfixed code. The failures
 * are the counterexamples that prove the defects exist. Do not weaken them.
 *
 * - ExportMenu keyboard contract (1.20 / 2.20)
 * - Print view table semantics and checklist boxes (1.21 / 2.21)
 * - Distinct route titles via Next metadata exports (1.22 / 2.22)
 *
 * Existing axe tests live in tests/a11y-axe.test.tsx and are not modified.
 *
 * **Validates: Requirements 1.20, 1.21, 1.22, 2.20, 2.21, 2.22**
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { axe } from "vitest-axe";
import { ExportMenu } from "@/components/ExportMenu";
import { BudgetTable } from "@/components/print/BudgetTable";
import { VendorList } from "@/components/print/VendorList";
import { getFixture } from "@/lib/fixtures";
import type { EventInput } from "@/lib/schema";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a">) =>
    React.createElement("a", { href, ...props }, children),
}));
// Heavy / Next-only modules that are irrelevant to the metadata assertions.
vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));
vi.mock("@vercel/analytics/next", () => ({ Analytics: () => null }));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children?: React.ReactNode }) => children,
}));
vi.mock("@/components/LandingClient", () => ({ LandingClient: () => null }));
vi.mock("@/components/PlanShell", () => ({ PlanShell: () => null }));
vi.mock("@/hooks/usePlanStore", () => ({ usePlanStore: () => ({}) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));

afterEach(cleanup);

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

// ─── Req 1.20 / 2.20: ExportMenu keyboard contract ────────────────────────────

describe("ExportMenu keyboard contract (bug condition)", () => {
  async function openWithEnter() {
    const user = userEvent.setup();
    render(<ExportMenu planId="p1" input={input} plan={plan} />);
    await user.tab();
    expect(document.activeElement).toBe(trigger());
    await user.keyboard("{Enter}");
    expect(screen.getByRole("menu")).toBeTruthy();
    return user;
  }

  it("opening with Enter then ArrowDown focuses the first item", async () => {
    const user = await openWithEnter();
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getAllByRole("menuitem")[0]);
  });

  it("End focuses the last item and Home focuses the first", async () => {
    const user = await openWithEnter();
    const items = screen.getAllByRole("menuitem");
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(items[items.length - 1]);
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(items[0]);
  });

  it("Escape closes the menu and returns focus to the trigger", async () => {
    const user = await openWithEnter();
    // Move focus into the menu (Tab reaches the first item today), then Escape.
    await user.tab();
    expect(screen.getAllByRole("menuitem")).toContain(document.activeElement);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("the trigger exposes aria-controls pointing at the menu", async () => {
    await openWithEnter();
    const controls = trigger().getAttribute("aria-controls");
    expect(controls).toBeTruthy();
    expect(document.getElementById(controls as string)).toBe(screen.getByRole("menu"));
  });
});

// ─── Req 1.21 / 2.21: print view table semantics ──────────────────────────────

describe("Print view semantics (bug condition)", () => {
  it("budget table header cells declare scope", () => {
    const { container } = render(
      <BudgetTable budget={plan.budget} currency="INR" totalBudget={500000} />,
    );
    const headers = Array.from(container.querySelectorAll("th"));
    expect(headers.length).toBeGreaterThan(0);
    for (const th of headers) {
      expect(th.getAttribute("scope") ?? "(missing)").toMatch(/^(col|row)$/);
    }
  });

  it("budget table has a caption or accessible name", () => {
    const { container } = render(
      <BudgetTable budget={plan.budget} currency="INR" totalBudget={500000} />,
    );
    const table = container.querySelector("table") as HTMLTableElement;
    const named =
      !!table.querySelector("caption")?.textContent?.trim() ||
      !!table.getAttribute("aria-label") ||
      !!table.getAttribute("aria-labelledby");
    expect(named).toBe(true);
  });

  it("vendor checklist boxes have an accessible representation", () => {
    const { container } = render(<VendorList vendors={plan.vendors} />);
    const boxes = container.querySelectorAll('[role="checkbox"]');
    const items = container.querySelectorAll("ul li");
    expect(items.length).toBeGreaterThan(0);
    // Either a checkbox role per item, or visually hidden text inside each item.
    const hasHiddenText = Array.from(items).every((li) => li.querySelector(".sr-only"));
    expect(boxes.length === items.length || hasHiddenText).toBe(true);
  });

  it("axe finds no violations on the budget table", async () => {
    const { container } = render(
      <BudgetTable budget={plan.budget} currency="INR" totalBudget={500000} />,
    );
    // Passes today for generic rules; the scope/caption checks above carry the failure.
    expect(await axe(container)).toHaveNoViolations();
  });
});

// ─── Req 1.22 / 2.22: distinct route titles ───────────────────────────────────

type MetaTitle = string | { default?: string; template?: string; absolute?: string } | undefined;
type MetaModule = { metadata?: { title?: MetaTitle } };

function titleText(mod: MetaModule): string | undefined {
  const t = mod.metadata?.title;
  if (typeof t === "string") return t;
  return t?.absolute ?? t?.default;
}

describe("Route titles (bug condition)", () => {
  it("root layout metadata has title.template '%s | EventAI'", async () => {
    const layout = (await import("@/app/layout")) as MetaModule;
    const t = layout.metadata?.title;
    expect(typeof t === "object" && t !== null ? t.template : undefined).toBe("%s | EventAI");
  });

  it("landing, plan and print pages each export a metadata title", async () => {
    const landing = (await import("@/app/page")) as MetaModule;
    const planPage = (await import("@/app/plan/[id]/page")) as MetaModule;
    const print = (await import("@/app/plan/[id]/print/page")) as MetaModule;
    expect(titleText(landing)).toBeTruthy();
    expect(titleText(planPage)).toBeTruthy();
    expect(titleText(print)).toBeTruthy();
  });

  it("the three route titles are distinct", async () => {
    const landing = (await import("@/app/page")) as MetaModule;
    const planPage = (await import("@/app/plan/[id]/page")) as MetaModule;
    const print = (await import("@/app/plan/[id]/print/page")) as MetaModule;
    const titles = [titleText(landing), titleText(planPage), titleText(print)];
    expect(titles.every(Boolean)).toBe(true);
    expect(new Set(titles).size).toBe(3);
  });
});
