# Phase 4: Polish & Extras (~3 h)

**Goal:** the differentiators: guaranteed-correct budgets, real calendar dates, export, vendor emails. Share link and mood board are optional.
**Refs:** PROJECT_SPEC §8 Nice-to-have, §10 Phase 4 · TDD §6.3, §6.4, §8.4–8.6, §14

Tasks P4-T01 – P4-T07 are **[NTH]**; P4-T08 and P4-T09 are **[OPT]**. Do P4-T01 first, since it backs a PROJECT_SPEC §13 acceptance criterion.

---

## [x] P4-T01: `lib/budget.ts` `normalizePlan` **[NTH, acceptance-critical]**

**Depends on:** Phase 3
**Refs:** PROJECT_SPEC §8, §13 · TDD §8.4, DD-9, R2

**Steps**
- Implement `normalizePlan(plan, totalBudget): { plan: Plan; warnings: string[] }` per TDD §8.4:
  1. Drop lines with non-finite or negative values.
  2. If `sumCost == 0`, derive costs from percents. Otherwise costs are the source of truth when within ±25 % of `totalBudget`, else percents are the source.
  3. Weights `w_i = source_i / Σ source`.
  4. `cost_i = floor(w_i × total)`; largest-remainder distribution of the leftover whole units.
  5. `percent_i = round(w_i × 100, 1)`; adjust the largest item so Σ = 100.0.
  6. Warning string when any value moved > 2 points.
- Edge cases: empty budget (return unchanged + warning "Budget missing, regenerate"), single category, zero-weight categories, all-zero sources.
- Wire it in at the single call sites created earlier: `PlanShell.onPlanComplete` (P2-T01) and `applyRefinement` (P3-T07). Warnings are held in UI state (not persisted) and passed to `BudgetChart`.
- Render a dismissible banner "We adjusted the figures to match your budget" in `BudgetChart`.

**Done when**
- `tests/budget.test.ts` covers: exact sums (cost = total, percent = 100.0) for many random inputs (property-style loop with a seeded RNG), source choice both ways, zeros, negatives, single item, remainder distribution, large INR numbers (e.g. 12,34,56,789), empty budget.
- Generating a real plan always shows chart total = entered budget.
- Refine with `newTotalBudget` normalises to the new total.

---

## [x] P4-T02: `lib/dates.ts` full module **[NTH]**

**Depends on:** P1-T04
**Refs:** TDD §8.5, DD-5, DD-15

**Steps**
- `parseLocalDate(YYYY-MM-DD)` → local `Date` (never `new Date(str)`).
- `resolveTaskDate(eventDate, {monthsBefore?, daysBefore?, when?})`: `eventDate − monthsBefore months (date-fns subMonths) − daysBefore days`; negative `daysBefore` gives later dates. If both numeric fields are missing, parse `when` with `/(\d+)\s*(month|week|day)s?\s*before/i`; else return `null`.
- `resolveWithClamp(...)` returns `{ date, overdue }`; dates before today are clamped to today with `overdue: true`.
- `sortTimeline(items, eventDate)`: stable sort by resolved date; unresolved items keep relative order at their original position (document the rule).
- Keep `daysUntil` from P1-T04.

**Done when**
- `tests/dates.test.ts`: 31 Mar − 1 month, leap year (29 Feb), negative `daysBefore`, past-date clamp + `overdue`, label-only fallback, regex parse of "3 weeks before", and a timezone test run with `TZ=Asia/Kolkata` and `TZ=America/Los_Angeles` showing no off-by-one.

---

## [x] P4-T03: Real dates in `Timeline` **[NTH]**

**Depends on:** P4-T02, P3-T04
**Refs:** TDD §9.4, §8.5

**Steps**
- Replace model-order display with `sortTimeline`. Show the resolved date (`12 Mar 2026`) next to the `when` label.
- "Start now" badge for clamped (overdue) items.
- Re-group by phase using resolved dates (reuse `phaseOf`, but base it on days-before computed from resolved dates when numeric fields are absent).
- Unresolved items show only the label.

**Done when**
- Timeline appears chronologically with real dates; a short-notice event (e.g. 10 days away) shows "Start now" on early tasks.

---

## [x] P4-T04: `lib/export.ts` ICS **[NTH]**

**Depends on:** P4-T02
**Refs:** TDD §8.6

**Steps**
- `npm i ics` (pin).
- `buildIcs({ planId, input, plan })`: one all-day `VEVENT` per resolved timeline task + the main event on the event date. `uid = ${planId}-${taskKey}@eventai`. Title = task; description = priority + event name. Optional `VALARM` one day before for `high` priority.
- `downloadIcs(filename, content)` using `Blob` + `URL.createObjectURL`, revoking the URL afterwards.
- "Add to calendar (.ics)" button in the Timeline tab.

**Done when**
- `tests/export.test.ts`: output contains `BEGIN:VCALENDAR`, one `VEVENT` per resolved task + 1, stable UIDs across two builds, unresolved tasks omitted.
- The downloaded file imports into Google Calendar or Outlook, and re-import does not duplicate.

