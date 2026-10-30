import { z } from "zod";
import { GUEST_MAX } from "@/lib/constants";

export const EVENT_TYPES = ["wedding", "birthday", "community"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Currencies accepted on requests and offered by the intake form (single source of truth). */
export const SUPPORTED_CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

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
  /** @deprecated Legacy field from older stored records. Read via getEventDisplayName; never written. */
  name: z.string().max(120).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  guestCount: z.coerce.number().int().positive().max(GUEST_MAX),
  totalBudget: z.coerce.number().positive(),
  // Lenient on purpose: records stored before SUPPORTED_CURRENCIES existed must still load.
  currency: z.string().length(3).default("INR"),
  city: z.string().min(2).max(80),
  theme: z.string().max(200).optional(),
  culturalTraditions: z.string().max(500).optional(),
  preferences: z.string().max(500).optional(),
});

/**
 * Same as EventInputBaseSchema but `currency` is restricted to SUPPORTED_CURRENCIES.
 * Used for data that reaches the LLM prompt (request bodies); never for stored records.
 */
export const EventInputRequestBaseSchema = EventInputBaseSchema.extend({
  currency: z.enum(SUPPORTED_CURRENCIES).default("INR"),
});

export const EventInputSchema = EventInputRequestBaseSchema.extend({
  date: EventInputBaseSchema.shape.date.refine(
    notInPast,
    "Date must be a valid date that is not in the past",
  ),
});

/** Event input as stored/read back: validated WITHOUT the "not in the past" refinement. */
export type EventInputBase = z.infer<typeof EventInputBaseSchema>;
/**
 * Event input as consumed across the app. `currency` is a plain string here because
 * stored records may carry codes outside SUPPORTED_CURRENCIES; request schemas
 * narrow it at the boundary.
 */
export type EventInput = EventInputBase;
/** Event input validated at the request boundary (currency restricted). */
export type EventInputRequest = z.infer<typeof EventInputSchema>;
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
      z
        .object({
          when: z.string().optional().describe("human label, e.g. '6 months before'"),
          // Models often emit null for the unused field; accept and normalise to undefined.
          monthsBefore: z
            .number()
            .int()
            .nonnegative()
            .nullish()
            .transform((v) => v ?? undefined)
            .optional(),
          daysBefore: z
            .number()
            .int()
            .nullish()
            .transform((v) => v ?? undefined)
            .optional()
            .describe("negative = after the event; 0 = event day"),
          task: z.string(),
          priority: z.enum(["high", "medium", "low"]),
        })
        .transform((item) => {
          if (item.when) return item;
          // Synthesise a human label when the LLM omits it but provides numeric fields.
          if (typeof item.daysBefore === "number") {
            const d = item.daysBefore;
            item.when =
              d < 0
                ? `${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} after`
                : d === 0
                  ? "Event day"
                  : `${d} day${d === 1 ? "" : "s"} before`;
          } else if (typeof item.monthsBefore === "number") {
            const m = item.monthsBefore;
            item.when = m === 0 ? "Month of event" : `${m} month${m === 1 ? "" : "s"} before`;
          }
          return item;
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
  // Request-only schema (stored chat records use the ChatMessage type, not this schema).
  // Bounded: user messages are <= 500 chars and assistant messages are the
  // changeSummary (<= 400 chars), so 1000 leaves headroom. `at` is an ISO timestamp.
  content: z.string().max(1000),
  at: z.string().max(40),
});

export const RefineRequestSchema = z.object({
  plan: PlanSchema,
  message: z.string().min(1).max(500),
  eventInput: EventInputRequestBaseSchema,
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

// ── Mood board schemas (network JSON guards) ─────────────────────────────────

const httpsUrl = z
  .string()
  .refine((value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "Must be an https URL");

/** One mood board image as returned by /api/moodboard. Only https url/link accepted. */
export const MoodBoardImageSchema = z.object({
  url: httpsUrl,
  alt: z.string(),
  credit: z.string(),
  link: httpsUrl,
});
export type MoodBoardImage = z.infer<typeof MoodBoardImageSchema>;

/** Subset of the Unsplash search payload that the moodboard route reads. */
export const UnsplashResponseSchema = z.object({
  results: z.array(z.unknown()).catch([]),
});

/** One Unsplash result; all fields optional, wrong-typed fields are rejected per item. */
export const UnsplashResultSchema = z.object({
  urls: z
    .object({ regular: z.string().optional(), small: z.string().optional() })
    .optional(),
  alt_description: z.string().nullish(),
  description: z.string().nullish(),
  user: z
    .object({
      name: z.string().nullish(),
      links: z.object({ html: z.string().nullish() }).optional(),
    })
    .optional(),
});
export type UnsplashResult = z.infer<typeof UnsplashResultSchema>;

/**
 * Parses an unknown value as a list of mood board images, skipping malformed
 * items individually. Never throws. Returns [] for a non-array.
 */
export function parseMoodBoardImages(data: unknown): MoodBoardImage[] {
  if (!Array.isArray(data)) return [];
  const out: MoodBoardImage[] = [];
  for (const item of data) {
    const parsed = MoodBoardImageSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

// ── Email API schemas (P4-T07) ───────────────────────────────────────────────

export const EmailRequestSchema = z.object({
  // Request-only; vendor type labels are short ("Photographer"). 200 leaves room for LLM wording.
  vendorType: z.string().min(1).max(200),
  eventInput: EventInputRequestBaseSchema,
  plan: PlanSchema,
});
export type EmailRequest = z.infer<typeof EmailRequestSchema>;

export const EmailSchema = z.object({
  subject: z.string().max(120),
  body: z.string().max(2000),
});
export type EmailDraft = z.infer<typeof EmailSchema>;
