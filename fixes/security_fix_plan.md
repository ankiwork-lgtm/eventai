# 🔒 Security Score Improvement Plan (98 ➔ 100)

## Overview

- **Current Security Score:** 98 / 100
- **Target Security Score:** 100 / 100
- **Primary Objective:** Address the 2-point penalty gap across HTTP headers, route rate limiting, dependency auditing, URL protocol sanitization, and IP spoofing defenses.

---

## 🎯 Root Cause & Gap Analysis

| # | Gap / Vulnerability Area | Severity | Impact | Files Affected |
|---|---|---|---|---|
| **S1** | **Missing CSP & HSTS Headers**<br>No Content-Security-Policy or Strict-Transport-Security configured in Next.js response headers. | High | -1.0 pt | [`next.config.ts`](../next.config.ts) |
| **S2** | **Unprotected `/api/moodboard` Route**<br>Unlike `/api/plan`, `/api/refine`, and `/api/email`, `/api/moodboard` lacks rate limiting, making the Unsplash API key / quota vulnerable to exhaustion attacks. | Medium | -0.5 pt | [`lib/ratelimit.ts`](../lib/ratelimit.ts)<br>[`app/api/moodboard/route.ts`](../app/api/moodboard/route.ts) |
| **S3** | **Vulnerable Dependency in Production Tree**<br>`shadcn` CLI is incorrectly placed in `"dependencies"` instead of `"devDependencies"`, pulling vulnerable transitive packages (`body-parser`, `deepmerge`) into `pnpm audit`. | Medium | -0.5 pt | [`package.json`](../package.json) |
| **S4** | **Unsanitized External URL Protocols**<br>Image URLs and photographer links from external APIs are passed directly to the frontend without verifying that they use the `https:` protocol. | Low | -0.2 pt | [`app/api/moodboard/route.ts`](../app/api/moodboard/route.ts) |
| **S5** | **Client IP Header Spoofing Vulnerability**<br>`getClientIp()` prioritizes the unverified `x-forwarded-for` header before trusted cloud headers (`x-real-ip`, `x-vercel-ip`, `cf-connecting-ip`). | Low | -0.2 pt | [`lib/api.ts`](../lib/api.ts) |

---

## 🛠️ Step-by-Step Implementation Plan

### Step 1: Add Comprehensive CSP, HSTS, COOP, and CORP Headers
**Target:** [`next.config.ts`](../next.config.ts)

Configure a robust Content Security Policy that supports Next.js hydration, inline styles/scripts needed by Vercel Analytics and Tailwind v4, while locking down frame-ancestors, object sources, and script sources.

```ts
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline' https://va.vercel-scripts.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data: https://images.unsplash.com https://*.unsplash.com;
  font-src 'self' data:;
  connect-src 'self' https://api.unsplash.com https://va.vercel-scripts.com https://vitals.vercel-insights.com;
  frame-ancestors 'none';
  form-action 'self';
  base-uri 'self';
  object-src 'none';
`.replace(/\s{2,}/g, " ").trim();

const securityHeaders = [
  { key: "Content-Security-Policy", value: cspHeader },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];
```

---

### Step 2: Rate Limit `/api/moodboard` & Prevent Quota Depletion
**Target:** [`lib/ratelimit.ts`](../lib/ratelimit.ts) & [`app/api/moodboard/route.ts`](../app/api/moodboard/route.ts)

1. Register `/api/moodboard` in `ROUTE_LIMITS` (`lib/ratelimit.ts`):
   ```ts
   export const ROUTE_LIMITS: Record<string, RateLimitConfig> = {
     "/api/plan": { limit: 5, windowMs: 10 * 60 * 1000 },
     "/api/refine": { limit: 20, windowMs: 10 * 60 * 1000 },
     "/api/email": { limit: 20, windowMs: 10 * 60 * 1000 },
     "/api/moodboard": { limit: 30, windowMs: 10 * 60 * 1000 },
   };
   ```

2. Add rate limiting check to [`app/api/moodboard/route.ts`](../app/api/moodboard/route.ts):
   ```ts
   import { getClientIp } from "@/lib/api";
   import { checkRateLimit } from "@/lib/ratelimit";

   export async function GET(req: Request): Promise<Response> {
     const rl = checkRateLimit(getClientIp(req), "/api/moodboard");
     if (rl.limited) {
       return Response.json([], {
         status: 429,
         headers: {
           "Retry-After": String(rl.retryAfterSeconds),
           "Cache-Control": "no-store",
         },
       });
     }
     // ... rest of route handler
   ```

---

### Step 3: Move CLI Tooling to `devDependencies`
**Target:** [`package.json`](../package.json)

1. Move `"shadcn"` from `"dependencies"` to `"devDependencies"`.
2. Run `pnpm install` and verify `pnpm audit` passes without high-severity warnings for production dependencies.

---

### Step 4: Validate External Protocols on Unsplash Image & Attribution URLs
**Target:** [`app/api/moodboard/route.ts`](../app/api/moodboard/route.ts)

Ensure image URLs and photographer profile links returned from third-party APIs strictly adhere to `https:` protocols:

```ts
function isValidHttpsUrl(urlString?: string): boolean {
  if (!urlString) return false;
  try {
    const parsed = new URL(urlString);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// In the mapping step:
const images = results
  .slice(0, 6)
  .map((img: UnsplashResult) => ({
    url: img.urls?.small || img.urls?.regular || "",
    alt: img.alt_description || img.description || `${q} decor`,
    credit: img.user?.name || "Unsplash Photographer",
    link: img.user?.links?.html
      ? `${img.user.links.html}?utm_source=eventai&utm_medium=referral`
      : "https://unsplash.com?utm_source=eventai&utm_medium=referral",
  }))
  .filter((img) => isValidHttpsUrl(img.url) && isValidHttpsUrl(img.link));
```

---

### Step 5: Harden IP Extraction Against Header Spoofing
**Target:** [`lib/api.ts`](../lib/api.ts)

Prioritize trusted platform headers set by reverse proxies / cloud edges (`x-real-ip`, `x-vercel-ip`, `cf-connecting-ip`) before fallback to `x-forwarded-for`:

```ts
export function getClientIp(req: Request): string {
  const trustedHeader =
    req.headers.get("x-real-ip") ||
    req.headers.get("x-vercel-ip") ||
    req.headers.get("cf-connecting-ip");

  if (trustedHeader) return trustedHeader.trim();

  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}
```

---

## 🧪 Verification & Validation Checklist

Execute the following checks after applying the fixes:

1. **Unit & API Tests:**
   ```bash
   pnpm test
   ```
   - Ensure all rate limit tests, error response envelopes, and API route tests pass.

2. **Typecheck & Lint:**
   ```bash
   pnpm typecheck
   pnpm lint
   ```

3. **Dependency Audit:**
   ```bash
   pnpm audit
   ```

4. **Security Header Assertion:**
   - Verify `next.config.ts` exports all required headers.
   - Run integration tests validating response headers for `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, and `X-Frame-Options`.

---

## 📈 Expected Score Outcome

| Metric | Before Fixes | After Fixes |
|---|---|---|
| **Security Score** | **98 / 100** | **100 / 100** |
| **Overall Score** | **95.69 / 100** | **96.09+ / 100** |
