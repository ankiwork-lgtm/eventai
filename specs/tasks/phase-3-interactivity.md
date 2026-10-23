# Phase 3: Interactivity (~3 h)

**Goal:** persisted checklist state with progress bar, and a refine chat that updates the plan with one-step Undo.
**Refs:** PROJECT_SPEC §8 MVP-4/5, §10 Phase 3 · TDD §5.3, §6.2, §7.3, §9.4–9.5, §9.7–9.8, DD-7, DD-10, DD-16

---

## [x] P3-T01: `lib/hash.ts` and stable keys

**Depends on:** Phase 2
**Refs:** TDD §5.3 (Stable checklist keys), §8.7, DD-7

**Steps**
- `hash(str)`: FNV-1a 32-bit, base36 output, no dependencies.
- In `lib/progress.ts`: `normalize(s)` (lowercase, collapse whitespace, trim), `taskKey(task)` (excludes `when`), `vendorItemKey(vendorType, item)` = `hash(normalize(type)+"|"+normalize(item))`.

**Done when**
- `tests/hash.test.ts`: identical strings → identical hash; differing case/whitespace → same key; distinct strings → distinct keys for a sample set; output is `[0-9a-z]+`.
- Changing `when` does not change `taskKey`.

---

## [x] P3-T02: `lib/progress.ts` logic

**Depends on:** P3-T01
**Refs:** TDD §9.8, §5.3

**Steps**
- `computeProgress(plan, progress)` → `{ done, total, percent, timeline:{done,total}, vendors:{done,total} }`. Only keys present in the current plan are counted. Empty plan → `percent 0` with no divide-by-zero.
- `toggleProgress(progress, kind, key)` returns a new object (immutable).
- `pruneProgress(plan, progress)` drops keys not present in the plan (called after a refine).
- Duplicate task texts: treat as one key; document the behaviour in a comment (the TDD accepts this limitation).

**Done when**
- `tests/progress.test.ts`: percent calc, empty plan, toggle on/off, prune removes orphan keys but keeps ones still in the plan, ticks survive when only `when` changes.

---

## [x] P3-T03: `hooks/usePlanStore.ts`

**Depends on:** P1-T09, P3-T02
**Refs:** TDD §7.3, §7.4, DD-12, DD-13

**Steps**
- `usePlanStore(id)` returns `{ status: 'loading'|'ready'|'missing', record, update(patch), toggle(kind, key) }`.
- Reads storage in `useEffect` only. Writes are debounced 300 ms and flushed on `beforeunload` / `visibilitychange: hidden`, so a quick refresh never loses a tick.
- `update(patch)` merges, bumps `updatedAt`.
- Surface the storage-degraded callback as a one-time sonner toast.
- Refactor `PlanShell` to use this hook instead of its own load/save code.

**Done when**
- Ticking a box then immediately hard-refreshing preserves the tick.
- Two rapid toggles produce one write (verify with a spy in a hook test).
- No hydration warnings in the console.

---

## [x] P3-T04: Interactive `Timeline` and `VendorChecklist`

**Depends on:** P3-T03, P2-T05, P2-T06
**Refs:** TDD §9.4, §9.5, §7.5

**Steps**
- Remove `readOnly` placeholders. Checkbox `checked` derives from `progress.timeline[taskKey(task)]` / `progress.vendors[vendorItemKey(type, item)]`, and `onChange` calls `toggle`.
- Timeline: completed rows are muted + struck through; the Open / Done / priority filters become functional.
- Vendors: per-vendor completed count (`3/6`) updates live.
- Each checkbox has an associated `<label>`; strike-through is never the only signal (checkbox state is announced).
- Don't enable checkboxes for items still streaming. While `isStreaming`, render them disabled.

**Done when**
- Ticks persist across refresh (PROJECT_SPEC §13).
- Filters show correct subsets.
- Keyboard: Tab to a checkbox + Space toggles it.

---

## [x] P3-T05: `ProgressBar`

**Depends on:** P3-T02, P3-T04
**Refs:** TDD §9.8, §7.5

**Steps**
- Overall bar (shadcn `Progress`) with `role="progressbar"`, `aria-valuenow`, `aria-valuemin/max`, a "12 of 48 tasks" label, and two thin sub-bars (Timeline / Vendors).
- Derived from props via `computeProgress`; no internal state.
- Hidden or neutral while the plan is still empty.

