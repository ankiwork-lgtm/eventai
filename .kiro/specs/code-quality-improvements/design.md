# Code Quality Improvements Bugfix Design

## Overview

EventAI scored 96.41/100. Code Quality (88) is the largest gap, followed by small gaps in Security, Testing, Accessibility and Problem Statement Alignment. The 23 defects in `bugfix.md` fall into seven groups. Two are functional bugs (an ignored event name, an IPv6 rate-limit bypass). The rest are structure, duplication, inconsistent contracts and repository leftovers.

The fix strategy is a staged, behavior-preserving refactor. Each stage is small, ships with its own tests, and keeps `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` green. Functional bugs are fixed first inside their stage because they are cheap and have clear regression tests. Large component splits come after shared contracts (constants, schema, API helpers, client error helper) exist, so the splits can consume them.

This is a plan only. No source code is changed in this phase.

### Facts confirmed from the bundled Next docs and unread files

**Nonce-based CSP (1.15 / 2.15): supported, but not compatible with this app's rendering mode.**
`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md` (Next 16.4.2) documents nonces via `proxy.ts`. The nonce is extracted from the request CSP header and applied to framework scripts and inline styles. The same guide states:
- Pages must be dynamically rendered. Static optimization is disabled and CDN caching is lost.
- Partial Prerendering is incompatible with nonce-based CSP, because static shell scripts cannot get a nonce.

`next.config.ts` sets `cacheComponents: true` (which controls PPR) and `partialPrefetching: true`. Adopting nonces would mean giving up the static shell, a real performance and Efficiency cost (Efficiency currently scores 100). The guide also confirms `'unsafe-eval'` is only needed in development. The guide offers a third option, experimental SRI hashes (`experimental.sri`), which keeps static generation. It is flagged experimental and its interaction with `cacheComponents` is not documented, so it is not adopted.

Decision: gate `'unsafe-eval'` to development only. Keep `'unsafe-inline'` in production `script-src` and document why in `README.md` and in a comment in `next.config.ts`, citing the PPR/nonce incompatibility. This satisfies the "or document why it remains" branch of 2.15. Nonce/proxy migration is recorded as a future option, not part of this work. Note the doc's own "without nonces" example also keeps `'unsafe-inline'`, so the policy is consistent with the framework guidance.

**Per-route titles for client pages (1.22 / 2.22): confirmed.**
`generate-metadata.md` states that `metadata` and `generateMetadata` are only supported in Server Components, and recommends keeping `page.tsx` as a Server Component and moving client logic to a separate file. Current state:
- `app/page.tsx` is already a Server Component. It only needs a `metadata` export.
- `app/plan/[id]/page.tsx` and `app/plan/[id]/print/page.tsx` both start with `"use client"`, so they cannot export metadata today.

Fix: move each page body into a client component file (for example `components/PlanPageClient.tsx` and `components/PrintPageClient.tsx`), and make both `page.tsx` files thin Server Components that export a static `metadata` title and render the client component. `title.template` in the root layout (`%s | EventAI`, with `default` set to the current title) supplies the suffix. Titles cannot include the user's event name at the server, because plans live in `localStorage`. An optional follow-up is rendering a React 19 `<title>` from the client component once the plan loads. It is optional and must not cause a hydration mismatch.

**Files not previously read**

- `components/Timeline.tsx`: confirms 1.1. `handleExportIcs` reads `planCtx.input.name?.trim() || planCtx.input.eventType` for the .ics filename. Row keys are `${group.phase}-${i}` (index based, acceptable here because the list is filtered and derived, but the unique `taskKey` plus index should be preferred). `planId: "plan"` is hard-coded in `buildIcs`, which makes UIDs identical across plans; it should receive the real plan id. `planCtx.plan as Plan` is a cast that disappears once PlanContext types are tightened (2.2).
- `components/BudgetChart.tsx`: no defects from the list. Minor items, in scope only where cheap: `Cell key={i}` index keys (use `entry.name`-based keys), and two near-identical `Tooltip` formatters that can share one helper. It already uses `useSyncExternalStore` for reduced motion, which is a pattern worth reusing, not changing.
- `components/EmailDialog.tsx`: a defect not in `bugfix.md`, found on reading. It has two copies of the same fetch logic (`fetchEmailDraft` and the `useEffect`). The effect version never sets `loading` to true, so the loading state is not shown on first open. It also skips reading the server error envelope (`errorData.message` is read in the first copy only, and the envelope uses `error.message`), and it duplicates the 429 and Retry-After handling that `PlanShell` and `ChatRefiner` also do. This belongs to 1.12 and is added to scope under the shared client error helper (see Fix Implementation, stage 3). Also `setTimeout(() => setCopied(false), 2000)` is an unmanaged timer and an instance of 1.5.

## Glossary

