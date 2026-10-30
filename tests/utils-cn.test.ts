import { cva } from "class-variance-authority";
import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

/**
 * Class-merging behavior relied on by components/ui/*: plain joins, conditional
 * values, cva output with a caller className override, and Tailwind conflicts
 * where the last utility wins.
 */
describe("cn", () => {
  it("joins plain class strings and skips falsy values", () => {
    expect(cn("a", undefined, null, false, "", "b")).toBe("a b");
  });

  it("supports arrays and object syntax", () => {
    expect(cn(["a", { b: true, c: false }], "d")).toBe("a b d");
  });

  it("lets the last conflicting utility win", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
    expect(cn("text-sm", "text-lg")).toBe("text-lg");
    expect(cn("bg-primary", "bg-destructive")).toBe("bg-destructive");
  });

  it("keeps non-conflicting utilities and distinct variants", () => {
    expect(cn("hover:bg-muted", "bg-card")).toBe("hover:bg-muted bg-card");
    expect(cn("h-8 w-8", "size-4")).toBe("size-4");
    expect(
      cn("data-[state=open]:bg-muted", "data-[state=open]:bg-accent"),
    ).toBe("data-[state=open]:bg-accent");
  });

  it("merges a caller className over cva variants (button/badge/tabs pattern)", () => {
    const variants = cva("inline-flex h-8 px-2.5 text-sm", {
      variants: { size: { default: "h-8 px-2.5", lg: "h-10 px-4" } },
      defaultVariants: { size: "default" },
    });
    expect(cn(variants({ size: "lg", className: "px-6 custom" }))).toBe(
      "inline-flex text-sm h-10 px-6 custom",
    );
    expect(cn(variants(), "h-12")).toBe("inline-flex text-sm px-2.5 h-12");
  });

  it("handles arbitrary values and important modifiers", () => {
    expect(cn("w-[10px]", "w-[20px]")).toBe("w-[20px]");
    expect(cn("p-2", "!p-4")).toBe("p-2 !p-4");
  });

  it("returns an empty string for no input", () => {
    expect(cn()).toBe("");
  });
});
