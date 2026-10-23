# Event Planning Assistant: Project Spec

> Hand this file to your coding assistant (Claude Code, Cursor, Copilot, etc.) and say:
> **"Read PROJECT_SPEC.md and build the project step by step, following the build order. Start with Phase 1."**

---

## 1. Problem Statement

Create a GenAI-powered planning assistant that helps users organize **weddings, birthdays, and community events** with **budgets, timelines, vendor checklists, and personalized ideas**.

## 2. Goals and Constraints

- Hackathon project: **simple, fast to build, demo-friendly**
- Must deploy on **Vercel** with zero extra infrastructure (no separate backend)
- Personalization is the differentiator: plans adapt to culture, location, budget, and guest count
- Prefer working features over perfect architecture. Skip auth at first.

## 3. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | Frontend + API routes in one repo |
| UI | Tailwind CSS + shadcn/ui | Fast, polished look |
| AI | Vercel AI SDK (`ai`) + `@ai-sdk/anthropic` | Streaming + structured output |
| LLM | Claude Sonnet (model name via env var `LLM_MODEL`) | Any provider works with the AI SDK |
| Validation | Zod | Schema shared between LLM output and UI |
| Charts | Recharts | Budget pie/bar chart |
| Storage | **Phase 1: localStorage**; **Phase 2: Vercel Postgres (Neon) or Supabase** | Upgrade only if time allows |
| Export | jsPDF or print-to-PDF CSS; `ics` npm package for calendar | Demo wow-factor |
| Hosting | Vercel | Env var: `ANTHROPIC_API_KEY` |

## 4. Core Architecture

```
User fills event intake form
        ↓
POST /api/plan  →  LLM (structured JSON via Zod schema, streamed)
        ↓
Plan = { summary, budget, timeline, vendors, ideas }
        ↓
Saved (localStorage → DB)  →  Rendered as editable dashboard
        ↓
Chat refiner ("make it cheaper", "add a DJ") → POST /api/refine → updated Plan
```

### Key design decision
**Do NOT have the LLM return free text.** Return JSON matching a Zod schema (`generateObject` / `streamObject`). This lets the UI render real components (charts, checklists, timelines).

## 5. Data Schemas

### Intake form input

```ts
// lib/schema.ts
import { z } from "zod";

export const EventInputSchema = z.object({
  eventType: z.enum(["wedding", "birthday", "community"]),
  eventName: z.string().optional(),
  date: z.string(),                 // ISO date
  guestCount: z.number().int().positive(),
  totalBudget: z.number().positive(),
  currency: z.string().default("INR"),
  city: z.string(),
  theme: z.string().optional(),
  culturalTraditions: z.string().optional(),   // e.g. "Maharashtrian wedding, 2-day ceremony"
  preferences: z.string().optional(),          // free text: vegetarian, outdoor, kid-friendly...
});
export type EventInput = z.infer<typeof EventInputSchema>;
```

### Generated plan

```ts
export const PlanSchema = z.object({
  summary: z.string(),
  budget: z.array(z.object({
    category: z.string(),          // Venue, Catering, Decor...
    percent: z.number(),
    estimatedCost: z.number(),
    tips: z.string(),
  })),
  timeline: z.array(z.object({
    when: z.string(),              // "6 months before"
    monthsBefore: z.number().optional(),   // used to compute real dates
    daysBefore: z.number().optional(),
    task: z.string(),
    priority: z.enum(["high", "medium", "low"]),
  })),
  vendors: z.array(z.object({
    type: z.string(),
    checklist: z.array(z.string()),        // questions to ask / things to verify
    budgetRange: z.string(),
  })),
  ideas: z.array(z.object({
    title: z.string(),
    description: z.string(),
  })),
});
export type Plan = z.infer<typeof PlanSchema>;
```

## 6. API Routes

### `POST /api/plan`: generate plan

```ts
// app/api/plan/route.ts
import { streamObject } from "ai";           // or generateObject for non-streaming
import { anthropic } from "@ai-sdk/anthropic";
import { PlanSchema } from "@/lib/schema";
import { systemPromptFor } from "@/lib/prompts";

export const maxDuration = 60;

export async function POST(req: Request) {
  const input = await req.json();
  const result = streamObject({
    model: anthropic(process.env.LLM_MODEL ?? "claude-sonnet-4-5"),
    schema: PlanSchema,
    system: systemPromptFor(input.eventType),
    prompt: `Create a detailed plan for this event: ${JSON.stringify(input)}`,
  });
  return result.toTextStreamResponse();
}
```

> Note: AI SDK APIs change between major versions. Check the installed version's docs for the exact `streamObject` / `useObject` usage.

### `POST /api/refine`: chat-based edits
- Input: `{ plan, message, eventInput }`
- Behavior: send current plan JSON + user request to the LLM; return a full updated plan matching `PlanSchema`
- Examples: "make it cheaper", "add a DJ", "we want a vegetarian-only menu", "shift the date by 2 weeks"

### `POST /api/email`: vendor email drafts
- Input: `{ vendorType, eventInput, plan }`
- Output: `{ subject, body }`, a polite inquiry email for that vendor type

## 7. Prompt Strategy (`lib/prompts.ts`)

Base system prompt: *"You are an expert event planner. Tailor plans to the culture, location, currency, guest count, and budget provided. Be specific and realistic about local costs."*