- **Bug_Condition (C)**: The condition that triggers a defect. Each group below defines its own C.
- **Property (P)**: The desired behavior for inputs where C holds.
- **Preservation**: Behavior for inputs where C does not hold (requirements 3.1 to 3.13). It must not change.
- **Defect group**: A set of related defects fixed together (A to G below).
- **Event name**: What the user types in the intake form. Today stored as `eventName`, while some readers use legacy `name`.
- **Canonical name helper**: A single function `getEventDisplayName(input)` in `lib/` that returns the trimmed `eventName`, else legacy `name`, else a type-based fallback.
- **Limiter key**: The map key used by the in-memory rate limiter in `lib/rateLimit` (today `ip::route`).
- **API envelope**: The existing JSON error shape returned by routes (`error.code`, `error.message`) with `Retry-After` on 429.
- **PPR / cacheComponents**: Next 16 prerendered static shell with streamed dynamic content. Enabled in `next.config.ts`.
- **nonce CSP**: A per-request CSP nonce set in `proxy.ts`. Requires fully dynamic rendering.

## Bug Details

### Bug Condition

The defects fall into seven groups. Each has a formal condition. Together, `isBugCondition(X)` is the disjunction of the groups.

**Formal Specification:**
```
FUNCTION isBugCondition(X)
  INPUT: X of type Scenario (user action, request, stored record, or repository state)
  OUTPUT: boolean

  RETURN A(X) OR B(X) OR C(X) OR D(X) OR E(X) OR F(X) OR G(X)
END FUNCTION

// A: Functional bugs
FUNCTION A(X)
  RETURN ( X.input.eventName IS NON_EMPTY
           AND X.consumer IN {printTitle, icsFilename, icsEntries, timelineIcsExport}
           AND X.consumer READS X.input.name )                         // 1.1, 1.23
      OR ( X.kind = "apiRequest"
           AND X.clientIp CONTAINS "::"
           AND limiterKey(X) = X.clientIp + "::" + X.route
           AND routeFromKey(limiterKey(X)) != X.route )                // 1.13
      OR ( X.kind = "shareLink"
           AND (len(X.hash) > LIMIT OR len(decompress(X.hash)) > LIMIT)
           AND NOT rejectedBeforeParse(X) )                            // 1.14
      OR ( X.kind = "emailDialogOpen" AND NOT loadingShown(X) )        // found in EmailDialog.tsx
END FUNCTION

// B: Structure and duplication in source
FUNCTION B(X)
  RETURN X.kind = "maintenance"
     AND ( X.file IN {PlanShell, IntakeForm, print/page} AND oversized(X.file)
        OR duplicatedLogic(X.file) OR unnamedConstant(X.file)
        OR unsafeCast(X.file) OR ignoredOption(X.file) )              // 1.2 to 1.9
END FUNCTION

// C: Contracts and error handling
FUNCTION C(X)
  RETURN ( X.kind = "networkJson" AND NOT schemaValidated(X) )         // 1.8
      OR ( X.kind = "clientError" AND parsesMessageByRegex(X) )        // 1.12
      OR ( X.kind = "apiFailure" AND X.route = "moodboard"
           AND X.status IN {200 with empty body on upstream failure, bare []}
           AND envelopeNotUsed(X) )                                    // 1.3, 1.12
END FUNCTION

// D: Repository hygiene and dependencies
FUNCTION D(X)
  RETURN X.kind = "repoState"
     AND ( publicLeftoverRoute(X) OR trackedGeneratedFile(X)
        OR scratchFilesAtRoot(X) OR unusualDependency(X) )            // 1.10, 1.11
END FUNCTION

// E: Security configuration
FUNCTION E(X)
  RETURN ( X.kind = "cspHeader" AND X.env = "production"
           AND "'unsafe-eval'" IN X.scriptSrc )                        // 1.15
      OR ( X.kind = "apiRequest"
           AND X.currency NOT IN SUPPORTED_CURRENCIES
           AND length(X.currency) = 3 )                                // 1.16
END FUNCTION

// F: Testing gaps
FUNCTION F(X)
  RETURN X.kind = "testSuite"
     AND ( coverageExcludes(X, {components, hooks}) OR branchThreshold(X) < 85
        OR missingTest(X, {ExportMenu, IdeasGrid, MoodBoard,
                           PlanHeader, TabSkeletons, usePlanStore})
        OR missingRegression(X, A OR C) )                              // 1.17 to 1.19
END FUNCTION

// G: Accessibility
FUNCTION G(X)
  RETURN ( X.kind = "keyboard" AND X.target = "ExportMenu"
           AND NOT followsAriaMenuPattern(X) )                         // 1.20
      OR ( X.kind = "screenReader" AND X.target = "printView"
           AND (tableMissingScope(X) OR checklistBoxNotAccessible(X)) )// 1.21
      OR ( X.kind = "navigation" AND X.toRoute IN {plan, print}
           AND documentTitle(X) = rootTitle )                          // 1.22
END FUNCTION
```

