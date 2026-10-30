# Bugfix Requirements Document

## Introduction

EventAI scored 96.41/100 in an AI evaluation: Code Quality 88, Security 99, Efficiency 100, Testing 98, Accessibility 99, Problem Statement Alignment 99. This document records the gaps that lowered that score. It is the result of reading the code, not of guessing. `pnpm lint` exits 0, so none of the gaps are lint failures. Most come from structure, duplication, inconsistent contracts and leftover files. Two are functional defects (an ignored event name and an IPv6 rate-limit bypass).

Gaps are ordered by expected score impact. Code Quality (1.1 to 1.12) comes first. Security (1.13 to 1.16), Testing (1.17 to 1.19), Accessibility (1.20 to 1.22) and Problem Statement Alignment (1.23) follow. 1.24 is a Code Quality defect found during implementation (EmailDialog) and is appended at the end to keep earlier numbering stable. Every defect has a matching expected behavior with the same sub-number. No source code is changed by this spec phase. Existing features and the existing vitest suite must keep working.

Next.js note: AGENTS.md warns of breaking changes. `node_modules/next/dist/docs` confirms that `export const maxDuration` is still a valid route segment config option. It also confirms that Route Handlers are not cached by default and that only GET can opt in. The design phase must re-read the relevant docs before touching any Next API, including `cacheComponents` behavior and metadata for client pages.

## Bug Analysis

### Current Behavior (Defect)

Code Quality

1.1 WHEN a user enters an event name in the intake form THEN the system stores it as `eventName`, but the print view title, the .ics filename and calendar entries, and the Timeline calendar export read the separate legacy `name` field. The user's name is ignored and falls back to "WEDDING PLAN" or the event type. The input schema declares both `eventName` and `name`, and prompt building reads either one.

1.2 WHEN the plan dashboard container is maintained THEN the system has one 599-line `PlanShell` component. It mixes storage loading, share-link decoding, corrupt-record recovery, streaming, replay, tab routing and four render branches. It also uses `as never` casts on tab data, many `!` non-null assertions, a status computation with two identical branches, and a hand-written list of valid tabs that duplicates `TAB_SECTIONS`. It carries two `eslint-disable` suppressions for `set-state-in-effect`.

1.3 WHEN the API routes plan, refine and email are read THEN the system repeats the same rate-limit gate, body-parse try/catch, `logLlmCall` calls and provider-vs-internal error mapping in each route. The moodboard route handles its own 429 differently, returning a bare `[]` instead of the shared error envelope.

1.4 WHEN the AI layer and its callers are read THEN the system accepts a `temperature` option that is silently ignored, yet routes pass 0.7 and 0.5. It also keeps three `MAX_OUTPUT_TOKENS_*` aliases that only tests use, defaults the `generateStructured` token budget to the plan budget, and hard-codes `error: undefined` in the `streamPlan` finish payload.

1.5 WHEN tunable values are read in the code THEN the system embeds unnamed or duplicated constants. The refine history limit of 6 appears in the route and separately in `ChatRefiner`. The 300 ms save debounce is written twice in `usePlanStore`. Other examples are the image count of 6, the query length of 100, the cache TTL of 86400, the guest maximum of 10000 (schema and form), the 500 ms print delay, the 2000 ms copied-state timer, and `maxDuration` and `maxRetries` repeated per file.

1.6 WHEN `usePlanStore` updates a record THEN the system duplicates the debounced-save logic in `update` and `toggle`. It also runs side effects (writing a ref and scheduling a timer) inside `setRecord` updater functions, which React may run twice, and it does not clear its pending timer on unmount.

1.7 WHEN the intake form is maintained THEN the system has a 495-line `IntakeForm` with per-event-type template data inline, the same chip block copied for two fields, `"" as unknown as number` defaults, and a currency list hard-coded in the JSX. The currency list is separate from the schema, which accepts any 3-character string.

1.8 WHEN JSON from the network is consumed THEN the system casts it without validation. `ChatRefiner` casts `res.json()` to `RefineResult`, `MoodBoard` casts its response to `MoodBoardImage[]`, and the moodboard route reads the untyped Unsplash payload. `MoodBoard` also keeps a `loading` state that is never set to true, and it uses array indexes as keys.

