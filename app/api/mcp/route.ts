import { NextRequest, NextResponse } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey, type Principal } from "@/lib/api-v1/auth";
import { ApiError } from "@/lib/api-v1/errors";
import { errorBody, recordAccess } from "@/lib/api-v1/handler";
import { buildMcpServer } from "@/lib/api-v1/mcp-server";

// ============================================
// POST /api/mcp — remote MCP server (Streamable HTTP, stateless)
// Same API key, tenant isolation and scopes as /api/v1: every tool runs the
// same service functions with the principal resolved from the key.
// ============================================

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let principal: Principal;
  try {
    principal = await authenticateApiKey(prisma, req.headers);
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json(errorBody(err.code, err.message), {
        status: err.status,
        headers: { "WWW-Authenticate": 'Bearer realm="captain-prospect-mcp"', ...err.headers },
      });
    }
    console.error("[mcp] auth failure", err instanceof Error ? err.message : err);
    return NextResponse.json(errorBody("internal_error", "Internal server error"), { status: 500 });
  }

  const server = buildMcpServer(principal, prisma, (entry) => recordAccess(principal, { ...entry, request: req }));
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(req);
}

// Stateless server: no SSE stream to open, no session to close.
const notAllowed = () =>
  NextResponse.json(errorBody("method_not_allowed", "Use POST (stateless MCP endpoint)."), { status: 405, headers: { Allow: "POST" } });
export const GET = notAllowed;
export const DELETE = notAllowed;
