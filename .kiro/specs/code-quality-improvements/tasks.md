# Implementation Plan

## Overview

This is a plan only. Nothing here has been executed and no source code has been changed.

Stages follow design.md, with Code Quality first. Each stage is independently mergeable. Regression tests sit in the stage that fixes the defect. Every stage ends with a verification task that runs `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build`. Existing tests, axe tests and e2e specs are never weakened or deleted to make a change pass.

Any task that deletes a file is marked **NEEDS USER CONFIRMATION**. For those, list the candidates, grep for references, and wait for approval before deleting.

Before touching any Next API (route segment config, metadata, CSP headers), re-read the relevant guide in `node_modules/next/dist/docs/`, as AGENTS.md requires.

## Tasks

- [x] 1. Stage 1: Shared constants, canonical event name, schema
  - Risk: Low. Score area: Code Quality, Problem Statement Alignment.

  - [x] 1.1 Write bug condition exploration tests for the event name (run on UNFIXED code)
    - **Property 1: Bug Condition** - Event name ignored in print and export
    - **GOAL**: Surface counterexamples on current code. These tests are expected to FAIL.
    - Build print title, .ics filename, .ics entries and the Timeline export from an input with `eventName` "Maya & Ravi" and no `name`
    - Assert the typed name appears in each output
    - Document the counterexamples (for example the output reads "WEDDING PLAN" or the event type)
    - Do not fix the code or the test at this step
    - _Bug_Condition: isBugCondition(X) group A, consumer reads X.input.name while eventName is non-empty_
    - _Requirements: 1.1, 1.23, 2.1, 2.23_

  - [x] 1.2 Write preservation tests for stored records and unnamed plans (run on UNFIXED code)
    - **Property 3: Preservation** - Legacy `name` records and plans without a custom name
    - Observe on unfixed code: records with only `name`, only `eventName`, both, or neither display the same name
    - Observe: .ics and print output for plans with no custom name
    - Write parameterized or property-based tests over those cases. Check whether fast-check is already installed first. Adding a library needs user agreement and a pinned version.
    - These tests must PASS on unfixed code
    - _Requirements: 3.4, 3.9_

  - [x] 1.3 Add `lib/constants.ts` with named, documented constants
    - Define `REFINE_HISTORY_LIMIT` (6), `SAVE_DEBOUNCE_MS` (300), `MOODBOARD_IMAGE_COUNT` (6), `MOODBOARD_QUERY_MAX` (100), `MOODBOARD_CACHE_TTL_S` (86400), `GUEST_MAX` (10000), `PRINT_DELAY_MS` (500), `COPIED_RESET_MS` (2000), `MAX_DURATION_S`, `MAX_RETRIES`
    - Replace the duplicated literals in the refine route, `ChatRefiner`, `hooks/usePlanStore.ts`, the moodboard route, the schema, `IntakeForm`, the print page and `ExportMenu`
    - Keep `export const maxDuration` as a literal in each route file with a comment pointing to the constant (Next needs it statically analyzable). Re-check the `route-segment-config` docs.
    - Add a test asserting each route literal equals the shared constant
    - _Requirements: 1.5, 2.5_

  - [x] 1.4 Add `getEventDisplayName` and `toSafeFilename`
    - `getEventDisplayName(input)`: trimmed `eventName`, else trimmed legacy `name`, else the existing event-type fallback
    - `toSafeFilename(name)`: strip path and control characters, collapse whitespace, cap length
    - Replace every direct read of `input.name` in the print title, `buildIcs` summary and filename, Timeline export, prompt building and `PlanHeader`
    - Pass the real plan id to `buildIcs` from `Timeline` instead of the hard-coded `"plan"`
    - Keep `name` in the schema as an optional documented legacy field. Stop writing it.
    - Unit tests: empty, whitespace, unicode, path-like and very long names
    - Property-based test: `toSafeFilename` never returns path separators or control characters and never exceeds the cap
    - _Bug_Condition: isBugCondition(X) group A, event name_
    - _Expected_Behavior: typed name used in print title, filenames, calendar, prompts, header_
    - _Preservation: legacy `name` records still load (3.4); unnamed plans produce unchanged output (3.9)_
    - _Requirements: 1.1, 1.23, 2.1, 2.23, 3.4, 3.9_

  - [x] 1.5 Add `SUPPORTED_CURRENCIES` and restrict the request schema
    - Export the tuple. The request schema uses `z.enum(SUPPORTED_CURRENCIES)`. The form derives its options from the same tuple.
    - Keep the stored-record schema lenient so old records with other currencies still load
    - Check that demo fixtures and scenario chips use supported codes
    - Test: unsupported 3-letter code is rejected on request, accepted when loading a stored record
    - _Requirements: 1.16, 1.7, 2.7, 2.16, 3.4_

  - [x] 1.6 Verify Stage 1
    - **Property 1: Expected Behavior** - Re-run the tests from 1.1. They must now PASS.
    - **Property 3: Preservation** - Re-run the tests from 1.2. They must still PASS.
    - Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`
    - _Requirements: 2.1, 2.5, 2.16, 2.23, 3.12_

- [x] 2. Stage 2: API layer helpers, IPv6 limiter fix, AI cleanup
  - Risk: Medium. Score area: Code Quality, Security.

  - [x] 2.1 Write bug condition exploration test for the IPv6 limiter (run on UNFIXED code)
    - **Property 1: Bug Condition** - IPv6 clients bypass the rate limit
    - **GOAL**: Expected to FAIL on current code
    - Send 6 requests to the plan limiter (limit 5) for IPs `::1` and `2001:db8::1`. Assert the 6th is blocked.
    - Document the counterexample (bucket deleted right after save, all 6 allowed)
    - _Bug_Condition: isBugCondition(X) group A, clientIp contains "::" and routeFromKey(key) != route_
    - _Requirements: 1.13, 2.13, 2.19_

  - [x] 2.2 Write preservation tests for the limiter and API contracts (run on UNFIXED code)
    - **Property 3: Preservation** - IPv4 limiting and route response contracts
    - Observe: for IPv4 addresses and the four routes, exactly the configured count is allowed, then 429 with `Retry-After`. Limits: plan 5, refine 20, email 20, moodboard 30 per 10 minutes.
    - Record snapshots of status codes and bodies for valid and invalid requests to plan, refine and email (400, 413, 429, 500, 502)
    - Check what existing route tests already cover before adding new ones
    - Tests must PASS on unfixed code
    - _Requirements: 3.2, 3.3, 3.11_

  - [x] 2.3 Fix the limiter key in `lib/rateLimit.ts`
    - Replace the `ip::route` string and `split("::")` with a nested `Map<route, Map<ip, bucket>>` or `JSON.stringify([route, ip])`
    - Look up route config directly by route
    - Keep the shared `"unknown"` bucket behavior
    - Unit tests: IPv4, compressed IPv6, full IPv6, IPv4-mapped IPv6, `"unknown"`
    - Property-based test: for any IP string and configured route, request N+1 is blocked and the route used always matches
    - _Bug_Condition: isBugCondition(X) group A, IPv6_
    - _Expected_Behavior: rate limit applies to IPv6 clients_
    - _Preservation: IPv4 limits and Retry-After unchanged_
    - _Requirements: 1.13, 2.13, 2.19, 3.3_

  - [x] 2.4 Add shared API helpers under `lib/api/`
    - `enforceRateLimit(req, route)` returns null or the 429 response with `Retry-After`
    - `readJsonBody(req, schema)` returns parsed data or an envelope response (413 over 50 KB, 400 for invalid JSON or schema)
    - `withLlmLogging(...)` wraps `logLlmCall`
    - `mapError(err)` maps provider errors to 502 and internal errors to 500
    - Unit-test each helper
    - Move plan, refine and email onto the helpers. Keep each route's statuses, messages and shapes identical (checked by the snapshots from 2.2).
    - _Requirements: 1.3, 2.3, 3.2_

  - [x] 2.5 Align the moodboard route
    - Return the shared envelope plus `Retry-After` for 429. The success body stays an array.
    - Keep returning an empty array with 200 on upstream failure. Document this as intentional in a code comment because the client hides the section silently.
    - Make body-read failures consistent with the other routes
    - Update the moodboard test to assert the envelope and `Retry-After`
    - _Requirements: 1.3, 1.12, 2.3, 2.12, 3.10_

  - [x] 2.6 Clean up the AI layer in `lib/ai.ts`
    - Remove the ignored `temperature` option and stop passing it from callers
    - Remove the `MAX_OUTPUT_TOKENS_*` aliases. Update the tests that import them to use the real constants and call out each edit.
    - Make `maxOutputTokens` a required argument of `generateStructured`
    - Check the consumers of the `streamPlan` finish payload, then either report the real error state or remove `error: undefined`
    - _Requirements: 1.4, 2.4, 3.1, 3.2_

  - [x] 2.7 Verify Stage 2
    - **Property 1: Expected Behavior** - Re-run the tests from 2.1. They must PASS.
    - **Property 3: Preservation** - Re-run the tests from 2.2. They must still PASS.
    - Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`
    - _Requirements: 2.3, 2.4, 2.13, 3.2, 3.3, 3.12_

