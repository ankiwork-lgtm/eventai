/**
 * Shared, documented constants. Each value is defined once here and imported
 * by every consumer (routes, schema, components, hooks).
 *
 * NOTE: Next.js requires route segment config such as `export const maxDuration`
 * to be statically analyzable, so each route file keeps a numeric literal with a
 * comment pointing here. tests/constants.test.ts asserts the literals match.
 */

/** Max chat history entries sent to /api/refine; the server trims to the same. */
export const REFINE_HISTORY_LIMIT = 6;

/** Debounce (ms) before a plan record is persisted to localStorage. */
export const SAVE_DEBOUNCE_MS = 300;

/** Number of mood board images requested from / returned by the moodboard route. */
export const MOODBOARD_IMAGE_COUNT = 6;

/** Max characters of the mood board search query. */
export const MOODBOARD_QUERY_MAX = 100;

/** Cache lifetime (seconds) for mood board responses and upstream fetches (24h). */
export const MOODBOARD_CACHE_TTL_S = 86400;

/** Max guest count accepted by the schema and the intake form. */
export const GUEST_MAX = 10000;

/** Delay (ms) before auto-opening the browser print dialog on the print view. */
export const PRINT_DELAY_MS = 500;

/** How long (ms) a "Copied" confirmation stays visible before resetting. */
export const COPIED_RESET_MS = 2000;

/** Max execution time (seconds) for LLM-backed routes (plan, refine, email). */
export const MAX_DURATION_S = 60;

/** Max execution time (seconds) for the moodboard proxy route. */
export const MOODBOARD_MAX_DURATION_S = 30;

/**
 * Max length (chars) of an encoded share hash accepted by decodeSharePayload.
 * A maximum-size valid plan measures 16,058 chars, so 64 KiB leaves ~4x headroom.
 */
export const SHARE_HASH_MAX_CHARS = 64 * 1024;

/**
 * Max decompressed size of a share payload (measured in UTF-16 code units, which
 * is never larger than the UTF-8 byte count for the ASCII-heavy JSON we emit).
 * A maximum-size valid plan measures 38,819 bytes, so 200 KiB leaves ~5x headroom.
 */
export const SHARE_DECOMPRESSED_MAX_BYTES = 200 * 1024;

/** Default maximum retry attempts for LLM calls. */
export const MAX_RETRIES = 1;
