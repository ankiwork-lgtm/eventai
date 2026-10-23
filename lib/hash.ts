/**
 * FNV-1a 32-bit hash, base36 output.
 * No external dependencies; ~10 lines of logic.
 *
 * Reference: http://www.isthe.com/chongo/tech/comp/fnv/
 */
export function hash(str: string): string {
  let h = 0x811c9dc5; // FNV offset basis (32-bit)
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    // Multiply by FNV prime (32-bit): 0x01000193
    // Use Math.imul for correct 32-bit unsigned multiplication in JS
    h = Math.imul(h, 0x01000193);
  }
  // >>> 0 converts to unsigned 32-bit integer
  return (h >>> 0).toString(36);
}
