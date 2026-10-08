import { z } from "zod";
import { ApiError } from "./errors";

/** Parse raw query-string / tool arguments against a service's zod shape. */
export function parseInput<S extends z.ZodRawShape>(shape: S, raw: Record<string, unknown>): z.infer<z.ZodObject<S>> {
  const cleaned = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== "" && v !== undefined && v !== null));
  const result = z.object(shape).safeParse(cleaned);
  if (!result.success) {
    const detail = result.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
    throw new ApiError(400, "invalid_params", detail);
  }
  return result.data;
}

/**
 * Audit trail. The path carries the resource ids ("who looked at contact X"),
 * the query string is reduced to parameter *names* — free-text search terms
 * and keys never reach the log.
 */
export function auditEndpoint(pathname: string, paramNames: string[]): string {
  return paramNames.length ? `${pathname}?params=${[...new Set(paramNames)].sort().join(",")}` : pathname;
}