1.9 WHEN the print view is maintained THEN the system has a 315-line single-component page with a nested ternary for priority styling, repeated metric blocks, a page-local `styled-jsx` global style, and index keys.

1.10 WHEN the repository is inspected THEN the system includes leftovers: the publicly routable `app/ui-test` demo page, the tracked `test-results/.last-run.json`, planning documents under `fixes/`, and root-level log and scratch files (`dev-*.log`, `run.*`, `server.log*`, `stream-out.txt`, `lh-*`). Several of these are git-ignored, but `test-results/` is not.

1.11 WHEN dependencies are reviewed THEN the system imports `cn` from the unusual npm package named `cn` in the UI components instead of a local utility. It uses `next-themes` (through the sonner wrapper) with no theme provider in the layout. It lists the `shadcn` CLI as a dev dependency. Versions mix exact pins and caret ranges.

1.12 WHEN errors surface in the client THEN the system handles them inconsistently. `PlanShell` extracts the 429 and retry seconds by regex on error message text. `ChatRefiner` shows `Server error <status>` and a generic message, ignoring the server's error envelope. API routes return 500 for body-read exceptions and the moodboard route returns 200 with an empty array for upstream failures.

Security

1.13 WHEN a client IP contains `::` (common compressed IPv6 such as `::1` or `2001:db8::1`) THEN the system builds the limiter key as `ip::route` and recovers the route with `split("::")[1]`. That returns a fragment of the address, finds no route config, and deletes the bucket straight after it is saved, so the client is never rate limited. This is a rate-limit bypass for IPv6 clients.

1.14 WHEN a share link hash is opened THEN the system decompresses and parses it with no cap on encoded or decompressed size before schema validation. A very large hash can consume client memory and CPU.

1.15 WHEN the Content-Security-Policy is built THEN the system allows `'unsafe-eval'` and `'unsafe-inline'` in `script-src` for all environments, weakening XSS protection in production.

1.16 WHEN request data reaches the LLM prompt THEN the system accepts any 3-character `currency` string, and requests with no trusted IP header share one `"unknown"` rate-limit bucket. Neither case is documented as an accepted risk.

Testing

1.17 WHEN coverage is measured THEN the system includes only `lib/**` and `app/api/**`. All of `components/`, `hooks/` and `app/**/page.tsx` are excluded from thresholds, and the branch threshold is only 78%.

1.18 WHEN component tests are listed THEN the system has no direct tests for `ExportMenu`, `IdeasGrid`, `MoodBoard`, `PlanHeader` or `TabSkeletons`, and `usePlanStore` is only exercised indirectly.

1.19 WHEN the known defects above exist THEN the system has no regression tests for the IPv6 rate-limit key, for `eventName` reaching print and export output, for oversized share payloads, or for non-validated network responses.

Accessibility

1.20 WHEN the Export menu is used with a keyboard THEN the system declares `role="menu"` and `role="menuitem"` but provides no arrow-key navigation, no initial focus move into the menu, no focus return to the trigger on Escape or close, and no `aria-controls`.

1.21 WHEN the print view is read by assistive technology THEN the system renders data tables with no `scope` on header cells and no caption. The vendor checklist boxes are empty decorative spans, and the view uses hard-coded white and black colors.

1.22 WHEN a user moves between landing, plan and print routes THEN the system shows the same static document title from the root layout. Client pages cannot set their own titles, so the page purpose is not announced (WCAG 2.4.2). Photo credits in the mood board are 10px text.

Problem Statement Alignment

1.23 WHEN a user shares, exports or prints a plan THEN the system uses the event type as a fallback name instead of the name the user typed (see 1.1). The feature "personalised plan, calendar and print" therefore does not reflect the user's own input.

Code Quality (found during implementation)

1.24 WHEN a user opens the email dialog and the draft request is pending THEN the system shows no loading indicator, and WHEN the request fails THEN it ignores the server error envelope message and shows "Failed to generate email (<status>)" instead. The fetch logic is also duplicated between the effect and the Retry handler.

### Expected Behavior (Correct)

