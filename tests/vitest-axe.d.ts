/**
 * Ambient types for the vitest-axe `toHaveNoViolations` matcher.
 *
 * vitest-axe 0.1.0's `extend-expect` entry is empty, so we register the matcher
 * manually in tests/setup.ts. This declaration teaches the Vitest `Assertion`
 * type about the matcher so `expect(await axe(...)).toHaveNoViolations()` typechecks.
 */

import "vitest";
import type { AxeMatchers } from "vitest-axe/matchers";

declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Assertion extends AxeMatchers {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
