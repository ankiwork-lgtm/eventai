"use client";

/**
 * PlanStateViews (task 5.2): the non-dashboard states of PlanShell.
 * Loading skeleton, invalid share link, corrupt record, and plan not found.
 */

import React from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { EventInput } from "@/lib/schema";

export function CenteredSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-10">
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-4 w-full max-w-prose" />
      <Skeleton className="h-4 w-4/5 max-w-prose" />
      <Skeleton className="mt-4 h-8 w-80" />
      <Skeleton className="h-64 w-full" />
    </main>
  );
}

function CenteredMessage({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-4 px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground">{body}</p>
      {children}
    </main>
  );
}

export function InvalidShareLinkView() {
  return (
    <CenteredMessage
      title="Invalid shared plan link"
      body="This share link appears to be incomplete, modified, or corrupted."
    >
      <Link href="/" className={buttonVariants({ variant: "default" })}>
        Back to home
      </Link>
    </CenteredMessage>
  );
}

export function CorruptPlanView({
  salvagedInput,
  onDelete,
  onRegenerate,
}: {
  salvagedInput: EventInput | null;
  onDelete: () => void;
  onRegenerate: (salvaged: EventInput) => void;
}) {
  return (
    <CenteredMessage
      title="Couldn't load this plan"
      body="The saved data for this plan is corrupted and can't be read."
    >
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant="destructive" onClick={onDelete}>
          Delete
        </Button>
        {salvagedInput && (
          <Button onClick={() => onRegenerate(salvagedInput)}>
            Regenerate from input
          </Button>
        )}
      </div>
    </CenteredMessage>
  );
}

export function PlanNotFoundView() {
  return (
    <CenteredMessage
      title="Plan not found on this device"
      body="This plan ID does not exist in your browser's local storage."
    >
      <Link href="/" className={buttonVariants({ variant: "default" })}>
        Back to home
      </Link>
    </CenteredMessage>
  );
}