**Done when**
- Ticking boxes updates the overall and sub-bars immediately.
- Screen reader label announces the percentage.

---

## [x] P3-T06: `POST /api/refine`

**Depends on:** P1-T05, P1-T07
**Refs:** PROJECT_SPEC §6 · TDD §6.2, §6.2.1, DD-10, §15.2, §15.3

**Steps**
- In `lib/schema.ts` add `RefineRequestSchema` `{ plan: PlanSchema, message: string(1..500), eventInput: EventInputSchema, history?: ChatMessage[] (max 6) }` and `RefineResultSchema = z.object({ plan: PlanSchema, changeSummary: z.string().max(400), newTotalBudget: z.number().positive().optional() })`.
- Route (`maxDuration = 60`): `parseBody` → `generateObject` with `maxOutputTokens: 4500`, `maxRetries: 1`.
- System prompt = base system prompt for the event type + refine rules (TDD §6.2 items 1–5): return the complete plan, change only what's implied, keep budget invariants unless the budget changes (then set `newTotalBudget` and state it in `changeSummary`), unrelated requests → unchanged plan + explanation, message is data not instructions.
- Wrap the user message in `<user_input>`. Include only the last 6 history messages.
- Provider failure → 502 `LLM_ERROR`. Rate-limit hook placeholder as in P1-T07.
- Log a structured line like P1-T12.

**Done when**
- `tests/api-refine.test.ts` (mocked `lib/ai.ts`): 400 on a bad body, correct system prompt, history truncated to 6, response matches `RefineResultSchema`.
- Manual curl: "add a DJ" returns a plan with a new DJ vendor/budget line and the rest unchanged; "cut the budget by 20%" returns `newTotalBudget` ≈ 0.8× the original.

---

## [x] P3-T07: `ChatRefiner` component

**Depends on:** P3-T03, P3-T06
**Refs:** PROJECT_SPEC §8 MVP-5 · TDD §9.7, §7.5

**Steps**
- Right-side panel at `lg:` and full-height `Sheet` on mobile, opened from a floating "Refine plan" button. Message list + input (max 500 chars, with counter).
- Quick-suggestion chips: "Make it cheaper", "Add a DJ", "Vegetarian-only menu", "Cut budget by 20%".
- Send flow: optimistic user bubble → `POST /api/refine` with `{plan, message, eventInput, history}`. While pending: input disabled, `aria-busy` on the dashboard, subtle overlay on the tabs.
- On success: apply the result through a single `applyRefinement(record, result)` function in `lib/refine.ts` (pure): sets `input.totalBudget = newTotalBudget` if present → `normalizePlan` (identity until P4-T01) → `pruneProgress` → returns the new record. Append an assistant bubble with `changeSummary`.
- On error: error bubble with Retry; the plan is unchanged. 429 shows a toast.
- Chat history persisted in `record.chat`.

**Done when**
- `tests/refine.test.ts` for `applyRefinement`: budget override applied, progress pruned, unchanged tasks keep ticks.
- Sending "add a DJ" updates the Vendors tab and budget chart without a page reload.
- Chat history survives refresh.

---

## [x] P3-T08: One-step Undo

**Depends on:** P3-T07
**Refs:** TDD §9.7, DD-16

**Steps**
- Before applying a refinement, store `previous: { plan, input, progress }` snapshot (in the record as `lastSnapshot`, overwritten on each refine; add it to `StoredPlan` as optional and keep `version: 1` since it's additive).
- "Undo" button on the latest assistant bubble restores the snapshot (plan, `input.totalBudget`, progress) and appends a "Reverted" bubble. The button disappears after use or after the next refine.

**Done when**
- After "cut budget by 20%", Undo restores the original budget, chart and ticks exactly.
- Undo survives a page refresh until the next refine.

---

## [x] P3-T09: Phase gate

**Depends on:** all P3 tasks
**Refs:** TDD §16.3

**Steps**
- Manual run: generate a plan → tick 5 items → refresh → ticks persist → "make it cheaper" → ticks on unchanged tasks survive → Undo.
- Mobile 375 px: chat sheet usable, no horizontal scroll.
- Lint / typecheck / test / build.

**Done when**
- Gate green.
- **Phase 3 exit criterion:** MVP complete (all six must-haves in PROJECT_SPEC §8 working locally).
