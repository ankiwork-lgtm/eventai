import { logLlmCall, type LogLlmCallParams } from "@/lib/observability";

type Usage = LogLlmCallParams["usage"];

/**
 * Returns a function that logs the LLM call at most once (for streaming routes
 * where both onFinish and the catch path may fire).
 */
export function createLlmLogOnce(route: string, eventType: string) {
  const startedAt = Date.now();
  let logged = false;
  return (ok: boolean, usage?: Usage): void => {
    if (logged) return;
    logged = true;
    logLlmCall({ route, eventType, latencyMs: Date.now() - startedAt, usage, ok });
  };
}

/**
 * Runs `fn`, logging one structured line: ok with token usage on success,
 * failed on throw (the error is rethrown unchanged).
 */
export async function withLlmLogging<T extends { usage?: Usage }>(
  meta: { route: string; eventType: string },
  fn: () => Promise<T>,
): Promise<T> {
  const log = createLlmLogOnce(meta.route, meta.eventType);
  try {
    const result = await fn();
    log(true, result.usage);
    return result;
  } catch (err) {
    log(false);
    throw err;
  }
}
