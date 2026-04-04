import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    successResponse,
    requireRole,
    withErrorHandler,
} from "@/lib/api-utils";

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);

    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);

    // Get all active SDR/BD/BOOKER users
    const users = await prisma.user.findMany({
        where: {
            isActive: true,
            role: { in: ["SDR", "BUSINESS_DEVELOPER", "BOOKER"] },
        },
        select: {
            id: true,
            name: true,
            avatar: true,
            role: true,
            lastConnectedAt: true,
        },
    });

    // Get today's action counts per user
    const actionCounts = await prisma.action.groupBy({
        by: ["sdrId"],
        where: { createdAt: { gte: today } },
        _count: true,
    });
    const actionMap = new Map(actionCounts.map((a) => [a.sdrId, a._count]));

    // Get current mission for each user (most recent active assignment)
    const missionAssignments = await prisma.mission.findMany({
        where: {
            isActive: true,
            assignedSDRs: { some: { id: { in: users.map((u) => u.id) } } },
        },
        select: {
            name: true,
            assignedSDRs: { select: { id: true } },
        },
    });

    const missionMap = new Map<string, string>();
    for (const m of missionAssignments) {
        for (const sdr of m.assignedSDRs) {
            if (!missionMap.has(sdr.id)) {
                missionMap.set(sdr.id, m.name);
            }
        }
    }

    // Compute status for each user
    const members = users.map((u) => {
        let status: "online" | "away" | "offline" = "offline";
        if (u.lastConnectedAt) {
            if (u.lastConnectedAt >= fiveMinAgo) status = "online";
            else if (u.lastConnectedAt >= thirtyMinAgo) status = "away";
        }

        return {
            id: u.id,
            name: u.name,
            avatar: u.avatar,
            role: u.role,
            status,
            currentMission: missionMap.get(u.id) || null,
            actionsToday: actionMap.get(u.id) ?? 0,
            lastConnectedAt: u.lastConnectedAt?.toISOString() ?? null,
        };
    });

    // Get last 10 actions across all team members for the live feed
    const recentActions = await prisma.action.findMany({
        where: {
            createdAt: { gte: today },
            sdrId: { in: users.map((u) => u.id) },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
            id: true,
            type: true,
            result: true,
            createdAt: true,
            sdr: { select: { name: true } },
            contact: { select: { firstName: true, lastName: true, company: true } },
        },
    });

    const liveFeed = recentActions.map((a) => ({
        id: a.id,
        user: a.sdr.name,
        type: a.type,
        result: a.result,
        time: a.createdAt.toISOString(),
        contactName: a.contact
            ? `${a.contact.firstName || ""} ${a.contact.lastName || ""}`.trim()
            : null,
        company: a.contact?.company || null,
    }));

    return successResponse({ members, liveFeed });
});
