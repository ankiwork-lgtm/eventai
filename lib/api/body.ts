import type { z } from "zod";
import { errorResponse, parseBody } from "./envelope";

export type ReadJsonBodyResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: Response };

/**
 * Reads, size-checks (50 KB → 413) and validates a JSON body (400 on invalid
 * JSON or schema). An unexpected throw while reading maps to the 500 envelope
 * the routes have always returned.
 */
export async function readJsonBody<T>(
  req: Request,
  schema: z.ZodType<T>,
): Promise<ReadJsonBodyResult<T>> {
  try {
    return await parseBody(req, schema);
  } catch {
    return {
      ok: false,
      response: errorResponse("INTERNAL", "Unexpected error reading request.", 500),
    };
  }
}