### Examples

- **Group A, event name:** User enters "Maya & Ravi's Wedding". The dashboard header shows it. The print title says "WEDDING PLAN" and the .ics file is named `wedding-schedule.ics`. Expected: print title and filename use the name.
- **Group A, IPv6:** A client at `::1` sends 6 requests to `/api/plan` (limit 5). Key is `::1::plan`. `split("::")[1]` returns `"1"`, which is not a route. The bucket is deleted right after saving, and all 6 requests are allowed. Expected: the sixth returns 429 with `Retry-After`.
- **Group A, share link:** A 5 MB compressed hash is opened. The client decompresses without a cap. Expected: rejected with "Invalid shared plan link" before parsing.
- **Group A, EmailDialog:** The dialog opens. The effect starts a fetch but `loading` stays false, so the form renders empty fields until data arrives. Expected: a loading state is shown.
- **Group B:** `PlanShell` is 599 lines and uses `as never`. Expected: split into focused units with typed tab data and the same behavior.
- **Group C:** Server returns `{error:{code:"RATE_LIMITED",message:"..."}}` with 429. `ChatRefiner` shows "Server error 429". Expected: it shows the server message and retry seconds through the shared helper.
- **Group C, edge:** Unsplash returns an unexpected payload shape. Today the route reads untyped fields. Expected: schema parse fails, the section stays hidden (3.10 preserved).
- **Group D:** `GET /ui-test` serves a demo page in production. Expected: not routable.
- **Group E:** Production response header includes `'unsafe-eval'`. Expected: only in development.
- **Group G, edge:** User tabs to the Export trigger and opens the menu. Focus stays on the trigger and arrow keys do nothing. Expected: focus moves into the menu, arrows/Home/End navigate, Escape returns focus to the trigger.
- **Not a bug (edge):** A client whose IPv4 address contains no `::` is already limited correctly. It must stay so.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Plan creation and four-section streaming into the dashboard tabs (3.1).
- Response shapes and status codes of `/api/plan`, `/api/refine`, `/api/email`, and the 400/413/429/500/502 envelope (3.2).
- Per-route limits: plan 5, refine 20, email 20, moodboard 30 per 10 minutes, with `Retry-After` (3.3).
- Load, corrupt-record recovery, "Plan not found", and loading of previously stored plans, including those with legacy `name` (3.4, 2.1).
- Demo mode replay, Retry and "Use sample plan" (3.5).
- 300 ms debounced persistence, flush on `beforeunload` and tab hide, `?tab=` mirroring, one storage-degraded toast (3.6).
- Refine flow with one-step Undo, last 6 messages, 500 character limit, read-only shared views (3.7, 3.8).
- Valid .ics, printable view with same sections and page breaks, copyable share link (3.9).
- Mood board hidden silently with no key or upstream failure; only valid https links shown (3.10).
- Other security headers and the 50 KB body limit (3.11).
- `pnpm lint`, `typecheck`, `test`, `build` pass. Existing vitest tests, axe tests and e2e specs are not weakened or deleted (3.12).
- Keyboard navigation, focus visibility, labels, reduced motion, demo chips (3.13).

**Scope:**
All inputs where none of groups A to G hold must behave exactly as before. This includes valid IPv4 traffic, plans without a custom name, and all rendering that is not touched by a split (printed output must be byte-identical in structure and text).

**Note:** The expected correct behavior for each defect is defined in the Correctness Properties section below.

## Hypothesized Root Cause

Root causes below come from reading the code and the bundled docs. Each is a hypothesis to confirm with an exploratory test before the fix.

**Group A: functional bugs**
1. **Schema drift (event name).** The input schema declares both `eventName` and `name`, and consumers were written at different times. Print, export and Timeline read `name`; the form writes `eventName`. There is no single accessor, so each reader picked a field.
2. **Ambiguous composite key (IPv6).** The limiter encodes two values in one string with `"::"` and splits it back. IPv6 uses `::` natively, so `split("::")[1]` returns an address fragment. The lookup then finds no route config, so the bucket is dropped immediately.
3. **Missing input bound (share link).** The decode path trusts the hash length. Schema validation runs only after full decompression.
4. **Effect-only fetch (EmailDialog).** The effect-driven copy of the request forgot `setLoading(true)`. The duplicate was written instead of reusing one function.

**Group B: structure**
5. **Organic growth in single files.** `PlanShell`, `IntakeForm` and the print page accumulated responsibilities phase by phase (P2 to P4). No shared module existed for constants, so values were repeated (6, 300, 2000, 10000).
6. **Type escapes.** `as never`, `as unknown as number` and `!` exist because tab data and form defaults are typed too loosely. Fixing the types at the source removes the casts.
7. **Dead or misleading options.** `temperature` was kept after the provider call stopped using it. Token aliases remain only because tests import them.
8. **Impure updaters.** `usePlanStore` runs side effects inside `setRecord` updaters. React may invoke updaters twice (Strict Mode), so a ref write and timer scheduling can double-fire.

