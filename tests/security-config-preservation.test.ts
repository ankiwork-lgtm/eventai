/**
 * Task 7.2: preservation tests (Stage 7, security configuration).
 *
 * Property 3: Preservation - other security headers, the 50 KB body limit, and
 * maximum-size valid share links must keep working after the CSP and share-cap
 * changes (7.3 / 7.4). These tests PASS on unfixed code and must keep passing.
 *
 * Validates: Requirements 3.8, 3.11
 *
 * CSP script-src is intentionally NOT pinned (7.3 changes it).
 */
import { describe, expect, it } from "vitest";
import LZString from "lz-string";
import nextConfig from "@/next.config";
import { MAX_BODY_BYTES, readJsonBody } from "@/lib/api";
import { decodeSharePayload, encodeSharePayload } from "@/lib/share";
import { z } from "zod";
import type { EventInput, Plan } from "@/lib/schema";

async function catchAllHeaders(): Promise<Map<string, string>> {
  const routes = await nextConfig.headers!();
  const catchAll = routes.find((r) => r.source === "/:path*")!;
  return new Map(catchAll.headers.map((h) => [h.key, h.value]));
}

describe("Preservation: security headers other than CSP script-src (3.11)", () => {
  it("pins the exact values of every non-CSP header", async () => {
    const headers = await catchAllHeaders();
    expect(headers.get("Strict-Transport-Security")).toBe(
      "max-age=63072000; includeSubDomains; preload",
    );
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
    expect(headers.get("Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
  });

  it("emits exactly the expected set of header names", async () => {
    const headers = await catchAllHeaders();
    expect([...headers.keys()].sort()).toEqual(
      [
        "Content-Security-Policy",
        "Cross-Origin-Opener-Policy",
        "Cross-Origin-Resource-Policy",
        "Permissions-Policy",
        "Referrer-Policy",
        "Strict-Transport-Security",
        "X-Content-Type-Options",
        "X-Frame-Options",
      ].sort(),
    );
  });

  it("pins every CSP directive except script-src", async () => {
    const csp = (await catchAllHeaders()).get("Content-Security-Policy")!;
    const directives = csp
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean);
    const nonScript = directives.filter((d) => !d.startsWith("script-src"));
    expect(nonScript).toEqual([
      "default-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' blob: data: https://images.unsplash.com https://*.unsplash.com",
      "font-src 'self' data:",
      "connect-src 'self' https://api.unsplash.com https://va.vercel-scripts.com https://vitals.vercel-insights.com",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
    ]);
    // script-src must still exist and keep the Vercel analytics origin + 'self'.
    const scriptSrc = directives.find((d) => d.startsWith("script-src"))!;
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).toContain("https://va.vercel-scripts.com");
  });
});

describe("Preservation: 50 KB request body limit (3.8)", () => {
  const schema = z.object({ pad: z.string().optional() });
  const jsonReq = (body: string) =>
    new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });

  it("MAX_BODY_BYTES is 50 KB (51,200 bytes)", () => {
    expect(MAX_BODY_BYTES).toBe(51_200);
  });

  it("accepts a body exactly at the limit and rejects one byte over with 413", async () => {
    const overhead = JSON.stringify({ pad: "" }).length;
    const atLimit = JSON.stringify({ pad: "a".repeat(MAX_BODY_BYTES - overhead) });
    expect(Buffer.byteLength(atLimit, "utf8")).toBe(MAX_BODY_BYTES);
    const ok = await readJsonBody(jsonReq(atLimit), schema);
    expect(ok.ok).toBe(true);

    const over = JSON.stringify({ pad: "a".repeat(MAX_BODY_BYTES - overhead + 1) });
    const rejected = await readJsonBody(jsonReq(over), schema);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.response.status).toBe(413);
  });
});

// ── Maximum-size valid plan ──────────────────────────────────────────────────

