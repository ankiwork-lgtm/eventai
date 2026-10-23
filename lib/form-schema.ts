import { z } from "zod";
import { EventInputSchema } from "@/lib/schema";

/**
 * Form-layer schema: EventInputSchema + "date ≥ tomorrow" refinement.
 * The API schema (EventInputSchema) accepts today; the form is stricter.
 */
function isTomorrow(value: string): boolean {
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return false;
  }
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return date.getTime() >= tomorrow.getTime();
}

export const IntakeFormSchema = EventInputSchema.superRefine((data, ctx) => {
  if (data.date && !isTomorrow(data.date)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Event date must be at least tomorrow",
      path: ["date"],
    });
  }
});

/** Compute tomorrow as YYYY-MM-DD in local time (safe to call client-side). */
export function getTomorrowString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
