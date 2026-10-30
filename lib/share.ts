/**
 * lib/share.ts (P4-T08, TDD §6.4, §14.2, Option B: Zero Infra URL Hash)
 *
 * Encodes and decodes shared plan payloads in the URL hash via lz-string compression.
 */

import LZString from "lz-string";
import { z } from "zod";
import { SHARE_DECOMPRESSED_MAX_BYTES, SHARE_HASH_MAX_CHARS } from "@/lib/constants";
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

const URI_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$";

/**
 * Bounded equivalent of LZString.decompressFromEncodedURIComponent.
 *
 * lz-string has no streaming or size-limited API, and LZ output can grow
 * quadratically with input length (a tiny hash can expand to hundreds of MB),
 * so the library call cannot be capped. This is the same algorithm (lz-string
 * 1.x, 6 bits per char) that aborts and returns null as soon as the output
 * would exceed `maxChars`. Also returns null for corrupt data.
 */
function boundedDecompress(input: string, maxChars: number): string | null {
  const src = input.replace(/ /g, "+");
  const length = src.length;
  const RESET = 32;

  let val = valueAt(0);
  let position = RESET;
  let index = 1;

  function valueAt(i: number): number {
    const v = URI_ALPHABET.indexOf(src.charAt(i));
    return v < 0 ? 0 : v;
  }

  function readBits(n: number): number {
    let bits = 0;
    const maxPower = 2 ** n;
    let power = 1;
    while (power !== maxPower) {
      const resb = val & position;
      position >>= 1;
      if (position === 0) {
        position = RESET;
        val = valueAt(index++);
      }
      bits |= (resb > 0 ? 1 : 0) * power;
      power <<= 1;
    }
    return bits;
  }

  const dictionary: string[] = ["0", "1", "2"];
  let enlargeIn = 4;
  let numBits = 3;

  const first = readBits(2);
  if (first === 2) return "";
  if (first !== 0 && first !== 1) return null;
  const firstChar = String.fromCharCode(readBits(first === 0 ? 8 : 16));
  dictionary[3] = firstChar;
  let w = firstChar;
  const result: string[] = [firstChar];
  let total = 1;

  for (;;) {
    if (index > length) return "";
    const code = readBits(numBits);
    let c = code;
    if (code === 0 || code === 1) {
      dictionary.push(String.fromCharCode(readBits(code === 0 ? 8 : 16)));
      c = dictionary.length - 1;
      enlargeIn--;
    } else if (code === 2) {
      return result.join("");
    }
    if (enlargeIn === 0) {
      enlargeIn = 2 ** numBits;
      numBits++;
    }

    let entry: string;
    if (dictionary[c] !== undefined) entry = dictionary[c];
    else if (c === dictionary.length) entry = w + w.charAt(0);
    else return null;

    total += entry.length;
    if (total > maxChars) return null;
    result.push(entry);
    dictionary.push(w + entry.charAt(0));
    enlargeIn--;
    w = entry;
    if (enlargeIn === 0) {
      enlargeIn = 2 ** numBits;
      numBits++;
    }
  }
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

  // Cap 1: reject oversized input before doing any decompression work.
  if (encoded.length > SHARE_HASH_MAX_CHARS) return null;

  try {
    // Cap 2: bounded decompression, always before JSON.parse.
    const decompressed = boundedDecompress(encoded, SHARE_DECOMPRESSED_MAX_BYTES);
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
