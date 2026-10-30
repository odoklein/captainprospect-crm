// ============================================
// GET /api/manager/agent/playbooks — what the agent can do, with each
// playbook's config as JSON Schema (zod's toJSONSchema) for the settings form.
// ============================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import type { AgentPlaybookItem } from "@/lib/assistant/api-contract";
import { PLAYBOOKS } from "@/lib/agent/playbooks/registry";

function configJsonSchema(schema: z.ZodType): Record<string, unknown> {
    try {
        return z.toJSONSchema(schema, { unrepresentable: "any", io: "input" }) as Record<string, unknown>;
    } catch {
        return { type: "object" };
    }
}

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);
    const items: AgentPlaybookItem[] = PLAYBOOKS.map((p) => ({
        id: p.id,
        kind: p.kind,
        label: p.label,
        description: p.description,
        scope: p.scope === "mission" ? "client" : p.scope,
        defaultSchedule: p.defaultSchedule,
        configSchema: configJsonSchema(p.configSchema as z.ZodType),
    }));
    return successResponse(items);
});
