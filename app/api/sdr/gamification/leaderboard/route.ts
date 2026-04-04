import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    successResponse,
    requireAuth,
    withErrorHandler,
} from "@/lib/api-utils";

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "week";

    const now = new Date();
    let periodStart: Date;

    if (period === "month") {
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === "alltime") {
        periodStart = new Date(2020, 0, 1);
    } else {
        // week
        periodStart = new Date(now);
        periodStart.setDate(periodStart.getDate() - periodStart.getDay());
        periodStart.setHours(0, 0, 0, 0);
    }

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
            xp: true,
            level: true,
            currentStreak: true,
        },
    });

    // Get action counts per user for the period
    const actionCounts = await prisma.action.groupBy({
        by: ["sdrId"],
        where: { createdAt: { gte: periodStart } },
        _count: true,
    });

    const meetingCounts = await prisma.action.groupBy({
        by: ["sdrId"],
        where: {
            createdAt: { gte: periodStart },
            result: "MEETING_BOOKED",
        },
        _count: true,
    });

    const actionMap = new Map(actionCounts.map((a) => [a.sdrId, a._count]));
    const meetingMap = new Map(meetingCounts.map((m) => [m.sdrId, m._count]));

    const rankings = users
        .map((u) => ({
            id: u.id,
            name: u.name,
            avatar: u.avatar,
            xp: u.xp,
            level: u.level,
            actions: actionMap.get(u.id) ?? 0,
            meetings: meetingMap.get(u.id) ?? 0,
            streak: u.currentStreak,
            isCurrentUser: u.id === session.user.id,
        }))
        .sort((a, b) => {
            // Sort by period actions primarily, then XP as tiebreaker
            const aScore = a.actions * 10 + a.meetings * 100;
            const bScore = b.actions * 10 + b.meetings * 100;
            return bScore - aScore || b.xp - a.xp;
        });

    return successResponse({ period, rankings });
});
