# Phase 5: Demo Prep & Deploy (~2 h)

**Goal:** one-click demos, a failure-proof fallback, cost protection, docs, and a public Vercel URL verified against every acceptance criterion.
**Refs:** PROJECT_SPEC §10 Phase 5, §11, §12, §13 · TDD §11, §12, §15, §16.3

---

## [x] P5-T01: `lib/demo.ts` scenarios

**Depends on:** Phase 3
**Refs:** TDD §12.1, DD-5, S4

**Steps**
- Export `DEMO_SCENARIOS`, each `{ id, label, description, buildInput(today) }`:
  - `wedding-mumbai`: wedding, Mumbai, 200 guests, INR 1,000,000, "Maharashtrian wedding, 2-day ceremony", date = today + 120 d.
  - `birthday-superhero`: birthday, 7th, superhero theme, about 25 kids, Pune, INR 60,000.
  - `community-diwali`: community, neighbourhood Diwali, 300 attendees, INR 50,000.
- Dates computed relative to `today` (injectable) so demos never contain past dates.

**Done when**
- `tests/demo.test.ts`: every scenario's `buildInput(today)` passes `EventInputSchema` (including the future-date rule) for several different `today` values.

---

## [x] P5-T02: `DemoScenarios` component

**Depends on:** P5-T01, P1-T08
**Refs:** PROJECT_SPEC §8, §13 · TDD §9.1

**Steps**
- Buttons on the landing page that call `form.reset(scenario.buildInput(new Date()))`.
- A secondary affordance per scenario, "Generate instantly (cached)", which creates a record with `plan` = fixture (P5-T03) and navigates straight to `/plan/[id]` using replay mode.
- Accessible labels; stacked layout at 375 px.

**Done when**
- One click fills the form; submit generates the plan. The cached path opens a dashboard with no LLM call.

---

## [x] P5-T03: Fixtures and replay mode

> Note: the three fixtures in `lib/fixtures/*.json` were hand-authored (not generated through the live API) and validated by `tests/fixtures.test.ts`. Replay was verified in jsdom tests (`tests/plan-replay-integration.test.tsx`) with `fetch` stubbed to reject; it has not been exercised in a real browser with the network disabled.

**Depends on:** P5-T01, P4-T01
**Refs:** TDD §12.2, R4, §11

**Steps**
- Generate one high-quality plan per scenario through the real API, then normalise it and save it as `lib/fixtures/<scenarioId>.json`. Review and hand-edit content quality if necessary.
- `tests/fixtures.test.ts`: each fixture validates against `PlanSchema`, passes `normalizePlan` with zero warnings, and sums to the scenario's budget.
- Replay: `lib/replay.ts` exposes `replayPlan(plan, onPartial, {intervalMs: 400})` that reveals `summary → budget → timeline → vendors → ideas` as growing partial objects. `PlanShell` uses it when `NEXT_PUBLIC_DEMO_FALLBACK=true`, when `?demo=1` is present, or when the user chooses "Load sample plan". Only the three scenario ids are eligible.
- Activate the "Use sample plan" button added as a placeholder in P2-T09: on failure, if the input matches a known scenario, load that fixture.
- Cancel works during replay (clears timers).

**Done when**
- With the network offline (or an invalid API key) a scenario still shows a plan that visibly streams in.
- Fixture tests pass.

---

## [x] P5-T04: Rate limiting and cost caps

**Depends on:** P1-T07, P3-T06, P4-T07
**Refs:** PROJECT_SPEC §11 · TDD §15.3, DD-17, R6

**Steps**
- `lib/ratelimit.ts`: in-memory token bucket keyed by `getClientIp` + route. Limits: `/api/plan` 5 per 10 min, `/api/refine` 20 per 10 min, `/api/email` 20 per 10 min. Returns `{ limited, retryAfterSeconds }`.
- Replace the `checkRateLimit` placeholders in each route; respond `429` with `RATE_LIMITED` and a `Retry-After` header.
- Confirm `maxOutputTokens` caps are set on every LLM call (plan 4000, refine 4500, email 600).
- Document in the README that the in-memory limiter is best-effort per Vercel instance, and that the Anthropic console monthly spend limit (Tier 3) must be set manually. **[OPT]** Tier 2: Upstash/Postgres global daily cap if a store already exists.

**Done when**
- `tests/ratelimit.test.ts`: allows N, blocks N+1, refills after the window (fake timers), separate buckets per IP/route.
- Hitting `/api/plan` 6 times quickly returns 429 and the UI shows the wait toast.
- The demo-fallback (replay) path is not rate limited (no API call).

---

## [x] P5-T05: Security headers and hardening

**Depends on:** P1-T01
**Refs:** TDD §15.2, §15.5, §15.1

