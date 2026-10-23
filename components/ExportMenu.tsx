"use client";

/**
 * ExportMenu (P4-T05, TDD §9.9)
 *
 * Dropdown menu offering:
 *  - Download calendar (.ics)
 *  - Print / Save as PDF (opens /plan/[id]/print)
 *  - Copy share link
 */

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CalendarIcon,
  ChevronDownIcon,
  PrinterIcon,
  Share2Icon,
  DownloadIcon,
  CheckIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buildIcs, downloadIcs } from "@/lib/export";
import { encodeSharePayload } from "@/lib/share";
import type { EventInput, Plan } from "@/lib/schema";

export function ExportMenu({
  planId,
  input,
  plan,
  disabled = false,
}: {
  planId: string;
  input: EventInput;
  plan: Plan | null | undefined;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [open]);

  const handleDownloadIcs = () => {
    if (!plan) return;
    try {
      const icsData = buildIcs({ planId, input, plan });
      const name = input.name?.trim() || input.eventType;
      downloadIcs(`${name}-schedule.ics`, icsData);
      toast.success("Calendar (.ics) downloaded");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate calendar");
    }
  };

  const handleCopyShareLink = async () => {
    if (!plan) return;
    try {
      const encoded = encodeSharePayload({ input, plan });
      const shareUrl = `${window.location.origin}/plan/shared#s=${encoded}`;
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Share link copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
      setOpen(false);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const isReady = !disabled && !!plan;

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <Button
        variant="outline"
        size="sm"
        disabled={!isReady}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={open}
        className="gap-1.5"
      >
        <DownloadIcon className="size-4" />
        <span>Export</span>
        <ChevronDownIcon className="size-3.5 opacity-60" />
      </Button>

      {open && (
        <div
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 z-50 mt-1.5 w-56 origin-top-right rounded-lg border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleDownloadIcs}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
          >
            <CalendarIcon className="size-4 text-muted-foreground" />
            <span>Download calendar (.ics)</span>
          </button>

          <Link
            href={`/plan/${planId}/print`}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
          >
            <PrinterIcon className="size-4 text-muted-foreground" />
            <span>Print / Save as PDF</span>
          </Link>

          <button
            type="button"
            role="menuitem"
            onClick={handleCopyShareLink}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
          >
            {copied ? (
              <CheckIcon className="size-4 text-green-600" />
            ) : (
              <Share2Icon className="size-4 text-muted-foreground" />
            )}
            <span>{copied ? "Copied!" : "Copy link"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
