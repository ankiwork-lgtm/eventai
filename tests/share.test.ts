import { describe, expect, it } from "vitest";
import LZString from "lz-string";
import { decodeSharePayload, encodeSharePayload } from "@/lib/share";
import type { EventInput, Plan } from "@/lib/schema";

const mockInput: EventInput = {
  eventType: "wedding",
  name: "Sneha & Rohan",
  date: "2026-08-20",
  guestCount: 300,
  totalBudget: 2500000,
  currency: "INR",
  city: "Udaipur",
};

const mockPlan: Plan = {
  summary: "A grand palace wedding in Udaipur.",
  budget: [
    { category: "Venue", percent: 50, estimatedCost: 1250000, tips: "Book 6 months ahead" },
    { category: "Catering", percent: 30, estimatedCost: 750000, tips: "Live stations" },
    { category: "Decor", percent: 15, estimatedCost: 375000, tips: "Fairy lights" },
    { category: "Misc", percent: 5, estimatedCost: 125000, tips: "Contingency" },
  ],
  timeline: [
    { when: "6 months before", task: "Book palace", priority: "high" },
    { when: "3 months before", task: "Finalize menu", priority: "medium" },
    { when: "1 month before", task: "Send invitations", priority: "high" },
    { when: "2 weeks before", task: "Fittings", priority: "medium" },
    { when: "1 day before", task: "Rehearsal", priority: "low" },
    { when: "1 day after", task: "Check-out", priority: "low" },
  ],
  vendors: [
    { type: "Venue", checklist: ["Palace lawn", "Rooms", "Power backup"], budgetRange: "10L-15L" },
    { type: "Catering", checklist: ["Rajasthani thali", "Dessert counter", "Drinks"], budgetRange: "6L-8L" },
    { type: "Decor", checklist: ["Mandap", "Entrance arch", "Table decor"], budgetRange: "3L-4L" },
  ],
  ideas: [
    { title: "Royal Entry", description: "Vintage car arrival" },
    { title: "Folk Music", description: "Local Manganiyar musicians" },
    { title: "Fireworks", description: "Eco-friendly display" },
    { title: "Photo Booth", description: "Royal turban corner" },
  ],
};

describe("lib/share (encodeSharePayload & decodeSharePayload)", () => {
  it("encodes and decodes a payload losslessly", () => {
    const encoded = encodeSharePayload({ input: mockInput, plan: mockPlan });
    expect(typeof encoded).toBe("string");
    expect(encoded.length).toBeGreaterThan(0);

    const decoded = decodeSharePayload(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded?.input.eventType).toBe("wedding");
    expect(decoded?.input.city).toBe("Udaipur");
    expect(decoded?.plan.budget).toHaveLength(4);
    expect(decoded?.plan.timeline).toHaveLength(6);
  });

  it("handles hashes with #s= or s= prefix correctly", () => {
    const encoded = encodeSharePayload({ input: mockInput, plan: mockPlan });
    const hashWithPrefix = `#s=${encoded}`;
    const decoded = decodeSharePayload(hashWithPrefix);
    expect(decoded).not.toBeNull();
    expect(decoded?.input.name).toBe("Sneha & Rohan");

    const queryWithPrefix = `s=${encoded}`;
    const decodedQuery = decodeSharePayload(queryWithPrefix);
    expect(decodedQuery).not.toBeNull();
  });

  it("returns null on tampered or corrupted payload strings", () => {
    expect(decodeSharePayload("invalid-garbage-payload")).toBeNull();
    expect(decodeSharePayload("#s=invalid-garbage-payload")).toBeNull();
    expect(decodeSharePayload("")).toBeNull();
  });

  it("returns null when decoded payload fails schema validation", () => {
    // Missing required fields
    const invalidObj = { input: { eventType: "invalid" }, plan: {} };
    const corruptedEncoded = LZString.compressToEncodedURIComponent(JSON.stringify(invalidObj));
    expect(decodeSharePayload(corruptedEncoded)).toBeNull();
  });
});
