import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { portalVisibleMissionWhere } from "@/lib/portal-visibility";

// ============================================
// GET /api/client/team
// "Votre mission & votre équipe" on the portal home: the client's active,
// portal-visible missions (dates, channels, status), the people actually on
// them, and the team's latest logged action. Everything shown is read from the
// schema — no role, date or activity figure is made up for the screen.
// ============================================

const ACTIVITY_WINDOW_DAYS = 7;

interface TeamMember {
    id: string;
    name: string;
    role: "ACCOUNT_MANAGER" | "TEAM_LEAD" | "SDR";
}

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["CLIENT"], request);
    const clientId = session.user.clientId;

    if (!clientId) {
        return successResponse({ missions: [], members: [], lastActivityAt: null, actionsLast7Days: 0 });
    }

    const now = new Date();
    const [missions, bdLinks] = await Promise.all([
        prisma.mission.findMany({
            where: { clientId, isActive: true, AND: [portalVisibleMissionWhere(now)] },
            select: {
                id: true,
                name: true,
                status: true,
                startDate: true,
                endDate: true,
                channels: true,
                teamLeadSdr: { select: { id: true, name: true, isActive: true } },
                sdrAssignments: {
                    select: { sdr: { select: { id: true, name: true, isActive: true } } },
                    orderBy: { createdAt: "asc" },
                },
            },
            orderBy: { startDate: "asc" },
        }),
        prisma.businessDeveloperClient.findMany({
            where: { clientId, isActive: true, bdUser: { isActive: true } },
            select: { bdUser: { select: { id: true, name: true } } },
            orderBy: { assignedAt: "asc" },
        }),
    ]);

    // One person, one row, with their most senior role on the account.
    const members = new Map<string, TeamMember>();
    for (const { bdUser } of bdLinks) {
        members.set(bdUser.id, { id: bdUser.id, name: bdUser.name, role: "ACCOUNT_MANAGER" });
    }
    for (const m of missions) {
        const lead = m.teamLeadSdr;
        if (lead?.isActive && !members.has(lead.id)) {
            members.set(lead.id, { id: lead.id, name: lead.name, role: "TEAM_LEAD" });
        }
    }
    for (const m of missions) {
        for (const { sdr } of m.sdrAssignments) {
            if (sdr.isActive && !members.has(sdr.id)) {
                members.set(sdr.id, { id: sdr.id, name: sdr.name, role: "SDR" });
            }
        }
    }

    const missionIds = missions.map((m) => m.id);
    let lastActivityAt: string | null = null;
    let actionsLast7Days = 0;
    if (missionIds.length > 0) {
        const since = new Date(now.getTime() - ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
        const scope = { campaign: { missionId: { in: missionIds } } };
        const [last, count] = await Promise.all([
            prisma.action.findFirst({
                where: scope,
                orderBy: { createdAt: "desc" },
                select: { createdAt: true },
            }),
            prisma.action.count({ where: { ...scope, createdAt: { gte: since } } }),
        ]);
        lastActivityAt = last?.createdAt.toISOString() ?? null;
        actionsLast7Days = count;
    }

    return successResponse({
        missions: missions.map((m) => ({
            id: m.id,
            name: m.name,
            status: m.status,
            startDate: m.startDate.toISOString(),
            endDate: m.endDate.toISOString(),
            channels: m.channels,
        })),
        members: Array.from(members.values()),
        lastActivityAt,
        actionsLast7Days,
    });
});