**Group C: contracts**
9. **Trust in network JSON.** Responses were cast during rapid prototyping, with no shared schemas for refine results or mood board images.
10. **No client error helper.** Each caller (PlanShell, ChatRefiner, EmailDialog) parses errors itself, so formats diverge. The moodboard route predates the shared envelope.

**Group D: hygiene and dependencies**
11. **Scratch artifacts committed or left in place.** `test-results/` is not in `.gitignore`. `app/ui-test` was a dev harness left routable. The package named `cn` was chosen instead of the shadcn convention (a local `cn` over `clsx` and `tailwind-merge`).

**Group E: security config**
12. **One CSP for all environments.** `next.config.ts` hard-codes `'unsafe-eval'` and `'unsafe-inline'`. The docs show `'unsafe-eval'` is a dev-only need. `'unsafe-inline'` remains because nonces require dynamic rendering (see Overview).
13. **Permissive currency schema.** The schema validates length (3), not membership.

**Group F: testing**
14. **Coverage `include` was scoped to what was easy to test.** Components and hooks were excluded, so gaps went unmeasured.

**Group G: accessibility**
15. **Role without behavior.** `role="menu"` was added without the keyboard contract that the ARIA menu pattern requires.
16. **Client-only pages cannot export metadata** (confirmed from docs), so both routes inherit the root title.

## Correctness Properties

Property 1: Bug Condition - Functional defects (groups A and C)

_For any_ input where the bug condition holds (isBugCondition returns true for group A or C), the fixed code SHALL: use the user's event name in print title, export filenames, calendar entries and prompts (falling back to the event type only when no name was entered, with filename sanitization); apply the rate limit to IPv6 clients with unambiguous limiter keys; reject oversized share payloads before parsing and show "Invalid shared plan link"; show a loading state when the email dialog opens; validate network JSON against a schema before use; and read errors through one shared helper that uses the server envelope and `Retry-After`.

**Validates: Requirements 2.1, 2.8, 2.12, 2.13, 2.14, 2.19, 2.23**

Property 2: Bug Condition - Structural, hygiene, security-config, test and accessibility defects (groups B, D, E, F, G)

_For any_ maintenance, repository, header, test-suite, keyboard or screen-reader scenario where the bug condition holds, the fixed code SHALL: use focused units, named single-definition constants, shared API helpers, a pure and unmount-safe `usePlanStore`, a data-driven intake form and print view, and typed tab data; remove or exclude leftovers and the unusual `cn` import; omit `'unsafe-eval'` from production CSP and document the remaining `'unsafe-inline'`; restrict `currency` to the supported list; measure and test components and hooks with higher branch thresholds; follow the ARIA menu pattern in ExportMenu; give print tables `scope` and an accessible name; and give each route a meaningful title.

**Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.9, 2.10, 2.11, 2.15, 2.16, 2.17, 2.18, 2.20, 2.21, 2.22**

Property 3: Preservation - Existing behavior

_For any_ input where the bug condition does NOT hold, the fixed code SHALL produce the same result as the original code, preserving plan generation and streaming, API response shapes, status codes and limits, stored-plan loading (including legacy `name`), demo replay, debounced persistence, refine and Undo, share/export/print output, mood board behavior, security headers other than the two CSP changes, and keyboard/screen-reader support.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13**

## Fix Implementation

### Ordering by score impact

Code Quality has the most headroom (88), so it is first. Within it, shared building blocks come before the large splits that depend on them. Each stage is independently mergeable and verified with lint, typecheck, test and build.

| Stage | Focus | Requirements | Score area | Risk |
|---|---|---|---|---|
| 1 | Constants, canonical name, schema (currency, name) | 2.1, 2.5, 2.7 (list), 2.16, 2.23 | Code Quality, Alignment | Low |
| 2 | API layer: helpers, limiter key fix, AI cleanup | 2.3, 2.4, 2.13 | Code Quality, Security | Medium |
| 3 | Client contracts: error helper, schema-validated JSON, EmailDialog | 2.8, 2.12 | Code Quality | Low |
| 4 | `usePlanStore` purity | 2.6 | Code Quality | Medium |
| 5 | Component splits: PlanShell, IntakeForm, print view | 2.2, 2.7, 2.9 | Code Quality | High |
| 6 | Hygiene and dependencies | 2.10, 2.11 | Code Quality | Low |
| 7 | Security config: CSP, share-link cap | 2.14, 2.15 | Security | Low |
| 8 | Tests and coverage | 2.17, 2.18, 2.19 | Testing | Low |
| 9 | Accessibility and titles | 2.20, 2.21, 2.22 | Accessibility | Medium |

