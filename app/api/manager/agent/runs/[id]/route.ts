// ============================================
// GET /api/manager/agent/runs/[id] — AgentRunDetail (steps, proposals, findings, report)
// The UI polls it every 3 s while the run is queued or running.
// ============================================

import { NextRequest } from "next/server";
import { NotFoundError, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { getRunDetail, isAgentUnavailable } from "@/lib/agent/api";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    await requireRole(["MANAGER"], request);
    const { id } = await params;
    try {
        const detail = await getRunDetail(id);
        if (!detail) throw new NotFoundError("Exécution introuvable");
        return successResponse(detail);
    } catch (error) {
        if (isAgentUnavailable(error)) throw new NotFoundError("Exécution introuvable");
        throw error;
    }
});
