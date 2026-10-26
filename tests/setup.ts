import { beforeEach } from "vitest";

// Register the `toHaveNoViolations` matcher for axe-core accessibility assertions.
// vitest-axe 0.1.0 ships an empty `extend-expect` entry, so register the matcher
// explicitly from `vitest-axe/matchers` instead.
import { expect } from "vitest";
import * as axeMatchers from "vitest-axe/matchers";
expect.extend(axeMatchers);

// vitest setup: tell React we're in a test environment so act() works.
// @ts-expect-error — not in the standard types but required by React 19
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom does not implement matchMedia; components that read a media query
// (e.g. BudgetChart's prefers-reduced-motion hook) need a stub.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

// jsdom does not implement scrollIntoView; ChatRefiner uses it to scroll the
// message list to the bottom. Stub it so component tests don't throw.
if (typeof window !== "undefined") {
  window.HTMLElement.prototype.scrollIntoView = function () {};
  if (typeof beforeEach === "function") {
    beforeEach(() => {
      window.location.hash = "";
    });
  }
}
