/**
 * Share-link size caps (task 7.4). Validates: Requirements 2.14, 2.19, 3.8
 */
import { describe, expect, it } from "vitest";
import LZString from "lz-string";
import { decodeSharePayload, encodeSharePayload } from "@/lib/share";
import { SHARE_DECOMPRESSED_MAX_BYTES, SHARE_HASH_MAX_CHARS } from "@/lib/constants";

const input = {
  eventType: "wedding",
  eventName: "Sneha & Rohan",
  date: "2026-08-20",
  guestCount: 300,
  totalBudget: 2500000,
  currency: "INR",
  city: "Udaipur",
};
const plan = {
  summary: "A grand palace wedding in Udaipur.",
  budget: [
    { category: "Venue", percent: 50, estimatedCost: 1250000, tips: "Book early" },
    { category: "Catering", percent: 30, estimatedCost: 750000, tips: "Live stations" },
    { category: "Decor", percent: 15, estimatedCost: 375000, tips: "Lights" },
    { category: "Misc", percent: 5, estimatedCost: 125000, tips: "Contingency" },
  ],
  timeline: [
    { when: "6 months before", task: "Book palace", priority: "high" },
    { when: "3 months before", task: "Finalize menu", priority: "medium" },
    { when: "1 month before", task: "Invitations", priority: "high" },
    { when: "2 weeks before", task: "Fittings", priority: "medium" },
    { when: "1 day before", task: "Rehearsal", priority: "low" },
    { when: "1 day after", task: "Check-out", priority: "low" },
  ],
  vendors: [
    { type: "Venue", checklist: ["Lawn", "Rooms", "Power"], budgetRange: "10L-15L" },
    { type: "Catering", checklist: ["Thali", "Dessert", "Drinks"], budgetRange: "6L-8L" },
    { type: "Decor", checklist: ["Mandap", "Arch", "Tables"], budgetRange: "3L-4L" },
  ],
  ideas: [
    { title: "Royal Entry", description: "Vintage car arrival" },
    { title: "Folk Music", description: "Local musicians" },
    { title: "Fireworks", description: "Eco-friendly display" },
  ],
};

/** JSON of exactly `size` chars: valid payload plus an ignored `pad` key. */
function jsonOfSize(size: number): string {
  const base = JSON.stringify({ input, plan, pad: "" });
  return JSON.stringify({ input, plan, pad: "A".repeat(size - base.length) });
}

describe("share link caps", () => {
  it("accepts a payload exactly at the decompressed cap", () => {
    const json = jsonOfSize(SHARE_DECOMPRESSED_MAX_BYTES);
    expect(json.length).toBe(SHARE_DECOMPRESSED_MAX_BYTES);
    expect(decodeSharePayload(LZString.compressToEncodedURIComponent(json))).not.toBeNull();
  });

  it("rejects a payload one char over the decompressed cap", () => {
    const json = jsonOfSize(SHARE_DECOMPRESSED_MAX_BYTES + 1);
    expect(decodeSharePayload(LZString.compressToEncodedURIComponent(json))).toBeNull();
  });

  it("rejects a hash longer than the hash cap", () => {
    expect(decodeSharePayload("A".repeat(SHARE_HASH_MAX_CHARS + 1))).toBeNull();
  });

  it("returns null for corrupted or garbage data", () => {
    const good = encodeSharePayload({ input, plan } as never);
    expect(decodeSharePayload(good.slice(0, 20))).toBeNull();
    expect(decodeSharePayload(`${good.slice(0, 10)}!!!${good.slice(10)}`)).toBeNull();
    expect(decodeSharePayload("not-a-valid-hash")).toBeNull();
    expect(decodeSharePayload("#s=")).toBeNull();
  });

  it("bounded decompressor matches lz-string on varied text", () => {
    for (const pad of ["x", "hello hello hello", "ünïcödé ✓ 日本語".repeat(20), "abcabcabc".repeat(50)]) {
      const hash = LZString.compressToEncodedURIComponent(JSON.stringify({ input, plan, pad }));
      const decoded = decodeSharePayload(hash);
      expect(decoded).toEqual({ input, plan });
    }
  });
});
