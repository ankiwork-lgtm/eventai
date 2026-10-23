import { describe, expect, it } from "vitest";
import { normalizePlan } from "@/lib/budget";
import { DEMO_SCENARIOS, matchDemoScenario } from "@/lib/demo";
import { FIXTURES, getFixture } from "@/lib/fixtures";
import { PlanSchema } from "@/lib/schema";

const FIXED_TODAY = new Date(2026, 0, 1);

describe("demo fixtures (P5-T03)", () => {
  it("has one fixture per demo scenario", () => {
    expect(Object.keys(FIXTURES).sort()).toEqual(
      DEMO_SCENARIOS.map((s) => s.id).sort(),
    );
  });

  for (const scenario of DEMO_SCENARIOS) {
    describe(scenario.id, () => {
      const fixture = getFixture(scenario.id);
      const input = scenario.buildInput(FIXED_TODAY);

      it("validates against PlanSchema", () => {
        expect(PlanSchema.safeParse(fixture).success).toBe(true);
      });

      it("passes normalizePlan with zero warnings", () => {
        const { warnings } = normalizePlan(fixture, input.totalBudget);
        expect(warnings).toEqual([]);
      });

      it("budget costs sum exactly to the scenario budget and percents to 100", () => {
        const cost = fixture.budget.reduce((a, b) => a + b.estimatedCost, 0);
        const percent = fixture.budget.reduce((a, b) => a + b.percent, 0);
        expect(cost).toBe(input.totalBudget);
        expect(Math.round(percent * 10) / 10).toBe(100);
      });

      it("is unchanged by normalizePlan", () => {
        const { plan } = normalizePlan(fixture, input.totalBudget);
        expect(plan.budget).toEqual(fixture.budget);
      });

      it("timeline ends with a day-after task", () => {
        const last = fixture.timeline[fixture.timeline.length - 1];
        expect(last.daysBefore).toBe(-1);
      });

      it("is matched by its own scenario input", () => {
        expect(matchDemoScenario(input)?.id).toBe(scenario.id);
      });
    });
  }

  it("does not match a non-demo input", () => {
    expect(
      matchDemoScenario({
        eventType: "wedding",
        city: "Delhi",
        guestCount: 200,
        totalBudget: 1_000_000,
      }),
    ).toBeUndefined();
  });
});
