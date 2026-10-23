import { describe, expect, it } from "vitest";
import { normalizePlan } from "@/lib/budget";
import type { Plan } from "@/lib/schema";

const basePlan: Plan = {
  summary: "A lovely wedding",
  budget: [
    { category: "Venue & Catering", estimatedCost: 500000, percent: 50, tips: "Book early" },
    { category: "Photography", estimatedCost: 200000, percent: 20, tips: "Review portfolios" },
    { category: "Decor & Flowers", estimatedCost: 150000, percent: 15, tips: "Seasonal flowers" },
    { category: "Attire", estimatedCost: 100000, percent: 10, tips: "Allow tailoring time" },
    { category: "Misc", estimatedCost: 50000, percent: 5, tips: "Contingency" },
  ],
  timeline: [],
  vendors: [],
  ideas: [],
};

describe("normalizePlan", () => {
  it("handles empty or missing budget gracefully", () => {
    const emptyPlan: Plan = { ...basePlan, budget: [] };
    const res = normalizePlan(emptyPlan, 1000000);
    expect(res.warnings).toContain("Budget missing, regenerate");
    expect(res.plan.budget).toEqual([]);
  });

  it("handles single item budget correctly", () => {
    const singlePlan: Plan = {
      ...basePlan,
      budget: [{ category: "All in one", estimatedCost: 1000, percent: 100, tips: "Everything" }],
    };
    const res = normalizePlan(singlePlan, 50000);
    expect(res.plan.budget).toHaveLength(1);
    expect(res.plan.budget[0].estimatedCost).toBe(50000);
    expect(res.plan.budget[0].percent).toBe(100.0);
  });

  it("drops negative or non-finite values", () => {
    const badPlan: Plan = {
      ...basePlan,
      budget: [
        { category: "Good", estimatedCost: 4000, percent: 40, tips: "" },
        { category: "Negative cost", estimatedCost: -500, percent: 10, tips: "" },
        { category: "Negative percent", estimatedCost: 1000, percent: -20, tips: "" },
        { category: "NaN cost", estimatedCost: Number.NaN, percent: 30, tips: "" },
        { category: "Good 2", estimatedCost: 6000, percent: 60, tips: "" },
      ],
    };
    const res = normalizePlan(badPlan, 10000);
    expect(res.plan.budget).toHaveLength(2);
    expect(res.plan.budget.map((b) => b.category)).toEqual(["Good", "Good 2"]);
    const sumCost = res.plan.budget.reduce((a, b) => a + b.estimatedCost, 0);
    const sumPercent = res.plan.budget.reduce((a, b) => a + b.percent, 0);
    expect(sumCost).toBe(10000);
    expect(Math.round(sumPercent * 10) / 10).toBe(100.0);
  });

  it("uses costs as source of truth when sumCost is within ±25% of totalBudget", () => {
    const plan: Plan = {
      ...basePlan,
      budget: [
        { category: "A", estimatedCost: 5000, percent: 10, tips: "" }, // percents are bogus (10+20=30)
        { category: "B", estimatedCost: 5000, percent: 20, tips: "" },
      ],
    };
    // totalBudget = 10000, sumCost = 10000 (within ±25%)
    const res = normalizePlan(plan, 10000);
    expect(res.plan.budget[0].estimatedCost).toBe(5000);
    expect(res.plan.budget[1].estimatedCost).toBe(5000);
    expect(res.plan.budget[0].percent).toBe(50);
    expect(res.plan.budget[1].percent).toBe(50);
  });

  it("uses percents as source of truth when sumCost is outside ±25% of totalBudget", () => {
    const plan: Plan = {
      ...basePlan,
      budget: [
        { category: "A", estimatedCost: 100, percent: 70, tips: "" }, // costs are 100 + 100 = 200, but totalBudget is 10000
        { category: "B", estimatedCost: 100, percent: 30, tips: "" },
      ],
    };
    const res = normalizePlan(plan, 10000);
    expect(res.plan.budget[0].estimatedCost).toBe(7000);
    expect(res.plan.budget[1].estimatedCost).toBe(3000);
    expect(res.plan.budget[0].percent).toBe(70);
    expect(res.plan.budget[1].percent).toBe(30);
  });

  it("handles sumCost == 0 by deriving from percents", () => {
    const plan: Plan = {
      ...basePlan,
      budget: [
        { category: "A", estimatedCost: 0, percent: 60, tips: "" },
        { category: "B", estimatedCost: 0, percent: 40, tips: "" },
      ],
    };
    const res = normalizePlan(plan, 50000);
    expect(res.plan.budget[0].estimatedCost).toBe(30000);
    expect(res.plan.budget[1].estimatedCost).toBe(20000);
    expect(res.plan.budget[0].percent).toBe(60);
    expect(res.plan.budget[1].percent).toBe(40);
  });

  it("handles all-zero costs and percents by distributing equally", () => {
    const plan: Plan = {
      ...basePlan,
      budget: [
        { category: "A", estimatedCost: 0, percent: 0, tips: "" },
        { category: "B", estimatedCost: 0, percent: 0, tips: "" },
      ],
    };
    const res = normalizePlan(plan, 10000);
    expect(res.plan.budget[0].estimatedCost).toBe(5000);
    expect(res.plan.budget[1].estimatedCost).toBe(5000);
    expect(res.plan.budget[0].percent).toBe(50);
    expect(res.plan.budget[1].percent).toBe(50);
  });

  it("distributes integer remainders using largest-remainder method", () => {
    const plan: Plan = {
      ...basePlan,
      budget: [
        { category: "A", estimatedCost: 33, percent: 33.33, tips: "" },
        { category: "B", estimatedCost: 33, percent: 33.33, tips: "" },
        { category: "C", estimatedCost: 33, percent: 33.34, tips: "" },
      ],
    };
    const res = normalizePlan(plan, 100);
    const sumCost = res.plan.budget.reduce((a, b) => a + b.estimatedCost, 0);
    const sumPercent = res.plan.budget.reduce((a, b) => a + b.percent, 0);
    expect(sumCost).toBe(100);
    expect(Math.round(sumPercent * 10) / 10).toBe(100.0);
    // Integer costs must be integers
    for (const item of res.plan.budget) {
      expect(Number.isInteger(item.estimatedCost)).toBe(true);
    }
  });

  it("handles very large INR numbers accurately", () => {
    const largeBudget = 123456789;
    const plan: Plan = {
      ...basePlan,
      budget: [
        { category: "A", estimatedCost: 60000000, percent: 50, tips: "" },
        { category: "B", estimatedCost: 30000000, percent: 25, tips: "" },
        { category: "C", estimatedCost: 30000000, percent: 25, tips: "" },
      ],
    };
    const res = normalizePlan(plan, largeBudget);
    const sumCost = res.plan.budget.reduce((a, b) => a + b.estimatedCost, 0);
    expect(sumCost).toBe(largeBudget);
    const sumPercent = res.plan.budget.reduce((a, b) => a + b.percent, 0);
    expect(Math.round(sumPercent * 10) / 10).toBe(100.0);
  });

  it("emits warning when values move > 2 percentage points", () => {
    // Let's test when input percents are shifted, e.g. costs within 25% but percents were 50/50:
    const shiftedPlan: Plan = {
      ...basePlan,
      budget: [
        { category: "A", estimatedCost: 800, percent: 50, tips: "" }, // cost implies 80%, but percent said 50% (> 2 pts)
        { category: "B", estimatedCost: 200, percent: 50, tips: "" },
      ],
    };
    const res = normalizePlan(shiftedPlan, 1000);
    expect(res.warnings.length).toBeGreaterThan(0);
    expect(res.warnings[0]).toContain("We adjusted the figures to match your budget");
  });

  it("property test: exact sums for 100 random variations with seeded PRNG", () => {
    // Simple LCG PRNG for repeatable property test
    let seed = 42;
    function rand() {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    }

    for (let testRun = 0; testRun < 100; testRun++) {
      const numItems = Math.floor(rand() * 8) + 1; // 1 to 8 items
      const totalBudget = Math.floor(rand() * 10000000) + 10;
      const budgetItems = [];

      for (let i = 0; i < numItems; i++) {
        budgetItems.push({
          category: `Cat ${i}`,
          estimatedCost: Math.floor(rand() * totalBudget * 1.5),
          percent: Math.floor(rand() * 100),
          tips: "",
        });
      }

      const plan: Plan = { ...basePlan, budget: budgetItems };
      const res = normalizePlan(plan, totalBudget);

      const sumCost = res.plan.budget.reduce((a, b) => a + b.estimatedCost, 0);
      const sumPercent = res.plan.budget.reduce((a, b) => a + b.percent, 0);

      expect(sumCost).toBe(totalBudget);
      expect(Math.round(sumPercent * 10) / 10).toBe(100.0);
      for (const item of res.plan.budget) {
        expect(Number.isInteger(item.estimatedCost)).toBe(true);
        expect(item.estimatedCost).toBeGreaterThanOrEqual(0);
        expect(item.percent).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
