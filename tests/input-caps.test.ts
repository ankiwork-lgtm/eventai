import { describe, expect, it } from "vitest";
import {
  ChatMessageSchema,
  EmailRequestSchema,
  EventInputBaseSchema,
  RefineRequestSchema,
} from "@/lib/schema";

describe("length caps on request-only free text", () => {
  it("accepts history messages at the caps", () => {
    const res = ChatMessageSchema.safeParse({
      role: "user",
      content: "x".repeat(1000),
      at: "2026-01-01T00:00:00.000Z",
    });
    expect(res.success).toBe(true);
  });

  it("rejects over-long history content and timestamp", () => {
    const at = "2026-01-01T00:00:00.000Z";
    expect(
      ChatMessageSchema.safeParse({ role: "user", content: "x".repeat(1001), at }).success,
    ).toBe(false);
    expect(
      ChatMessageSchema.safeParse({ role: "user", content: "ok", at: "t".repeat(41) }).success,
    ).toBe(false);
  });

  it("caps vendorType (and still requires it)", () => {
    const field = EmailRequestSchema.shape.vendorType;
    expect(field.safeParse("Photographer").success).toBe(true);
    expect(field.safeParse("v".repeat(200)).success).toBe(true);
    expect(field.safeParse("v".repeat(201)).success).toBe(false);
    expect(field.safeParse("").success).toBe(false);
  });

  it("keeps existing caps on refine message and eventInput fields", () => {
    expect(RefineRequestSchema.shape.message.safeParse("m".repeat(501)).success).toBe(false);
    const shape = EventInputBaseSchema.shape;
    expect(shape.eventName.safeParse("n".repeat(121)).success).toBe(false);
    expect(shape.city.safeParse("c".repeat(81)).success).toBe(false);
    expect(shape.theme.safeParse("t".repeat(201)).success).toBe(false);
    expect(shape.culturalTraditions.safeParse("c".repeat(501)).success).toBe(false);
    expect(shape.preferences.safeParse("p".repeat(501)).success).toBe(false);
  });
});
