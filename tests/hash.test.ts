import { describe, it, expect } from "vitest";
import { hash } from "@/lib/hash";
import { normalize, taskKey, vendorItemKey } from "@/lib/progress";

// ---------------------------------------------------------------------------
// hash()
// ---------------------------------------------------------------------------

describe("hash", () => {
  it("identical strings produce identical hashes", () => {
    expect(hash("hello world")).toBe(hash("hello world"));
  });

  it("output contains only base36 characters [0-9a-z]", () => {
    const samples = ["", "hello", "EventAI 2025", "abc|def", "1234567890"];
    for (const s of samples) {
      expect(hash(s)).toMatch(/^[0-9a-z]+$/);
    }
  });

  it("distinct strings produce distinct hashes (sample set)", () => {
    const inputs = [
      "book the venue",
      "book venue",
      "hire photographer",
      "send invitations",
      "arrange catering",
      "catering|setup tables",
      "catering|order napkins",
    ];
    const hashes = inputs.map(hash);
    const unique = new Set(hashes);
    expect(unique.size).toBe(inputs.length);
  });

  it("empty string hashes without throwing", () => {
    expect(() => hash("")).not.toThrow();
    expect(typeof hash("")).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// normalize()
// ---------------------------------------------------------------------------

describe("normalize", () => {
  it("lowercases input", () => {
    expect(normalize("Book The Venue")).toBe("book the venue");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalize("  book the venue  ")).toBe("book the venue");
  });

  it("collapses internal whitespace to a single space", () => {
    expect(normalize("book  the\t\nvenue")).toBe("book the venue");
  });

  it("handles all three transformations together", () => {
    expect(normalize("  BOOK   THE   VENUE  ")).toBe("book the venue");
  });
});

// ---------------------------------------------------------------------------
// taskKey() — differing case/whitespace → same key; changing `when` → same key
// ---------------------------------------------------------------------------

describe("taskKey", () => {
  it("same task text → same key", () => {
    expect(taskKey({ task: "Book the venue" })).toBe(taskKey({ task: "Book the venue" }));
  });

  it("differing case → same key", () => {
    expect(taskKey({ task: "Book The Venue" })).toBe(taskKey({ task: "book the venue" }));
  });

  it("differing whitespace → same key", () => {
    expect(taskKey({ task: "Book  the  venue" })).toBe(taskKey({ task: "book the venue" }));
  });

  it("changing `when` does NOT change the key", () => {
    const k1 = taskKey({ task: "Book the venue", when: "6 months before" } as Parameters<typeof taskKey>[0]);
    const k2 = taskKey({ task: "Book the venue", when: "5 months before" } as Parameters<typeof taskKey>[0]);
    expect(k1).toBe(k2);
  });

  it("distinct task texts → distinct keys", () => {
    const k1 = taskKey({ task: "Book the venue" });
    const k2 = taskKey({ task: "Hire photographer" });
    expect(k1).not.toBe(k2);
  });
});

// ---------------------------------------------------------------------------
// vendorItemKey() — stable across case/whitespace; vendor type is included
// ---------------------------------------------------------------------------

describe("vendorItemKey", () => {
  it("same type + item → same key", () => {
    expect(vendorItemKey("Catering", "Setup tables")).toBe(
      vendorItemKey("Catering", "Setup tables"),
    );
  });

  it("differing case → same key", () => {
    expect(vendorItemKey("CATERING", "SETUP TABLES")).toBe(
      vendorItemKey("catering", "setup tables"),
    );
  });

  it("differing whitespace → same key", () => {
    expect(vendorItemKey("catering", "setup  tables")).toBe(
      vendorItemKey("catering", "setup tables"),
    );
  });

  it("same item text under different vendor types → distinct keys", () => {
    const k1 = vendorItemKey("Catering", "Confirm headcount");
    const k2 = vendorItemKey("Photography", "Confirm headcount");
    expect(k1).not.toBe(k2);
  });

  it("different items under same vendor type → distinct keys", () => {
    const k1 = vendorItemKey("Catering", "Setup tables");
    const k2 = vendorItemKey("Catering", "Order napkins");
    expect(k1).not.toBe(k2);
  });

  it("output is [0-9a-z]+", () => {
    expect(vendorItemKey("Catering", "Setup tables")).toMatch(/^[0-9a-z]+$/);
  });
});
