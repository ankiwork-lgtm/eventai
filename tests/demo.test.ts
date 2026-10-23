import { afterEach, describe, expect, it, vi } from "vitest";
import { DEMO_SCENARIOS, getDemoScenario } from "@/lib/demo";
import { daysUntil } from "@/lib/dates";
import { IntakeFormSchema } from "@/lib/form-schema";
import { EventInputSchema } from "@/lib/schema";

const TODAYS = [
  new Date(2026, 0, 1),
  new Date(2026, 1, 28),
  new Date(2027, 11, 31),
  new Date(2028, 1, 29),
  new Date(2030, 5, 15, 23, 59),
];

describe("lib/demo", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("exposes the three expected scenarios", () => {
    expect(DEMO_SCENARIOS.map((s) => s.id)).toEqual([
      "wedding-mumbai",
      "birthday-superhero",
      "community-diwali",
    ]);
    expect(getDemoScenario("wedding-mumbai")?.id).toBe("wedding-mumbai");
    expect(getDemoScenario("nope")).toBeUndefined();
  });

  for (const scenario of DEMO_SCENARIOS) {
    it(`${scenario.id} passes EventInputSchema for several 'today' values`, () => {
      for (const today of TODAYS) {
        // The schema's future-date rule reads the real clock, so pin it to `today`.
        vi.useFakeTimers();
        vi.setSystemTime(today);
        const input = scenario.buildInput(today);
        expect(EventInputSchema.safeParse(input).success).toBe(true);
        expect(IntakeFormSchema.safeParse(input).success).toBe(true);
        expect(daysUntil(input.date, today)).toBeGreaterThan(0);
        vi.useRealTimers();
      }
    });
  }

  it("wedding date is today + 120 days", () => {
    const today = new Date(2026, 0, 1);
    const input = getDemoScenario("wedding-mumbai")!.buildInput(today);
    expect(daysUntil(input.date, today)).toBe(120);
  });

  it("matches the specified scenario values", () => {
    const today = new Date(2026, 0, 1);
    const wedding = getDemoScenario("wedding-mumbai")!.buildInput(today);
    expect(wedding).toMatchObject({
      eventType: "wedding",
      city: "Mumbai",
      guestCount: 200,
      totalBudget: 1_000_000,
      currency: "INR",
    });
    const bday = getDemoScenario("birthday-superhero")!.buildInput(today);
    expect(bday).toMatchObject({
      eventType: "birthday",
      city: "Pune",
      guestCount: 25,
      totalBudget: 60_000,
    });
    const diwali = getDemoScenario("community-diwali")!.buildInput(today);
    expect(diwali).toMatchObject({
      eventType: "community",
      guestCount: 300,
      totalBudget: 50_000,
    });
  });
});
