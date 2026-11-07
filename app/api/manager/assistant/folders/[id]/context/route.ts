import { NextRequest } from "next/server";
import { requireRole, successResponse } from "@/lib/api-utils";
import { assistantRoute, readIds } from "@/lib/assistant/conversations/http";
import { loadViewer } from "@/lib/assistant/conversations/service";
import { getFolderDetail } from "@/lib/assistant/folders/service";
import { prisma } from "@/lib/prisma";
import { getClientProductionInsight } from "@/lib/client-insights";
import type { ClientWorkspaceContext } from "@/lib/assistant/api-contract";

export const dynamic = "force-dynamic";

export const GET = assistantRoute<{ id: string }>(async (request: NextRequest, { params }) => {
    const session = await requireRole(["MANAGER"], request);
    const viewer = await loadViewer(session.user.id);
    const { id } = await readIds(params, "id");
    // Resolve through the same access boundary as the folder before reading CRM data.
    const folder = await getFolderDetail(id, viewer);
    const context: ClientWorkspaceContext = { updatedAt: new Date().toISOString(), client: null, missions: [], activity: null };
    if (!folder.clientId) return successResponse(context);
    const [client, missions, insight] = await Promise.all([
        prisma.client.findUnique({ where: { id: folder.clientId }, select: { id: true, name: true, industry: true, email: true, status: true } }),
        prisma.mission.findMany({ where: { clientId: folder.clientId, isActive: true }, select: { id: true, name: true, objective: true, status: true }, orderBy: { startDate: "desc" } }),
        getClientProductionInsight(folder.clientId),
    ]);
    context.client = client;
    context.missions = missions;
    context.activity = {
        month: insight.month, calls: insight.totalCalls, meetingsBooked: insight.totalMeetings,
        workedDays: insight.workedCallDays, plannedDays: insight.plannedMonthDays,
        estimatedPlan: !insight.hasMonthlyPlan && insight.plannedMonthDays !== null,
    };
    return successResponse(context);
});
