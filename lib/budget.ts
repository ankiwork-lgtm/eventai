/**
 * lib/budget.ts (P4-T01, TDD §8.4, DD-9, R2)
 *
 * normalizePlan: Budget guardrails ensuring integer costs sum exactly to totalBudget
 * and percents sum exactly to 100.0 using the largest-remainder method.
 */

import type { Plan } from "@/lib/schema";

/** Result of {@link normalizePlan}: the corrected plan plus any human-readable adjustment warnings. */
export type BudgetNormalisationResult = {
  /** The plan with its budget costs and percents normalised. */
  plan: Plan;
  /** Messages describing dropped lines or large adjustments; empty when nothing notable changed. */
  warnings: string[];
};

/**
 * Normalise a plan's budget breakdown so costs add up exactly to `totalBudget`
 * and percentages add up to 100.0.
 *
 * Algorithm:
 * 1. Drop budget lines with non-finite or negative values.
 * 2. If sumCost == 0, derive from percents. Otherwise costs are the source of truth
 *    when within ±25% of totalBudget, else percents are the source.
 * 3. Weights w_i = source_i / Σ source (equal weights if Σ source == 0).
 * 4. cost_i = floor(w_i × totalBudget); distribute remainder whole units to largest fractional parts.
 * 5. percent_i = round(w_i × 100, 1); adjust the largest item so Σ percent = 100.0.
 * 6. Emit a warning if any value moved by > 2 points or if items were dropped.
 *
 * @param plan - The plan whose `budget` should be normalised. Not mutated.
 * @param totalBudget - The exact amount the final costs must sum to.
 * @returns The normalised plan and any warnings. A plan with no usable budget is
 *   returned unchanged with a "Budget missing" warning.
 */
export function normalizePlan(
  plan: Plan,
  totalBudget: number,
): BudgetNormalisationResult {
  const warnings: string[] = [];

  if (!plan || !Array.isArray(plan.budget) || plan.budget.length === 0) {
    return {
      plan: plan ?? { summary: "", budget: [], timeline: [], vendors: [], ideas: [] },
      warnings: ["Budget missing, regenerate"],
    };
  }

  // 1. Drop budget lines with non-finite or negative values
  const validBudget = plan.budget.filter((item) => {
    if (!item) return false;
    const validCost =
      typeof item.estimatedCost === "number" &&
      Number.isFinite(item.estimatedCost) &&
      item.estimatedCost >= 0;
    const validPercent =
      typeof item.percent === "number" &&
      Number.isFinite(item.percent) &&
      item.percent >= 0;
    return validCost && validPercent;
  });

  if (validBudget.length === 0) {
    return {
      plan: { ...plan, budget: [] },
      warnings: ["Budget missing, regenerate"],
    };
  }

  const droppedLines = validBudget.length < plan.budget.length;

  // 2. Determine source of truth
  const sumCost = validBudget.reduce((acc, item) => acc + item.estimatedCost, 0);
  const isCostWithin25Percent =
    totalBudget > 0 &&
    sumCost >= 0.75 * totalBudget &&
    sumCost <= 1.25 * totalBudget;

  const useCostAsSource = sumCost > 0 && isCostWithin25Percent;

  const rawSources = validBudget.map((item) =>
    useCostAsSource ? item.estimatedCost : item.percent,
  );
  const sumSource = rawSources.reduce((acc, val) => acc + val, 0);

  // 3. Compute weights
  const weights: number[] =
    sumSource === 0
      ? validBudget.map(() => 1 / validBudget.length)
      : rawSources.map((s) => s / sumSource);

  // 4. Largest-remainder distribution for integer costs
  const targetTotal = Math.max(0, Math.round(totalBudget));
  const rawCosts = weights.map((w) => w * targetTotal);
  const flooredCosts = rawCosts.map((c) => Math.floor(c));
  const currentCostSum = flooredCosts.reduce((a, b) => a + b, 0);
  let remainder = targetTotal - currentCostSum;

  const fractions = rawCosts.map((rc, i) => ({
    index: i,
    fraction: rc - flooredCosts[i],
  }));

  // Sort descending by fractional remainder (stable by original index)
  fractions.sort((a, b) => {
    if (b.fraction !== a.fraction) return b.fraction - a.fraction;
    return a.index - b.index;
  });

  for (let i = 0; i < fractions.length && remainder > 0; i++) {
    flooredCosts[fractions[i].index] += 1;
    remainder -= 1;
  }

  // 5. Percentages rounded to 1 decimal place, adjust largest item so Σ = 100.0
  const rawPercents = weights.map((w) => Math.round(w * 100 * 10) / 10);
  const currentPercentSum = Math.round(
    rawPercents.reduce((a, b) => a + b, 0) * 10,
  ) / 10;
  const percentDiff = Math.round((100.0 - currentPercentSum) * 10) / 10;

  if (percentDiff !== 0 && validBudget.length > 0) {
    // Find index of item with maximum weight
    let maxIdx = 0;
    let maxWeight = weights[0];
    for (let i = 1; i < weights.length; i++) {
      if (weights[i] > maxWeight) {
        maxWeight = weights[i];
        maxIdx = i;
      }
    }
    rawPercents[maxIdx] = Math.round((rawPercents[maxIdx] + percentDiff) * 10) / 10;
  }

  // 6. Check for warnings (> 2 percentage points shift or dropped lines)
  let movedSignificantly = droppedLines;
  for (let i = 0; i < validBudget.length; i++) {
    if (Math.abs(rawPercents[i] - validBudget[i].percent) > 2) {
      movedSignificantly = true;
      break;
    }
  }

  if (movedSignificantly) {
    warnings.push("We adjusted the figures to match your budget");
  }

  const normalizedBudget = validBudget.map((item, i) => ({
    ...item,
    estimatedCost: flooredCosts[i],
    percent: rawPercents[i],
  }));

  return {
    plan: {
      ...plan,
      budget: normalizedBudget,
    },
    warnings,
  };
}
