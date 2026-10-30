/**
 * Content-Security-Policy builder (no nonces; see next.config.ts and README).
 *
 * `'unsafe-eval'` is only allowed in development, where React uses eval for
 * enhanced debugging (server error stacks). Production never needs it.
 */
export function buildCsp(nodeEnv: string | undefined = process.env.NODE_ENV): string {
  const isDev = nodeEnv === "development";
  const scriptSrc = `script-src 'self' 'unsafe-inline'${
    isDev ? " 'unsafe-eval'" : ""
  } https://va.vercel-scripts.com;`;

  return `
  default-src 'self';
  ${scriptSrc}
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data: https://images.unsplash.com https://*.unsplash.com;
  font-src 'self' data:;
  connect-src 'self' https://api.unsplash.com https://va.vercel-scripts.com https://vitals.vercel-insights.com;
  frame-ancestors 'none';
  form-action 'self';
  base-uri 'self';
  object-src 'none';
`
    .replace(/\s{2,}/g, " ")
    .trim();
}
