/**
 * tests/a11y-axe.test.tsx  (gap fix: automated accessibility audit)
 *
 * Runs axe-core over the key dashboard components and asserts zero violations.
 * This complements the targeted ARIA assertions in accessibility.test.tsx with a
 * broad automated sweep (colour-independent cues, label associations, roles,
 * name/role/value, etc.).
 *
 * recharts is mocked (it cannot render meaningfully in jsdom) and PlanContext is
 * stubbed so components render standalone.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import React from "react";

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

const progress = { timeline: {}, vendors: {} };

describe("axe: ProgressBar", () => {
  it("has no accessibility violations", async () => {
    const { ProgressBar } = await import("@/components/ProgressBar");
    const plan = {
      summary: "S",
      budget: [],
      timeline: [
        { task: "Book venue", when: "6m before", monthsBefore: 6, priority: "high" as const },
        { task: "Send invites", when: "3m before", monthsBefore: 3, priority: "low" as const },
      ],
      vendors: [],
      ideas: [],
    };
    const { container } = render(
      <ProgressBar plan={plan} progress={{ timeline: { "Book venue": true }, vendors: {} }} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("axe: Timeline", () => {
  it("has no accessibility violations", async () => {
    const { Timeline } = await import("@/components/Timeline");
    const items = [
      { task: "Book venue", when: "6 months before", monthsBefore: 6, priority: "high" as const },
      { task: "Send invites", when: "3 months before", monthsBefore: 3, priority: "medium" as const },
      { task: "Confirm catering", when: "1 month before", monthsBefore: 1, priority: "low" as const },
    ];
    const { container } = render(
      <Timeline items={items} progress={progress} isStreaming={false} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("axe: BudgetChart", () => {
  it("has no accessibility violations", async () => {
    const { BudgetChart } = await import("@/components/BudgetChart");
    const items = [
      { category: "Venue", percent: 40, estimatedCost: 40000, tips: "Book early" },
      { category: "Catering", percent: 35, estimatedCost: 35000, tips: "Taste test" },
      { category: "Decor", percent: 25, estimatedCost: 25000, tips: "DIY options" },
    ];
    const { container } = render(
      <BudgetChart items={items} currency="INR" total={100000} isStreaming={false} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("axe: VendorChecklist (expanded)", () => {
  it("has no accessibility violations once the panel is open", async () => {
    const { VendorChecklist } = await import("@/components/VendorChecklist");
    const vendors = [
      {
        type: "Caterer",
        budgetRange: "50k-80k",
        checklist: ["Book venue", "Confirm menu", "Final headcount"],
      },
    ];
    const { container } = render(
      <VendorChecklist vendors={vendors} progress={progress} isStreaming={false} />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /caterer/i }));
    await screen.findAllByRole("checkbox");

    expect(await axe(container)).toHaveNoViolations();
  });
});

// ─── G2-T01: colour contrast ──────────────────────────────────────────────────
//
// jsdom has no layout engine and does not load Tailwind's stylesheet, so axe's
// `color-contrast` rule cannot resolve real colours and reports "incomplete"
// rather than a pass/fail. We therefore (1) run axe with the rule explicitly
// enabled to catch anything it *can* resolve, and (2) verify WCAG AA ratios
// programmatically from the actual design tokens in app/globals.css, including
// semi-transparent backgrounds (e.g. `bg-destructive/10`) composited over the page.

describe("axe: color-contrast rule (IntakeForm)", () => {
  it("has no colour contrast violations with the rule explicitly enabled", async () => {
    const { IntakeForm } = await import("@/components/IntakeForm");
    const { container } = render(<IntakeForm onSubmit={() => {}} />);
    const results = await axe(container, {
      rules: { "color-contrast": { enabled: true } },
    });
    expect(results.violations.filter((v) => v.id === "color-contrast")).toHaveLength(0);
  });
});

type RGB = [number, number, number]; // gamma-encoded sRGB, 0..1

/** Parse `oklch(L C H / A%)` into gamma-encoded sRGB + alpha. */
function parseOklch(value: string): { rgb: RGB; alpha: number } {
  const m = value.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+)(%?))?\s*\)/);
  if (!m) throw new Error(`Unsupported colour: ${value}`);
  const [L, C, H] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const alpha = m[4] === undefined ? 1 : m[5] ? Number(m[4]) / 100 : Number(m[4]);

  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin: RGB = [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s,
  ];
  const gamma = (c: number) => {
    const x = Math.min(1, Math.max(0, c));
    return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
  };
  return { rgb: [gamma(lin[0]), gamma(lin[1]), gamma(lin[2])], alpha };
}

function composite(fg: { rgb: RGB; alpha: number }, bg: RGB): RGB {
  return [0, 1, 2].map((i) => fg.rgb[i] * fg.alpha + bg[i] * (1 - fg.alpha)) as RGB;
}

function luminance(rgb: RGB): number {
  const [r, g, b] = rgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Read the CSS custom properties declared in a `:root` / `.dark` block. */
function readTokens(selector: ":root" | ".dark"): Record<string, string> {
  const css = readFileSync(path.resolve(__dirname, "../app/globals.css"), "utf8");
  const block = css.match(new RegExp(`^${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`, "m"));
  if (!block) throw new Error(`Block ${selector} not found in globals.css`);
  const tokens: Record<string, string> = {};
  for (const [, name, value] of block[1].matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    tokens[name] = value.trim();
  }
  return tokens;
}

const WCAG_AA_TEXT = 4.5;

// [foreground token, background token] pairs used together as text-on-surface.
const TEXT_PAIRS: Array<[string, string]> = [
  ["foreground", "background"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["accent-foreground", "accent"],
  ["muted-foreground", "background"],
  ["muted-foreground", "muted"],
  ["muted-foreground", "card"],
  ["destructive", "background"],
  ["sidebar-foreground", "sidebar"],
  ["sidebar-primary-foreground", "sidebar-primary"],
  ["sidebar-accent-foreground", "sidebar-accent"],
];

describe.each([
  { theme: "light", selector: ":root" as const, destructiveTint: 0.1 },
  { theme: "dark", selector: ".dark" as const, destructiveTint: 0.2 },
])("colour contrast (WCAG AA) — $theme theme", ({ selector, destructiveTint }) => {
  const tokens = readTokens(selector);
  const colour = (name: string) => parseOklch(tokens[name]);

  it.each(TEXT_PAIRS)("%s on %s meets 4.5:1", (fg, bg) => {
    const bgRgb = composite(colour(bg), colour("background").rgb);
    const fgRgb = composite(colour(fg), bgRgb);
    expect(contrast(fgRgb, bgRgb)).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
  });

  it("destructive text on a semi-transparent destructive tint meets 4.5:1", () => {
    // e.g. `bg-destructive/10 text-destructive` (light) / `dark:bg-destructive/20` (dark)
    const destructive = colour("destructive");
    const tint = composite({ rgb: destructive.rgb, alpha: destructiveTint }, colour("background").rgb);
    expect(contrast(destructive.rgb, tint)).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
  });
});
