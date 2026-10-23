# Event Planning Assistant: Implementation Task Index

| | |
|---|---|
| **Source specs** | [`PROJECT_SPEC.md`](../PROJECT_SPEC.md), [`TECHNICAL_DESIGN.md`](../TECHNICAL_DESIGN.md) (TDD) |
| **Approach** | Spec-driven: every task cites the spec/design section it implements and has verifiable "Done when" criteria |
| **Status legend** | `[ ]` todo · `[-]` in progress · `[x]` done |

## How to use these files

1. Work phases in order: 1 → 5. Inside a phase, work tasks in ID order unless the `Depends on` line says otherwise.
2. A task is done only when **every** "Done when" bullet is true and the global Definition of Done (below) holds.
3. Tick the checkbox in the task heading when finished. Do not delete tasks. Add new ones at the end of the phase with the next ID.
4. If the implementation must deviate from the TDD, record a new `DD-n` in TDD section 20 first, then implement.

## Task files

| File | Phase | Est. | Contents |
|---|---|---|---|
| [`phase-1-scaffold.md`](phase-1-scaffold.md) | 1. Scaffold | ~2 h | Project setup, schema, prompts, `/api/plan`, intake form v0, raw-JSON plan page |
| [`phase-2-dashboard.md`](phase-2-dashboard.md) | 2. Dashboard | ~4 h | PlanShell, tabs, budget chart, timeline, vendors, ideas, streaming tolerance, error states |
| [`phase-3-interactivity.md`](phase-3-interactivity.md) | 3. Interactivity | ~3 h | Persistent checklists, progress bar, `/api/refine`, ChatRefiner with Undo |
| [`phase-4-polish.md`](phase-4-polish.md) | 4. Polish & extras | ~3 h | Budget normaliser, real dates, ICS, print PDF, vendor emails, optional share/mood board |
| [`phase-5-demo-prep.md`](phase-5-demo-prep.md) | 5. Demo prep & deploy | ~2 h | Demo scenarios, fixtures + replay, rate limit, security headers, README, Vercel, smoke test |

## Critical path (never cut)

`schema` → `/api/plan` → streaming UI → persisted checkboxes → `/api/refine`.
Everything marked **[NTH]** (nice-to-have) or **[OPT]** (optional) can be dropped without breaking the demo story.

## Global Definition of Done (applies to every task)

- TypeScript strict, no `any` leaks, no `// @ts-ignore`.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass with zero warnings (TDD 16.4). Where a script does not yet exist, add it in P1-T01/P1-T12.
- Business logic lives in `lib/` as pure functions. Components and route handlers only orchestrate (TDD 3.3).
- All LLM-originated text is rendered as plain text. No `dangerouslySetInnerHTML` (TDD 15.2).
- No API key or server-only env var reaches the client bundle (TDD 15.1).
- Components tolerate `undefined` / partial data (TDD 8.2, R7).
- Mobile viewport 375 px has no horizontal scroll for any UI touched.

## Spec → Task coverage matrix

### Must-have (PROJECT_SPEC §8)

| Spec requirement | Tasks |
|---|---|
| MVP-1 Landing + intake form | P1-T08, P1-T09 |
| MVP-2 Dashboard with 4 tabs | P2-T01 – P2-T03, P2-T05 – P2-T08 |
| MVP-3 Budget chart + tips | P2-T04 |
| MVP-4 Interactive checklists + progress, persisted | P3-T01 – P3-T05 |
| MVP-5 Refine chat | P3-T06 – P3-T08 |
| MVP-6 Streaming generation | P1-T07, P1-T10, P2-T03, P2-T09 |

### Nice-to-have (PROJECT_SPEC §8)

| Spec item | Tasks |
|---|---|
| Event-type templates | P1-T04, P1-T08 |
| Budget guardrails | P4-T01 |
| Countdown timeline (real dates) | P4-T02, P4-T03 |
| Share link | P4-T08 [OPT] |
| PDF / ICS export | P4-T04, P4-T05, P4-T06 |
| Vendor email drafts | P4-T07 |
| Local currency/culture awareness | P1-T04, P1-T08 |
| Mood board | P4-T09 [OPT] |
| Pre-seeded demo scenarios | P5-T01, P5-T02 |

### Acceptance criteria (PROJECT_SPEC §13)

| Criterion | Verified by |
|---|---|
| Plan within ~30 s | P5-T10 |
| Plan rendered as UI, not raw text | P2-T08, P5-T10 |
| Budget sums to 100 / total | P4-T01, P4-T10 |
| Checklist progress persists across refresh | P3-T03, P3-T09, P5-T10 |
| Refine chat modifies plan | P3-T07, P3-T09, P5-T10 |
| Mobile viewport works | P5-T07, P5-T10 |
| Deployed on Vercel, public URL | P5-T09 |
| Demo scenarios work with one click | P5-T01, P5-T02, P5-T10 |

## Design Decision cross-reference

| DD | Where implemented |
|---|---|
| DD-1 useObject + streamObject | P1-T10, P2-T01 |
| DD-2 print-CSS PDF | P4-T06 |
| DD-3 async PlanRepository | P1-T09 |
| DD-4 crypto.randomUUID | P1-T09 |
| DD-5 negative daysBefore | P1-T03, P4-T02 |
| DD-6 schema bounds fallback | P1-T03, P1-T05 |
| DD-7 content-hash keys | P3-T01, P3-T02 |
| DD-8 mid-stream errors | P2-T09 |
| DD-9 client-side normalisation | P2-T01, P4-T01 |
| DD-10 non-streaming refine | P3-T06 |
| DD-11 `/plan/[id]` route | P1-T10 |
| DD-12 no global store | P2-T01, P3-T03 |
| DD-13 client-only plan pages | P1-T10, P3-T03 |
| DD-14 server-computed prompt context | P1-T04 |
| DD-15 local date parsing | P4-T02 |
| DD-16 one-step Undo | P3-T08 |
| DD-17 tiered rate limiting | P5-T04 |