Event-type add-ons:

- **Wedding**: ceremonies and rituals per tradition, multi-day events, venue + catering heavy budget, photographer, mehendi/sangeet-type functions if relevant, guest accommodation
- **Birthday**: age-appropriate themes, activities, cake, entertainment, return gifts, kid-friendly vs adult
- **Community event**: permits and permissions, volunteers, sponsorship, safety and crowd management, accessibility, publicity, low-budget focus

Rules to include in prompts:
- Budget `percent` values must sum to 100
- `estimatedCost` values must sum to the total budget
- Use the user's currency and local vendor norms
- Timeline should start from the earliest sensible lead time through the day after the event

## 8. Features

### Must have (MVP)
1. **Landing page + intake form** (event type, date, guests, budget, city, theme, traditions, preferences)
2. **Plan dashboard** with four tabs: **Budget, Timeline, Vendors, Ideas**
3. **Budget chart** (Recharts pie or bar) with category tips
4. **Interactive checklists** (timeline tasks + vendor checklist) with checkboxes and an overall progress bar; state persisted
5. **Refine chat**: user types a change, the plan updates
6. **Streaming generation** so the plan builds on screen live

### Nice to have (differentiators)
- Event-type templates (separate prompts and form fields per type)
- **Budget guardrails**: validate percentages/costs sum correctly; auto-retry or normalize if not
- **Countdown timeline** converting "6 months before" into real calendar dates from the event date
- **Share link** `/plan/[id]` (needs DB)
- **Export** to PDF and to calendar `.ics` for timeline tasks
- **Vendor email drafts** (one click per vendor type)
- **Local currency and culture awareness** (INR, region-specific ceremonies, local vendor norms)
- **Mood board** via Unsplash API (free tier)
- **Pre-seeded demo scenarios** (buttons that auto-fill the form)

## 9. Suggested File Structure

```
/app
  page.tsx                  # landing + intake form
  plan/[id]/page.tsx        # dashboard (or /plan for localStorage version)
  api/plan/route.ts         # generate plan
  api/refine/route.ts       # chat-based edits
  api/email/route.ts        # vendor email drafts
/components
  IntakeForm.tsx
  BudgetChart.tsx
  Timeline.tsx
  VendorChecklist.tsx
  IdeasGrid.tsx
  ChatRefiner.tsx
  ProgressBar.tsx
/lib
  schema.ts                 # Zod schemas
  prompts.ts                # system prompts per event type
  storage.ts                # localStorage helpers (swap for db.ts later)
  dates.ts                  # compute real dates from timeline
  db.ts                     # optional: Postgres client
```

## 10. Build Order (for the coding assistant)

**Phase 1: Scaffold (≈ 2 hrs)**
- `npx create-next-app@latest` (TypeScript, Tailwind, App Router)
- Install: `ai @ai-sdk/anthropic zod recharts` and init shadcn/ui
- Build intake form + `/api/plan` returning a plan; log the JSON

**Phase 2: Dashboard (≈ 4 hrs)**
- Render four tabs from the plan JSON
- Budget chart, timeline list, vendor checklists, ideas grid
- Stream the plan into the UI as it generates

**Phase 3: Interactivity (≈ 3 hrs)**
- Checkbox state + progress bar, persisted in localStorage
- `/api/refine` + chat refiner component

**Phase 4: Polish and extras (≈ 3 hrs)**
- Budget validation, real dates on timeline, PDF/ICS export
- Vendor email drafts, share link via DB if time allows

**Phase 5: Demo prep**
- Pre-seeded scenarios, cached fallback plan, responsive check, README

## 11. Deployment (Vercel)

1. Push the repo to GitHub
2. Import it at vercel.com
3. Add env vars: `ANTHROPIC_API_KEY`, optionally `LLM_MODEL`
4. (Optional) Add Vercel Postgres / Neon from the Storage tab; env vars are auto-injected
5. Deploy

**Vercel notes**
- Add `export const maxDuration = 60;` to LLM routes (Hobby plan limits apply; streaming helps avoid timeouts)
- Never expose the API key to the client; only call the LLM from API routes
- Add basic rate limiting or a daily cap if the URL will be public

## 12. Hackathon Demo Tips

- Pre-seed demo scenarios, e.g. **"₹10L wedding in Mumbai, 200 guests, Maharashtrian traditions"**, a **kid's 7th birthday with a superhero theme**, and a **neighborhood Diwali community event with a ₹50K budget**
- Keep a **cached good plan** as a fallback if the API or network fails during judging
- Pitch the **personalization** (culture, budget, guests, location), not "a checklist generator"
- Show the **refine chat** live: "cut the budget by 20%" and watch the chart update
- Show **streaming** so the demo feels fast

## 13. Acceptance Criteria

- [ ] User can submit the intake form and see a full plan within ~30 seconds
- [ ] Plan includes budget, timeline, vendors, and ideas, rendered as UI (not raw text)
- [ ] Budget percentages sum to 100 and costs match the total (or are auto-normalized)
- [ ] Checklist progress persists across page refresh
- [ ] Refine chat modifies the plan correctly
- [ ] Works on mobile viewport
- [ ] Deployed on Vercel with a public URL
- [ ] Demo scenarios work with one click