Regression tests for each defect (2.19) are written alongside the stage that fixes it, not deferred to stage 8. Stage 8 adds the remaining component tests and raises thresholds once measured.

### Stage 1: Shared constants, canonical name, schema

**Files**: new `lib/constants.ts`, new `lib/eventName.ts` (or an addition to `lib/format.ts`), `lib/schema.ts`, `lib/prompts` (wherever prompt building reads `name`), `lib/export.ts`, print page, `components/Timeline.tsx`, `components/PlanHeader.tsx`, `components/ChatRefiner.tsx`, `hooks/usePlanStore.ts`, `components/MoodBoard.tsx`, `components/ExportMenu.tsx`.

1. **Canonical name.** Add `getEventDisplayName(input)`: trimmed `eventName`, else trimmed legacy `name`, else the event-type fallback already used today. Replace every direct read of `input.name` (print title, `buildIcs` summary and filename, Timeline export, prompts). Add `toSafeFilename(name)` that strips path and control characters, collapses whitespace, and caps length. Keep `name` in the schema as an optional, documented legacy field so old stored records still parse (3.4), and stop writing it.
2. **Named constants.** In `lib/constants.ts` define, each once with a doc comment: `REFINE_HISTORY_LIMIT` (6; imported by the refine route and `ChatRefiner`), `SAVE_DEBOUNCE_MS` (300), `MOODBOARD_IMAGE_COUNT` (6), `MOODBOARD_QUERY_MAX` (100), `MOODBOARD_CACHE_TTL_S` (86400), `GUEST_MAX` (10000, used by schema and form), `PRINT_DELAY_MS` (500), `COPIED_RESET_MS` (2000), and `MAX_DURATION_S` / `MAX_RETRIES` for routes. Route files cannot re-export non-segment values from `export const maxDuration`. Next requires `maxDuration` to be statically analyzable in each route, so the literal stays in each route file with a comment pointing to the constant, or the route uses a literal that a test asserts equals the shared constant. This is a known Next constraint and must be re-checked in `route-segment-config` docs when editing.
3. **Currency.** Add `SUPPORTED_CURRENCIES` as a tuple. The schema uses `z.enum(SUPPORTED_CURRENCIES)`. The form derives its options from the same tuple. Existing stored records with an unsupported currency must still load, so the stored-record schema keeps a lenient parse and the request schema is strict (see Risks).

### Stage 2: API layer

**Files**: new `lib/api/` helpers (for example `guard.ts`, `errors.ts`, `logging.ts`), `lib/rateLimit.ts`, `lib/ai.ts`, `app/api/{plan,refine,email,moodboard}/route.ts`.

1. **Limiter key fix (2.13).** Replace the concatenated string key with a nested `Map<route, Map<ip, bucket>>`, or a key built with an unambiguous encoding such as `JSON.stringify([route, ip])`. Remove `split("::")`. Keep per-route config lookup keyed by the route directly. Keep the shared `"unknown"` bucket behavior and document it in the README (2.16).
2. **Shared helpers (2.3).** Add `enforceRateLimit(req, route)` returning either `null` or the 429 response with `Retry-After`; `readJsonBody(req, schema)` returning parsed data or an envelope response (413 over the 50 KB limit, 400 on invalid JSON or schema); `withLlmLogging(...)` to wrap `logLlmCall`; and `mapError(err)` that converts provider vs internal errors into 502 or 500. Plan, refine and email use them, preserving each route's existing statuses and messages (3.2).
3. **Moodboard (2.3, 1.12).** Public contract for the success path stays an array. The 429 uses the shared envelope plus `Retry-After`. `MoodBoard` already hides on failure (3.10), so the client change is safe. Body-read exceptions return 400 or 500 consistently with the others. Upstream failures keep returning an empty array with 200, because the client hides the section silently; this is documented as intentional, which resolves the "consistent codes" point without breaking 3.10. The envelope change for 429 must be verified against the existing moodboard test and the client.
4. **AI layer (2.4).** Remove the `temperature` option and the callers' arguments. Remove the `MAX_OUTPUT_TOKENS_*` aliases after updating the tests that import them to use the real constants. Make `maxOutputTokens` a required argument of `generateStructured`. In `streamPlan`, either report the real stream error state or remove the `error: undefined` field. Check the consumers of the finish payload first to choose.

### Stage 3: Client contracts

**Files**: new `lib/client/apiError.ts`, schemas added to `lib/schema.ts` (`RefineResultSchema`, `MoodBoardImageSchema`, `UnsplashResponseSchema`), `components/ChatRefiner.tsx`, `components/MoodBoard.tsx`, `components/EmailDialog.tsx`, `components/PlanShell.tsx` error paths.