- [x] 3. Stage 3: Client contracts, network JSON validation, EmailDialog
  - Risk: Low. Score area: Code Quality.

  - [x] 3.1 Write bug condition exploration tests (run on UNFIXED code)
    - **Property 1: Bug Condition** - Unvalidated network JSON, regex error parsing, EmailDialog loading
    - **GOAL**: Expected to FAIL (or throw) on current code
    - ChatRefiner and MoodBoard given malformed JSON: expect a handled error and no render crash
    - ChatRefiner given a 429 envelope with `Retry-After`: expect the server message and retry seconds, not "Server error 429"
    - EmailDialog opened with a pending fetch: expect a loading indicator
    - EmailDialog given an envelope error: expect `error.message` to be shown
    - Document the counterexamples
    - _Bug_Condition: isBugCondition(X) group A (emailDialogOpen) and group C (networkJson, clientError)_
    - _Requirements: 1.8, 1.12, 2.8, 2.12, 2.19_

  - [x] 3.2 Write preservation tests (run on UNFIXED code)
    - **Property 3: Preservation** - Refine, email and mood board success paths
    - Observe: valid refine result applies and Undo works, last 6 messages sent, 500 character limit
    - Observe: email draft success shape and copy action
    - Observe: mood board hidden with no key or on failure; only https image and credit links shown
    - Tests must PASS on unfixed code
    - _Requirements: 3.2, 3.7, 3.10_

  - [x] 3.3 Add `lib/client/apiError.ts`
    - `parseApiError(res)` returns a typed `ApiError` (`status`, `code`, `message`, `retryAfterSeconds`) and handles envelope, missing envelope, non-JSON body, and `Retry-After` present or absent
    - `formatRateLimitMessage(err)` produces the user text
    - Unit tests for each case
    - _Requirements: 1.12, 2.12_

  - [x] 3.4 Add response schemas and validate network JSON
    - Add `RefineResultSchema`, `MoodBoardImageSchema`, `UnsplashResponseSchema` to `lib/schema.ts`
    - `ChatRefiner` and `MoodBoard` use `safeParse` instead of casts. On failure ChatRefiner shows its generic error and MoodBoard stays hidden.
    - The moodboard route parses the Unsplash payload and skips malformed results
    - Property-based test: for any JSON value, the guards return a typed object or a failure and never throw
    - _Requirements: 1.8, 2.8, 2.19, 3.10_

  - [x] 3.5 Clean up `MoodBoard`
    - Remove the dead `loading` state
    - Use stable keys (image id or URL)
    - Raise photo credit text from 10px to a readable size and check the layout
    - _Requirements: 1.8, 2.8, 2.22_

  - [x] 3.6 Fix `EmailDialog` (defect found outside bugfix.md)
    - Collapse `fetchEmailDraft` and the effect copy into one `requestDraft(signal)` used by the effect and Retry
    - Set `loading` to true at the start of the request
    - Use `AbortController` instead of the `active` flag
    - Read errors through `parseApiError`, including the 429 and `Retry-After` path
    - Use `COPIED_RESET_MS` and clear the copied timer on unmount
    - Keep the endpoint and response handling identical
    - Switch `ChatRefiner` and the `PlanShell` error paths to `parseApiError` and remove the regex on message text
    - Ask the user whether to add this defect and a matching 2.x clause to `bugfix.md`
    - _Bug_Condition: isBugCondition(X) group A emailDialogOpen and group C clientError_
    - _Expected_Behavior: loading state shown; errors read from the server envelope_
    - _Preservation: email request and response unchanged (3.2)_
    - _Requirements: 1.5, 1.12, 1.24, 2.5, 2.12, 2.24, 3.2_

  - [x] 3.7 Verify Stage 3
    - **Property 1: Expected Behavior** - Re-run the tests from 3.1. They must PASS.
    - **Property 3: Preservation** - Re-run the tests from 3.2. They must still PASS.
    - Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`
    - _Requirements: 2.8, 2.12, 3.2, 3.7, 3.10, 3.12_

- [x] 4. Stage 4: `usePlanStore` purity
  - Risk: Medium. Score area: Code Quality.

  - [x] 4.1 Write bug condition exploration test (run on UNFIXED code)
    - **Property 1: Bug Condition** - Side effects inside `setRecord` updaters, timer not cleared on unmount
    - **GOAL**: Expected to FAIL on current code
    - Render the hook under `React.StrictMode`. Run sequences of `update` and `toggle`. Assert at most one write per debounce window and that the final persisted record equals a pure reduction of the sequence.
    - Unmount with a pending save. Assert the latest edit is persisted and no timer is left.
    - Document the counterexamples
    - _Requirements: 1.6, 2.6_

  - [x] 4.2 Write preservation tests (run on UNFIXED code)
    - **Property 3: Preservation** - Persistence behavior
    - Observe: save after the 300 ms debounce, flush on `beforeunload` and tab hide, storage-degraded toast shown once
    - Property-based test: toggle and update sequences give the same stored state after the debounce
    - Tests must PASS on unfixed code
    - _Requirements: 3.6_

  - [x] 4.3 Refactor `hooks/usePlanStore.ts`
    - One `scheduleSave(next)` routine used by `update` and `toggle`, using `SAVE_DEBOUNCE_MS`
    - Pure updaters. Compute the next record from a ref that mirrors the latest record (or a reducer), and do the ref write and timer scheduling outside the updater.
    - On unmount, flush the pending save if the record still exists, then clear the timer. The delete flow cancels the pending timer.
    - Keep the `beforeunload` and visibility flush
    - _Bug_Condition: updater side effects and uncleared timer_
    - _Expected_Behavior: pure updaters; no lost edit on unmount_
    - _Preservation: persistence behavior from 4.2_
    - _Requirements: 1.5, 1.6, 2.5, 2.6, 3.6_

  - [x] 4.4 Verify Stage 4
    - **Property 1: Expected Behavior** - Re-run the tests from 4.1. They must PASS.
    - **Property 3: Preservation** - Re-run the tests from 4.2. They must still PASS.
    - Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`
    - _Requirements: 2.6, 3.6, 3.12_

