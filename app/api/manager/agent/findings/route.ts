// ============================================
// GET /api/manager/agent/findings?state=OPEN&severity=&folderId=&clientId=&rule=&cursor=&limit= — FindingsResponse
// Most severe first, then most recently seen. `state=ALL` lists every state.
// ============================================

import { NextRequest } from "next/server";
import type { AgentFindingState, AgentSeverity, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import type { FindingsResponse } from "@/lib/assistant/api-contract";
import { folderWhere, isAgentUnavailable, pageLimit, toPage } from "@/lib/agent/api";
import { toFindingItems } from "@/lib/agent/findings-api";
import { withStore } from "@/lib/agent/store";

export const dynamic = "force-dynamic";

const STATES: AgentFindingState[] = ["OPEN", "ACKED", "SNOOZED", "RESOLVED"];
const SEVERITIES: AgentSeverity[] = ["INFO", "WARN", "CRITICAL"];

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);
    const { searchParams } = new URL(request.url);
    const limit = pageLimit(searchParams);
    const cursor = searchParams.get("cursor");
    const stateParam = (searchParams.get("state") ?? "OPEN").toUpperCase();
    const states = stateParam === "ALL" ? [] : stateParam.split(",").filter((s): s is AgentFindingState => (STATES as string[]).includes(s));
    const severity = searchParams.get("severity")?.toUpperCase();
    const folderId = searchParams.get("folderId");
    const clientId = searchParams.get("clientId");
    const rule = searchParams.get("rule");

    try {
        const where: Prisma.AgentFindingWhereInput = {
            ...(states.length > 0 ? { state: { in: states } } : {}),
            ...(severity && (SEVERITIES as string[]).includes(severity) ? { severity: severity as AgentSeverity } : {}),
            ...(clientId ? { clientId } : {}),
            ...(rule ? { rule } : {}),
            ...(folderId ? await folderWhere(folderId) : {}),
        };
        const rows = await withStore(() =>
            prisma.agentFinding.findMany({
                where,
                orderBy: [{ severity: "desc" }, { lastSeenAt: "desc" }, { id: "desc" }],
                take: limit + 1,
                ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            }),
        );
        const page: FindingsResponse = await toPage(rows, limit, toFindingItems);
        return successResponse(page);
    } catch (error) {
        if (isAgentUnavailable(error)) return successResponse({ items: [], nextCursor: null, degraded: true } satisfies FindingsResponse);
        throw error;
    }
});
