/**
 * GET /api/moodboard (P4-T09, TDD §14.3)
 *
 * Proxy to Unsplash Search API for event visual inspiration.
 * Returns up to 6 curated images with photographer attribution.
 * Silently returns empty array if UNSPLASH_ACCESS_KEY is absent or if the query fails.
 */

import { getClientIp } from "@/lib/api";
import { checkRateLimit } from "@/lib/ratelimit";

export const maxDuration = 30;

/** Returns true only when the string is a valid https: URL (S4). */
function isValidHttpsUrl(urlString?: string): boolean {
  if (!urlString) return false;
  try {
    const parsed = new URL(urlString);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

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

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").slice(0, 100).trim();

  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey || !q) {
    return Response.json([], {
      status: 200,
      headers: { "Cache-Control": "s-maxage=86400, stale-while-revalidate=86400" },
    });
  }

  try {
    const unsplashUrl = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
      q,
    )}&per_page=6&orientation=landscape`;

    const res = await fetch(unsplashUrl, {
      headers: {
        Authorization: `Client-ID ${accessKey}`,
        "Accept-Version": "v1",
      },
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      return Response.json([], { status: 200 });
    }

    const data = await res.json();
    const results = Array.isArray(data.results) ? data.results : [];

    type UnsplashResult = {
      urls?: { regular?: string; small?: string };
      alt_description?: string;
      description?: string;
      user?: { name?: string; links?: { html?: string } };
    };

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
      .filter((img: { url: string; link: string }) => isValidHttpsUrl(img.url) && isValidHttpsUrl(img.link));

    return Response.json(images, {
      status: 200,
      headers: {
        "Cache-Control": "s-maxage=86400, stale-while-revalidate=86400",
      },
    });
  } catch {
    return Response.json([], { status: 200 });
  }
}
