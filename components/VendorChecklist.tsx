"use client";

/**
 * VendorChecklist (P2-T06, P3-T04, TDD §9.5)
 *
 * Accordion per vendor: title, budgetRange, a live completed-counter (X/N),
 * and checklist items with <label>-associated checkboxes (keyboard accessible).
 * Checkboxes are disabled while streaming. "Draft email" renders only when
 * onDraftEmail is provided (wired in P4-T07).
 */

import { useId } from "react";
import type { DeepPartial } from "ai";
import { MailIcon } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { completedChecklist, isCompleteVendor } from "@/lib/guards";
import { vendorItemKey } from "@/lib/progress";
import type { Plan } from "@/lib/schema";
import type { ProgressState } from "@/lib/types";

type Vendor = Plan["vendors"][number];

function VendorItem({
  vendor,
  index,
  progress,
  onToggle,
  isStreaming,
  onDraftEmail,
}: {
  vendor: Vendor;
  index: number;
  progress?: ProgressState;
  onToggle?: (kind: keyof ProgressState, key: string) => void;
  isStreaming: boolean;
  onDraftEmail?: (type: string) => void;
}) {
  const baseId = useId();
  const items = completedChecklist(vendor);

  // Compute live completed count
  const doneCount = items.filter(
    (item) => progress?.vendors[vendorItemKey(vendor.type, item)] ?? false,
  ).length;

  return (
    <AccordionItem value={`${vendor.type}-${index}`}>
      <AccordionTrigger>
        <span className="flex flex-1 flex-wrap items-center gap-2">
          <span className="font-medium">{vendor.type}</span>
          <span className="text-xs text-muted-foreground">{vendor.budgetRange}</span>
          <span className="ml-auto mr-2 text-xs text-muted-foreground">
            {doneCount}/{items.length}
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <ul className="flex flex-col gap-2 pl-1">
          {items.map((task, i) => {
            const id = `${baseId}-${i}`;
            const key = vendorItemKey(vendor.type, task);
            const isDone = progress?.vendors[key] ?? false;

            return (
              <li key={id} className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  checked={isDone}
                  disabled={isStreaming || !onToggle}
                  onCheckedChange={() => onToggle?.("vendors", key)}
                />
                <label
                  htmlFor={id}
                  className={`cursor-pointer text-sm select-none ${
                    isDone ? "line-through text-muted-foreground" : ""
                  }`}
                >
                  {task}
                </label>
              </li>
            );
          })}
        </ul>
        {onDraftEmail && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => onDraftEmail(vendor.type)}
          >
            <MailIcon aria-hidden />
            Draft email
          </Button>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

export function VendorChecklist({
  vendors,
  progress,
  onToggle,
  isStreaming = false,
  onDraftEmail,
}: {
  vendors: readonly (Partial<Vendor> | DeepPartial<Vendor> | null | undefined)[] | undefined;
  progress?: ProgressState;
  onToggle?: (kind: keyof ProgressState, key: string) => void;
  isStreaming?: boolean;
  onDraftEmail?: (type: string) => void;
}) {
  const complete = (vendors ?? []).filter(isCompleteVendor);

  if (complete.length === 0) {
    return <p className="text-sm text-muted-foreground">No vendors yet.</p>;
  }

  return (
    <Accordion className="rounded-lg border px-3">
      {complete.map((vendor, i) => (
        <VendorItem
          key={`${vendor.type}-${i}`}
          vendor={vendor}
          index={i}
          progress={progress}
          onToggle={onToggle}
          isStreaming={isStreaming}
          onDraftEmail={onDraftEmail}
        />
      ))}
    </Accordion>
  );
}
