"use client";

/**
 * usePlanLoader (task 5.2)
 *
 * Record loading for the dashboard: delegates storage + persistence to
 * usePlanStore, decodes `#s=` share links into a read-only record, and probes
 * for corrupt records so the UI can offer delete / regenerate (DD-13: all
 * storage access happens in effects).
 */

import { useEffect, useState } from "react";
import { localRepo, salvageInput } from "@/lib/storage";
import { decodeSharePayload } from "@/lib/share";
import type { EventInput } from "@/lib/schema";
import type { StoredPlan } from "@/lib/types";
import { usePlanStore } from "@/hooks/usePlanStore";

/** Local load states before we have a record decision (used for corrupt handling). */
export type CorruptState = { kind: "corrupt"; salvagedInput: EventInput | null } | null;

export function usePlanLoader(id: string) {
  // ── usePlanStore owns loading + persistence ──────────────────────────────
  const { status: storeStatus, record, update, toggle, cancelPendingSave } =
    usePlanStore(id);

  const [corruptState, setCorruptState] = useState<CorruptState>(null);
  const [sharedRecord, setSharedRecord] = useState<StoredPlan | null>(null);
  const [sharedError, setSharedError] = useState(false);

  // Detect shared link or corrupt records
  useEffect(() => {
    if (id === "shared" || (typeof window !== "undefined" && window.location.hash.startsWith("#s="))) {
      const hash = typeof window !== "undefined" ? window.location.hash : "";
      const decoded = decodeSharePayload(hash);
      if (decoded) {
        const now = new Date().toISOString();
        // The hash only exists in the browser; reading it during render would cause a hydration mismatch.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSharedRecord({
          id: "shared",
          input: decoded.input,
          plan: decoded.plan,
          progress: { timeline: {}, vendors: {} },
          chat: [],
          version: 1,
          createdAt: now,
          updatedAt: now,
        });
        return;
      } else if (id === "shared" || hash.startsWith("#s=")) {
        setSharedError(true);
        return;
      }
    }

    if (storeStatus !== "missing") return;
    localRepo.inspect(id).then((result) => {
      if (result.state === "corrupt") {
        setCorruptState({ kind: "corrupt", salvagedInput: salvageInput(result.raw) });
      }
    });
  }, [id, storeStatus]);

  return {
    storeStatus,
    record,
    update,
    toggle,
    cancelPendingSave,
    corruptState,
    setCorruptState,
    sharedRecord,
    sharedError,
  };
}