const WORDS = (
  "venue catering decor photography music invitation florist lighting transport " +
  "accommodation entertainment rehearsal tasting contract deposit permit security " +
  "hospitality ceremony reception guest banquet marquee stage sound stylist " +
  "bridal groom family tradition cultural vegetarian dessert beverage backup"
).split(" ");

/** Deterministic pseudo-random text of about `len` characters (not trivially compressible). */
function text(seed: number, len: number): string {
  let s = seed * 2654435761;
  let out = "";
  while (out.length < len) {
    s = (s * 1103515245 + 12345) % 2147483648;
    out += `${WORDS[s % WORDS.length]}${s % 7 === 0 ? ", " : " "}${s % 97}${" "}`;
  }
  return out.slice(0, len).trim();
}

function buildMaxInput(): EventInput {
  return {
    eventType: "wedding",
    eventName: text(1, 120),
    date: "2026-08-20",
    guestCount: 5000,
    totalBudget: 99_999_999,
    currency: "INR",
    city: text(2, 80),
    theme: text(3, 200),
    culturalTraditions: text(4, 500),
    preferences: text(5, 500),
  };
}

function buildMaxPlan(): Plan {
  return {
    summary: text(10, 800),
    budget: Array.from({ length: 12 }, (_, i) => ({
      category: text(100 + i, 40),
      percent: 8,
      estimatedCost: 8_333_333 + i,
      tips: text(200 + i, 300),
    })),
    timeline: Array.from({ length: 40 }, (_, i) => ({
      when: `${i + 1} weeks before: ${text(300 + i, 20)}`,
      task: text(400 + i, 200),
      priority: (["high", "medium", "low"] as const)[i % 3],
    })),
    vendors: Array.from({ length: 12 }, (_, i) => ({
      type: text(500 + i, 40),
      checklist: Array.from({ length: 10 }, (_, j) => text(600 + i * 10 + j, 120)),
      budgetRange: `INR ${1000 * (i + 1)} - ${2000 * (i + 1)}`,
    })),
    ideas: Array.from({ length: 12 }, (_, i) => ({
      title: text(800 + i, 50),
      description: text(900 + i, 300),
    })),
  };
}

describe("Preservation: maximum-size valid share link round-trips (3.8)", () => {
  const input = buildMaxInput();
  const plan = buildMaxPlan();

  it("builds a plan at every PlanSchema upper bound", () => {
    expect(plan.budget).toHaveLength(12);
    expect(plan.timeline).toHaveLength(40);
    expect(plan.vendors).toHaveLength(12);
    expect(plan.vendors.every((v) => v.checklist.length === 10)).toBe(true);
    expect(plan.ideas).toHaveLength(12);
  });

  it("encodes and decodes losslessly, with and without a #s= prefix", () => {
    const hash = encodeSharePayload({ input, plan });
    const decoded = decodeSharePayload(hash);
    expect(decoded).not.toBeNull();
    expect(decoded?.input).toEqual(input);
    expect(decoded?.plan).toEqual(plan);
    expect(decodeSharePayload(`#s=${hash}`)).toEqual(decoded);
  });

  it("reports decompressed JSON size and hash length (inputs for the 7.4 caps)", () => {
    const hash = encodeSharePayload({ input, plan });
    const json = JSON.stringify({ input, plan });
    const decompressedBytes = Buffer.byteLength(json, "utf8");
    expect(LZString.decompressFromEncodedURIComponent(hash)).toBe(json);

    console.warn(
      `[7.2] max-size plan: decompressed JSON = ${decompressedBytes} bytes ` +
        `(${(decompressedBytes / 1024).toFixed(1)} KB), hash length = ${hash.length} chars`,
    );
    // Sanity floor so the fixture is genuinely large; the 7.4 caps must exceed these.
    expect(decompressedBytes).toBeGreaterThan(30 * 1024);
    expect(hash.length).toBeGreaterThan(10_000);
  });
});
