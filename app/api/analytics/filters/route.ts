import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";

// ============================================
// GET /api/analytics/filters
// Options of the Statistiques scope filters in one light request. The old page
// fired four (missions, users, clients and /api/lists, which loads every company
// of every list just to get a name).
// ============================================

export interface StatsFilterOptions {
    clients: { id: string; name: string }[];
    missions: { id: string; name: string; clientId: string; clientName: string; status: string }[];
    sdrs: { id: string; name: string; isActive: boolean }[];
    lists: { id: string; name: string; missionId: string | null }[];
}

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER", "DEVELOPER"], request);

    const [clients, missions, sdrs, lists] = await Promise.all([
        prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
        prisma.mission.findMany({
            select: { id: true, name: true, clientId: true, status: true, client: { select: { name: true } } },
            orderBy: { name: "asc" },
        }),
        prisma.user.findMany({
            where: { role: { in: ["SDR", "BOOKER", "BUSINESS_DEVELOPER"] } },
            select: { id: true, name: true, isActive: true },
            orderBy: { name: "asc" },
        }),
        prisma.list.findMany({ select: { id: true, name: true, missionId: true }, orderBy: { createdAt: "desc" } }),
    ]);

    const options: StatsFilterOptions = {
        clients,
        missions: missions.map((m) => ({ id: m.id, name: m.name, clientId: m.clientId, clientName: m.client?.name ?? "—", status: m.status })),
        sdrs,
        lists,
    };
    return successResponse(options);
});
