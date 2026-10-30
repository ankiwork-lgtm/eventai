import { describe, expect, it } from "vitest";
import {
  EmailRequestSchema,
  EventInputBaseSchema,
  EventInputSchema,
  RefineRequestSchema,
  SUPPORTED_CURRENCIES,
} from "@/lib/schema";
import { DEMO_SCENARIOS } from "@/lib/demo";

const base = {
  eventType: "wedding" as const,
  date: "2099-01-01",
  guestCount: 100,
  totalBudget: 100000,
  city: "Pune",
};

describe("SUPPORTED_CURRENCIES", () => {
  it.each(SUPPORTED_CURRENCIES)("request schema accepts %s", (code) => {
    expect(EventInputSchema.safeParse({ ...base, currency: code }).success).toBe(true);
  });

  it("request schema rejects an unsupported 3-letter code", () => {
    expect(EventInputSchema.safeParse({ ...base, currency: "XYZ" }).success).toBe(false);
  });

  it("refine and email request schemas also reject unsupported codes", () => {
    // Validate the eventInput field directly so the result is not masked by plan validation.
    for (const field of [
      RefineRequestSchema.shape.eventInput,
      EmailRequestSchema.shape.eventInput,
    ]) {
      expect(field.safeParse({ ...base, currency: "XYZ" }).success).toBe(false);
      expect(field.safeParse({ ...base, currency: "USD" }).success).toBe(true);
    }
  });

  it("stored-record schema still accepts an unsupported 3-letter code", () => {
    const parsed = EventInputBaseSchema.safeParse({ ...base, currency: "XYZ" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.currency).toBe("XYZ");
  });

  it("demo scenarios use supported currencies", () => {
    for (const s of DEMO_SCENARIOS) {
      const { currency } = s.buildInput(new Date(2030, 0, 1));
      expect(SUPPORTED_CURRENCIES).toContain(currency);
    }
  });
});
