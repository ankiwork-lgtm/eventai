"use client";

/**
 * EmailDialog (P4-T07, PROJECT_SPEC §6, TDD §6.3, §9.5)
 *
 * Generates an inquiry email for a specific vendor, allows editing subject/body,
 * copying to clipboard, and opening in mail client via mailto:.
 */

import React, { useEffect, useState } from "react";
import { CheckIcon, CopyIcon, MailIcon, RefreshCwIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { EventInput, Plan } from "@/lib/schema";

export function EmailDialog({
  open,
  onOpenChange,
  vendorType,
  eventInput,
  plan,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorType: string;
  eventInput: EventInput;
  plan: Plan;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [copied, setCopied] = useState(false);

  const fetchEmailDraft = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorType,
          eventInput,
          plan,
        }),
      });

      if (res.status === 429) {
        const retryAfter = res.headers.get("Retry-After");
        const seconds = retryAfter ? Number(retryAfter) : null;
        const msg = seconds
          ? `Too many requests, wait ${seconds} seconds.`
          : "Too many requests, please wait a moment.";
        toast.error(msg, { id: "email-429" });
        throw new Error(msg);
      }
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to generate email (${res.status})`);
      }

      const data = (await res.json()) as { subject: string; body: string };
      setSubject(data.subject);
      setBody(data.body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate email draft");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    if (open && vendorType) {
      fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorType, eventInput, plan }),
      })
        .then((res) => {
          if (res.status === 429) {
            const retryAfter = res.headers.get("Retry-After");
            const seconds = retryAfter ? Number(retryAfter) : null;
            const msg = seconds
              ? `Too many requests, wait ${seconds} seconds.`
              : "Too many requests, please wait a moment.";
            toast.error(msg, { id: "email-429" });
            throw new Error(msg);
          }
          if (!res.ok) throw new Error(`Failed to generate email (${res.status})`);
          return res.json();
        })
        .then((data) => {
          if (active) {
            setSubject(data.subject);
            setBody(data.body);
          }
        })
        .catch((err) => {
          if (active) setError(err.message || "Failed to generate email");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }
    return () => {
      active = false;
    };
  }, [open, vendorType, eventInput, plan]);

  const handleCopy = async () => {
    try {
      const fullText = `Subject: ${subject}\n\n${body}`;
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      toast.success("Email copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy email");
    }
  };

  const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MailIcon className="size-5 text-primary" aria-hidden="true" />
            Draft inquiry for {vendorType}
          </DialogTitle>
          <DialogDescription>
            Review and customise this inquiry before sending to potential vendors.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
            <Loader2Icon className="size-8 animate-spin text-primary" />
            <p className="text-sm">Drafting email tailored to your plan…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchEmailDraft} className="gap-2">
              <RefreshCwIcon className="size-4" />
              Retry
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email-subject" className="text-xs font-semibold">
                Subject
              </Label>
              <Input
                id="email-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="text-sm"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email-body" className="text-xs font-semibold">
                Email Body
              </Label>
              <Textarea
                id="email-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={9}
                className="field-sizing-fixed resize-none break-words font-sans text-sm leading-relaxed"
              />
            </div>
          </div>
        )}

        <DialogFooter className="flex-wrap flex-row items-center justify-between gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              disabled={loading || !!error || !body}
              className="gap-1.5"
            >
              {copied ? (
                <CheckIcon className="size-4 text-green-600" />
              ) : (
                <CopyIcon className="size-4" />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>

            <a
              href={mailtoUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={loading || !!error || !body}
              tabIndex={loading || !!error || !body ? -1 : undefined}
              className={buttonVariants({ size: "sm" }) + " gap-1.5" + (loading || !!error || !body ? " pointer-events-none opacity-50" : "")}
            >
              <MailIcon className="size-4" aria-hidden="true" />
              Open in mail app
            </a>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
