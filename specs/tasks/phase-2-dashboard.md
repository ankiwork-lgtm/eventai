# Phase 2: Dashboard (~4 h)

**Goal:** replace the raw JSON with the real dashboard: header, four tabs (Budget, Timeline, Vendors, Ideas), live streaming reveal, and graceful loading/error states.
**Refs:** PROJECT_SPEC §8 MVP-2/3/6, §10 Phase 2 · TDD §7.2–7.5, §8.2, §9.2–9.6, §9.9, §11

**Shared rules for every component in this phase**
- Props are `Partial`/`DeepPartial`-tolerant. Filter out incomplete array items using type guards in `lib/guards.ts` (`isCompleteBudgetItem`, `isCompleteTimelineItem`, `isCompleteVendor`, `isCompleteIdea`).
- Checkbox state is **not** wired yet (P3). Timeline/Vendor rows render checkboxes as disabled or uncontrolled placeholders behind a `readOnly` prop.
- Render LLM text as plain text only.

---

## [x] P2-T01: `PlanContext` and `PlanShell` skeleton

**Depends on:** Phase 1
**Refs:** TDD §7.2, §7.3, §9.2, DD-12

**Steps**
- `components/PlanContext.tsx`: context providing `{ input, plan, progress, isStreaming, status }` plus a `usePlan()` hook that throws outside the provider.
- `components/PlanShell.tsx`: owns record loading, `useObject`, and the once-only `submit` guard (move logic from P1-T10). Status machine: `loading | generating | ready | failed | missing`.
- Layout: `PlanHeader` (stub) → `ProgressBar` (stub) → `Tabs` → chat slot (empty for now).
- Active tab mirrored to the `?tab=` query param (`budget | timeline | vendors | ideas`, default `budget`); invalid values fall back to default.
- `onFinish` calls a `onPlanComplete(plan)` function. In this phase it saves the plan as-is; `normalizePlan` is plugged in at P4-T01 (DD-9). Leave a single clearly named call site.

**Done when**
- `/plan/[id]` renders four tab triggers, and switching tabs updates `?tab=`.
- Opening `/plan/[id]?tab=ideas` lands on Ideas.
- Only one API call per fresh plan.

---

## [x] P2-T02: `PlanHeader`

**Depends on:** P2-T01, P1-T04 (`daysUntil`)
**Refs:** TDD §9.9

**Steps**
- Show title: `eventName` or `"{Type} in {City}"`, formatted date, guests, budget (currency formatted), countdown text: "94 days to go" / "Tomorrow" / "Today!" / "Event completed".
- Show the plan `summary` below the title (a streaming-tolerant paragraph with a skeleton before it arrives).
- Reserve a slot for the Export menu (filled in Phase 4) and a "New plan" link to `/`.
- Create `lib/format.ts` with `formatMoney(amount, currency)`: `Intl.NumberFormat`, locale `en-IN` when currency is INR else `en-US`, `maximumFractionDigits: 0` (TDD §9.3). Unit-test it.

**Done when**
- Countdown strings are correct for +94 d, +1 d, 0 d and -3 d dates (unit test on a pure helper).
- INR 1000000 renders as `₹10,00,000`.

---

## [x] P2-T03: Tab frame, streaming badges and skeletons

**Depends on:** P2-T01
**Refs:** TDD §8.2, §7.5

**Steps**
- Create `StreamingBadge` (small "Generating…" pill shown on a tab while its key is still arriving and `isStreaming`).
- Per-tab skeleton component for the empty state while `object?.<section>` is `undefined`.
- Determine a section as "done" when the next section's key has started arriving, or when streaming has finished.
- `TabsList` scrolls horizontally on mobile (`overflow-x-auto`), no page-level horizontal scroll.

**Done when**
- While generating, each tab shows a skeleton and then content, with the badge disappearing in order: summary, budget, timeline, vendors, ideas.
- Tab labels remain reachable at 375 px.

---

## [x] P2-T04: `BudgetChart` and category list

**Depends on:** P2-T02, P2-T03
**Refs:** PROJECT_SPEC §8 MVP-3 · TDD §9.3, §7.5

**Steps**
- Props: `items`, `currency`, `total`, `isStreaming`, optional `warnings: string[]` (banner placeholder; filled in P4-T01).
- Recharts `PieChart` (donut) inside `ResponsiveContainer`, with `Tooltip` showing category, percent and formatted cost. A toggle button switches to a horizontal `BarChart`.
- Fixed colour palette array keyed by index (≥ 12 entries to match the schema max).
- Centre label displays the total budget. Disable chart animation while `isStreaming` and when `prefers-reduced-motion` is set.
- Under the chart: a row per category `[dot] Category · percent% · cost`, expandable (accordion) to reveal `tips`. This list is also the text alternative / legend.
- Skip items failing `isCompleteBudgetItem` so a half-streamed item never renders `NaN`.

