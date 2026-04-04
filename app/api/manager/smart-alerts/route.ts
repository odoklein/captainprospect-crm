import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    successResponse,
    requireRole,
    withErrorHandler,
} from "@/lib/api-utils";

interface Alert {
    type: string;
    severity: "success" | "warning" | "info";
    title: string;
    message: string;
    actionUrl?: string;
    userId?: string;
}

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);

    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);
    const twentyFourHAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const fortyEightHAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const alerts: Alert[] = [];

    // Get active SDR/BD users
    const activeSDRs = await prisma.user.findMany({
        where: {
            isActive: true,
            role: { in: ["SDR", "BUSINESS_DEVELOPER", "BOOKER"] },
        },
        select: {
            id: true,
            name: true,
            lastConnectedAt: true,
        },
    });

    // 1. Performance drop — SDR's actions today < 50% of 7-day daily average
    const todayActionCounts = await prisma.action.groupBy({
        by: ["sdrId"],
        where: { createdAt: { gte: today } },
        _count: true,
    });
    const todayMap = new Map(todayActionCounts.map((a) => [a.sdrId, a._count]));

    const weekActionCounts = await prisma.action.groupBy({
        by: ["sdrId"],
        where: { createdAt: { gte: sevenDaysAgo } },
        _count: true,
    });
    const weekMap = new Map(weekActionCounts.map((a) => [a.sdrId, a._count]));

    // Only check performance drop if it's past 11am (enough working time)
    if (now.getHours() >= 11) {
        for (const sdr of activeSDRs) {
            const todayCount = todayMap.get(sdr.id) ?? 0;
            const weekTotal = weekMap.get(sdr.id) ?? 0;
            const dailyAvg = weekTotal / 7;
            if (dailyAvg >= 10 && todayCount < dailyAvg * 0.5) {
                alerts.push({
                    type: "performance_drop",
                    severity: "warning",
                    title: "Baisse de performance",
                    message: `${sdr.name} a ${todayCount} actions aujourd'hui (moyenne: ${Math.round(dailyAvg)}/jour)`,
                    actionUrl: `/manager/team`,
                    userId: sdr.id,
                });
            }
        }
    }

    // 2. Stale callbacks — CALLBACK_REQUESTED older than 48h
    const staleCallbacks = await prisma.action.count({
        where: {
            result: "CALLBACK_REQUESTED",
            callbackDate: { lt: fortyEightHAgo },
        },
    });
    if (staleCallbacks > 0) {
        alerts.push({
            type: "stale_callbacks",
            severity: "warning",
            title: "Rappels en retard",
            message: `${staleCallbacks} rappel${staleCallbacks > 1 ? "s" : ""} en attente depuis plus de 48h`,
            actionUrl: `/manager/team`,
        });
    }

    // 3. Team goal milestone
    const totalTeamActionsToday = todayActionCounts.reduce(
        (sum, a) => sum + a._count,
        0
    );
    const teamGoal = activeSDRs.length * 80;
    if (teamGoal > 0) {
        const teamProgress = Math.round((totalTeamActionsToday / teamGoal) * 100);
        if (teamProgress >= 100) {
            alerts.push({
                type: "goal_milestone",
                severity: "success",
                title: "Objectif atteint! 🎉",
                message: `L'équipe a dépassé l'objectif quotidien (${totalTeamActionsToday}/${teamGoal} actions)`,
            });
        } else if (teamProgress >= 75) {
            alerts.push({
                type: "goal_milestone",
                severity: "success",
                title: "75% de l'objectif",
                message: `L'équipe a atteint ${teamProgress}% de l'objectif (${totalTeamActionsToday}/${teamGoal})`,
            });
        }
    }

    // 4. Meeting celebration — any MEETING_BOOKED in last 30 minutes
    const recentMeetings = await prisma.action.findMany({
        where: {
            result: "MEETING_BOOKED",
            createdAt: { gte: thirtyMinAgo },
        },
        select: {
            sdr: { select: { name: true } },
            contact: { select: { company: true } },
        },
    });
    for (const m of recentMeetings) {
        const company = m.contact?.company || "un prospect";
        alerts.push({
            type: "meeting_celebration",
            severity: "success",
            title: "Nouveau RDV! 🤝",
            message: `${m.sdr.name} a décroché un RDV avec ${company}`,
        });
    }

    // 5. Inactive SDR — no connection in 24h
    for (const sdr of activeSDRs) {
        if (!sdr.lastConnectedAt || sdr.lastConnectedAt < twentyFourHAgo) {
            alerts.push({
                type: "inactive_sdr",
                severity: "info",
                title: "SDR inactif",
                message: `${sdr.name} ne s'est pas connecté depuis plus de 24h`,
                userId: sdr.id,
            });
        }
    }

    return successResponse({ alerts });
});
