"use client";

/**
 * ExportMenu (P4-T05, TDD §9.9)
 *
 * Dropdown menu offering:
 *  - Download calendar (.ics)
 *  - Print / Save as PDF (opens /plan/[id]/print)
 *  - Copy share link
 */

import React, { useEffect, useId, useRef, useState } from "react";
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
import { getEventDisplayName, toSafeFilename } from "@/lib/eventName";
import { encodeSharePayload } from "@/lib/share";
import { COPIED_RESET_MS } from "@/lib/constants";
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const getItems = () =>
    Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  const focusItem = (index: number) => {
    const items = getItems();
    if (items.length === 0) return;
    items[(index + items.length) % items.length]?.focus();
  };

  const closeAndFocusTrigger = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        const active = document.activeElement;
        const focusWasInMenu = !!active && !!listRef.current?.contains(active);
        setOpen(false);
        if (focusWasInMenu) triggerRef.current?.focus();
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
        closeAndFocusTrigger();
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
      const name = toSafeFilename(getEventDisplayName(input));
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
      setTimeout(() => setCopied(false), COPIED_RESET_MS);
      setOpen(false);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = getItems();
    const current = items.indexOf(document.activeElement as HTMLElement);
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusItem(current + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusItem(current < 0 ? -1 : current - 1);
        break;
      case "Home":
        e.preventDefault();
        focusItem(0);
        break;
      case "End":
        e.preventDefault();
        focusItem(-1);
        break;
      case "Tab":
        // Tab closes the menu; focus returns to the trigger so Tab continues from there.
        setOpen(false);
        triggerRef.current?.focus();
        break;
    }
  };

  const isReady = !disabled && !!plan;

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <Button
        variant="outline"
        size="sm"
        disabled={!isReady}
        ref={triggerRef}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            focusItem(0);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            focusItem(-1);
          } else if (e.key === "Home") {
            e.preventDefault();
            focusItem(0);
          } else if (e.key === "End") {
            e.preventDefault();
            focusItem(-1);
          }
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="gap-1.5"
      >
        <DownloadIcon className="size-4" />
        <span>Export</span>
        <ChevronDownIcon className="size-3.5 opacity-60" />
      </Button>

      {open && (
        <div
          id={menuId}
          ref={listRef}
          role="menu"
          aria-orientation="vertical"
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 z-50 mt-1.5 w-56 origin-top-right rounded-lg border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
        >
          <button
            type="button"
            role="menuitem"
            tabIndex={0}
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
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
          >
            <PrinterIcon className="size-4 text-muted-foreground" />
            <span>Print / Save as PDF</span>
          </Link>

          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
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
