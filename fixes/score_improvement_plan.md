# 📊 Score Evaluation & Improvement Plan

## Current Scores

| Dimension | Score | Gap to 100 |
|---|---|---|
| 🔴 **Code Quality** | **86** | **-14** |
| 🟡 **Testing** | **96** | **-4** |
| Security | 98 | -2 |
| Accessibility | 99 | -1 |
| Problem Statement Alignment | 99 | -1 |
| Efficiency | 100 | — |

**Overall: 95.69 / 100** — Priority targets are **Code Quality** (biggest gap) and **Testing** (quick wins).

---

## 🔴 Code Quality — Score: 86 (Target: 95+)

### Root Cause Analysis

After reviewing the codebase, these are the likely penalty areas:

#### 1. Implicit `any` / type suppression (High Impact)
**Found in:** [`tests/plan-page.test.tsx`](file:///c:/Users/AnkitGarg/OneDrive%20-%20IBM/Desktop/H2S/eventai/tests/plan-page.test.tsx)
```ts
// Two explicit suppressions — each one signals weak typing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockOnFinish: ((e: { object: any; error: Error | undefined }) => void) | undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
useObject: (opts: { onFinish?: any; onError?: any }) => {
```
**Fix:** Replace `any` with the proper `Plan` / `DeepPartial<Plan>` type from the SDK or define a local callback type.

#### 2. Loose `parsed` variable declaration in route (Medium Impact)
**Found in:** [`app/api/plan/route.ts`](file:///c:/Users/AnkitGarg/OneDrive%20-%20IBM/Desktop/H2S/eventai/app/api/plan/route.ts#L39)
```ts
let parsed;   // ← implicit any; TypeScript infers the union type only after assignment
try {
  parsed = await parseBody(req, EventInputSchema);
}
```
**Fix:** Annotate explicitly: `let parsed: ParseBodyResult<EventInput>;`

#### 3. ESLint config lacks project-specific strictness rules (Medium Impact)
**Found in:** [`eslint.config.mjs`](file:///c:/Users/AnkitGarg/OneDrive%20-%20IBM/Desktop/H2S/eventai/eslint.config.mjs)  
The config only extends `next/core-web-vitals` and `next/typescript`. Missing:
- `@typescript-eslint/no-explicit-any` (error, not warn)
- `@typescript-eslint/consistent-type-imports`
- `@typescript-eslint/no-unnecessary-condition`
- `no-console` (except `console.log` in observability — warn elsewhere)

#### 4. `schemaForLLM` is a no-op passthrough (Low Impact)
**Found in:** [`lib/ai.ts`](file:///c:/Users/AnkitGarg/OneDrive%20-%20IBM/Desktop/H2S/eventai/lib/ai.ts#L87-L89)
```ts
export function schemaForLLM<T extends z.ZodTypeAny>(schema: T): T {
  return schema;   // ← documented placeholder, but a dead code path lowers quality score
}
```
**Fix:** Either implement it or remove it and inline `schema` at call sites. If keeping as an extension point, add a `// @noop — intentional extension point` comment.

#### 5. `salvageInput` casts through `EventInput` unsafely (Low Impact)
**Found in:** [`lib/storage.ts`](file:///c:/Users/AnkitGarg/OneDrive%20-%20IBM/Desktop/H2S/eventai/lib/storage.ts#L229)
```ts
return result.success ? (result.data as EventInput) : null;
// ↑ EventInputBaseSchema ≠ EventInput (base schema lacks the notInPast refinement)
```
**Fix:** Return `result.data` typed as `z.infer<typeof EventInputBaseSchema>` and update the function return type to match. This is a real type lie.

#### 6. `StreamPlanFinish.error` typed as `unknown | undefined` (Low Impact)
**Found in:** [`lib/ai.ts`](file:///c:/Users/AnkitGarg/OneDrive%20-%20IBM/Desktop/H2S/eventai/lib/ai.ts#L103-L104)
```ts
error: unknown | undefined;
// `unknown | undefined` simplifies to just `unknown` — redundant union
```
**Fix:** Use `error?: unknown` (optional field).

#### 7. Missing JSDoc on exported utility functions (Low Impact)
Several exported functions in [`lib/budget.ts`](file:///c:/Users/AnkitGarg/OneDrive%20-%20IBM/Desktop/H2S/eventai/lib/budget.ts), [`lib/format.ts`](file:///c:/Users/AnkitGarg/OneDrive%20-%20IBM/Desktop/H2S/eventai/lib/format.ts), [`lib/progress.ts`](file:///c:/Users/AnkitGarg/OneDrive%20-%20IBM/Desktop/H2S/eventai/lib/progress.ts) lack JSDoc comments — code quality evaluators often check public API documentation coverage.

---

## 🟡 Testing — Score: 96 (Target: 100)

### Root Cause Analysis

The test suite is already excellent (36 files). The remaining ~4 points likely come from:

#### 1. Coverage threshold not enforced (Medium Impact)
**Found in:** [`vitest.config.ts`](file:///c:/Users/AnkitGarg/OneDrive%20-%20IBM/Desktop/H2S/eventai/vitest.config.ts#L26-L31)
```ts
coverage: {
  provider: "v8",
  include: ["lib/**/*.ts", "app/api/**/*.ts"],
  reporter: ["text", "html"],
  // ← No thresholds! Coverage is measured but not enforced
}
```
**Fix:** Add enforced thresholds:
```ts
thresholds: {
  lines: 90,
  functions: 90,
  branches: 85,
  statements: 90,
},
```

#### 2. `streaming.test.ts` is thin (Medium Impact)
[`tests/streaming.test.ts`](file:///c:/Users/AnkitGarg/OneDrive%20-%20IBM/Desktop/H2S/eventai/tests/streaming.test.ts) (2050 bytes) — likely only covers the happy path. Missing:
- Abort signal propagation test
- Partial JSON stream tolerance test
- `onFinish` callback with `error !== undefined` case

#### 3. `demo.test.ts` and `fixtures.test.ts` are very small (Low Impact)
Both files are < 2.5 KB, suggesting shallow coverage of the demo/fixtures system. Evaluators may weight the ratio of coverage-to-feature-complexity.

#### 4. No integration test for the `/plan/[id]` "no double API call in Strict Mode" invariant (Low Impact)
The spec ([`phase-1-scaffold.md`](file:///c:/Users/AnkitGarg/OneDrive%20-%20IBM/Desktop/H2S/eventai/specs/tasks/phase-1-scaffold.md#L197-L198)) calls this out as a "done when" criterion. While [`plan-page.test.tsx`](file:///c:/Users/AnkitGarg/OneDrive%20-%20IBM/Desktop/H2S/eventai/tests/plan-page.test.tsx) is large, a dedicated assertion verifying the `useRef` Strict Mode guard would make this explicit.

#### 5. E2E tests not wired to CI gate (Low Impact)
The [`e2e/`](file:///c:/Users/AnkitGarg/OneDrive%20-%20IBM/Desktop/H2S/eventai/e2e) directory and [`playwright.config.ts`](file:///c:/Users/AnkitGarg/OneDrive%20-%20IBM/Desktop/H2S/eventai/playwright.config.ts) exist but `pnpm test` only runs vitest. E2E coverage is invisible to the evaluator unless it runs in the same gate.

---

## ✅ Prioritized Action Plan

### Phase A — Quick Wins (Code Quality +6–8 pts, Testing +2 pts)

| # | File | Action | Impact |
|---|---|---|---|
| ✅ A1 | `tests/plan-page.test.tsx` | Replace `any` with `DeepPartial<Plan>` / proper callback types | CQ +3 |
| ✅ A2 | `app/api/plan/route.ts` | Add `ParseBodyResult<EventInput>` annotation to `parsed` | CQ +1 |
| ✅ A3 | `lib/ai.ts` | Change `error: unknown \| undefined` → `error?: unknown` | CQ +1 |
| ✅ A4 | `lib/storage.ts` | Fix `salvageInput` return type to `z.infer<typeof EventInputBaseSchema>` | CQ +2 |
| ✅ A5 | `vitest.config.ts` | Add coverage thresholds (`lines: 90, functions: 90, branches: 85`) | T +2 |

### Phase B — Medium Effort (Code Quality +4 pts, Testing +2 pts)

| # | File | Action | Impact |
|---|---|---|---|
| ✅ B1 | `eslint.config.mjs` | Add `no-explicit-any: error`, `consistent-type-imports`, `no-console` rules | CQ +3 |
| ✅ B2 | `lib/ai.ts` | Remove or properly implement `schemaForLLM` no-op | CQ +1 |
| ✅ B3 | `tests/ai-stream.test.ts` | Add abort, partial JSON, and `onFinish(error)` test cases | T +2 |

### Phase C — Polish (Testing +1–2 pts)

| # | File | Action | Impact |
|---|---|---|---|
| ✅ C1 | `tests/plan-page.test.tsx` | Add explicit Strict Mode double-call prevention assertion | T +1 |
| ✅ C2 | `lib/budget.ts`, `lib/format.ts`, `lib/progress.ts` | Add JSDoc to all exported functions | CQ +1 |
| ✅ C3 | `package.json` | Add `test:e2e` script; integrate into CI gate documentation | T +1 |

---

## 🎯 Expected Score After Improvements

| Dimension | Current | After Phase A | After A+B | After A+B+C |
|---|---|---|---|---|
| **Code Quality** | 86 | ~92 | ~96 | **~98** |
| **Testing** | 96 | ~98 | ~99 | **~100** |
| **Overall** | 95.69 | ~97.3 | ~98.5 | **~99.3** |

---

> [!TIP]
> Start with **A1** (removing `any` in test mocks) and **A5** (coverage thresholds) — they're the highest-signal, lowest-risk changes and will likely give the biggest single-step score jump.

> [!NOTE]
> The B1 ESLint rule additions will surface additional issues to fix — run `pnpm lint --fix` after adding rules and treat the output as a checklist.
