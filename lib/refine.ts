/**
 * lib/refine.ts (P3-T07, TDD §9.7)
 *
 * Pure functions for applying a refinement result to a stored plan record.
 * No side effects; easy to unit-test.
 */

import { pruneProgress } from "@/lib/progress";
import { normalizePlan } from "@/lib/budget";
import type { RefineResult } from "@/lib/schema";
import type { StoredPlan, ChatMessage } from "@/lib/types";

/**
 * Apply a refinement result to the current record (pure, immutable).
 *
 * Steps:
 * 1. Save current state as lastSnapshot for one-step Undo (P3-T08).
 * 2. If newTotalBudget is present, update input.totalBudget.
 * 3. normalizePlan ensures exact budget sums.
 * 4. pruneProgress to remove orphan checklist keys.
 * 5. Return the new record with the assistant bubble appended to chat.
 */
export function applyRefinement(
  record: StoredPlan,
  result: RefineResult,
  assistantMessage: ChatMessage,
): StoredPlan {
  const newBudget = result.newTotalBudget ?? record.input.totalBudget;

  const updatedInput = result.newTotalBudget
    ? { ...record.input, totalBudget: newBudget }
    : record.input;

  const { plan: normalizedPlan } = normalizePlan(result.plan, newBudget);

  const prunedProgress = pruneProgress(normalizedPlan, record.progress);

  return {
    ...record,
    // Save snapshot before overwriting (P3-T08, DD-16)
    lastSnapshot: {
      plan: record.plan,
      input: record.input,
      progress: record.progress,
    },
    input: updatedInput,
    plan: normalizedPlan,
    progress: prunedProgress,
    chat: [...record.chat, assistantMessage],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Restore the lastSnapshot to undo the most recent refinement (P3-T08).
 * Appends a "Reverted" bubble and clears lastSnapshot so Undo can only be
 * used once per refinement.
 */
export function applyUndo(record: StoredPlan, revertedMessage: ChatMessage): StoredPlan {
  const snap = record.lastSnapshot;
  if (!snap) return record; // nothing to undo

  return {
    ...record,
    plan: snap.plan,
    input: snap.input,
    progress: snap.progress,
    lastSnapshot: undefined,
    chat: [...record.chat, revertedMessage],
    updatedAt: new Date().toISOString(),
  };
}