2.1 WHEN a user enters an event name THEN the system SHALL use one canonical name field everywhere (print title, export filenames, calendar, prompts, header). The name entered in the form SHALL appear in all of them. Previously stored records that use the legacy `name` field SHALL still load and display their name.

2.2 WHEN the plan dashboard container is maintained THEN the system SHALL split `PlanShell` into focused units (loading and recovery states, streaming and replay logic, tab content) with typed tab data. It SHALL not use `as never` casts, SHALL minimize non-null assertions, SHALL derive valid tabs from `TAB_SECTIONS`, SHALL use a status function with no redundant branches, and SHALL justify or remove each lint suppression.

2.3 WHEN the API routes are maintained THEN the system SHALL provide shared helpers for the rate-limit gate, body parsing, LLM call logging and error mapping. Plan, refine and email SHALL use them, and the moodboard route SHALL return rate-limit responses in the same style as the other routes where its public contract allows.

2.4 WHEN the AI layer is maintained THEN the system SHALL remove or properly document the ignored `temperature` option and stop passing it from callers. It SHALL remove unused token aliases, require each caller to choose its token budget, and report the real stream error state or drop the misleading field.

2.5 WHEN tunable values are used THEN the system SHALL define each once as a named, documented constant. Client and server SHALL share the refine history limit, and the debounce, image, query, cache, guest-limit, delay and timeout values SHALL each have a single definition.

2.6 WHEN `usePlanStore` updates a record THEN the system SHALL use one shared debounced-save routine, SHALL keep updater functions pure, and SHALL clear or flush its pending timer on unmount without losing the latest edit.

2.7 WHEN the intake form is maintained THEN the system SHALL move template data to a separate module, render the chip groups with one shared component, avoid `as unknown as` defaults, and derive the currency options from one shared list that the schema also validates.

2.8 WHEN network JSON is consumed THEN the system SHALL validate it against a schema before use (refine result, mood board images, Unsplash payload), SHALL remove the dead `loading` state, and SHALL use stable keys.

2.9 WHEN the print view is maintained THEN the system SHALL split it into small presentational components with a lookup map for priority styling and stable keys, with identical printed output.

2.10 WHEN the repository is inspected THEN the system SHALL remove or exclude the `app/ui-test` route, untrack `test-results/` and add it to `.gitignore`, and move or archive the planning documents and root scratch files. No file the app or tests depend on SHALL be removed.

2.11 WHEN dependencies are reviewed THEN the system SHALL replace the unusual `cn` package import with a local utility built on `clsx` and `tailwind-merge` or equivalent (after vetting the package), SHALL either add a theme provider or remove the unused `next-themes` hook, SHALL move or justify the CLI package, and SHALL use a consistent version-pinning policy.

2.12 WHEN errors surface in the client THEN the system SHALL read the server error envelope (`error.code`, `error.message`, `Retry-After`) through one shared client helper instead of regex on message text, and SHALL use consistent status codes for body-read failures and upstream failures.

2.13 WHEN a client IP contains `::` THEN the system SHALL still apply the rate limit, with bucket keys that cannot be confused with the route (for example a nested map or an unambiguous separator).

2.14 WHEN a share link hash is opened THEN the system SHALL reject encoded or decompressed payloads over a documented size limit before parsing, and show the existing "Invalid shared plan link" message.

2.15 WHEN the Content-Security-Policy is built THEN the system SHALL allow `'unsafe-eval'` only in development and SHALL remove `'unsafe-inline'` from `script-src` in production if Next.js supports a nonce-based alternative in this version (confirmed from the bundled docs), or document why it remains.

2.16 WHEN request data reaches the prompt THEN the system SHALL restrict `currency` to the supported list, SHALL document the shared "unknown" bucket behavior as an accepted limitation in the README, and SHALL keep length caps on all free-text fields.

2.17 WHEN coverage is measured THEN the system SHALL include `hooks/**` and the testable `components/**` in coverage, with thresholds set just under the measured values and branches raised from 78% toward 85%.

2.18 WHEN component tests are listed THEN the system SHALL have tests for `ExportMenu`, `IdeasGrid`, `MoodBoard`, `PlanHeader`, `TabSkeletons` and `usePlanStore`.

