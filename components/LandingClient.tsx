"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IntakeForm } from "@/components/IntakeForm";
import { buttonVariants } from "@/components/ui/button";
import type { EventInput } from "@/lib/schema";
import type { DemoScenario } from "@/lib/demo";
import { localRepo } from "@/lib/storage";
import type { StoredPlan } from "@/lib/types";

const subscribeNoop = () => () => {};

export function LandingClient() {
  const router = useRouter();

  // localStorage is only read on the client; the server snapshot is null so the
  // "Resume" link is absent from SSR markup and appears after hydration (no mismatch).
  const lastId = useSyncExternalStore(
    subscribeNoop,
    () => localRepo.getLastPlanId(),
    () => null,
  );

  useEffect(
    () =>
      localRepo.onStorageDegraded(() => {
        toast("Progress won't be saved in this browser mode");
      }),
    [],
  );

  async function handleSubmit(input: EventInput) {
    const now = new Date().toISOString();
    const record: StoredPlan = {
      id: crypto.randomUUID(),
      input,
      plan: null,
      progress: { timeline: {}, vendors: {} },
      chat: [],
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await localRepo.save(record);
    router.push(`/plan/${record.id}`);
  }

  async function handleInstantGenerate(scenario: DemoScenario) {
    const now = new Date().toISOString();
    const input = scenario.buildInput(new Date());
    const record: StoredPlan = {
      id: crypto.randomUUID(),
      input,
      // plan stays null on purpose: `?demo=1` makes PlanShell replay the cached
      // fixture for this scenario (P5-T03), so no LLM call is made and the plan
      // visibly streams in. The completed fixture is then persisted as usual.
      plan: null,
      progress: { timeline: {}, vendors: {} },
      chat: [],
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await localRepo.save(record);
    router.push(`/plan/${record.id}?demo=1`);
  }

  return (
    <>
      {lastId && (
        <div className="flex justify-center">
          <Link
            href={`/plan/${lastId}`}
            className={buttonVariants({ variant: "outline" })}
          >
            Resume last plan
          </Link>
        </div>
      )}
      <IntakeForm
        onSubmit={handleSubmit}
        onInstantGenerate={handleInstantGenerate}
      />
    </>
  );
}
