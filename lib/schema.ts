import { z } from "zod";

export const EVENT_TYPES = ["wedding", "birthday", "community"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/**
 * Parses a strict YYYY-MM-DD string as a LOCAL calendar date.
 * Returns null for impossible dates (e.g. 2026-02-30).
 */
function parseLocalDate(value: string): Date | null {
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return null;
  }
  return date;
}

/**
 * DECISION (TDD S4): the API schema rejects past dates (date >= today, local time).
 * "Today" itself is accepted here; the stricter "date >= tomorrow" rule lives in the
 * form layer (P1-T08) so the server stays lenient about timezone edges.
 */
const notInPast = (value: string): boolean => {
  const date = parseLocalDate(value);
  if (!date) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return date.getTime() >= today.getTime();
};

/**
 * Same shape as EventInputSchema but WITHOUT the "not in the past" refinement.
 * Used by lib/storage.ts to validate records read back from localStorage: a plan
 * saved for a future date must still load after that date has passed.
 */
export const EventInputBaseSchema = z.object({
  eventType: z.enum(EVENT_TYPES),
  eventName: z.string().max(120).optional(),
  name: z.string().max(120).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  guestCount: z.coerce.number().int().positive().max(10000),
  totalBudget: z.coerce.number().positive(),
  currency: z.string().length(3).default("INR"),
  city: z.string().min(2).max(80),
  theme: z.string().max(200).optional(),
  culturalTraditions: z.string().max(500).optional(),
  preferences: z.string().max(500).optional(),
});

export const EventInputSchema = EventInputBaseSchema.extend({
  date: EventInputBaseSchema.shape.date.refine(
    notInPast,
    "Date must be a valid date that is not in the past",
  ),
});

export type EventInput = z.infer<typeof EventInputSchema>;
export type EventInputForm = z.input<typeof EventInputSchema>;

export const PlanSchema = z.object({
  summary: z.string().describe("2-4 sentence overview tailored to the event"),
  budget: z
    .array(
      z.object({
        category: z.string(),
        percent: z.number().nonnegative().max(100),
        estimatedCost: z.number().nonnegative(),
        tips: z
          .string()
          .describe("one or two cost-saving tips specific to this category"),
      }),
    )
    .min(4)
    .max(12),
  timeline: z
    .array(
      z.object({
        when: z.string().describe("human label, e.g. '6 months before'"),
        monthsBefore: z.number().int().nonnegative().optional(),
        daysBefore: z
          .number()
          .int()
          .optional()
          .describe("negative = after the event; 0 = event day"),
        task: z.string(),
        priority: z.enum(["high", "medium", "low"]),
      }),
    )
    .min(6)
    .max(40),
  vendors: z
    .array(
      z.object({
        type: z.string(),
        checklist: z.array(z.string()).min(3).max(10),
        budgetRange: z.string(),
      }),
    )
    .min(3)
    .max(12),
  ideas: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
      }),
    )
    .max(12)
    .default([]),
});
export type Plan = z.infer<typeof PlanSchema>;

// ── Refine API schemas (P3-T06) ──────────────────────────────────────────────

export const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  at: z.string(),
});

export const RefineRequestSchema = z.object({
  plan: PlanSchema,
  message: z.string().min(1).max(500),
  eventInput: EventInputBaseSchema,
  // Accept up to 20 messages; the route trims to the last 6 before the LLM call.
  history: z.array(ChatMessageSchema).max(20).optional(),
});
export type RefineRequest = z.infer<typeof RefineRequestSchema>;

// The LLM occasionally returns `plan` as a JSON-encoded string and overshoots the
// changeSummary length limit. Normalise both before validation instead of failing the request.
const CHANGE_SUMMARY_MAX = 400;

export const RefineResultSchema = z.object({
  plan: z.preprocess((v) => {
    if (typeof v !== "string") return v;
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }, PlanSchema),
  changeSummary: z.preprocess(
    (v) =>
      typeof v === "string" && v.length > CHANGE_SUMMARY_MAX
        ? `${v.slice(0, CHANGE_SUMMARY_MAX - 1).trimEnd()}…`
        : v,
    z.string().max(CHANGE_SUMMARY_MAX),
  ),
  newTotalBudget: z.number().positive().optional(),
});
export type RefineResult = z.infer<typeof RefineResultSchema>;

// ── Email API schemas (P4-T07) ───────────────────────────────────────────────

export const EmailRequestSchema = z.object({
  vendorType: z.string().min(1),
  eventInput: EventInputBaseSchema,
  plan: PlanSchema,
});
export type EmailRequest = z.infer<typeof EmailRequestSchema>;

export const EmailSchema = z.object({
  subject: z.string().max(120),
  body: z.string().max(2000),
});
export type EmailDraft = z.infer<typeof EmailSchema>;
