"use client";

/**
 * /plan/[id] — Phase 2: the real tabbed dashboard.
 *
 * Next.js 16 async params: in a client component, params arrives as a
 * Promise<{ id: string }>. Unwrap it with React.use() inside a Suspense
 * boundary. The same boundary also satisfies useSearchParams() used by
 * PlanShell for the `?tab=` query param.
 *
 * Cache Components (cacheComponents: true): client components inside a dynamic
 * segment are always dynamic; no generateStaticParams required.
 *
 * DD-13: never branch on `window` in render — all storage access is deferred to
 * effects inside PlanShell.
 */

import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { PlanShell } from "@/components/PlanShell";

function PlanPageShell({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  return <PlanShell id={id} />;
}

function DashboardFallback() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-10">
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-4 w-full max-w-prose" />
      <Skeleton className="h-64 w-full" />
    </main>
  );
}

export default function PlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <React.Suspense fallback={<DashboardFallback />}>
      <PlanPageShell params={params} />
    </React.Suspense>
  );
}
