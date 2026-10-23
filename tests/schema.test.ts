import { describe, expect, it } from "vitest";
import { EventInputSchema, PlanSchema, type Plan } from "@/lib/schema";

/** Local YYYY-MM-DD, `offsetDays` from today (not date-sensitive). */
function localDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const validInput = () => ({
  eventType: "wedding" as const,
  date: localDate(90),
  guestCount: 150,
  totalBudget: 1500000,
  city: "Pune",
});

describe("EventInputSchema", () => {
  it("parses valid input and defaults currency to INR", () => {
    const parsed = EventInputSchema.parse(validInput());
    expect(parsed.currency).toBe("INR");
    expect(parsed.guestCount).toBe(150);
  });

  it("coerces string numbers", () => {
    const parsed = EventInputSchema.parse({
      ...validInput(),
      guestCount: "200",
      totalBudget: "250000.5",
    });
    expect(parsed.guestCount).toBe(200);
    expect(parsed.totalBudget).toBe(250000.5);
  });

  it("rejects bad date format", () => {
    expect(EventInputSchema.safeParse({ ...validInput(), date: "12/05/2030" }).success).toBe(false);
  });

  it("rejects impossible calendar dates", () => {
    expect(EventInputSchema.safeParse({ ...validInput(), date: "2099-02-30" }).success).toBe(false);
  });

  it("rejects past dates but accepts today", () => {
    expect(EventInputSchema.safeParse({ ...validInput(), date: localDate(-1) }).success).toBe(false);
    expect(EventInputSchema.safeParse({ ...validInput(), date: localDate(0) }).success).toBe(true);
  });

  it("rejects guestCount 0 and 10001", () => {
    expect(EventInputSchema.safeParse({ ...validInput(), guestCount: 0 }).success).toBe(false);
    expect(EventInputSchema.safeParse({ ...validInput(), guestCount: 10001 }).success).toBe(false);
  });

  it("rejects negative budget", () => {
    expect(EventInputSchema.safeParse({ ...validInput(), totalBudget: -1 }).success).toBe(false);
  });
});

const validPlan = (): Plan => ({
  summary: "A lovely plan.",
  budget: Array.from({ length: 4 }, (_, i) => ({
    category: `Cat ${i}`,
    percent: 25,
    estimatedCost: 1000,
    tips: "Save money.",
  })),
  timeline: Array.from({ length: 6 }, (_, i) => ({
    when: `${i} months before`,
    monthsBefore: i,
    task: `Task ${i}`,
    priority: "medium" as const,
  })),
  vendors: Array.from({ length: 3 }, (_, i) => ({
    type: `Vendor ${i}`,
    checklist: ["a", "b", "c"],
    budgetRange: "1k-2k",
  })),
  ideas: Array.from({ length: 4 }, (_, i) => ({
    title: `Idea ${i}`,
    description: "Something nice.",
  })),
});

describe("PlanSchema", () => {
  it("validates a minimal plan", () => {
    expect(PlanSchema.safeParse(validPlan()).success).toBe(true);
  });

  it("rejects a plan with only 3 budget lines", () => {
    const plan = validPlan();
    plan.budget = plan.budget.slice(0, 3);
    expect(PlanSchema.safeParse(plan).success).toBe(false);
  });

  it("allows negative daysBefore for post-event tasks", () => {
    const plan = validPlan();
    plan.timeline[0].daysBefore = -1;
    expect(PlanSchema.safeParse(plan).success).toBe(true);
  });

  it("defaults missing ideas to empty array without failing validation", () => {
    const plan = validPlan();
    delete (plan as Partial<Plan>).ideas;
    const res = PlanSchema.safeParse(plan);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.ideas).toEqual([]);
    }
  });
});