1. **Shared helper.** `parseApiError(res)` reads `error.code`, `error.message` and `Retry-After` and returns a typed `ApiError` with `status`, `code`, `message`, `retryAfterSeconds`. A `formatRateLimitMessage(err)` produces the user text. PlanShell stops using regex on message text. ChatRefiner stops showing `Server error <status>`.
2. **Validation.** Parse refine and mood board responses with `safeParse`. On failure, ChatRefiner shows its generic error; MoodBoard stays hidden (3.10). The moodboard route parses the Unsplash payload with a schema and skips malformed results.
3. **MoodBoard cleanup.** Remove the dead `loading` state. Use stable keys (image id or URL). Raise the photo credit text from 10px to a readable size (2.22) with a layout check.
4. **EmailDialog.** Collapse the two fetch copies into one `requestDraft(signal)` function called from the effect and the Retry button. Set `loading` to true at the start. Use `AbortController` instead of the `active` flag. Use `parseApiError`. Keep the same endpoint and response handling (3.2). Replace the raw timer with the shared `COPIED_RESET_MS` and clear it on unmount.

### Stage 4: `usePlanStore`

**File**: `hooks/usePlanStore.ts`.

1. One `scheduleSave(next)` routine used by both `update` and `toggle`, with `SAVE_DEBOUNCE_MS`.
2. Updater functions become pure. Compute the next record from a ref that mirrors the latest record, or use a reducer, then perform the ref write and timer scheduling outside the updater.
3. On unmount, flush the pending save rather than dropping it (so the last edit is never lost), then clear the timer. Keep the existing `beforeunload` and visibility flush (3.6).
4. This hook is where Strict Mode double invocation is most likely to expose problems, so the test must run under `React.StrictMode`.

### Stage 5: Component splits

Do these after stages 1 to 4. They are the riskiest because they touch the most behavior.

**PlanShell (2.2)** into: a `usePlanLoader` hook (storage load, share-link decode, corrupt-record recovery), a `usePlanStream` hook (generation, replay, demo), `PlanStateViews` (loading, not found, corrupt, invalid link), and `PlanTabs` (tab routing and content). Valid tabs derive from `TAB_SECTIONS`. Tab data is typed with a discriminated union keyed by tab id, which removes `as never`. Fix the status function with two identical branches. For the two `set-state-in-effect` suppressions, either restructure (derive state, or use `useSyncExternalStore` as BudgetChart already does) or keep with a one-line justification each. Do not remove a suppression without a passing lint.

**IntakeForm (2.7)**: move per-event-type templates to `components/intake/templates.ts`. Extract a `ChipGroup` component used by both chip fields. Replace `"" as unknown as number` with form defaults typed as `number | ""` plus a transform at submit. Currency options come from `SUPPORTED_CURRENCIES`.

**Print view (2.9)**: extract `PrintHeader`, `BudgetTable`, `TimelineSection`, `VendorList`, `IdeasList` presentational components. Replace the nested priority ternary with a lookup map. Use stable keys. The page-local `styled-jsx` global style stays (print-only rules) unless moving it to `globals.css` under `@media print` is trivially equal; if moved, compare printed output.

Each split is done as pure extraction first (move code, no edits), run tests, then cleanups in a second commit.

### Stage 6: Hygiene and dependencies

1. **`app/ui-test` (2.10).** Before deleting, grep tests and e2e specs for `/ui-test`. If referenced, gate it behind `NODE_ENV !== "production"` with `notFound()`; otherwise delete.
2. **`test-results/`**: `git rm -r --cached test-results` and add `test-results/` (and `playwright-report/` if present) to `.gitignore`.
3. **Scratch files and planning docs**: move `fixes/` to `docs/archive/`, delete or ignore the root `dev-*.log`, `run.*`, `server.log*`, `stream-out.txt`, `lh-*`. Verify with grep that no script or spec references them first. Deletions of untracked or ignored files are not recoverable from git, so list them for the user before deleting.
4. **`cn` (2.11).** Vet the npm package named `cn` (publisher, contents). Replace imports in `components/ui/*` with a local `lib/utils.ts` `cn` built from `clsx` and `tailwind-merge`, then remove the package. Add those two packages with exact pinned versions only if they are not already installed.
5. **`next-themes`**: the sonner wrapper calls `useTheme` with no provider, so it always resolves to the default. Prefer removing the hook and passing a fixed theme (or `system`) to avoid adding a provider and a hydration concern. Remove `next-themes` if nothing else uses it.
6. **`shadcn` CLI** move to `devDependencies` is already the case; justify it in the README or remove it if unused at build time. **Pin policy**: adopt exact pins for all dependencies (consistent with the repository safety rule) and document in the README.

### Stage 7: Security configuration