- [x] 5. Stage 5: Component splits (PlanShell, IntakeForm, print view)
  - Risk: High. Do after stages 1 to 4. For each split, do a pure extraction first (move code, no edits), run tests, then do cleanups as a second step.

  - [x] 5.1 Write characterization tests before splitting (run on UNFIXED code)
    - **Property 3: Preservation** - PlanShell, IntakeForm and print view behavior
    - PlanShell: loading, not found, corrupt record (delete and regenerate), invalid share link, read-only shared view, demo replay with Retry and "Use sample plan", `?tab=` mirroring, streaming into four tabs
    - IntakeForm: submit with valid data creates a plan; per-event-type template defaults; chip selection for both chip fields
    - Print view: snapshot the rendered text and structure for sample plans, including page breaks
    - Reuse existing tests where they already cover a case
    - Tests must PASS on unfixed code
    - _Requirements: 3.1, 3.4, 3.5, 3.6, 3.8, 3.9_

  - [x] 5.2 Split `PlanShell`
    - Pure extraction into `usePlanLoader` (storage load, share-link decode, corrupt-record recovery), `usePlanStream` (generation, replay, demo), `PlanStateViews` (loading, not found, corrupt, invalid link) and `PlanTabs` (tab routing and content)
    - Then cleanups: derive valid tabs from `TAB_SECTIONS`, type tab data as a discriminated union keyed by tab id (remove `as never`), tighten `PlanContext` types (remove `planCtx.plan as Plan`), reduce `!` assertions, fix the status function with identical branches
    - For each of the two `set-state-in-effect` suppressions, restructure or keep with a one-line justification. Do not remove a suppression unless lint passes.
    - _Preservation: dashboard behavior from 5.1_
    - _Requirements: 1.2, 2.2, 3.1, 3.4, 3.5, 3.6, 3.8_

  - [x] 5.3 Split `IntakeForm`
    - Move per-event-type templates to `components/intake/templates.ts`
    - Extract a shared `ChipGroup` used by both chip fields
    - Replace `"" as unknown as number` with defaults typed `number | ""` and a transform at submit
    - Currency options come from `SUPPORTED_CURRENCIES`. Guest max uses `GUEST_MAX`.
    - _Requirements: 1.7, 2.7, 3.1_

  - [x] 5.4 Split the print view
    - Extract `PrintHeader`, `BudgetTable`, `TimelineSection`, `VendorList`, `IdeasList`
    - Replace the nested priority ternary with a lookup map. Use stable keys. Use `PRINT_DELAY_MS`.
    - Keep the `styled-jsx` print rules unless moving them to `globals.css` under `@media print` is provably equal. If moved, compare printed output.
    - Cheap extras from the design: stable keys in `BudgetChart` (`Cell`) and one shared tooltip formatter
    - _Requirements: 1.9, 2.9, 3.9_

  - [x] 5.5 Verify Stage 5
    - **Property 3: Preservation** - Re-run the tests from 5.1. They must still PASS, with printed output unchanged.
    - Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`
    - Run `pnpm test:e2e` and confirm the specs pass unchanged
    - _Requirements: 2.2, 2.7, 2.9, 3.1, 3.12_

- [x] 6. Stage 6: Repository hygiene and dependencies
  - Risk: Low. Score area: Code Quality.

  - [x] 6.1 Resolve `app/ui-test` — **NEEDS USER CONFIRMATION before deleting**
    - Grep unit tests and e2e specs for `/ui-test`
    - If referenced: gate the page with `notFound()` when `NODE_ENV === "production"`. If not referenced: propose deleting `app/ui-test/page.tsx` and wait for approval.
    - _Requirements: 1.10, 2.10_

  - [x] 6.2 Untrack `test-results/`
    - Run `git rm -r --cached test-results` (removes it from the index only, files stay on disk)
    - Add `test-results/` and `playwright-report/` (if present) to `.gitignore`
    - Confirm with the user before running the git command, as it changes the index
    - _Requirements: 1.10, 2.10_

  - [x] 6.3 Planning documents and root scratch files — **NEEDS USER CONFIRMATION before moving or deleting**
    - List candidates: `fixes/`, `dev-*.log`, `run.*`, `server.log*`, `stream-out.txt`, `lh-*`
    - Grep scripts, configs and specs for references to each
    - Propose: move `fixes/` to `docs/archive/`; delete or ignore the scratch files. Untracked or ignored files cannot be recovered from git, so show the list and wait for approval.
    - Do not touch anything an app file or test depends on
    - _Requirements: 1.10, 2.10_

  - [x] 6.4 Replace the `cn` npm package with a local utility
    - Vet the npm package `cn` (publisher, contents) first
    - Add `lib/utils.ts` with `cn` built on `clsx` and `tailwind-merge`. Add those two packages with exact pinned versions only if not already installed.
    - Update imports in `components/ui/*`, then remove the `cn` package
    - Unit test class-merging equivalence for the patterns used in `components/ui`
    - _Requirements: 1.11, 2.11_

  - [x] 6.5 Handle `next-themes` and the `shadcn` CLI
    - Remove the unused `useTheme` call in the sonner wrapper and pass a fixed theme. Remove `next-themes` if nothing else uses it. Visually check the Toaster.
    - Keep `shadcn` in `devDependencies` only if needed. Justify it in the README or remove it.
    - Adopt exact version pins for all dependencies and document the policy in the README. Show the `package.json` diff to the user before running an install.
    - _Requirements: 1.11, 2.11_

  - [x] 6.6 Verify Stage 6
    - Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`
    - Confirm `git status` shows only intended changes
    - _Requirements: 2.10, 2.11, 3.12_

- [x] 7. Stage 7: Security configuration
  - Risk: Low. Score area: Security.

  - [x] 7.1 Write bug condition exploration tests (run on UNFIXED code)
    - **Property 1: Bug Condition** - Production CSP allows `'unsafe-eval'`; oversized share payloads
    - **GOAL**: Expected to FAIL on current code
    - Build the production CSP header and assert `script-src` has no `'unsafe-eval'`
    - Decode a hash whose decompressed size exceeds the cap and assert it is rejected before parse with "Invalid shared plan link"
    - Document the counterexamples
    - _Bug_Condition: isBugCondition(X) group E (cspHeader) and group A (shareLink)_
    - _Requirements: 1.14, 1.15, 2.14, 2.15, 2.19_

  - [x] 7.2 Write preservation tests (run on UNFIXED code)
    - **Property 3: Preservation** - Other security headers and valid share links
    - Observe: HSTS, X-Frame-Options, nosniff, Referrer-Policy, COOP, CORP, Permissions-Policy values, and the 50 KB body limit
    - Observe: a maximum-size valid plan round-trips through share encode and decode
    - Tests must PASS on unfixed code
    - _Requirements: 3.8, 3.11_

  - [x] 7.3 Extract and fix the CSP builder
    - Re-read `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md` and the headers config docs first
    - Create `lib/security/csp.ts`. `script-src` is `'self' 'unsafe-inline' https://va.vercel-scripts.com`, plus `'unsafe-eval'` only when `NODE_ENV === "development"`. All other directives unchanged.
    - Use it from `next.config.ts` with a comment citing the nonce and PPR incompatibility
    - Add a README section explaining why `'unsafe-inline'` remains and that nonce/proxy is a future option
    - Unit tests for development and production
    - _Bug_Condition: isBugCondition(X) group E, production script-src contains 'unsafe-eval'_
    - _Preservation: other headers unchanged (3.11)_
    - _Requirements: 1.15, 2.15, 3.11_

  - [x] 7.4 Cap share-link size
    - Add `SHARE_HASH_MAX_CHARS` and `SHARE_DECOMPRESSED_MAX_BYTES` to the constants
    - Check encoded length first. Decompress with a bounded read and abort past the cap. Show the existing "Invalid shared plan link".
    - Tests: at the cap, just over the cap, corrupted data. The cap must exceed the largest valid plan fixture.
    - _Bug_Condition: isBugCondition(X) group A, shareLink over limit_
    - _Preservation: valid links open read-only (3.8)_
    - _Requirements: 1.14, 2.14, 2.19, 3.8_

  - [x] 7.5 Document accepted limitations
    - README "Known limitations": shared `"unknown"` bucket when no trusted IP header exists, and per-instance scope of the in-memory limiter
    - Confirm length caps exist on all free-text fields; add any that are missing, with tests
    - _Requirements: 1.16, 2.16_

  - [x] 7.6 Verify Stage 7
    - **Property 1: Expected Behavior** - Re-run the tests from 7.1. They must PASS.
    - **Property 3: Preservation** - Re-run the tests from 7.2. They must still PASS.
    - Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`
    - Serve the build with `next start` (the user runs this manually), check the CSP response header has no `'unsafe-eval'`, and check that pages and Recharts charts render
    - Run `pnpm test:e2e` against that server
    - _Requirements: 2.14, 2.15, 2.16, 3.11, 3.12_

- [x] 8. Stage 8: Testing and coverage
  - Risk: Low. Score area: Testing.

  - [x] 8.1 Add the missing component and hook tests
    - `ExportMenu` (open, select, close; keyboard contract is added in Stage 9)
    - `IdeasGrid`
    - `MoodBoard` (valid, invalid and empty responses)
    - `PlanHeader` (shows the typed name, legacy `name`, and the fallback)
    - `TabSkeletons`
    - `usePlanStore` (debounce, flush on unmount, `toggle`, Strict Mode), extending the Stage 4 tests where useful
    - _Requirements: 1.18, 2.18_

  - [x] 8.2 Add the remaining regression tests
    - Confirm each 2.19 item has a test from its stage: IPv6 keys (2.1), event name in print and export (1.1), oversized share payloads (7.1), invalid network responses (3.1)
    - Add an integration test for intake to dashboard to export with a typed name: header, share link, .ics and print view all show it
    - _Requirements: 1.19, 2.19_

  - [x] 8.3 Measure coverage, then update thresholds
    - Run the coverage run on the current code and record the measured values
    - Update the vitest coverage `include` to add `hooks/**` and testable `components/**`. Exclude only pure shell files (`app/layout.tsx`, `components/ui/**`) with a comment each.
    - Set each threshold a point or two under the measured value. Raise branches from 78 toward 85 only if measured values allow it. If a gate cannot be met honestly, set it at the measured floor and note the gap. Never lower an existing threshold.
    - _Requirements: 1.17, 2.17_

  - [x] 8.4 Verify Stage 8
    - Run `pnpm lint`, `pnpm typecheck`, `pnpm test` with coverage, `pnpm build`
    - Confirm the thresholds pass
    - _Requirements: 2.17, 2.18, 2.19, 3.12_

- [x] 9. Stage 9: Accessibility and route titles
  - Risk: Medium. Score area: Accessibility.

  - [x] 9.1 Write bug condition exploration tests (run on UNFIXED code)
    - **Property 1: Bug Condition** - Export menu keyboard contract, print table semantics, route titles
    - **GOAL**: Expected to FAIL on current code
    - ExportMenu: open with Enter, press ArrowDown, expect focus on the first item. Also Home/End, Escape returning focus to the trigger, and `aria-controls`.
    - Print view: expect `scope` on header cells, a caption or accessible name per table, and an accessible representation for checklist boxes (extend the axe tests)
    - Titles: expect each of landing, plan and print to have its own `document.title`
    - Document the counterexamples
    - _Bug_Condition: isBugCondition(X) group G_
    - _Requirements: 1.20, 1.21, 1.22, 2.20, 2.21, 2.22_

  - [x] 9.2 Write preservation tests (run on UNFIXED code)
    - **Property 3: Preservation** - Keyboard, focus, labels, reduced motion, demo chips
    - Observe: existing axe tests, visible focus, labels, reduced-motion handling and demo scenario chips
    - Grep e2e specs for `toHaveTitle` and note which assert on the root title
    - Tests must PASS on unfixed code
    - _Requirements: 3.13_

  - [x] 9.3 Fix `ExportMenu` keyboard behavior
    - Check first whether `components/ui` or the installed UI library provides an accessible menu primitive. If so, use it and remove the hand-rolled roles.
    - Otherwise implement `aria-haspopup`, `aria-expanded`, `aria-controls`, focus first item on open, Arrow Up/Down with wrap, Home/End, Escape and outside click close with focus returned to the trigger, Tab closes the menu
    - _Requirements: 1.20, 2.20, 3.9, 3.13_

  - [x] 9.4 Fix print view semantics
    - Add `scope="col"` or `scope="row"` to `<th>`, a `<caption>` (can be `sr-only`) per table, and an accessible checklist box (`role="checkbox"` with `aria-checked`, or visually hidden text)
    - Replace hard-coded white and black with CSS variables only if printed output is unchanged. Otherwise leave them and note it.
    - _Requirements: 1.21, 2.21, 3.9_

  - [x] 9.5 Add route titles
    - Re-read `generate-metadata.md` first
    - Root layout: `title.template` `%s | EventAI` and `default` set to the current title
    - Landing page: export `metadata`
    - Move the plan and print page bodies into `components/PlanPageClient.tsx` and `components/PrintPageClient.tsx`. Make both `page.tsx` files thin Server Components that export static `metadata`. Keep `React.use(params)` and the Suspense boundary inside the client component.
    - Update any e2e `toHaveTitle` assertion intentionally
    - Optional follow-up, only if it causes no hydration mismatch: render the event name in a React 19 `<title>` once the plan loads
    - _Requirements: 1.22, 2.22, 3.4_

  - [x] 9.6 Verify Stage 9
    - **Property 1: Expected Behavior** - Re-run the tests from 9.1. They must PASS.
    - **Property 3: Preservation** - Re-run the tests from 9.2. They must still PASS.
    - Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`
    - Do a manual keyboard-only pass through the Export menu. Full WCAG validation needs manual testing with assistive technologies and expert review, so note that it was not done.
    - _Requirements: 2.20, 2.21, 2.22, 3.12, 3.13_

- [x] 10. Final checkpoint
  - Run `pnpm lint`, `pnpm typecheck`, `pnpm test` with coverage, `pnpm build` and `pnpm test:e2e`
  - Confirm every requirement 2.1 to 2.23 has a task and every 3.1 to 3.13 has a preservation test
  - Confirm no existing test was weakened or deleted. List each edited existing assertion with its reason.
  - Confirm every deletion in Stage 6 was approved by the user
  - Ensure all tests pass, ask the user if questions arise.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2"] },
    { "id": 2, "tasks": ["3"] },
    { "id": 3, "tasks": ["4"] },
    { "id": 4, "tasks": ["5"] },
    { "id": 5, "tasks": ["6"] },
    { "id": 6, "tasks": ["7"] },
    { "id": 7, "tasks": ["8"] },
    { "id": 8, "tasks": ["9"] },
    { "id": 9, "tasks": ["10"] }
  ]
}
```

## Notes

- Stages run in order. Stages 6 and 7 only depend on stage 1, but are kept sequential so each stage is verified before the next starts.
- Stage 6 deletions and the git index change need user confirmation.
- No source code has been changed by this plan.
