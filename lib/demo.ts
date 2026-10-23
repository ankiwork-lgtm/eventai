/**
 * lib/demo.ts (P5-T01, TDD §12.1, DD-5, S4)
 *
 * One-click demo scenarios. Dates are computed relative to an injectable
 * `today` so a demo never contains a past date.
 */

import { addDays } from "date-fns";
import { formatIsoDate } from "@/lib/dates";
import type { EventInput } from "@/lib/schema";

export type DemoScenarioId =
  | "wedding-mumbai"
  | "birthday-superhero"
  | "community-diwali";

export type DemoScenario = {
  id: DemoScenarioId;
  label: string;
  description: string;
  buildInput: (today: Date) => EventInput;
};

export const DEMO_SCENARIOS: readonly DemoScenario[] = [
  {
    id: "wedding-mumbai",
    label: "Mumbai wedding",
    description: "Maharashtrian wedding, 200 guests, ₹10,00,000",
    buildInput: (today) => ({
      eventType: "wedding",
      eventName: "Maharashtrian Wedding",
      date: formatIsoDate(addDays(today, 120)),
      guestCount: 200,
      totalBudget: 1_000_000,
      currency: "INR",
      city: "Mumbai",
      culturalTraditions: "Maharashtrian wedding, 2-day ceremony",
    }),
  },
  {
    id: "birthday-superhero",
    label: "Superhero birthday",
    description: "7th birthday, superhero theme, ~25 kids, ₹60,000",
    buildInput: (today) => ({
      eventType: "birthday",
      eventName: "7th Birthday Party",
      date: formatIsoDate(addDays(today, 30)),
      guestCount: 25,
      totalBudget: 60_000,
      currency: "INR",
      city: "Pune",
      theme: "Superhero",
      preferences: "Turning 7, about 25 kids",
    }),
  },
  {
    id: "community-diwali",
    label: "Community Diwali",
    description: "Neighbourhood Diwali, 300 attendees, ₹50,000",
    buildInput: (today) => ({
      eventType: "community",
      eventName: "Neighbourhood Diwali Celebration",
      date: formatIsoDate(addDays(today, 45)),
      guestCount: 300,
      totalBudget: 50_000,
      currency: "INR",
      city: "Pune",
      theme: "Diwali",
      preferences: "Neighbourhood Diwali celebration",
    }),
  },
];

export function getDemoScenario(id: string): DemoScenario | undefined {
  return DEMO_SCENARIOS.find((s) => s.id === id);
}

/**
 * Matches an input against the three demo scenarios (P5-T03): only exact
 * eventType + city + guestCount + totalBudget matches are eligible for
 * replay / sample-plan fallback. The date is ignored (it is relative to today).
 */
export function matchDemoScenario(
  input: Pick<EventInput, "eventType" | "city" | "guestCount" | "totalBudget">,
): DemoScenario | undefined {
  const reference = new Date(2000, 0, 1);
  return DEMO_SCENARIOS.find((s) => {
    const ref = s.buildInput(reference);
    return (
      ref.eventType === input.eventType &&
      ref.city.toLowerCase() === input.city.trim().toLowerCase() &&
      ref.guestCount === Number(input.guestCount) &&
      ref.totalBudget === Number(input.totalBudget)
    );
  });
}