1. **CSP (2.15).** In `next.config.ts`, build `script-src` as `'self' 'unsafe-inline' https://va.vercel-scripts.com` plus `'unsafe-eval'` only when `process.env.NODE_ENV === "development"`. Keep every other directive and header unchanged (3.11). Add a comment and a README section explaining that nonces require dynamic rendering and are incompatible with PPR in this version's docs. Extract the header builder into `lib/security/csp.ts` so it can be unit tested for both environments.
2. **Share-link cap (2.14).** Define `SHARE_HASH_MAX_CHARS` and `SHARE_DECOMPRESSED_MAX_BYTES` in the constants. Check the encoded length first. Decompress with a bounded read (check output length as it grows, or use a decompress function that supports a max output) and abort when the cap is exceeded. Show the existing "Invalid shared plan link". The cap must comfortably exceed the largest valid plan (verify with the maximum-size fixture in tests).
3. **Documentation (2.16).** README "Known limitations": the shared `"unknown"` bucket when no trusted IP header exists, and the in-memory limiter's per-instance scope.

### Stage 8: Testing

1. Update `vitest.config` coverage `include` to add `hooks/**` and the testable `components/**`. Exclude only pure shell files (`app/layout.tsx`, `components/ui/**` generated primitives) with a comment each.
2. Measure first. Set each threshold a point or two under the measured value. Raise branches from 78 toward 85 only if measured values allow it; if a gate cannot be met honestly, set it at the measured floor and note the gap. Do not lower any existing threshold.
3. New tests: `ExportMenu` (including the keyboard contract), `IdeasGrid`, `MoodBoard` (valid, invalid and empty responses), `PlanHeader`, `TabSkeletons`, and `usePlanStore` (debounce, flush on unmount, `toggle`, Strict Mode).
4. Regression tests per 2.19, written with their stage: IPv6 limiter keys, event name in print and export output, oversized share payloads, and invalid network responses.

### Stage 9: Accessibility and titles

1. **ExportMenu (2.20).** First check whether the project's UI library already provides an accessible menu primitive (the `components/ui` folder and installed base-ui or radix packages). If so, use it and delete the hand-rolled roles. If not, implement: `aria-haspopup`, `aria-expanded`, `aria-controls`, focus first item on open, Arrow Up/Down with wrap, Home/End, Escape and outside click close and return focus to the trigger, Tab closes the menu.
2. **Print view (2.21).** Add `scope="col"` or `scope="row"` to `<th>`, a `<caption>` (can be `sr-only`) per table, and an accessible representation for checklist boxes (`role="checkbox"` with `aria-checked`, or a visually hidden "Not done" text). Colors: replace hard-coded white and black with the same values via CSS variables only if the printed output is unchanged; otherwise leave and note.
3. **Titles (2.22).** Add `title.template` and `default` to the root layout metadata. Export `metadata` from the landing page (already a Server Component). Convert the plan and print pages into Server Component wrappers that export static titles, render the existing client logic from `components/PlanPageClient.tsx` and `components/PrintPageClient.tsx`, and keep `React.use(params)` and the Suspense boundary inside the client component so nothing about the existing dynamic-segment behavior changes.

## Risks and Mitigations

- **Large splits change behavior silently (stage 5).** Mitigation: extract with no edits first, keep all existing component and e2e tests green at each step, add characterization tests for the state transitions before touching `PlanShell`.
- **`maxDuration` and other route segment configs must stay literal.** Mitigation: keep literals in route files; add a test that asserts they equal the shared constants.
- **Currency enum can reject stored or demo data.** Mitigation: strict enum on the request schema only; stored records parse leniently; verify demo fixtures and the scenario chips use supported codes before merging.
- **Moodboard 429 envelope change could break the client or its test.** Mitigation: client treats any non-OK as hidden; update the moodboard test to assert the envelope and `Retry-After`.
- **Removing `'unsafe-eval'` could break production if a dependency uses `eval`.** Mitigation: run the production build and the e2e suite against `next start` with the new header, and run a quick check of the Recharts pages.
- **Removing `next-themes` or `cn` could alter styling.** Mitigation: snapshot or visual check of the Toaster; `cn` is behavior-equivalent for the used signatures (verify with a unit test over class merging).
- **Flushing on unmount could write after the record is deleted.** Mitigation: flush only if the record still exists and the delete flow cancels the pending timer.
- **Coverage thresholds could fail CI if set above measured values.** Mitigation: measure on a clean run and set just under.
- **Deleting files is not reversible for untracked content.** Mitigation: grep for references, list candidates, and delete only with the user's confirmation.
- **Title changes affect e2e specs that assert on `document.title`.** Mitigation: grep e2e specs for `toHaveTitle` before changing and update intentionally.
- **Scope creep.** The EmailDialog defect was found outside `bugfix.md`. It is included under 1.12 and 1.5; `bugfix.md` should be updated to list it, with a matching 2.x clause, if the user agrees.

## Testing Strategy

### Validation Approach

