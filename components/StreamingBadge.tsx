"use client";

/**
 * StreamingBadge (P2-T03, TDD §8.2)
 *
 * A small "Generating…" pill shown on a tab trigger while that section's key is
 * still arriving and the stream is live. Section-reveal order follows the model's
 * key order: summary → budget → timeline → vendors → ideas (TDD §8.2).
 *
 * Respects prefers-reduced-motion: the spin animation is disabled when the user
 * has requested reduced motion (TDD §7.5).
 */

import { Loader2Icon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StreamingBadge({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Generating"
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary",
        className,
      )}
    >
      {/* animate-spin is disabled by the motion-safe: variant so it respects
          prefers-reduced-motion without any JS overhead */}
      <Loader2Icon className="size-2.5 motion-safe:animate-spin" aria-hidden />
      Generating…
    </span>
  );
}