**Done when**
- Chart and list render from a fixture `Plan` and from a deliberately partial object (last item missing `estimatedCost`) without errors.
- Toggle pie ↔ bar works, with tooltips.
- At 375 px the chart fits with no horizontal scroll.

---

## [x] P2-T05: `Timeline` (read-only version)

**Depends on:** P2-T03
**Refs:** TDD §9.4

**Steps**
- Props: `items`, `eventDate`, `readOnly`.
- Display in model order for now (real sort by resolved date is P4-T03), grouped by phase: *Early (>3 months)*, *Month-of*, *Final weeks*, *Event week*, *After*. Phase derived from `monthsBefore`/`daysBefore` with a pure helper `phaseOf(item)` in `lib/timeline.ts` (unit-test the boundaries; items with no numeric fields go to a fallback group "Other").
- Row: checkbox placeholder, task, `when` label, priority badge with text "High / Medium / Low" (colour is never the only signal).
- Filters (All / Open / Done and by priority) are rendered but "Open/Done" only becomes functional in P3.

**Done when**
- All timeline items from the fixture appear in the right groups.
- `daysBefore: -1` lands in *After*, `0` in *Event week*.
- Partial items are skipped without crashing.

---

## [x] P2-T06: `VendorChecklist` (read-only version)

**Depends on:** P2-T03
**Refs:** TDD §9.5

**Steps**
- Props: `vendors`, `readOnly`, `onDraftEmail?(type)`.
- shadcn `Accordion` per vendor: title, `budgetRange`, completed counter placeholder (`0/N`), and the checklist items with `<label>`-associated checkboxes.
- "Draft email" button rendered only if `onDraftEmail` is provided (wired in P4-T07).
- Items with an incomplete `checklist` array are rendered with what has arrived.

**Done when**
- All vendors and checklist items from the fixture render in the accordion, keyboard accessible (Enter/Space toggles).

---

## [x] P2-T07: `IdeasGrid`

**Depends on:** P2-T03
**Refs:** TDD §9.6

**Steps**
- Responsive grid 1 / 2 / 3 columns (`sm:` / `lg:`) of `Card`s with title and description.
- Reserve a slot below for `MoodBoard` (P4-T09, optional).

**Done when**
- Grid reflows correctly at 375 / 768 / 1280 px.

---

## [x] P2-T08: Wire tabs to live data

**Depends on:** P2-T04, P2-T05, P2-T06, P2-T07
**Refs:** TDD §8.2

**Steps**
- In `PlanShell`, feed `object` (streaming) or `record.plan` (persisted) into the tab components through context. Single selector `usePlan().plan` returns whichever is current.
- Remove the temporary `<pre>` JSON dump.
- Make sure that after `onFinish` the persisted plan replaces the partial without a visual reset (same keys, same data).

**Done when**
- Submitting the form results in tabs filling in live. Reload shows the same dashboard from storage without an API call.
- No raw JSON visible anywhere (PROJECT_SPEC §13).

---

## [x] P2-T09: Failure, retry and cancel flows

**Depends on:** P2-T08
**Refs:** TDD §11, DD-8, §8.2

**Steps**
- Pre-stream failure (non-2xx): `failed` state with message from the error envelope, **Retry** button (re-submits input) and, if the input matches a known scenario, a placeholder for "Use sample plan" (activated in P5-T03).
- Mid-stream failure: keep the partial plan visible with a banner "Generation interrupted" + Retry. Do not persist a partial plan as final.
- Schema-invalid completion (`object` undefined + `error`): same banner.
- Cancel button calling `stop()` while generating; cancelling returns to a retry state, not a blank page.
- Map 429 to a toast "Too many requests, wait N seconds" (uses `Retry-After` if present).
- Single user-initiated Retry only; no automatic client retry.

**Done when**
- Manually verified with: invalid API key (pre-stream failure), killing the dev server mid-stream, Cancel button.
- Retry clears the error and starts a fresh generation exactly once.

---

## [x] P2-T10: Missing / corrupt record and empty states

**Depends on:** P2-T01
**Refs:** TDD §7.1, §8.3, §11

**Steps**
- `missing`: "Plan not found on this device" + button to `/`.
- Corrupt record (storage `get` returns `null` for an existing key; expose a `corrupt` flag through the repository result or a separate `inspect` call): "Couldn't load this plan" with **Delete** and **Regenerate from input** (only when `input` is salvageable).
- Empty-array states per tab ("No ideas yet").

**Done when**
- Manually corrupting the stored JSON in DevTools produces the corrupt-state UI, and Delete returns to `/`.

---

## [x] P2-T11: Phase gate

**Depends on:** all P2 tasks
**Refs:** TDD §16.4

**Steps**
- Unit tests: `guards`, `phaseOf`, `formatMoney`, countdown helper.
- Run lint / typecheck / test / build.
- Responsive check of the dashboard at 375 / 768 / 1280 px.

**Done when**
- Gate green.
- **Phase 2 exit criterion:** a generated plan renders as a polished tabbed dashboard, streaming live, with working error and retry states.
