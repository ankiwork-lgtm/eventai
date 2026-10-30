/**
 * Canonical event-name helpers.
 *
 * The intake form writes `eventName`. Older stored records may only carry the
 * legacy `name` field, so reads fall back to it.
 */

import type { EventInput } from "@/lib/schema";

/** Maximum length of a generated filename stem (without extension). */
export const SAFE_FILENAME_MAX = 80;

type NameFields = Pick<EventInput, "eventType"> & {
  eventName?: string;
  /** @deprecated legacy field, read-only. */
  name?: string;
};

/**
 * Display name: trimmed `eventName`, else trimmed legacy `name`, else `fallback`.
 * Each consumer keeps its existing event-type fallback (e.g. "WEDDING PLAN"),
 * defaulting to the plain event type.
 */
export function getEventDisplayName(
  input: NameFields,
  fallback: string = input.eventType,
): string {
  return input.eventName?.trim() || input.name?.trim() || fallback;
}

/**
 * Makes a string safe for use as a filename stem: removes control characters,
 * path separators and reserved characters, collapses whitespace and caps length.
 * Returns "event" if nothing usable remains.
 */
export function toSafeFilename(name: string): string {
  const cleaned = Array.from(name)
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code > 0x1f && !(code >= 0x7f && code <= 0x9f);
    })
    .join("")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Slice by code points so surrogate pairs are never split.
  const capped = Array.from(cleaned).slice(0, SAFE_FILENAME_MAX).join("").trim();
  // Leading dots would produce hidden files / "..": drop them.
  const result = capped.replace(/^[.\s]+/, "");
  return result || "event";
}
