import { describe, it, expect } from "vitest";
import { countdownText, formatEventDate, formatMoney } from "@/lib/format";

describe("formatMoney", () => {
  it("formats INR with en-IN lakh/crore grouping and no decimals", () => {
    // ₹10,00,000 — Indian digit grouping (P2-T02 done-when).
    expect(formatMoney(1_000_000, "INR")).toBe("₹10,00,000");
  });

  it("formats USD with en-US grouping and no decimals", () => {
    expect(formatMoney(1_000_000, "USD")).toBe("$1,000,000");
  });

  it("is case-insensitive about the currency code", () => {
    expect(formatMoney(1_000_000, "inr")).toBe("₹10,00,000");
  });

  it("rounds away fractional digits", () => {
    expect(formatMoney(1234.89, "USD")).toBe("$1,235");
  });

  it("falls back gracefully for an unknown currency code", () => {
    const out = formatMoney(1000, "ZZZ");
    expect(out).toContain("ZZZ");
    expect(out).toContain("1,000");
  });

  it("treats non-finite amounts as zero", () => {
    expect(formatMoney(Number.NaN, "USD")).toBe("$0");
  });
});

describe("countdownText", () => {
  it("+94 days → '94 days to go'", () => {
    expect(countdownText(94)).toBe("94 days to go");
  });
  it("+1 day → 'Tomorrow'", () => {
    expect(countdownText(1)).toBe("Tomorrow");
  });
  it("0 days → 'Today!'", () => {
    expect(countdownText(0)).toBe("Today!");
  });
  it("-3 days → 'Event completed'", () => {
    expect(countdownText(-3)).toBe("Event completed");
  });
});

describe("formatEventDate", () => {
  it("formats a YYYY-MM-DD string as a local day/month/year", () => {
    expect(formatEventDate("2027-02-14")).toBe("14 Feb 2027");
  });
  it("returns the input unchanged when it is not a date", () => {
    expect(formatEventDate("not-a-date")).toBe("not-a-date");
  });
});
