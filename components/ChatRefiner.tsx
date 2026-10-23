"use client";

/**
 * ChatRefiner (P3-T07, P3-T08, TDD §9.7, §7.5)
 *
 * Floating "Refine plan" button opens a right-side panel (lg: always visible)
 * or a full-height Sheet on mobile. Message list + text input (max 500 chars).
 * Quick-suggestion chips. Undo on the latest assistant bubble.
 *
 * State design: `record.chat` is the source of truth for persisted messages.
 * A small `overlay` array holds transient bubbles (optimistic user message,
 * pending/error states) that have not yet been saved. This avoids setState
 * inside effects.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { applyRefinement, applyUndo } from "@/lib/refine";
import type { RefineResult } from "@/lib/schema";
import type { StoredPlan, ChatMessage } from "@/lib/types";

const QUICK_SUGGESTIONS = [
  "Make it cheaper",
  "Add a DJ",
  "Vegetarian-only menu",
  "Cut budget by 20%",
] as const;

const MAX_MSG_LENGTH = 500;

// ─── Types ─────────────────────────────────────────────────────────────────────

type TransientBubble = {
  id: string;
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
};

// ─── ChatRefiner ──────────────────────────────────────────────────────────────

export function ChatRefiner({
  record,
  onRecordChange,
  isStreaming,
}: {
  record: StoredPlan;
  onRecordChange: (next: StoredPlan) => void;
  isStreaming: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [inputText, setInputText] = useState("");
  const [isPending, setIsPending] = useState(false);
  // Transient bubbles: optimistic user message + pending/error states before
  // they are persisted to record.chat via onRecordChange.
  const [overlay, setOverlay] = useState<TransientBubble[]>([]);
  const listEndRef = useRef<HTMLDivElement>(null);

  // The last assistant bubble in record.chat is "undoable" while lastSnapshot exists.
  const lastPersistedIdx = record.chat.length - 1;
  const hasUndo = !!record.lastSnapshot;

  // Auto-scroll to bottom when messages or overlay change
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [record.chat.length, overlay.length]);

  const canSend = inputText.trim().length > 0 && !isPending && !isStreaming;

  // ── Send ─────────────────────────────────────────────────────────────────
  const send = useCallback(
    async (message: string) => {
      if (!message.trim()) return;
      setInputText("");
      setIsPending(true);

      // Optimistic user bubble in overlay
      const optimisticId = crypto.randomUUID();
      setOverlay([{ id: optimisticId, role: "user", content: message }]);

      try {
        const history = record.chat.slice(-6);

        const res = await fetch("/api/refine", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            plan: record.plan,
            message,
            eventInput: record.input,
            history,
          }),
        });

        if (res.status === 429) {
          toast.error("Too many requests, please wait a moment.", { id: "refine-429" });
          setOverlay([
            { id: optimisticId, role: "user", content: message },
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: "Rate limited — please wait and try again.",
              isError: true,
            },
          ]);
          return;
        }

        if (!res.ok) {
          throw new Error(`Server error ${res.status}`);
        }

        const result = (await res.json()) as RefineResult;

        const userMsg: ChatMessage = {
          role: "user",
          content: message,
          at: new Date().toISOString(),
        };
        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: result.changeSummary,
          at: new Date().toISOString(),
        };

        // applyRefinement internally appends only the assistant message;
        // we prepend the user message manually.
        const withUser: StoredPlan = { ...record, chat: [...record.chat, userMsg] };
        const nextRecord = applyRefinement(withUser, result, assistantMsg);
        onRecordChange(nextRecord);
        // Clear overlay — persisted chat now includes both messages.
        setOverlay([]);
      } catch {
        setOverlay([
          { id: optimisticId, role: "user", content: message },
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "Something went wrong. Please try again.",
            isError: true,
          },
        ]);
      } finally {
        setIsPending(false);
      }
    },
    [record, onRecordChange],
  );

  // ── Undo ─────────────────────────────────────────────────────────────────
  const handleUndo = useCallback(() => {
    const revertMsg: ChatMessage = {
      role: "assistant",
      content: "Reverted to the previous plan.",
      at: new Date().toISOString(),
    };
    const nextRecord = applyUndo(record, revertMsg);
    onRecordChange(nextRecord);
    setOverlay([]);
  }, [record, onRecordChange]);

  // ── Retry ─────────────────────────────────────────────────────────────────
  const handleRetry = useCallback(() => {
    if (overlay.length === 0) return;
    const lastUser = [...overlay].reverse().find((b) => b.role === "user");
    if (!lastUser) return;
    setOverlay([]);
    void send(lastUser.content);
  }, [overlay, send]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) void send(inputText);
    }
  };

  const allEmpty = record.chat.length === 0 && overlay.length === 0 && !isPending;

  // ── Panel content ─────────────────────────────────────────────────────────
  const panelContent = (
    <div className="flex h-full flex-col" aria-busy={isPending}>
      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {allEmpty && (
          <p className="text-center text-sm text-muted-foreground">
            Ask me to refine your event plan.
          </p>
        )}

        {/* Persisted chat messages */}
        {record.chat.map((msg, i) => {
          const isUndoable =
            hasUndo && i === lastPersistedIdx && msg.role === "assistant";
          return (
            <div
              key={`${msg.at}-${i}`}
              className={`mb-3 flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
                {msg.content}
              </div>
              {isUndoable && (
                 <button
                   type="button"
                   onClick={handleUndo}
                   className="mt-1 min-h-[40px] px-1 text-xs text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded"
                 >
                   Undo
                 </button>
               )}
            </div>
          );
        })}

        {/* Transient overlay bubbles */}
        {overlay.map((bubble, i) => (
          <div
            key={bubble.id}
            className={`mb-3 flex flex-col ${bubble.role === "user" ? "items-end" : "items-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                bubble.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : bubble.isError
                    ? "border border-destructive/40 bg-destructive/10 text-destructive"
                    : "bg-muted text-foreground"
              }`}
            >
              {bubble.content}
            </div>
            {bubble.isError && i === overlay.length - 1 && (
               <button
                 type="button"
                 onClick={handleRetry}
                 className="mt-1 min-h-[40px] px-1 text-xs text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded"
               >
                 Retry
               </button>
             )}
          </div>
        ))}

        {isPending && (
          <div className="flex items-start">
            <div className="rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
              Updating plan…
            </div>
          </div>
        )}
        <div ref={listEndRef} />
      </div>

      {/* Quick suggestions */}
      {allEmpty && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-2">
          {QUICK_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={isPending || isStreaming}
              onClick={() => void send(s)}
              className="min-h-[40px] rounded-full border px-3 py-1 text-xs transition-colors hover:bg-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="border-t px-4 py-3">
        <div className="relative">
          <Textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value.slice(0, MAX_MSG_LENGTH))}
            onKeyDown={handleKeyDown}
            placeholder="Ask me to change something…"
            disabled={isPending || isStreaming}
            rows={2}
            className="resize-none pr-16 text-sm"
            aria-label="Refine message"
          />
          <div className="absolute right-2 bottom-2 flex items-center gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">
              {inputText.length}/{MAX_MSG_LENGTH}
            </span>
            <Button
              size="sm"
              disabled={!canSend}
              onClick={() => void send(inputText)}
            >
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile: Sheet trigger (hidden at lg) */}
      <div className="fixed bottom-6 right-6 z-40 lg:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <Button
            onClick={() => setOpen(true)}
            className="rounded-full shadow-lg"
            size="sm"
          >
            Refine plan
          </Button>
          <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-md">
            <SheetHeader className="px-4 pt-4">
              <SheetTitle>Refine plan</SheetTitle>
            </SheetHeader>
            {panelContent}
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop: always-visible right panel (shown at lg) */}
      <div className="hidden lg:flex lg:w-80 lg:shrink-0 lg:flex-col lg:rounded-lg lg:border lg:bg-background">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Refine plan</h2>
        </div>
        {panelContent}
      </div>
    </>
  );
}
