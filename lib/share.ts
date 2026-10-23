/**
 * lib/share.ts (P4-T08, TDD §6.4, §14.2, Option B: Zero Infra URL Hash)
 *
 * Encodes and decodes shared plan payloads in the URL hash via lz-string compression.
 */

import LZString from "lz-string";
import { z } from "zod";
import { EventInputBaseSchema, PlanSchema } from "@/lib/schema";

export const SharedPayloadSchema = z.object({
  input: EventInputBaseSchema,
  plan: PlanSchema,
});

export type SharedPayload = z.infer<typeof SharedPayloadSchema>;

/**
 * Compresses input + plan into a URL-safe encoded string.
 */
export function encodeSharePayload(payload: SharedPayload): string {
  const json = JSON.stringify(payload);
  return LZString.compressToEncodedURIComponent(json);
}

/**
 * Decodes and validates a shared payload from a hash string.
 * Accepts raw hash strings like "#s=...", "s=...", or the raw compressed token.
 * Returns null if the payload is invalid, corrupted, or tampered with.
 */
export function decodeSharePayload(hashOrEncoded: string): SharedPayload | null {
  if (!hashOrEncoded) return null;

  let encoded = hashOrEncoded.trim();
  if (encoded.startsWith("#")) {
    encoded = encoded.slice(1);
  }
  if (encoded.startsWith("s=")) {
    encoded = encoded.slice(2);
  }

  if (!encoded) return null;

  try {
    const decompressed = LZString.decompressFromEncodedURIComponent(encoded);
    if (!decompressed) return null;

    const parsedJson = JSON.parse(decompressed);
    const validated = SharedPayloadSchema.safeParse(parsedJson);
    if (!validated.success) {
      return null;
    }

    return validated.data as SharedPayload;
  } catch {
    return null;
  }
}
