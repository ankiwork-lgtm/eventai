/**
 * TabSkeletons: each skeleton renders its expected placeholder structure.
 *
 * **Validates: Requirements 1.18, 2.18**
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import {
  BudgetSkeleton,
  TimelineSkeleton,
  VendorsSkeleton,
  IdeasSkeleton,
} from "@/components/TabSkeletons";

afterEach(cleanup);

const count = (c: HTMLElement) => c.querySelectorAll('[data-slot="skeleton"]').length;

describe("TabSkeletons", () => {
  it.each([
    ["BudgetSkeleton", BudgetSkeleton, 6],
    ["TimelineSkeleton", TimelineSkeleton, 8],
    ["VendorsSkeleton", VendorsSkeleton, 4],
    ["IdeasSkeleton", IdeasSkeleton, 6],
  ])("%s renders %i placeholders", (_name, Component, expected) => {
    const { container } = render(<Component />);
    expect(count(container)).toBe(expected);
  });

  it("renders no text content (purely visual placeholders)", () => {
    for (const C of [BudgetSkeleton, TimelineSkeleton, VendorsSkeleton, IdeasSkeleton]) {
      const { container } = render(<C />);
      expect(container.textContent).toBe("");
      cleanup();
    }
  });
});
