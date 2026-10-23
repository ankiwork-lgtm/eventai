import { describe, expect, it } from "vitest";
import { buildIcs } from "@/lib/export";
import type { EventInput, Plan } from "@/lib/schema";

const mockInput: EventInput = {
  eventType: "wedding",
  name: "Priya & Rahul",
  date: "2026-06-15",
  guestCount: 200,
  totalBudget: 1500000,
  currency: "INR",
  city: "Jaipur",
  theme: "Royal Heritage",
};

const mockPlan: Plan = {
  summary: "A grand royal wedding in Jaipur",
  budget: [
    { category: "Venue", estimatedCost: 750000, percent: 50, tips: "Book early" },
  ],
  timeline: [
    { task: "Book palace venue", monthsBefore: 6, priority: "high", when: "6 months before" },
    { task: "Hire photographer", monthsBefore: 4, priority: "medium", when: "4 months before" },
    { task: "Tasting menu", daysBefore: 14, priority: "low", when: "2 weeks before" },
    { task: "General brainstorm", when: "Ongoing", priority: "low" }, // Unresolved task
  ],
  vendors: [],
  ideas: [],
};

describe("lib/export (buildIcs)", () => {
  it("generates valid VCALENDAR with one VEVENT per resolved task plus one for the main event", () => {
    const ics = buildIcs({
      planId: "plan-123",
      input: mockInput,
      plan: mockPlan,
    });

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");

    // Count VEVENT occurrences
    const veventMatches = ics.match(/BEGIN:VEVENT/g) ?? [];
    // 3 resolved tasks + 1 main event = 4 VEVENTs
    expect(veventMatches.length).toBe(4);

    // Unresolved task should NOT be present
    expect(ics).not.toContain("General brainstorm");

    // Resolved tasks should be present
    expect(ics).toContain("Book palace venue");
    expect(ics).toContain("Hire photographer");
    expect(ics).toContain("Tasting menu");
    expect(ics).toContain("Priya & Rahul");
  });

  it("produces deterministic/stable UIDs across multiple builds", () => {
    const ics1 = buildIcs({
      planId: "plan-abc",
      input: mockInput,
      plan: mockPlan,
    });

    const ics2 = buildIcs({
      planId: "plan-abc",
      input: mockInput,
      plan: mockPlan,
    });

    const uids1 = (ics1.match(/UID:[^\r\n]+/g) ?? []).sort();
    const uids2 = (ics2.match(/UID:[^\r\n]+/g) ?? []).sort();

    expect(uids1).toEqual(uids2);
    expect(uids1).toContain("UID:plan-abc-main@eventai");
  });

  it("includes VALARM reminder for high priority tasks", () => {
    const ics = buildIcs({
      planId: "plan-123",
      input: mockInput,
      plan: mockPlan,
    });

    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("TRIGGER:-P1DT");
  });
});
