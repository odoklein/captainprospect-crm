import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    successResponse,
    requireAuth,
    withErrorHandler,
} from "@/lib/api-utils";

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [allAchievements, userAchievements, totalActions, totalMeetings, dailyActions, focusSessions, user] =
        await Promise.all([
            prisma.achievement.findMany({ orderBy: { threshold: "asc" } }),
            prisma.userAchievement.findMany({
                where: { userId },
                select: { achievementId: true, unlockedAt: true },
            }),
            prisma.action.count({ where: { sdrId: userId } }),
            prisma.action.count({ where: { sdrId: userId, result: "MEETING_BOOKED" } }),
            prisma.action.count({ where: { sdrId: userId, createdAt: { gte: today } } }),
            prisma.focusSession.count({ where: { userId, endedAt: { not: null } } }),
            prisma.user.findUnique({
                where: { id: userId },
                select: { currentStreak: true },
            }),
        ]);

    let conversionRate = 0;
    if (totalActions >= 100) {
        conversionRate = Math.round((totalMeetings / totalActions) * 100);
    }

    const metricsMap: Record<string, number> = {
        actions: totalActions,
        meetings: totalMeetings,
        daily_actions: dailyActions,
        streak: user?.currentStreak ?? 0,
        conversion: conversionRate,
        focus_sessions: focusSessions,
    };

    const unlockedMap = new Map(
        userAchievements.map((ua) => [ua.achievementId, ua.unlockedAt])
    );

    const achievements = allAchievements.map((a) => {
        const unlockedAt = unlockedMap.get(a.id);
        const metricValue = metricsMap[a.metric] ?? 0;
        const progress = Math.min(100, Math.round((metricValue / a.threshold) * 100));
        return {
            code: a.code,
            name: a.name,
            description: a.description,
            icon: a.icon,
            tier: a.tier,
            xpReward: a.xpReward,
            threshold: a.threshold,
            metric: a.metric,
            unlocked: !!unlockedAt,
            unlockedAt: unlockedAt?.toISOString() ?? null,
            progress,
            currentValue: metricValue,
        };
    });

    return successResponse({ achievements });
});