Two-phase: first write tests that expose each defect on the unfixed code and confirm or refute the root cause. Then fix, and verify both fix checking and preservation. The existing vitest suite, axe tests and e2e specs run unchanged at every stage. They are the preservation baseline and are never edited to make a change pass. Only new tests are added; existing assertions change only when they encode a defect (for example a test importing a removed token alias), and each such edit is called out in the commit.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples on the UNFIXED code before changing it.

**Test Plan**: Write the tests below against current code and record the failures. If a result contradicts the hypothesis, re-hypothesize before fixing.

**Test Cases**:
1. **IPv6 limiter**: send 6 requests with IP `::1` and `2001:db8::1` to the plan limiter; expect the 6th blocked (will fail on unfixed code).
2. **Event name**: build print title, ics filename and ics entries from an input with `eventName` "Maya & Ravi" and no `name` (will fail on unfixed code). Repeat for the Timeline export.
3. **Share cap**: decode a hash that decompresses past the cap; expect rejection before parse (will fail on unfixed code).
4. **EmailDialog loading**: open the dialog with a pending fetch; expect a loading indicator (will fail on unfixed code).
5. **Invalid network JSON**: feed ChatRefiner and MoodBoard malformed JSON; expect a handled error, not a thrown render error (may fail on unfixed code).
6. **Production CSP**: build the header for production; expect no `'unsafe-eval'` (will fail on unfixed code).
7. **ExportMenu keyboard**: open with Enter, press ArrowDown, expect focus on the first item (will fail on unfixed code).

**Expected Counterexamples**:
- The IPv6 requests are never blocked because the bucket is deleted immediately.
- Output reads "WEDDING PLAN" or the event type instead of the typed name.
- Possible causes: ambiguous key encoding, divergent field reads, missing size bound, missing state transition.

### Fix Checking

**Goal**: For all inputs where the bug condition holds, the fixed code produces the expected behavior.

**Pseudocode:**
```
FOR ALL X WHERE isBugCondition(X) DO
  result := fixed(X)
  ASSERT expectedBehavior(result)
END FOR
```

### Preservation Checking

**Goal**: For all inputs where the bug condition does NOT hold, the fixed code matches the original.

**Pseudocode:**
```
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT original(X) = fixed(X)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation because it generates many cases and catches edge cases that hand-written examples miss. The project's existing test setup should be checked for an installed PBT library (such as fast-check) before adding one; if none exists, parameterized tests over generated tables are an acceptable substitute, and adding a library requires the user's agreement and a pinned version.

**Test Plan**: Observe behavior on the unfixed code first (record outputs for sample inputs), then assert the same after the fix.

**Test Cases**:
1. **Limiter on non-IPv6 keys**: for random IPv4 addresses and routes, the fixed limiter allows exactly the configured count and then blocks, identical to before.
2. **Legacy records**: records with only `name`, only `eventName`, both, or neither render the same display name as before (legacy `name` still works).
3. **Export output**: for plans with no custom name, .ics and print output equal the pre-change output.
4. **API contracts**: for valid and invalid requests to plan, refine and email, status codes and response bodies match recorded snapshots.
5. **Printed output**: the split print view renders the same text and structure as the original for sample plans.
6. **Persistence**: toggle and update sequences produce the same stored state after the debounce.

### Unit Tests

- `getEventDisplayName` and `toSafeFilename` over empty, whitespace, unicode, path-like and very long names.
- Limiter keys for IPv4, IPv6 compressed, IPv6 full, IPv4-mapped IPv6 and `"unknown"`.
- `parseApiError` for envelope, missing envelope, non-JSON body and `Retry-After` present/absent.
- Schema parsing for refine result, mood board images, Unsplash payload (valid, missing fields, wrong types).
- CSP builder for development and production.
- Share decode: at the cap, just over the cap, and corrupted data.
- `cn` equivalence for the class patterns used in `components/ui`.

### Property-Based Tests

- For any generated name string, `toSafeFilename` never returns path separators or control characters and never exceeds the length cap.
- For any IP string and route among the configured four, the limiter blocks on request N+1 and the route recovered from the key always equals the route used.
- For any generated plan, `buildIcs` output parses, and the calendar name equals the display name.
- For any sequence of `update` and `toggle` calls under `StrictMode`, the final persisted record equals a pure reduction of the sequence, with at most one write per debounce window.
- For any JSON value, the client schema guards either return a valid typed object or a failure, never throw.

### Integration Tests

- Intake to dashboard with a typed name: header, share link, .ics and print view all show it.
- Full e2e specs unchanged: generation, refine with Undo, demo replay, share link, print, export.
- Production build served with `next start`: response CSP header has no `'unsafe-eval'`, pages render, charts render.
- Route titles: landing, plan and print each show their own `document.title`.
- Keyboard-only pass through the Export menu with the existing axe tests extended to the print view tables.
- Final gate: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and a coverage run showing thresholds met.
