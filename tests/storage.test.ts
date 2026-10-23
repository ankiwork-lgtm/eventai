import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLocalRepo, salvageInput } from "@/lib/storage";
import type { StoredPlan } from "@/lib/types";

const validPlan = {
  summary: "A lovely event.",
  budget: Array.from({ length: 4 }, (_, i) => ({
    category: `Cat ${i}`,
    percent: 25,
    estimatedCost: 1000,
    tips: "Save money",
  })),
  timeline: Array.from({ length: 6 }, (_, i) => ({
    when: `${i} months before`,
    task: `Task ${i}`,
    priority: "high" as const,
  })),
  vendors: Array.from({ length: 3 }, (_, i) => ({
    type: `Vendor ${i}`,
    checklist: ["a", "b", "c"],
    budgetRange: "1-2k",
  })),
  ideas: Array.from({ length: 4 }, (_, i) => ({
    title: `Idea ${i}`,
    description: "desc",
  })),
};

function makePlan(id: string, updatedAt: string, overrides: Partial<StoredPlan> = {}): StoredPlan {
  return {
    id,
    createdAt: updatedAt,
    updatedAt,
    // Fixed past date on purpose: stored-record validation must not be date-sensitive.
    input: {
      eventType: "wedding",
      date: "2020-01-15",
      guestCount: 100,
      totalBudget: 500000,
      currency: "INR",
      city: "Pune",
    },
    plan: validPlan,
    progress: { timeline: { a: true }, vendors: {} },
    chat: [{ role: "user", content: "hi", at: updatedAt }],
    version: 1,
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("localRepo", () => {
  it("round-trips a record and tracks index + last keys", async () => {
    const repo = createLocalRepo();
    const p = makePlan("a", "2024-01-01T00:00:00.000Z");
    await repo.save(p);

    expect(await repo.get("a")).toEqual(p);
    expect(JSON.parse(window.localStorage.getItem("eventai:v1:index")!)).toEqual(["a"]);
    expect(window.localStorage.getItem("eventai:v1:last")).toBe("a");
    expect(window.localStorage.getItem("eventai:v1:plan:a")).not.toBeNull();
  });

  it("supports plan: null while generating", async () => {
    const repo = createLocalRepo();
    const p = makePlan("g", "2024-01-01T00:00:00.000Z", { plan: null });
    await repo.save(p);
    expect(await repo.get("g")).toEqual(p);
  });

  it("returns null for a missing id", async () => {
    expect(await createLocalRepo().get("nope")).toBeNull();
  });

  it("returns null and warns for corrupted JSON", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    window.localStorage.setItem("eventai:v1:plan:bad", "{not json");
    expect(await createLocalRepo().get("bad")).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it("returns null for a wrong version", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const p = { ...makePlan("v", "2024-01-01T00:00:00.000Z"), version: 2 };
    window.localStorage.setItem("eventai:v1:plan:v", JSON.stringify(p));
    expect(await createLocalRepo().get("v")).toBeNull();
  });

  it("returns null when the plan fails PlanSchema", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const p = makePlan("s", "2024-01-01T00:00:00.000Z", {
      plan: { ...validPlan, budget: [] },
    });
    window.localStorage.setItem("eventai:v1:plan:s", JSON.stringify(p));
    expect(await createLocalRepo().get("s")).toBeNull();
  });

  it("list() returns most recently updated first", async () => {
    const repo = createLocalRepo();
    await repo.save(makePlan("old", "2024-01-01T00:00:00.000Z"));
    await repo.save(makePlan("new", "2024-03-01T00:00:00.000Z"));
    await repo.save(makePlan("mid", "2024-02-01T00:00:00.000Z"));
    const ids = (await repo.list()).map((m) => m.id);
    expect(ids).toEqual(["new", "mid", "old"]);
  });

  it("remove() deletes the record, index entry and last pointer", async () => {
    const repo = createLocalRepo();
    await repo.save(makePlan("x", "2024-01-01T00:00:00.000Z"));
    await repo.remove("x");
    expect(await repo.get("x")).toBeNull();
    expect(await repo.list()).toEqual([]);
    expect(repo.getLastPlanId()).toBeNull();
  });

  it("inspect() distinguishes missing, ok and corrupt (P2-T10)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const repo = createLocalRepo();

    expect((await repo.inspect("none")).state).toBe("missing");

    const p = makePlan("good", "2024-01-01T00:00:00.000Z");
    await repo.save(p);
    const ok = await repo.inspect("good");
    expect(ok.state).toBe("ok");
    if (ok.state === "ok") expect(ok.record.id).toBe("good");

    window.localStorage.setItem("eventai:v1:plan:broken", "{not json");
    const corrupt = await repo.inspect("broken");
    expect(corrupt.state).toBe("corrupt");
    if (corrupt.state === "corrupt") expect(corrupt.raw).toBe("{not json");
  });

  it("falls back to memory when localStorage throws, and fires onStorageDegraded once", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    const repo = createLocalRepo();
    const cb = vi.fn();
    repo.onStorageDegraded(cb);

    await repo.save(makePlan("m1", "2024-01-01T00:00:00.000Z"));
    await repo.save(makePlan("m2", "2024-02-01T00:00:00.000Z"));
    await Promise.resolve(); // flush the deferred notification

    expect(cb).toHaveBeenCalledTimes(1);
    expect((await repo.get("m1"))?.id).toBe("m1");
    expect((await repo.list()).map((m) => m.id)).toEqual(["m2", "m1"]);
    expect(repo.getLastPlanId()).toBe("m2");

    // A late subscriber is notified immediately; the first is not re-fired.
    const late = vi.fn();
    repo.onStorageDegraded(late);
    expect(late).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe("salvageInput (P2-T10)", () => {
  it("recovers a valid EventInput from a corrupt record's raw JSON", () => {
    const raw = JSON.stringify({
      id: "x",
      input: {
        eventType: "birthday",
        date: "2020-01-01", // past date OK: base schema has no future-date rule
        guestCount: 20,
        totalBudget: 50000,
        currency: "INR",
        city: "Pune",
      },
      plan: "💥 corrupt tail",
    });
    const input = salvageInput(raw);
    expect(input).not.toBeNull();
    expect(input?.eventType).toBe("birthday");
    expect(input?.city).toBe("Pune");
  });

  it("returns null when the input is not salvageable", () => {
    expect(salvageInput("{not json")).toBeNull();
    expect(salvageInput(JSON.stringify({ input: { eventType: "nope" } }))).toBeNull();
  });
});
