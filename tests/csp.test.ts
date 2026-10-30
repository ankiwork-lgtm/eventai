import { describe, expect, it } from "vitest";
import { buildCsp } from "@/lib/security/csp";

function scriptSrc(csp: string): string {
  return csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith("script-src"))!;
}

describe("buildCsp", () => {
  it("production script-src has no 'unsafe-eval'", () => {
    expect(scriptSrc(buildCsp("production"))).toBe(
      "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
    );
  });

  it("development script-src adds 'unsafe-eval'", () => {
    expect(scriptSrc(buildCsp("development"))).toBe(
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
    );
  });

  it("test/undefined env behaves like production", () => {
    expect(buildCsp("test")).toBe(buildCsp("production"));
  });

  it("keeps other directives identical across environments", () => {
    const strip = (c: string) => c.replace(/ 'unsafe-eval'/, "");
    expect(strip(buildCsp("development"))).toBe(buildCsp("production"));
    expect(buildCsp("production")).toContain("frame-ancestors 'none'");
  });
});