**Steps**
- `next.config.ts` `headers()`: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` (or CSP `frame-ancestors 'none'`), `Permissions-Policy` minimal. Skip a strict CSP unless time allows (Recharts/shadcn inline styles).
- `grep -r dangerouslySetInnerHTML` returns nothing.
- Verify no server-only var is read in client components; inspect the built client bundle (`.next/static`) for the substring of the key prefix `sk-ant`, which must be absent.
- Add a code-review checklist item: no logging of free text or keys.

**Done when**
- Response headers visible on the deployed site.
- Bundle inspection is clean.

---

## [x] P5-T06: Observability finish

**Depends on:** P3-T06, P4-T07
**Refs:** TDD §13

**Steps**
- Ensure all three LLM routes log `{route, eventType, latencyMs, inputTokens, outputTokens, ok}` and nothing else.
- **[OPT]** Add Vercel Analytics (`@vercel/analytics`, one line in `layout.tsx`).

**Done when**
- Vercel function logs show one line per call, and no user free text appears in them.

---

## [x] P5-T07: Responsive and accessibility pass

**Depends on:** all UI tasks
**Refs:** PROJECT_SPEC §13 · TDD §7.5, §12.3

**Steps**
- Test at 360, 375, 768, 1280 px: landing, form, every tab, chat sheet, email dialog, print page.
- Fix horizontal scroll, truncated badges, tap targets < 40 px, and sheet/dialog overflow.
- Check: every checkbox has a label, progress bar ARIA is present, focus rings are visible, priority is communicated by text, chart has a text alternative (the category list), `prefers-reduced-motion` respected.
- Lighthouse accessibility score ≥ 90 on `/` and a plan page.

**Done when**
- No horizontal scroll at 375 px on any page; Lighthouse a11y ≥ 90.

**Measured results (production build, headless Chrome via puppeteer-core + Lighthouse 13.5.0):**

- **Lighthouse accessibility:** `/` = 100, plan page (`/plan/<id>?tab=budget`, seeded from the `wedding-mumbai` fixture) = 100, run with mobile emulation.
- **Horizontal scroll:** `documentElement.scrollWidth === clientWidth` at 360, 375, 768 and 1280 px on landing, all four plan tabs (budget, timeline, vendors, ideas), chat sheet (desktop: always-visible panel at 1280), email dialog (also checked that dialog content does not overflow the dialog) and the print page. 32 measurements, 0 failing.
- **Lighthouse findings fixed this pass:** `heading-order` (accordion headers now render `<h2>` via `render={<h2 />}` in `components/ui/accordion.tsx`; demo-card titles `<h3>` → `<h2>`), `label-content-name-mismatch` (cached button `aria-label` is now `Generate instantly (cached): <label>`, so it starts with the visible text).
- Validation: `tsc --noEmit` clean, eslint clean on the files changed this pass, full test suite 31 files / 297 tests passing (`--pool=threads --no-file-parallelism`), `pnpm build` succeeds.
- Not covered: the real LLM-generated plan path (the plan page was loaded from a seeded fixture, `/api/email` was stubbed), tap-target sizes and focus-ring visibility were checked by code inspection only, and the harness (`.bob/tmp/auto/run.mjs`) is a local scratch script, not committed test infrastructure. An earlier measurement showing print-page and email-dialog overflow came from a stale build; a fresh build showed none.

Fixes applied by code inspection earlier (validated by `pnpm tsc --noEmit`, `pnpm lint`, tests, `pnpm build`):

- **Horizontal scroll**: `body` gains `overflow-x-hidden`. `TabsList` gets `w-full overflow-x-auto` (was `w-fit`). `BudgetChart` chart wrapper gains `overflow-hidden`. Bar chart `YAxis` width reduced 110 → 90 px and `margin.left` trimmed.
- **Tap targets < 40 px**: `Chip` buttons in `IntakeForm`, Timeline filter buttons, `BudgetChart` mode toggle (size `sm`→`default`), `ChatRefiner` quick suggestion chips, Undo/Retry buttons — all given `min-h-[40px]`.
- **Focus rings**: All raw `<button>` elements listed above given `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1`.
- **ARIA — progressbar**: `ProgressBar.tsx` already had `role="progressbar"`, `aria-valuenow/min/max`, and `aria-label` on both the main and sub-bars ✓ (verified with unit test).
- **ARIA — checkboxes**: `VendorChecklist.tsx` and `Timeline.tsx` already paired `<Checkbox id={id}>` with `<label htmlFor={id}>` ✓ (verified with unit test).
- **ARIA — chart text alternative**: `BudgetChart` chart div given `role="img"` and `aria-label` listing all categories and percentages ✓ (verified with unit test). The accordion category list already served as an additional text alternative.
- **ARIA — priority text**: `Timeline` already uses `PRIORITY_LABEL` ("High"/"Medium"/"Low") as badge text ✓. Print page uses `item.priority` uppercased ✓.
- **Reduced motion**: `StreamingBadge` `animate-spin` → `motion-safe:animate-spin` ✓ (verified with unit test). `BudgetChart` already used `usePrefersReducedMotion()` ✓.
- **EmailDialog footer**: `flex-wrap` added so buttons wrap on narrow screens.
- **Sheet/dialog overflow**: `DialogContent` already uses `max-w-[calc(100%-2rem)]` ✓. Chat sheet uses `w-full` ✓.

---

## [x] P5-T08: README and docs

**Depends on:** P5-T04
**Refs:** TDD §12.3, PROJECT_SPEC §12

**Steps**
- `README.md`: what it is and the pitch (personalisation first), screenshots/GIF, setup (`pnpm i`, `.env.local` from `.env.example`), env var table (server vs public), scripts, demo scenario descriptions, architecture diagram (copy the mermaid from TDD §3.1/§3.2), known limitations (in-memory rate limiter, local-only storage, AI-generated cultural content may be inaccurate, no auth), and the spec/TDD links.
- Add a short "Demo script" section: scenario order, the live refine ("cut the budget by 20%"), showing streaming, fallback switch (`?demo=1`).

**Done when**
- A new developer can clone, configure and run following only the README.

**Completion notes**
- `README.md` rewritten; the P5-T04 "Rate limiting & cost protection" and P5-T05 "Security checklist" sections are preserved (security bullets only had `—` changed to `-`).
- Verified: script names against `package.json`; env vars against `.env.example`, `lib/ai.ts`, `app/api/moodboard/route.ts`, `components/PlanShell.tsx` and `@ai-sdk/anthropic` (`ANTHROPIC_BASE_URL`); Node `>=20.9.0` from Next's `package.json`; `pnpm build` succeeded; the production server served `/` (200); screenshots in `docs/screenshots/` are real captures from that build (seeded Mumbai wedding fixture in localStorage).
- **Placeholders / not done:** public URL is "TBD" until P5-T09; no demo GIF recorded (marked TODO in README); `DATABASE_URL` documented as unused (no code reads it). A from-scratch clone + `pnpm i` was not re-run, and lint/typecheck/test were not re-run (markdown-only change).



---

## [ ] P5-T09: Vercel deployment

**Depends on:** P5-T04, P5-T05, P5-T08
**Refs:** PROJECT_SPEC §11 · TDD §2.3, §15.1

**Steps**
- Push to GitHub; import into Vercel; set `ANTHROPIC_API_KEY`, optional `LLM_MODEL`, optional `NEXT_PUBLIC_DEMO_FALLBACK`, plus optional `UNSPLASH_ACCESS_KEY` / `DATABASE_URL`.
- Confirm Node runtime and `maxDuration = 60` on all three LLM routes (Hobby limits).
- Deploy; record the public URL in the README.
- Set the Anthropic console monthly spend limit.

**Done when**
- The public URL works in an incognito window, and a plan generates on the deployed site without a function timeout.

---

## [ ] P5-T10: Final acceptance smoke test

**Depends on:** P5-T09
**Refs:** PROJECT_SPEC §13 · TDD §16.3, §16.4

Run on the **deployed URL** and tick each:

- [ ] Submit the form → full plan visible within ~30 s; first content within ~5 s (time all 3 scenarios)
- [ ] Budget, Timeline, Vendors and Ideas render as UI components; no raw JSON anywhere
- [ ] Chart total equals the entered budget; percents sum to 100
- [ ] Tick items, hard refresh → same state, progress bar unchanged
- [ ] Refine "make it cheaper", "add a DJ", "cut budget by 20%" → UI updates; Undo restores
- [ ] 375 px viewport: no horizontal scroll, tabs and chat usable
- [ ] Public URL opens in an incognito window
- [ ] Each of the 3 demo scenario buttons works in one click
- [ ] Cached fallback: with `?demo=1` (or a bad key) a scenario still shows a streaming plan
- [ ] (NTH) ICS imports; print/PDF clean; vendor email draft opens in the mail app
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all green with zero warnings

**Done when**
- All boxes ticked. Anything that fails is logged as a new task in the relevant phase file and fixed before the demo.
- **Project exit criterion:** every item in PROJECT_SPEC §13 is checked.

---

## Demo-day checklist

- [ ] Fixtures committed and `?demo=1` verified an hour before judging
- [ ] Anthropic key has credit; spend limit set
- [ ] Browser has a clean `localStorage` (or a pre-ticked plan ready to show persistence)
- [ ] Pitch the personalisation (culture, budget, guests, location), not "a checklist generator"
- [ ] Sequence: pick scenario → show streaming → tick items → "cut the budget by 20%" → chart updates → Undo → export calendar