2.19 WHEN the defects above are fixed THEN the system SHALL have a regression test for each of them: IPv6 limiter keys, event name in print and export output, oversized share payloads, and invalid network responses.

2.20 WHEN the Export menu is used with a keyboard THEN the system SHALL follow the ARIA menu pattern (focus into the menu, arrow keys, Home/End, Escape returns focus to the trigger, `aria-controls`), or use an existing accessible menu primitive from the UI library already in the project.

2.21 WHEN the print view is read by assistive technology THEN the system SHALL give table headers `scope`, give tables a caption or accessible name, give checklist boxes an accessible representation, and keep printed output unchanged.

2.22 WHEN a user moves between routes THEN the system SHALL give each route a meaningful document title (landing, plan, print), and SHALL render photo credits at a readable size without losing the layout.

2.23 WHEN a user shares, exports or prints a plan THEN the system SHALL name the output after the user's event name, falling back to the event type only when no name was entered, and SHALL sanitize the name when used in filenames.

2.24 WHEN the email dialog requests a draft THEN the system SHALL show a loading indicator while the request is pending, SHALL show the server error envelope message (via the shared client error helper, see 2.12) when the request fails, and SHALL use a single request routine for the initial load and Retry.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user submits a valid intake form THEN the system SHALL CONTINUE TO create a stored plan and stream a four-section plan (budget, timeline, vendors, ideas) into the dashboard tabs.

3.2 WHEN plan generation, refinement and email drafting succeed THEN the system SHALL CONTINUE TO return the same response shapes and status codes from `/api/plan`, `/api/refine` and `/api/email`, with the existing error envelope for 400, 413, 429, 500 and 502.

3.3 WHEN a client stays within its per-route limits THEN the system SHALL CONTINUE TO allow requests, and WHEN a client exceeds them THEN the system SHALL CONTINUE TO return 429 with a `Retry-After` header and the existing limits (plan 5, refine 20, email 20, moodboard 30 per 10 minutes).

3.4 WHEN a stored plan exists, is corrupt, or is missing THEN the system SHALL CONTINUE TO load it, offer delete or regenerate-from-input, or show "Plan not found", as it does today. Plans saved before this work SHALL CONTINUE TO load.

3.5 WHEN demo mode (`?demo=1` or `NEXT_PUBLIC_DEMO_FALLBACK`) is used THEN the system SHALL CONTINUE TO replay cached fixtures section by section without an API call, including Retry and "Use sample plan".

3.6 WHEN the user toggles timeline or vendor items, switches tabs, or refreshes THEN the system SHALL CONTINUE TO persist progress after the 300 ms debounce, flush on `beforeunload` and tab hide, mirror the active tab in `?tab=`, and show the storage-degraded toast once.

3.7 WHEN a user refines a plan in chat THEN the system SHALL CONTINUE TO apply the change with one-step Undo, send at most the last 6 messages, enforce the 500-character limit, and keep read-only shared views free of refine and email actions.

3.8 WHEN a valid share link is opened THEN the system SHALL CONTINUE TO show the plan in read-only mode, and WHEN the link is invalid THEN the system SHALL CONTINUE TO show "Invalid shared plan link".

3.9 WHEN a user exports THEN the system SHALL CONTINUE TO produce a valid .ics calendar, the printable view with the same sections and page breaks, and a copyable share link.

3.10 WHEN the mood board has no `UNSPLASH_ACCESS_KEY` or the upstream call fails THEN the system SHALL CONTINUE TO hide the section silently, and only valid https image and credit links SHALL CONTINUE TO be shown.

3.11 WHEN the existing security headers (HSTS, X-Frame-Options, nosniff, Referrer-Policy, COOP, CORP, Permissions-Policy) and the 50 KB body limit are applied THEN the system SHALL CONTINUE TO apply them unchanged.

3.12 WHEN `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` are run THEN the system SHALL CONTINUE TO pass, with the existing vitest tests (including axe accessibility tests and the e2e specs) passing without being weakened or deleted.

3.13 WHEN a user relies on keyboard navigation, visible focus, screen-reader labels, reduced-motion handling and the demo scenario chips THEN the system SHALL CONTINUE TO provide them.
