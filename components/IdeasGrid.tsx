"use client";

/**
 * IdeasGrid (P2-T07, TDD §9.6)
 *
 * Responsive 1 / 2 / 3-column grid of Cards (title + description). Reserves a
 * slot below for MoodBoard (P4-T09, optional). Half-streamed ideas are skipped.
 */

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isCompleteIdea } from "@/lib/guards";
import { MoodBoard } from "@/components/MoodBoard";
import { useOptionalPlan } from "@/components/PlanContext";
import type { Plan } from "@/lib/schema";

type Idea = Plan["ideas"][number];

export function IdeasGrid({
  ideas,
}: {
  ideas: readonly (Partial<Idea> | null | undefined)[] | undefined;
}) {
  const complete = (ideas ?? []).filter(isCompleteIdea);
  const planCtx = useOptionalPlan();

  if (complete.length === 0) {
    return <p className="text-sm text-muted-foreground">No ideas yet.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {complete.map((idea, i) => (
          <Card key={`${idea.title}-${i}`}>
            <CardHeader>
              <CardTitle>{idea.title}</CardTitle>
              <CardDescription>{idea.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
      {/* MoodBoard (P4-T09) */}
      <MoodBoard input={planCtx?.input} />
    </div>
  );
}
