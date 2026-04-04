import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    successResponse,
    requireAuth,
    withErrorHandler,
} from "@/lib/api-utils";
import { xpProgress } from "@/lib/gamification/engine";

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [user, actionsToday, recentAchievements, teamSize, higherXpCount] =
        await Promise.all([
            prisma.user.findUnique({
                where: { id: userId },
                select: {
                    xp: true,
                    level: true,
                    currentStreak: true,
                    longestStreak: true,
                    lastStreakDate: true,
                    dailyGoal: true,
                },
            }),
            prisma.action.count({
                where: { sdrId: userId, createdAt: { gte: today } },
            }),
            prisma.userAchievement.findMany({
                where: { userId },
                orderBy: { unlockedAt: "desc" },
                take: 3,
                include: {
                    achievement: {
                        select: { code: true, name: true, icon: true, tier: true },
                    },
                },
            }),
            prisma.user.count({
                where: {
                    isActive: true,
                    role: { in: ["SDR", "BUSINESS_DEVELOPER", "BOOKER"] },
                },
            }),
            prisma.user.count({
                where: {
                    isActive: true,
                    role: { in: ["SDR", "BUSINESS_DEVELOPER", "BOOKER"] },
                    xp: { gt: user?.xp ?? 0 },
                },
            }),
        ]);

    if (!user) {
        return successResponse(null);
    }

    const dailyGoal = user.dailyGoal || 80;

    // Check streak freshness
    let streakActive = false;
    if (user.lastStreakDate) {
        const lastDate = new Date(user.lastStreakDate);
        lastDate.setHours(0, 0, 0, 0);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        streakActive =
            lastDate.getTime() === today.getTime() ||
            lastDate.getTime() === yesterday.getTime();
    }

    return successResponse({
        xp: user.xp,
        level: user.level,
        xpToNext: xpProgress(user.xp),
        streak: {
            current: streakActive ? user.currentStreak : 0,
            longest: user.longestStreak,
            isActive: streakActive,
        },
        dailyGoal: {
            target: dailyGoal,
            actual: actionsToday,
            progress: Math.min(100, Math.round((actionsToday / dailyGoal) * 100)),
        },
        recentAchievements: recentAchievements.map((ua) => ({
            code: ua.achievement.code,
            name: ua.achievement.name,
            icon: ua.achievement.icon,
            tier: ua.achievement.tier,
            unlockedAt: ua.unlockedAt.toISOString(),
        })),
        rank: {
            position: higherXpCount + 1,
            total: teamSize,
        },
    });
});
