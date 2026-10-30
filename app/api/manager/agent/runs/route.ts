// ============================================
// GET /api/manager/agent/runs?status=&folderId=&kind=&clientId=&cursor=&limit= — RunsResponse
// Newest first; `status` accepts a comma list. Degraded empty page when the
// agent tables are missing.
// ============================================

import { NextRequest } from "next/server";
import type { AgentJobKind, AgentRunStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import type { RunsResponse } from "@/lib/assistant/api-contract";
import { RUN_SELECT, folderWhere, isAgentUnavailable, pageLimit, toPage, toRunCards } from "@/lib/agent/api";
import type { RunRow } from "@/lib/agent/serialize";
import { withStore } from "@/lib/agent/store";

export const dynamic = "force-dynamic";

const STATUSES: AgentRunStatus[] = ["QUEUED", "RUNNING", "WAITING_APPROVAL", "DONE", "FAILED", "CANCELLED", "DEFERRED"];
const KINDS: AgentJobKind[] = ["WATCH", "REPORT", "MISSION", "DIGEST"];

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);
    const { searchParams } = new URL(request.url);
    const limit = pageLimit(searchParams);
    const cursor = searchParams.get("cursor");
    const statuses = (searchParams.get("status") ?? "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s): s is AgentRunStatus => (STATUSES as string[]).includes(s));
    const kind = searchParams.get("kind")?.toUpperCase();
    const folderId = searchParams.get("folderId");
    const clientId = searchParams.get("clientId");

    try {
        const where: Prisma.AgentRunWhereInput = {
            ...(statuses.length > 0 ? { status: { in: statuses } } : {}),
            ...(kind && (KINDS as string[]).includes(kind) ? { kind: kind as AgentJobKind } : {}),
            ...(clientId ? { clientId } : {}),
            ...(folderId ? await folderWhere(folderId) : {}),
        };
        const rows = await withStore(() =>
            prisma.agentRun.findMany({
                where,
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                take: limit + 1,
                ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
                select: RUN_SELECT,
            }),
        );
        const page: RunsResponse = await toPage(rows as RunRow[], limit, toRunCards);
        return successResponse(page);
    } catch (error) {
        if (isAgentUnavailable(error)) return successResponse({ items: [], nextCursor: null, degraded: true } satisfies RunsResponse);
        throw error;
    }
});
