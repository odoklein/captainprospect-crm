import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PrismaClient } from "@prisma/client";
import type { Principal } from "./auth";
import { ApiError } from "./errors";
import { auditEndpoint } from "./input";
import { TOOLS } from "./mcp-tools";

export interface AccessEntry {
  endpoint: string;
  method: string;
  status: number;
  startedAt: number;
}

/**
 * One MCP server per request (stateless), exposing only the tools this key's
 * scopes allow. Every call runs the same service functions as the REST API
 * with the principal resolved from the API key, and leaves an audit entry.
 */
export function buildMcpServer(principal: Principal, db: PrismaClient, record: (e: AccessEntry) => void): McpServer {
  const server = new McpServer({ name: "captain-prospect-crm", version: "1.0.0" });

  for (const def of TOOLS.filter((t) => principal.scopes.includes(t.scope))) {
    server.registerTool(
      def.name,
      {
        description: def.description,
        inputSchema: def.shape,
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      },
      async (args: Record<string, unknown>) => {
        const startedAt = Date.now();
        const resourceId = def.idArg && typeof args[def.idArg] === "string" ? `/${args[def.idArg]}` : "";
        const argNames = Object.keys(args).filter((k) => k !== def.idArg && args[k] !== undefined);
        let status = 200;
        try {
          const result = await def.run({ p: principal, db }, args);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        } catch (err) {
          const known = err instanceof ApiError;
          status = known ? err.status : 500;
          if (!known) console.error(`[mcp] ${def.name} failed`, err instanceof Error ? err.message : err);
          return {
            isError: true,
            content: [{ type: "text" as const, text: known ? `${err.code}: ${err.message}` : "internal_error: Internal server error" }],
          };
        } finally {
          record({ endpoint: auditEndpoint(`/mcp/${def.name}${resourceId}`, argNames), method: "MCP", status, startedAt });
        }
      },
    );
  }
  return server;
}
