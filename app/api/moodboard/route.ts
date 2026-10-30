/**
 * GET /api/moodboard (P4-T09, TDD §14.3)
 *
 * Proxy to Unsplash Search API for event visual inspiration.
 * Returns up to MOODBOARD_IMAGE_COUNT curated images with photographer attribution.
 * Silently returns empty array if UNSPLASH_ACCESS_KEY is absent or if the query fails.
 */

import { enforceRateLimit } from "@/lib/api";
import { UnsplashResponseSchema, UnsplashResultSchema } from "@/lib/schema";
import {
  MOODBOARD_CACHE_TTL_S,
  MOODBOARD_IMAGE_COUNT,
  MOODBOARD_QUERY_MAX,
} from "@/lib/constants";

// Must stay a literal (Next needs it statically analyzable). Equals MOODBOARD_MAX_DURATION_S
// in lib/constants.ts; tests/constants.test.ts enforces this.
export const maxDuration = 30;

const CACHE_CONTROL = `s-maxage=${MOODBOARD_CACHE_TTL_S}, stale-while-revalidate=${MOODBOARD_CACHE_TTL_S}`;

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
  // 429 returns the shared error envelope plus Retry-After (same as other routes).
  // The success body remains a bare array. This is a GET with no request body,
  // so there is no body-read/parse step to align.
  const limited = enforceRateLimit(req, "/api/moodboard");
  if (limited) {
    limited.headers.set("Cache-Control", "no-store");
    return limited;
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").slice(0, MOODBOARD_QUERY_MAX).trim();

  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey || !q) {
    return Response.json([], {
      status: 200,
      headers: { "Cache-Control": CACHE_CONTROL },
    });
  }

  try {
    const unsplashUrl = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
      q,
    )}&per_page=${MOODBOARD_IMAGE_COUNT}&orientation=landscape`;

    const res = await fetch(unsplashUrl, {
      headers: {
        Authorization: `Client-ID ${accessKey}`,
        "Accept-Version": "v1",
      },
      next: { revalidate: MOODBOARD_CACHE_TTL_S },
    });

    // INTENTIONAL: upstream failures (non-2xx, network error, bad JSON) return
    // 200 with an empty array rather than an error envelope. The mood board is
    // decorative and the client hides the section silently when it is empty.
    if (!res.ok) {
      return Response.json([], { status: 200 });
    }

    // Validate the upstream payload; malformed results are skipped individually.
    const payload = UnsplashResponseSchema.safeParse(await res.json());
    const results = payload.success ? payload.data.results : [];

    const images = results
      .slice(0, MOODBOARD_IMAGE_COUNT)
      .flatMap((raw) => {
        const parsed = UnsplashResultSchema.safeParse(raw);
        return parsed.success ? [parsed.data] : [];
      })
      .map((img) => ({
        url: img.urls?.small || img.urls?.regular || "",
        alt: img.alt_description || img.description || `${q} decor`,
        credit: img.user?.name || "Unsplash Photographer",
        link: img.user?.links?.html
          ? `${img.user.links.html}?utm_source=eventai&utm_medium=referral`
          : "https://unsplash.com?utm_source=eventai&utm_medium=referral",
      }))
      .filter((img) => isValidHttpsUrl(img.url) && isValidHttpsUrl(img.link));

    return Response.json(images, {
      status: 200,
      headers: {
        "Cache-Control": CACHE_CONTROL,
      },
    });
  } catch {
    // Intentional empty-array fallback; see note above.
    return Response.json([], { status: 200 });
  }
}
