"use client";

/**
 * EmailDialog (P4-T07, PROJECT_SPEC §6, TDD §6.3, §9.5)
 *
 * Generates an inquiry email for a specific vendor, allows editing subject/body,
 * copying to clipboard, and opening in mail client via mailto:.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { COPIED_RESET_MS } from "@/lib/constants";
import { formatRateLimitMessage, isRateLimited, parseApiError } from "@/lib/client/apiError";

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

  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Controller of the in-flight request, so Retry and unmount can cancel it. */
  const controllerRef = useRef<AbortController | null>(null);

  const requestDraft = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vendorType, eventInput, plan }),
          signal,
        });

        if (!res.ok) {
          const apiErr = await parseApiError(res);
          if (isRateLimited(apiErr)) {
            const msg = formatRateLimitMessage(apiErr);
            if (!signal.aborted) toast.error(msg, { id: "email-429" });
            throw new Error(msg);
          }
          throw new Error(apiErr.message);
        }

        const data = (await res.json()) as { subject: string; body: string };
        if (signal.aborted) return;
        setSubject(data.subject);
        setBody(data.body);
      } catch (err) {
        if (signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to generate email draft");
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [vendorType, eventInput, plan],
  );

  const startRequest = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    void requestDraft(controller.signal);
    return controller;
  }, [requestDraft]);

  useEffect(() => {
    if (!open || !vendorType) return;
    // Starting a request synchronizes with an external system (the network); the
    // loading flag must be set before the first paint of the open dialog.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    const controller = startRequest();
    return () => controller.abort();
  }, [open, vendorType, startRequest]);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const handleCopy = async () => {
    try {
      const fullText = `Subject: ${subject}\n\n${body}`;
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      toast.success("Email copied to clipboard");
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
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
            <Button variant="outline" size="sm" onClick={startRequest} className="gap-2">
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
