/**
 * Route `maxDuration` must be a literal in each route file (Next reads it
 * statically), so this test keeps those literals in sync with lib/constants.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MAX_DURATION_S, MOODBOARD_MAX_DURATION_S } from "@/lib/constants";

function routeMaxDuration(route: string): number {
  const src = readFileSync(join(process.cwd(), "app", "api", route, "route.ts"), "utf8");
  const match = src.match(/^export const maxDuration = (\d+);/m);
  if (!match) throw new Error(`No literal maxDuration in ${route}/route.ts`);
  return Number(match[1]);
}

describe("route maxDuration literals match shared constants", () => {
  it.each(["plan", "refine", "email"])("/api/%s equals MAX_DURATION_S", (route) => {
    expect(routeMaxDuration(route)).toBe(MAX_DURATION_S);
  });

  it("/api/moodboard equals MOODBOARD_MAX_DURATION_S", () => {
    expect(routeMaxDuration("moodboard")).toBe(MOODBOARD_MAX_DURATION_S);
  });
});
