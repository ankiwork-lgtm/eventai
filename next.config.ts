import type { NextConfig } from "next";
import { buildCsp } from "./lib/security/csp";

// CSP without nonces, so 'unsafe-inline' remains in script-src. Per the Next.js
// CSP guide (docs/01-app/02-guides/content-security-policy.md), nonces require
// dynamic rendering of every page, and Partial Prerendering (PPR) is
// incompatible with nonce-based CSP because static shell scripts cannot get the
// nonce. This app uses cacheComponents/PPR, so nonces are not an option today.
// 'unsafe-eval' is added only in development (see lib/security/csp.ts).
const cspHeader = buildCsp();

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

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
