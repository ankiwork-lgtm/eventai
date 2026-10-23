import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";

describe("next.config headers()", () => {
  it("returns at least one route entry covering all paths", async () => {
    expect(typeof nextConfig.headers).toBe("function");
    const routes = await nextConfig.headers!();
    expect(routes.length).toBeGreaterThan(0);
    const catchAll = routes.find((r) => r.source === "/:path*");
    expect(catchAll).toBeDefined();
  });

  it("includes X-Content-Type-Options: nosniff", async () => {
    const routes = await nextConfig.headers!();
    const catchAll = routes.find((r) => r.source === "/:path*")!;
    const header = catchAll.headers.find(
      (h) => h.key === "X-Content-Type-Options",
    );
    expect(header?.value).toBe("nosniff");
  });

  it("includes Referrer-Policy: strict-origin-when-cross-origin", async () => {
    const routes = await nextConfig.headers!();
    const catchAll = routes.find((r) => r.source === "/:path*")!;
    const header = catchAll.headers.find((h) => h.key === "Referrer-Policy");
    expect(header?.value).toBe("strict-origin-when-cross-origin");
  });

  it("includes X-Frame-Options: DENY", async () => {
    const routes = await nextConfig.headers!();
    const catchAll = routes.find((r) => r.source === "/:path*")!;
    const header = catchAll.headers.find((h) => h.key === "X-Frame-Options");
    expect(header?.value).toBe("DENY");
  });

  it("includes Permissions-Policy restricting camera, microphone, geolocation", async () => {
    const routes = await nextConfig.headers!();
    const catchAll = routes.find((r) => r.source === "/:path*")!;
    const header = catchAll.headers.find(
      (h) => h.key === "Permissions-Policy",
    );
    expect(header).toBeDefined();
    expect(header!.value).toContain("camera=()");
    expect(header!.value).toContain("microphone=()");
    expect(header!.value).toContain("geolocation=()");
  });
});
