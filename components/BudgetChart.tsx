"use client";

/**
 * BudgetChart (P2-T04, PROJECT_SPEC §8 MVP-3, TDD §9.3, §7.5)
 *
 * Recharts donut PieChart with a pie ↔ horizontal-bar toggle, a fixed colour
 * palette keyed by index, a centre total label, and an accordion category list
 * that doubles as the legend / text alternative. Half-streamed items are skipped
 * via isCompleteBudgetItem so a partial object never renders NaN.
 */

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartBarIcon, ChartPieIcon, XIcon } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { isCompleteBudgetItem } from "@/lib/guards";
import { formatMoney } from "@/lib/format";
import type { Plan } from "@/lib/schema";

type BudgetItem = Plan["budget"][number];

/** Fixed palette keyed by index; ≥12 entries to match the schema max (12). */
const PALETTE = [
  "#6366f1", // indigo
  "#ec4899", // pink
  "#f59e0b", // amber
  "#10b981", // emerald
  "#3b82f6", // blue
  "#ef4444", // red
  "#8b5cf6", // violet
  "#14b8a6", // teal
  "#f97316", // orange
  "#84cc16", // lime
  "#06b6d4", // cyan
  "#a855f7", // purple
] as const;

const colorAt = (i: number) => PALETTE[i % PALETTE.length];

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(callback: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

/**
 * Reads prefers-reduced-motion without setState-in-effect, via
 * useSyncExternalStore. Server snapshot is `false` (animation disabled during
 * streaming is handled separately), avoiding any hydration mismatch.
 */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () =>
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia(REDUCED_MOTION_QUERY).matches
        : false,
    () => false,
  );
}

export function BudgetChart({
  items,
  currency,
  total,
  isStreaming,
  warnings,
}: {
  items: readonly (Partial<BudgetItem> | null | undefined)[] | undefined;
  currency: string;
  total: number;
  isStreaming: boolean;
  /** Normalisation banner placeholder (filled in P4-T01). */
  warnings?: string[];
}) {
  const [mode, setMode] = useState<"pie" | "bar">("pie");
  const [dismissed, setDismissed] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  // Only render fully-streamed items so a partial object never produces NaN.
  const complete = useMemo(
    () => (items ?? []).filter(isCompleteBudgetItem),
    [items],
  );

  const data = useMemo(
    () =>
      complete.map((item, i) => ({
        name: item.category,
        value: item.estimatedCost,
        percent: item.percent,
        tips: item.tips,
        fill: colorAt(i),
      })),
    [complete],
  );

  const animate = !isStreaming && !reducedMotion;

  if (complete.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No budget breakdown yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {!dismissed && warnings && warnings.length > 0 && (
        <div
          role="status"
          className="flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400"
        >
          <span>{warnings.join(" ")}</span>
          <button
            type="button"
            aria-label="Dismiss banner"
            onClick={() => setDismissed(true)}
            className="ml-2 rounded p-1 hover:bg-amber-500/20"
          >
            <XIcon className="size-4" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-end">
        <div className="inline-flex rounded-lg border p-0.5">
          <Button
            variant={mode === "pie" ? "secondary" : "ghost"}
            size="default"
            aria-pressed={mode === "pie"}
            onClick={() => setMode("pie")}
          >
            <ChartPieIcon aria-hidden />
            Pie
          </Button>
          <Button
            variant={mode === "bar" ? "secondary" : "ghost"}
            size="default"
            aria-pressed={mode === "bar"}
            onClick={() => setMode("bar")}
          >
            <ChartBarIcon aria-hidden />
            Bar
          </Button>
        </div>
      </div>

      <div
        className="relative h-72 w-full overflow-hidden"
        role="img"
        aria-label={`Budget chart: ${data.map((d) => `${d.name} ${d.percent}%`).join(", ")}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          {mode === "pie" ? (
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius="60%"
                outerRadius="90%"
                paddingAngle={1}
                isAnimationActive={animate}
                stroke="var(--background)"
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, _name, item) => {
                  const payload = (item?.payload ?? {}) as {
                    percent?: number;
                    name?: string;
                  };
                  const cost = typeof value === "number" ? value : Number(value) || 0;
                  const p = payload.percent;
                  return [
                    `${formatMoney(cost, currency)}${
                      typeof p === "number" ? ` · ${p}%` : ""
                    }`,
                    payload.name ?? "",
                  ];
                }}
              />
            </PieChart>
          ) : (
            <BarChart
              data={data}
              layout="vertical"
              margin={{ left: 4, right: 12, top: 8, bottom: 8 }}
            >
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={90}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                formatter={(value, _name, item) => {
                  const payload = (item?.payload ?? {}) as { percent?: number };
                  const cost = typeof value === "number" ? value : Number(value) || 0;
                  const p = payload.percent;
                  return [
                    `${formatMoney(cost, currency)}${
                      typeof p === "number" ? ` · ${p}%` : ""
                    }`,
                    "Cost",
                  ];
                }}
              />
              <Bar dataKey="value" isAnimationActive={animate} radius={4}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>

        {/* Centre total label — only meaningful for the donut */}
        {mode === "pie" && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xs text-muted-foreground">Total</span>
            <span className="text-lg font-semibold">
              {formatMoney(total, currency)}
            </span>
          </div>
        )}
      </div>

      {/* Category list = legend + text alternative; expandable to show tips */}
      <Accordion className="border-t">
        {complete.map((item, i) => (
          <AccordionItem key={`${item.category}-${i}`} value={`${item.category}-${i}`}>
            <AccordionTrigger>
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: colorAt(i) }}
                />
                <span>{item.category}</span>
                <span className="text-muted-foreground">
                  · {item.percent}% · {formatMoney(item.estimatedCost, currency)}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <p className="pl-5 text-muted-foreground">{item.tips}</p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
