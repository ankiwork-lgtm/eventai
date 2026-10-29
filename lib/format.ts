/**
 * lib/format.ts — presentation helpers (TDD §9.3, §9.9)
 *
 * Pure functions, unit-tested. No React, no DOM.
 */

/**
 * Formats a monetary amount with no fractional digits (TDD §9.3).
 *
 * - Locale is `en-IN` when currency is INR (lakh/crore grouping → ₹10,00,000),
 *   otherwise `en-US`.
 * - `maximumFractionDigits: 0` so budgets render as whole units.
 * - Falls back gracefully if an unknown currency code is passed.
 *
 * @param amount - The amount to format. Non-finite values are formatted as 0.
 * @param currency - ISO 4217 code (case-insensitive); empty falls back to INR.
 * @returns The formatted string, e.g. "₹10,00,000" or "$1,000".
 */
export function formatMoney(amount: number, currency: string): string {
  const code = (currency || "INR").toUpperCase();
  const locale = code === "INR" ? "en-IN" : "en-US";
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    }).format(safeAmount);
  } catch {
    // Unknown/invalid currency code: fall back to a plain number with the code.
    return `${code} ${new Intl.NumberFormat(locale, {
      maximumFractionDigits: 0,
    }).format(safeAmount)}`;
  }
}

/**
 * Human countdown text for the header (TDD §9.9).
 *
 *   days > 1   → "94 days to go"
 *   days === 1 → "Tomorrow"
 *   days === 0 → "Today!"
 *   days < 0   → "Event completed"
 *
 * `days` is a whole-day delta (see lib/dates.ts `daysUntil`).
 *
 * @param days - Whole days until the event (negative once it has passed).
 * @returns The countdown label, or an empty string when `days` is not finite.
 */
export function countdownText(days: number): string {
  if (!Number.isFinite(days)) return "";
  if (days < 0) return "Event completed";
  if (days === 0) return "Today!";
  if (days === 1) return "Tomorrow";
  return `${days} days to go`;
}

/**
 * Formats a YYYY-MM-DD string as a readable local date, e.g. "14 Feb 2027".
 * Parses as a LOCAL calendar date (DD-15) so there is no UTC off-by-one.
 *
 * @param dateStr - A date in strict `YYYY-MM-DD` form.
 * @returns The formatted date, or `dateStr` unchanged if it is not a valid date.
 */
export function formatEventDate(dateStr: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return dateStr;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (Number.isNaN(date.getTime())) return dateStr;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
