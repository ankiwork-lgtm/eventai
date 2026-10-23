/**
 * lib/fixtures (P5-T03, TDD §12.2)
 *
 * Cached, pre-normalised plans for the three demo scenarios. Used by replay
 * mode and as the "Use sample plan" fallback when generation fails.
 */

import type { DemoScenarioId } from "@/lib/demo";
import type { Plan } from "@/lib/schema";
import weddingMumbai from "./wedding-mumbai.json";
import birthdaySuperhero from "./birthday-superhero.json";
import communityDiwali from "./community-diwali.json";

export const FIXTURES: Record<DemoScenarioId, Plan> = {
  "wedding-mumbai": weddingMumbai as Plan,
  "birthday-superhero": birthdaySuperhero as Plan,
  "community-diwali": communityDiwali as Plan,
};

export function getFixture(id: DemoScenarioId): Plan {
  return FIXTURES[id];
}
