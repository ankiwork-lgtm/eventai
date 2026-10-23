"use client";

/**
 * usePlanStore (P3-T03, TDD §7.3, §7.4, DD-12, DD-13)
 *
 * Single source of truth for a plan record on the plan dashboard.
 *  - Reads localStorage in useEffect only (never during SSR render).
 *  - Writes are debounced 300 ms; flushed immediately on beforeunload /
 *    visibilitychange:hidden so a quick hard-refresh never loses a tick.
 *  - update(patch) deep-merges and bumps updatedAt.
 *  - toggle(kind, key) calls toggleProgress and schedules a flush.
 *  - Storage-degraded fires a one-time sonner toast.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { localRepo } from "@/lib/storage";
import { toggleProgress } from "@/lib/progress";
import type { StoredPlan, ProgressState } from "@/lib/types";

export type PlanStoreStatus = "loading" | "ready" | "missing";

export type UsePlanStoreReturn = {
  status: PlanStoreStatus;
  record: StoredPlan | null;
  update: (patch: Partial<StoredPlan>) => void;
  toggle: (kind: keyof ProgressState, key: string) => void;
};

export function usePlanStore(id: string): UsePlanStoreReturn {
  const [status, setStatus] = useState<PlanStoreStatus>("loading");
  const [record, setRecord] = useState<StoredPlan | null>(null);

  // Keep a ref to the latest record for flush callbacks (avoids stale closure)
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

  // Sync recordRef after each render so flush callbacks always see the latest record
  useEffect(() => {
    recordRef.current = record;
  });

  // ── Load once on mount ────────────────────────────────────────────────────
  useEffect(() => {
    localRepo.inspect(id).then((result) => {
      if (result.state === "ok") {
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

  // ── update(patch) ─────────────────────────────────────────────────────────
  const update = useCallback((patch: Partial<StoredPlan>) => {
    setRecord((prev) => {
      if (!prev) return prev;
      const next: StoredPlan = {
        ...prev,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      recordRef.current = next;
      // Debounced write
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        void localRepo.save(next);
        debounceTimer.current = null;
      }, 300);
      return next;
    });
  }, []);

  // ── toggle(kind, key) ─────────────────────────────────────────────────────
  const toggle = useCallback(
    (kind: keyof ProgressState, key: string) => {
      setRecord((prev) => {
        if (!prev) return prev;
        const next: StoredPlan = {
          ...prev,
          progress: toggleProgress(prev.progress, kind, key),
          updatedAt: new Date().toISOString(),
        };
        recordRef.current = next;
        // Debounced write
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => {
          void localRepo.save(next);
          debounceTimer.current = null;
        }, 300);
        return next;
      });
    },
    [],
  );

  return { status, record, update, toggle };
}
