import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { logApiKeyUsage } from "@/lib/api-keys";
import { authenticateApiKey, requireScope, type Principal } from "./auth";
import { ApiError } from "./errors";
import type { Scope } from "./scopes";
import type { Ctx } from "./serializers";

export { parseInput, auditEndpoint } from "./input";
import { auditEndpoint } from "./input";

export function recordAccess(
  p: Principal | null,
  entry: { endpoint: string; method: string; status: number; startedAt: number; request?: Request },
): void {
  if (!p) return;
  after(() =>
    logApiKeyUsage(p.keyId, entry.endpoint, entry.method, entry.status, Date.now() - entry.startedAt, entry.request),
  );
}

export function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

const NO_STORE = { "Cache-Control": "no-store" };

function envelope(result: unknown, limit: number | undefined) {
  if (result && typeof result === "object" && "items" in result && "next_cursor" in result) {
    const r = result as { items: unknown[]; next_cursor: string | null };
    return { data: r.items, pagination: { limit: limit ?? r.items.length, next_cursor: r.next_cursor, has_more: r.next_cursor !== null } };
  }
  return { data: result };
}

// Next.js requires this exact shape for the second argument of a route handler.
type RouteContext = { params: Promise<Record<string, string>> };

/**
 * Wraps a /api/v1 route: authenticate → scope → run → envelope → audit.
 * The route only ever sees a `Ctx` whose tenant comes from the API key.
 */
export function v1Route(
  scope: Scope | null,
  run: (ctx: Ctx, args: { params: Record<string, string>; query: Record<string, string> }) => Promise<unknown>,
) {
  return async (req: NextRequest, context?: RouteContext): Promise<NextResponse> => {
    const startedAt = Date.now();
    const url = new URL(req.url);
    let principal: Principal | null = null;
    let status = 200;
    try {
      principal = await authenticateApiKey(prisma, req.headers);
      if (scope) requireScope(principal, scope);
      const query = Object.fromEntries(url.searchParams);
      const params = context?.params ? await context.params : {};
      const result = await run({ p: principal, db: prisma }, { params, query });
      const limit = Number(query.limit) || undefined;
      return NextResponse.json(envelope(result, limit), { status, headers: NO_STORE });
    } catch (err) {
      let body;
      if (err instanceof ApiError) {
        status = err.status;
        body = errorBody(err.code, err.message);
        return NextResponse.json(body, { status, headers: { ...NO_STORE, ...err.headers } });
      }
      status = 500;
      console.error("[api/v1] unexpected error", err instanceof Error ? err.message : err);
      return NextResponse.json(errorBody("internal_error", "Internal server error"), { status, headers: NO_STORE });
    } finally {
      recordAccess(principal, {
        endpoint: auditEndpoint(url.pathname, [...url.searchParams.keys()]),
        method: req.method,
        status,
        startedAt,
        request: req,
      });
    }
  };
}