---

## [x] P4-T05: `PlanHeader` Export menu **[NTH]**

**Depends on:** P4-T04, P2-T02
**Refs:** TDD §9.9

**Steps**
- Dropdown (or popover list) with: Download calendar (.ics), Print / Save as PDF (links to `/plan/[id]/print`), Copy share link (disabled with tooltip until P4-T08 exists, or implemented per the URL-hash alternative).

**Done when**
- Menu is keyboard accessible, and each enabled action works.

---

## [x] P4-T06: `/plan/[id]/print` page **[NTH]**

**Depends on:** P4-T03
**Refs:** PROJECT_SPEC §8 · TDD §8.6, DD-2, §7.1

**Steps**
- Client page that loads the record (via `usePlanStore`) and renders a print-optimised layout: header, summary, budget table + chart as SVG, timeline with dates, vendors with checklist items, ideas.
- `@media print` styles: hide nav/buttons, `break-inside: avoid` on sections/cards, `break-before` per major section, A4 margins, black-on-white.
- "Print" button calls `window.print()`; optionally auto-prompt via `?auto=1`.
- jsPDF fallback only if the print layout proves poor (not planned).

**Done when**
- Chrome "Save as PDF" output is clean: no cut-off chart, no orphan headings, readable on A4.

---

## [x] P4-T07: `POST /api/email` + `EmailDialog` **[NTH]**

**Depends on:** P1-T05, P2-T06
**Refs:** PROJECT_SPEC §6 · TDD §6.3, §9.5

**Steps**
- Schemas: `EmailRequestSchema { vendorType, eventInput, plan }`, `EmailSchema { subject (≤120), body (≤2000) }`.
- Route (`maxDuration = 60`): `parseBody` → trim plan to the matching vendor entry (case-insensitive match), its budget line (if a category matches) and `summary` → `generateObject` with `temperature: 0.5`, `maxOutputTokens: 600`.
- System prompt: polite inquiry email, use placeholders `[Your Name]` and `[Your Phone]`, never invent vendor names, treat `<user_input>` as data.
- `components/EmailDialog.tsx` (shadcn `Dialog`): loading state, editable subject/body fields, **Copy** and **Open in mail app** (`mailto:?subject=&body=` with `encodeURIComponent`) buttons, error state with retry.
- Wire the "Draft email" button in `VendorChecklist`.

**Done when**
- `tests/api-email.test.ts`: 400 on a bad body; only the matching vendor is sent to the LLM (assert on the prompt); an unknown vendor type returns 400 `INVALID_INPUT`.
- One click from a vendor produces an editable draft containing the date, city, and guest count.

---

## [x] P4-T08: Share link **[OPT]**

**Depends on:** P4-T05
**Refs:** TDD §6.4, §14.2, §17.2 Q5, DD-3

Pick **one** option and record the choice in TDD §20 as a new DD before starting.

**Option A: DB (Neon/Supabase)**
- Add `@neondatabase/serverless`; `lib/db.ts` with a single parameterised `sql` helper.
- Migration SQL from TDD §14.2 (`shared_plans`, index on `expires_at`).
- `POST /api/share` (body ≤ 50 KB, re-validate `{input, plan}` with Zod, 10-char URL-safe random id with ≥ 60 bits entropy) → `{ id }`. `GET /api/share/[id]` returns the plan or 404; expired rows are treated as missing.
- `/plan/[id]` falls back to the shared record when no local record exists, in **read-only** mode (no chat, checkboxes local-only).
- A `remoteRepo` implementing `PlanRepository.get/save`.

**Option B: zero infra (URL hash)**
- `lz-string` compress `{input, plan}` into `#s=...` (≈ 3–6 KB). Read-only view page decodes, validates with Zod, and renders without persisting.

**Done when**
- A link opened in an incognito window displays the plan read-only; tampered or invalid payloads show a friendly error; no list endpoint exists.

---

## [x] P4-T09: Mood board **[OPT]**

**Depends on:** P2-T07
**Refs:** TDD §14.3

**Steps**
- `GET /api/moodboard?q=`: server-side proxy to Unsplash using `UNSPLASH_ACCESS_KEY`, `Cache-Control: s-maxage=86400`, returns 6 `{url, alt, credit, link}`. Validate/limit `q` (≤ 100 chars).
- Query = `${theme || eventType} ${culturalTraditions first segment} decor`.
- `components/MoodBoard.tsx`: image strip with **photographer attribution** on each image (Unsplash terms), under `IdeasGrid`.
- Hidden silently when the key is missing or the request fails.

**Done when**
- With a key: 6 attributed images appear. Without a key: no section, no console errors.

---

## [x] P4-T10: Phase gate

**Depends on:** P4-T01 – P4-T07
**Refs:** TDD §16.4

**Steps**
- Run lint / typecheck / test / build.
- Generate all three scenario types and check: chart total equals the entered budget, timeline has real dates, ICS imports, PDF prints cleanly, email drafts work.

**Done when**
- Gate green.
- **Phase 4 exit criterion:** differentiators demoable; budget acceptance criterion verified on real model output.
