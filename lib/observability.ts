/**
 * lib/observability.ts (P5-T06, TDD §13)
 *
 * Lightweight structured logging for LLM routes.
 * Emits exactly one structured JSON line per LLM call with the keys:
 * { route, eventType, latencyMs, inputTokens, outputTokens, ok }
 *
 * Never logs user free-text, prompts, or API keys.
 */

export type LlmLogLine = {
  route: string;
  eventType: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  ok: boolean;
};

export type LogLlmCallParams = {
  route: string;
  eventType: string;
  latencyMs: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  usage?: {
    inputTokens?: number | null;
    outputTokens?: number | null;
    promptTokens?: number | null;
    completionTokens?: number | null;
  } | null;
  ok: boolean;
};

export function formatLlmLogLine(params: LogLlmCallParams): LlmLogLine {
  const inputTokens =
    params.usage?.inputTokens ??
    params.usage?.promptTokens ??
    params.inputTokens ??
    null;
  const outputTokens =
    params.usage?.outputTokens ??
    params.usage?.completionTokens ??
    params.outputTokens ??
    null;

  return {
    route: params.route,
    eventType: params.eventType,
    latencyMs: Math.max(0, Math.round(params.latencyMs)),
    inputTokens: typeof inputTokens === "number" ? inputTokens : null,
    outputTokens: typeof outputTokens === "number" ? outputTokens : null,
    ok: Boolean(params.ok),
  };
}

export function logLlmCall(params: LogLlmCallParams): void {
  const line = formatLlmLogLine(params);
  console.log(JSON.stringify(line));
}
