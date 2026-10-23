# Phase 1: Scaffold (~2 h)

**Goal:** a user can fill a form, submit, land on `/plan/[id]`, and see a streamed plan as raw JSON. The LLM pipeline and schema are proven end to end.
**Refs:** PROJECT_SPEC §3, §5, §6, §7, §10 Phase 1 · TDD §4, §5, §6.0–6.1, §7.1, §8.1–8.3, §9.1, §15.1

---

## [x] P1-T01: Project bootstrap

**Depends on:** none
**Refs:** PROJECT_SPEC §3, §10 · TDD §4, §18 Phase 1

**Steps**
- Run `create-next-app@latest` in the repo root (TypeScript, Tailwind, App Router, ESLint, `src/` dir **off**, import alias `@/*`). `specs/` already exists, so scaffold into the root and keep `specs/` untouched.
- Enable `"strict": true` in `tsconfig.json`.
- Install runtime deps: `ai @ai-sdk/anthropic @ai-sdk/react zod recharts date-fns react-hook-form @hookform/resolvers`.
- Install dev deps: `vitest @vitejs/plugin-react jsdom @testing-library/react` (only what tests need).
- **Pin exact versions** (no `^`) in `package.json` for `ai`, `@ai-sdk/*`, `zod`.
- Add scripts: `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `test:watch`.
- Add `vitest.config.ts` with `@/` alias and `/tests` include.

**Done when**
- `pnpm dev` serves the default page.
- `pnpm lint`, `pnpm typecheck`, `pnpm build` pass on the blank scaffold.
- `package.json` shows pinned AI SDK versions.

---

## [x] P1-T02: shadcn/ui setup

**Depends on:** P1-T01
**Refs:** TDD §9.10

**Steps**
- `npx shadcn@latest init`.
- Add components: `button card tabs input textarea select label checkbox progress accordion dialog sheet badge skeleton sonner tooltip form`.
- Mount `<Toaster />` (sonner) in `app/layout.tsx`.
- Set app metadata (title "Event Planning Assistant") and `lang="en"`.

**Done when**
- A test page rendering a `Button`, `Card` and a toast works.
- `components/ui/*` exist for every listed component.
- Build passes.

---

## [x] P1-T03: `lib/schema.ts`

**Depends on:** P1-T01
**Refs:** PROJECT_SPEC §5 · TDD §5.1, §5.2, DD-5, DD-6

**Steps**
- Implement `EVENT_TYPES`, `EventInputSchema`, `PlanSchema` exactly as TDD §5.2, including `.describe()` hints and array `.min/.max` bounds.
- Export `EventInput`, `EventInputForm` (`z.input`), `Plan`, `EventType`.
- Add `RefineResultSchema` placeholder export later in P3-T06 (not now).
- Add `futureDate` refinement helper for the form (date ≥ tomorrow) separate from the API schema, so fixtures and server tests are not date-sensitive. Put it in the form layer (P1-T08), not in `EventInputSchema`, **unless** the API should also reject past dates. Decide and document it (TDD S4 says "must not be in the past"). Recommended: API schema enforces `date >= today` server-side via `.refine`.
- Add `lib/types.ts` with `StoredPlan`, `ProgressState`, `ChatMessage` (TDD §5.3) and `StoredPlanMeta`.

**Done when**
- `tests/schema.test.ts`: valid input parses, `currency` defaults to `INR`, string numbers coerce, bad date format / `guestCount` 0 / `guestCount` 10001 / negative budget are rejected.
- A hand-written minimal `Plan` fixture validates; one with 3 budget lines is rejected (min 4).
- Types compile and are importable from client and server code.

---

## [x] P1-T04: `lib/prompts.ts` and `lib/dates.ts` (minimal)

**Depends on:** P1-T03
**Refs:** PROJECT_SPEC §7 · TDD §8.1, §10, DD-14, §15.2

**Steps**
- Export `BASE_PROMPT`, `RULES`, `EVENT_ADDONS` (wedding / birthday / community, text from PROJECT_SPEC §7), `systemPromptFor(type)`.
- `RULES` must include: percent sums to 100, cost sums to total, user's currency and local norms, timeline range (`daysBefore = -1` last, `0` event day), chronological order, `monthsBefore` vs `daysBefore` usage, vendor types mapped to budget categories, "say *assumed* when inferring".
- Add the data-not-instructions statement for `<user_input>` blocks (TDD §15.2).
- `buildPlanPrompt(input, today = new Date())`: JSON of input, free-text fields wrapped in `<user_input>…</user_input>`, `Today`, `Event date`, `Days until event`, a "compress timeline / flag tight deadlines if < 60 days" line, and `budgetPerGuest` hint with a small per-currency/type threshold table.
- In `lib/dates.ts` create only `daysUntil(dateStr, today?)` for now (full module in P4-T02). It must parse `YYYY-MM-DD` as a **local** date (DD-15).

**Done when**
- `tests/prompts.test.ts`: each event type's system prompt contains BASE, its add-on and RULES; `buildPlanPrompt` includes the computed days-until and wraps free text in `<user_input>`.
- Low-budget-per-guest input produces the hint line; normal input does not.
- `today` is injectable, so tests are deterministic.

---

## [x] P1-T05: `lib/api.ts` and `lib/ai.ts`

**Depends on:** P1-T03
**Refs:** TDD §6.0, R3, DD-8

**Steps**
- `lib/ai.ts`: single touch point for the SDK. Export `getModel()` (reads `LLM_MODEL`, default `claude-sonnet-4-5`), and thin wrappers `streamPlan(...)`, `generateStructured(...)` so SDK major-version drift only affects this file.
- **Before coding**, open the installed `ai` version's docs/types and confirm `streamObject`, `generateObject`, `toTextStreamResponse`, `maxOutputTokens` (vs `maxTokens`) names. Note findings in a comment at the top of `lib/ai.ts`.
- `lib/api.ts`:
  - `errorResponse(code, message, status, details?)` returns the envelope from TDD §6.0 (`INVALID_INPUT | RATE_LIMITED | LLM_ERROR | INTERNAL`).
  - `parseBody(req, schema)`: reads text, rejects > 50 KB with 413, `JSON.parse` failure → 400, Zod failure → 400 with `issues` in `details`. Returns `{ok:true,data}` or `{ok:false,response}`.
  - `getClientIp(req)`: first entry of `x-forwarded-for`, fallback `"unknown"`.
- Set `maxRetries: 1` and `maxOutputTokens` per call type (plan 4000, refine 4500, email 600) as constants.
- If the provider rejects `.min/.max` array keywords (DD-6), strip them via a `schemaForLLM` helper and rely on prompt text.

**Done when**
- `tests/api.test.ts`: oversized body → 413, malformed JSON → 400, schema failure → 400 with `issues`, valid body → ok.
- `grep` shows no direct `@ai-sdk/anthropic` import outside `lib/ai.ts`.

---

## [x] P1-T06: Environment and secrets hygiene

**Depends on:** P1-T01
**Refs:** TDD §15.1, PROJECT_SPEC §11

**Steps**
- Create `.env.example` with `ANTHROPIC_API_KEY=`, `LLM_MODEL=claude-sonnet-4-5`, `NEXT_PUBLIC_DEMO_FALLBACK=false`, and commented optional `UNSPLASH_ACCESS_KEY=`, `DATABASE_URL=`.
- Confirm `.gitignore` ignores `.env*.local`.
- Create a local `.env.local` with a real key (never committed).

**Done when**
- `git check-ignore .env.local` returns a match.
- `.env.example` is committed with no secrets.

---

## [x] P1-T07: `POST /api/plan` route

**Depends on:** P1-T04, P1-T05, P1-T06
**Refs:** PROJECT_SPEC §6 · TDD §6.1, DD-8, DD-9

**Steps**
- `app/api/plan/route.ts` with `export const maxDuration = 60`.
- Flow: `parseBody(req, EventInputSchema)` → `streamObject({ model: getModel(), schema: PlanSchema, system: systemPromptFor(type), prompt: buildPlanPrompt(input), temperature: 0.7, maxRetries: 1, maxOutputTokens: 4000 })` → `result.toTextStreamResponse()`.
- Leave a clearly marked hook for `checkRateLimit` (implemented in P5-T04). Keep the route working without it.
- Wrap the pre-stream path in try/catch → `errorResponse("INTERNAL", …, 500)`; provider errors before the first byte → 502 `LLM_ERROR`.
- Server console log line (TDD §13) is added in P1-T12.

**Done when**
- `curl -N -X POST localhost:3000/api/plan -H "content-type: application/json" -d @sample.json` streams growing JSON, and the final JSON validates against `PlanSchema` (check with a small script or test).
- Invalid body returns 400 with the error envelope.
- Wrong-method request returns 405 (Next default).
- Budget percents/costs may be off at this stage (normalisation comes in P4-T01).

---

## [x] P1-T08: `IntakeForm` v0 with per-type templates

**Depends on:** P1-T02, P1-T03
**Refs:** PROJECT_SPEC §8 MVP-1 · TDD §9.1, §15.4, §7.5

**Steps**
- `components/IntakeForm.tsx` (client) using `react-hook-form` + `zodResolver` with a form schema = `EventInputSchema` plus "date ≥ tomorrow".
- Fields: event type (segmented control / tabs), event name (optional), date (native `<input type="date">`, `min` = tomorrow), guests, budget, currency select (INR default, USD, EUR, GBP, AED), city, theme, traditions, preferences.
- Add `FORM_TEMPLATES[eventType]` config map: labels, placeholders and helper chips for traditions/preferences per type (wedding → "Traditions / ceremonies", birthday → "Age & interests", community → "Expected attendance & permits"). Chips append text to the field.
- Inline error messages with `aria-describedby`; submit disabled while invalid; every input has a `<label>`.
- Privacy notice line below the submit button (TDD §15.4).
- `onSubmit` is a prop in this task; wiring happens in P1-T09.

**Done when**
- Switching event type changes labels/placeholders but not the submitted shape.
- Invalid values show inline errors; a valid submit calls `onSubmit(EventInput)` with numbers (not strings) and `currency`.
- Layout is single column at 375 px.

---

## [x] P1-T09: `lib/storage.ts` and landing page wiring

**Depends on:** P1-T03, P1-T08
**Refs:** TDD §5.4, §8.3, §7.1, DD-3, DD-4

**Steps**
- Implement `PlanRepository` (`list/get/save/remove`, all async) with `localRepo` over `localStorage`, keys `eventai:v1:index`, `eventai:v1:plan:<id>`, `eventai:v1:last` (TDD §5.4).
- `try/catch` every access; on failure fall back to an in-memory `Map` and expose a one-time `onStorageDegraded` callback so the UI can toast "Progress won't be saved in this browser mode".
- Read-side validation: check `version === 1` and parse `input` with `EventInputSchema` and `plan` (if not null) with `PlanSchema`. Corrupt record → `get` returns `null` and logs a warning (UI offers "Regenerate" in P2-T10).
- `StoredPlan.plan` is `Plan | null` while generating.
- IDs via `crypto.randomUUID()`.
- `app/page.tsx`: hero text, `IntakeForm`, "Resume last plan" link if `eventai:v1:last` exists. On submit: create record `{id, input, plan:null, progress:{timeline:{},vendors:{}}, chat:[], version:1, createdAt, updatedAt}` → `save` → `router.push('/plan/'+id)`.
- The form does **not** call the API (TDD §9.1).

**Done when**
- `tests/storage.test.ts`: round-trip, corrupted JSON → `null`, wrong version → `null`, quota/throwing `localStorage` → in-memory fallback works, `list()` ordering most recent first.
- Submitting the form navigates to `/plan/<uuid>` and the record is in `localStorage`.

---

## [x] P1-T10: `/plan/[id]` page v0 (raw JSON stream)

**Depends on:** P1-T07, P1-T09
**Refs:** PROJECT_SPEC §10 Phase 1 · TDD §7.1, §7.4, §8.2, DD-1, DD-11, DD-13

**Steps**
- `app/plan/[id]/page.tsx` as a client page. Read the `id` param (check the Next version's async `params` signature).
- Load the record in `useEffect`; states `loading | missing | ready`. Render a skeleton while loading; **never** branch on `window` in render (DD-13).
- If `plan === null`, call `useObject({ api:'/api/plan', schema: PlanSchema, onFinish, onError })`'s `submit(record.input)` **once**, guarded by a `useRef` for Strict Mode.
- Render `<pre>{JSON.stringify(object, null, 2)}</pre>` while streaming (temporary).
- `onFinish`: save the plan to the record and set `eventai:v1:last`.
- "Plan not found on this device" with a button back to `/` when missing.

**Done when**
- Submitting the form shows JSON growing live, and after finishing, a reload shows the saved plan **without** a new API call (verify in the network tab).
- Strict Mode does not trigger two API calls.
- Unknown id shows the not-found state.
- Console log shows the final plan JSON (spec Phase 1 outcome).

---

## [x] P1-T11: Tests for core logic in this phase

**Depends on:** P1-T03, P1-T04, P1-T05, P1-T09
**Refs:** TDD §16.1, §16.2

**Steps**
- Consolidate the tests from P1-T03/04/05/09 under `/tests`.
- Add `tests/api-plan.test.ts`: mock `lib/ai.ts`; verify 400 on bad body, and that the system prompt passed to the LLM matches the event type for all three types.

**Done when**
- `pnpm test` is green.

---

## [x] P1-T12: Observability and phase gate

**Depends on:** P1-T07, P1-T10, P1-T11
**Refs:** TDD §13, §16.4

**Steps**
- In `/api/plan`, after the stream finishes, log one structured line `{route:'plan', eventType, latencyMs, inputTokens, outputTokens, ok}` using `result.usage`. **Never** log free text or keys.
- Run the full gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
- Manually run all three demo-ish inputs through the form and confirm the schema validates the output.

**Done when**
- Gate passes with zero warnings.
- Vercel-style log line appears in the dev terminal for each call.
- **Phase 1 exit criterion:** form → streamed JSON → persisted record, working locally.
