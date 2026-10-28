# EventAI — Gap Fix Plan

> Derived from the self-evaluation (54/60). Tasks ordered by impact on score.  
> Each task states the exact file(s) touched, the change, and the done-when criterion.

---

## P0 — Fix now (breaks test run, low effort)

### G0-T01 · Fix Vitest worker timeout on `logging.test.ts` and `landing.test.tsx`

**Why:** The test runner exits code 1 due to worker startup timeouts on two files, obscuring the otherwise-green suite and costing Testing score points.

**Root cause:** `jsdom` is created 26× (one per file), driving 189s of environment overhead. Two large files exceed the per-worker startup window.

**Files to change:**
- [`vitest.config.ts`](file:///c:/Users/AnkitGarg/OneDrive%20-%20IBM/Desktop/H2S/eventai/vitest.config.ts)

**Steps:**
1. Add `pool: 'vmThreads'` to the `test` block — this reuses the jsdom environment across files in the same worker instead of tearing it down and recreating it.
2. Raise `testTimeout` from `15000` to `30000` for the two heavy files as a safety net.
3. Optionally add `poolOptions: { vmThreads: { singleThread: false } }` to keep parallelism.

```ts
// vitest.config.ts — test block change
test: {
  environment: "jsdom",
  pool: "vmThreads",           // ← add this
  include: ["tests/**/*.test.{ts,tsx}"],
  setupFiles: ["./tests/setup.ts"],
  testTimeout: 30000,          // ← raise from 15000
  ...
}
```

**Done when:** `pnpm test` exits code 0 with all 35 test files passing and no worker timeout errors.

---

### G0-T02 · Remove / replace empty `utils.ts`

**Why:** `lib/utils.ts` re-exports `cn` from the `cn` package (24 bytes). Components that import it get a misleading "utility" module that does nothing beyond a pass-through. Dead code.

**Files to change:**
- [`lib/utils.ts`](file:///c:/Users/AnkitGarg/OneDrive%20-%20IBM/Desktop/H2S/eventai/lib/utils.ts)

**Steps:**
1. Check which components import `@/lib/utils`.
2. Replace every `import { cn } from "@/lib/utils"` with `import { cn } from "cn"` directly.
3. Delete `lib/utils.ts`.

**Done when:** `pnpm typecheck && pnpm build` pass with no references to `lib/utils`.

---

## P1 — Fix before demo (high testing score impact)

### G1-T01 · Add Playwright E2E test suite

**Why:** The streaming UX, tab switching, share-link, and refine flow are not covered at the browser level. Missing entirely from tests.

**Files to create:**
- `playwright.config.ts`
- `e2e/form-to-plan.spec.ts` — core happy path
- `e2e/refine-flow.spec.ts` — chat refinement
- `e2e/demo-mode.spec.ts` — `?demo=1` cached replay

**Steps:**

1. Install Playwright:
   ```bash
   pnpm add -D @playwright/test
   npx playwright install chromium
   ```

2. Create `playwright.config.ts`:
   ```ts
   import { defineConfig, devices } from '@playwright/test';
   export default defineConfig({
     testDir: './e2e',
     webServer: {
       command: 'pnpm dev',
       url: 'http://localhost:3000',
       reuseExistingServer: !process.env.CI,
     },
     projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
     use: { baseURL: 'http://localhost:3000' },
   });
   ```

3. Add `e2e/demo-mode.spec.ts` (fastest — no API key needed, uses `?demo=1`):
   ```ts
   test('Mumbai wedding cached plan streams and shows budget tab', async ({ page }) => {
     // Click "Generate instantly" on the Mumbai wedding card
     await page.goto('/');
     await page.getByTestId('demo-wedding-mumbai-instant').click();
     // Wait for streaming badge to disappear
     await expect(page.getByRole('status', { name: 'Generating' })).toBeHidden({ timeout: 20000 });
     // Budget tab visible with chart
     await expect(page.getByRole('img', { name: /budget/i })).toBeVisible();
   });
   ```

4. Add `e2e/form-to-plan.spec.ts` (requires `ANTHROPIC_API_KEY` in `.env.local`, skip on CI if not set):
   ```ts
   test.skip(!process.env.ANTHROPIC_API_KEY, 'needs API key');
   test('fills intake form, submits, and sees a streamed plan', async ({ page }) => { ... });
   ```

5. Add `pnpm e2e` script to `package.json`: `"e2e": "playwright test"`.

**Done when:**
- `pnpm e2e` passes the three demo-mode tests without an API key.
- The live-API test is correctly skipped when `ANTHROPIC_API_KEY` is absent.

---

### G1-T02 · Client-side refine history trim

**Why:** The server trims history to the last 6 messages before the LLM call, but the client sends up to 20, adding unnecessary payload weight.

**Files to change:**
- [`components/ChatRefiner.tsx`](file:///c:/Users/AnkitGarg/OneDrive%20-%20IBM/Desktop/H2S/eventai/components/ChatRefiner.tsx)

**Steps:**
1. Find the `fetch('/api/refine', ...)` call in `ChatRefiner.tsx`.
2. Before setting `history` in the request body, trim it to the last 6 messages:
   ```ts
   const HISTORY_SEND_LIMIT = 6;
   // in the fetch call:
   history: record.chat.slice(-HISTORY_SEND_LIMIT),
   ```
3. Update `tests/refine.test.ts` or `tests/api-refine.test.ts` to assert the trimmed length.

**Done when:** Network payload for `/api/refine` never contains more than 6 history entries.

---

## P2 — Improve before submission (accessibility score)

### G2-T01 · Add programmatic colour contrast checks

**Why:** axe-core's built-in contrast rules don't catch all WCAG AA violations (e.g. text on semi-transparent backgrounds). The evaluation flagged this as a gap.

**Files to change:**
- [`tests/a11y-axe.test.tsx`](file:///c:/Users/AnkitGarg/OneDrive%20-%20IBM/Desktop/H2S\eventai\tests\a11y-axe.test.tsx) — extend existing axe tests
- [`tests/setup.ts`](file:///c:/Users/AnkitGarg/OneDrive%20-%20IBM/Desktop/H2S/eventai/tests/setup.ts)

**Steps:**
1. Enable the `color-contrast` axe rule explicitly (it is on by default but verify it is not disabled in `setup.ts`).
2. Add a targeted axe run on the `IntakeForm` rendered in light mode and verify `violations` is empty.
3. Add the same check for dark mode by toggling `prefers-color-scheme: dark` via `window.matchMedia` mock.

```ts
// tests/a11y-axe.test.tsx — add
it('IntakeForm has no colour contrast violations', async () => {
  render(<IntakeForm onSubmit={() => {}} />);
  const results = await axe(document.body, { rules: { 'color-contrast': { enabled: true } } });
  expect(results.violations.filter(v => v.id === 'color-contrast')).toHaveLength(0);
});
```

**Done when:** The new axe test passes and no contrast violations are reported for the landing/form.

---

### G2-T02 · Add keyboard focus management test for dialogs

**Why:** The evaluation noted dialog open/close focus management is not explicitly tested. shadcn/ui handles it but it is not verified.

**Files to change:**
- [`tests/accessibility.test.tsx`](file:///c:/Users/AnkitGarg/OneDrive%20-%20IBM/Desktop/H2S/eventai/tests/accessibility.test.tsx)

**Steps:**
1. Add a test that renders `EmailDialog` open, verifies the first focusable element inside the dialog receives focus.
2. After closing the dialog (pressing Escape or clicking close), verify focus returns to the trigger button.

```ts
describe('EmailDialog focus management', () => {
  it('traps focus inside the dialog when open', async () => {
    const trigger = screen.getByRole('button', { name: /draft email/i });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toContainElement(document.activeElement);
  });

  it('returns focus to the trigger on close', async () => {
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(trigger);
  });
});
```

**Done when:** Both focus-management tests pass in the existing Vitest suite.

---

## P3 — Optional / post-hackathon

### G3-T01 · Refactor `PlanShell.tsx` into custom hooks

**Why:** `PlanShell.tsx` is 600 lines. Splitting state logic into `useStreamingPlan` and `useReplayPlan` hooks would bring it under 300 lines, improve testability, and make the state machine easier to read.

**Files to create/change:**
- `hooks/useStreamingPlan.ts` — owns `useObject`, `submit`, `stop`, `onFinish`/`onError` handlers
- `hooks/useReplayPlan.ts` — owns `replayPlan`, `cancelReplay`, `replaySource`, `isReplaying`, `replayObject`
- [`components/PlanShell.tsx`](file:///c:/Users/AnkitGarg/OneDrive%20-%20IBM/Desktop/H2S/eventai/components/PlanShell.tsx) — imports the two hooks, no internal stream/replay state

**Done when:** `PlanShell.tsx` is under 350 lines and both hooks are independently unit-testable.

---

### G3-T02 · Rate-limiter Redis upgrade (post-hackathon production hardening)

**Why:** The in-memory limiter is per-serverless-instance — on a multi-instance Vercel deployment each instance has its own independent bucket. Best-effort only.

**Note:** This requires a paid Upstash or Vercel KV account. Scope for post-hackathon.

**Files to change:**
- `lib/ratelimit.ts` — replace `Map<string, Bucket>` with Upstash Redis `ZADD`/`ZCOUNT` sliding-window commands

**Steps:**
1. `pnpm add @upstash/ratelimit @upstash/redis`
2. Create `lib/ratelimit.ts` variant using `Ratelimit.slidingWindow(5, '10 m')` from `@upstash/ratelimit`.
3. Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to `.env.example`.
4. Keep the current in-memory implementation behind an env flag for local dev (no Redis needed).
5. Update existing `ratelimit.test.ts` — the fake-clock tests still apply to the in-memory path.

**Done when:** On Vercel, 5 requests from the same IP across different instances all count toward a shared bucket; the 6th returns 429.

---

## Effort & Priority Summary

| ID | Task | Effort | Score Impact | Priority |
|---|---|---|---|---|
| G0-T01 | Fix Vitest worker timeout | 30 min | Testing +0.5 | **Do now** |
| G0-T02 | Remove empty utils.ts | 10 min | Code Quality +0.3 | **Do now** |
| G1-T01 | Add Playwright E2E tests | 2–3 h | Testing +0.5 | Before demo |
| G1-T02 | Client-side refine trim | 20 min | Efficiency +0.3 | Before demo |
| G2-T01 | Colour contrast axe check | 30 min | Accessibility +0.3 | Before submission |
| G2-T02 | Dialog focus management test | 30 min | Accessibility +0.2 | Before submission |
| G3-T01 | Refactor PlanShell hooks | 2 h | Code Quality +0.5 | Post-hackathon |
| G3-T02 | Redis rate limiter | 3 h | Security +0.5 | Post-hackathon |

**Quick wins first (G0-T01 + G0-T02 + G1-T02): ~1 hour total, fixes the test runner exit code and two score deductions.**
