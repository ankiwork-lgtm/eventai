"use client";

/**
 * usePlanStore (P3-T03, TDD §7.3, §7.4, DD-12, DD-13)
 *
 * Single source of truth for a plan record on the plan dashboard.
 *  - Reads localStorage in useEffect only (never during SSR render).
 *  - Writes are debounced 300 ms; flushed immediately on beforeunload /
 *    visibilitychange:hidden so a quick hard-refresh never loses a tick.
 *  - update(patch) merges and bumps updatedAt.
 *  - toggle(kind, key) calls toggleProgress and schedules a save.
 *  - Updaters are pure: the next record is computed from a ref mirroring the
 *    latest record; the ref write and timer scheduling live in scheduleSave.
 *  - On unmount a pending save is flushed; the delete flow cancels it.
 *  - Storage-degraded fires a one-time sonner toast.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { localRepo } from "@/lib/storage";
import { toggleProgress } from "@/lib/progress";
import { SAVE_DEBOUNCE_MS } from "@/lib/constants";
import type { StoredPlan, ProgressState } from "@/lib/types";

export type PlanStoreStatus = "loading" | "ready" | "missing";

export type UsePlanStoreReturn = {
  status: PlanStoreStatus;
  record: StoredPlan | null;
  update: (patch: Partial<StoredPlan>) => void;
  toggle: (kind: keyof ProgressState, key: string) => void;
  /** Cancel any pending save and stop flushing (call before deleting). */
  cancelPendingSave: () => void;
};

export function usePlanStore(id: string): UsePlanStoreReturn {
  const [status, setStatus] = useState<PlanStoreStatus>("loading");
  const [record, setRecord] = useState<StoredPlan | null>(null);

  // Mirrors the latest record; the source for computing the next record
  const recordRef = useRef<StoredPlan | null>(null);

  // Debounce timer ref
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Whether we've registered the degraded listener
  const degradedRegistered = useRef(false);

  // ── Flush to storage ──────────────────────────────────────────────────────
  const flush = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    const current = recordRef.current;
    if (current) {
      void localRepo.save(current);
    }
  }, []);

  // ── Load once on mount ────────────────────────────────────────────────────
  useEffect(() => {
    localRepo.inspect(id).then((result) => {
      if (result.state === "ok") {
        recordRef.current = result.record;
        setRecord(result.record);
        setStatus("ready");
      } else {
        setStatus("missing");
      }
    });
  }, [id]);

  // ── Storage-degraded toast (once) ─────────────────────────────────────────
  useEffect(() => {
    if (degradedRegistered.current) return;
    degradedRegistered.current = true;
    const unsub = localRepo.onStorageDegraded(() => {
      toast.warning(
        "Storage unavailable — your plan is saved in memory only and may be lost on refresh.",
        { id: "storage-degraded" },
      );
    });
    return unsub;
  }, []);

  // ── beforeunload / visibilitychange flush ────────────────────────────────
  useEffect(() => {
    const handleBeforeUnload = () => flush();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [flush]);

  // ── scheduleSave: single debounce routine (outside any updater) ──────────
  const scheduleSave = useCallback((next: StoredPlan) => {
    recordRef.current = next;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      debounceTimer.current = null;
      void localRepo.save(next);
    }, SAVE_DEBOUNCE_MS);
  }, []);

  // ── Unmount: flush a pending save if the record still exists ─────────────
  useEffect(() => {
    return () => {
      if (!debounceTimer.current) return;
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
      const current = recordRef.current;
      if (current) void localRepo.save(current);
    };
  }, []);

  // ── update(patch) ─────────────────────────────────────────────────────────
  const update = useCallback(
    (patch: Partial<StoredPlan>) => {
      const prev = recordRef.current;
      if (!prev) return;
      const next: StoredPlan = {
        ...prev,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      setRecord(next);
      scheduleSave(next);
    },
    [scheduleSave],
  );

  // ── toggle(kind, key) ─────────────────────────────────────────────────────
  const toggle = useCallback(
    (kind: keyof ProgressState, key: string) => {
      const prev = recordRef.current;
      if (!prev) return;
      const next: StoredPlan = {
        ...prev,
        progress: toggleProgress(prev.progress, kind, key),
        updatedAt: new Date().toISOString(),
      };
      setRecord(next);
      scheduleSave(next);
    },
    [scheduleSave],
  );

  // ── cancelPendingSave: used by the delete flow ────────────────────────────
  const cancelPendingSave = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    // Drop the mirror so no later flush resurrects a deleted record
    recordRef.current = null;
  }, []);

  return { status, record, update, toggle, cancelPendingSave };
}
