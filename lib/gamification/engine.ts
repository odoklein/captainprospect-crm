import { prisma } from "@/lib/prisma";

// ============================================
// XP RULES
// ============================================

export const XP_RULES = {
    ACTION_LOGGED: 10,
    MEETING_BOOKED: 100,
    CALLBACK_COMPLETED: 15,
    DAILY_GOAL_MET: 50,
    STREAK_BONUS_PER_DAY: 20, // capped at ×30
};

const XP_PER_LEVEL = 500;

// ============================================
// LEVEL HELPERS
// ============================================

export function getLevel(xp: number): number {
    return Math.floor(xp / XP_PER_LEVEL) + 1;
}

export function xpProgress(xp: number): { current: number; needed: number; progress: number } {
    const inLevel = xp % XP_PER_LEVEL;
    return {
        current: inLevel,
        needed: XP_PER_LEVEL,
        progress: Math.round((inLevel / XP_PER_LEVEL) * 100),
    };
}

// ============================================
// PROCESS XP AFTER AN ACTION
// ============================================

export async function processActionXP(
    userId: string,
    actionResult: string
): Promise<{
    xpGained: number;
    totalXp: number;
    leveledUp: boolean;
    newLevel: number;
    achievementsUnlocked: { code: string; name: string; icon: string; xpReward: number }[];
}> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { xp: true, level: true, dailyGoal: true },
    });
    if (!user) throw new Error("User not found");

    // Base XP for the action
    let xpGained = XP_RULES.ACTION_LOGGED;
    if (actionResult === "MEETING_BOOKED") {
        xpGained += XP_RULES.MEETING_BOOKED;
    } else if (actionResult === "CALLBACK_REQUESTED") {
        xpGained += XP_RULES.CALLBACK_COMPLETED;
    }

    // Check if daily goal was just met
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const actionsToday = await prisma.action.count({
        where: { sdrId: userId, createdAt: { gte: today } },
    });
    const dailyGoal = user.dailyGoal || 80;
    // Award bonus only on the exact action that meets the goal
    if (actionsToday === dailyGoal) {
        xpGained += XP_RULES.DAILY_GOAL_MET;
    }

    const newXp = user.xp + xpGained;
    const newLevel = getLevel(newXp);
    const leveledUp = newLevel > user.level;

    await prisma.user.update({
        where: { id: userId },
        data: { xp: newXp, level: newLevel },
    });

    // Check achievements
    const achievementsUnlocked = await checkAndAwardAchievements(userId);

    return {
        xpGained,
        totalXp: newXp,
        leveledUp,
        newLevel,
        achievementsUnlocked,
    };
}

// ============================================
// UPDATE STREAK
// ============================================

export async function updateStreak(
    userId: string
): Promise<{ currentStreak: number; isNewRecord: boolean }> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            currentStreak: true,
            longestStreak: true,
            lastStreakDate: true,
            dailyGoal: true,
            xp: true,
        },
    });
    if (!user) throw new Error("User not found");

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if already updated today
    if (user.lastStreakDate) {
        const lastDate = new Date(user.lastStreakDate);
        lastDate.setHours(0, 0, 0, 0);
        if (lastDate.getTime() === today.getTime()) {
            return { currentStreak: user.currentStreak, isNewRecord: false };
        }
    }

    // Check if daily goal was met today
    const actionsToday = await prisma.action.count({
        where: { sdrId: userId, createdAt: { gte: today } },
    });
    const dailyGoal = user.dailyGoal || 80;
    if (actionsToday < dailyGoal) {
        return { currentStreak: user.currentStreak, isNewRecord: false };
    }

    // Check if yesterday was also a streak day
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastStreakDate = user.lastStreakDate ? new Date(user.lastStreakDate) : null;
    let wasYesterday = false;
    if (lastStreakDate) {
        lastStreakDate.setHours(0, 0, 0, 0);
        wasYesterday = lastStreakDate.getTime() === yesterday.getTime();
    }

    const newStreak = wasYesterday ? user.currentStreak + 1 : 1;
    const isNewRecord = newStreak > user.longestStreak;

    // Streak XP bonus (capped at 30 days)
    const streakBonus = Math.min(newStreak, 30) * XP_RULES.STREAK_BONUS_PER_DAY;

    await prisma.user.update({
        where: { id: userId },
        data: {
            currentStreak: newStreak,
            longestStreak: isNewRecord ? newStreak : user.longestStreak,
            lastStreakDate: today,
            xp: user.xp + streakBonus,
            level: getLevel(user.xp + streakBonus),
        },
    });

    return { currentStreak: newStreak, isNewRecord };
}

// ============================================
// CHECK & AWARD ACHIEVEMENTS
// ============================================

async function checkAndAwardAchievements(
    userId: string
): Promise<{ code: string; name: string; icon: string; xpReward: number }[]> {
    // Get all achievements the user hasn't unlocked yet
    const unlockedCodes = (
        await prisma.userAchievement.findMany({
            where: { userId },
            select: { achievement: { select: { code: true } } },
        })
    ).map((ua) => ua.achievement.code);

    const allAchievements = await prisma.achievement.findMany();
    const locked = allAchievements.filter((a) => !unlockedCodes.includes(a.code));
    if (locked.length === 0) return [];

    // Gather metrics
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalActions, totalMeetings, dailyActions, focusSessions, user] =
        await Promise.all([
            prisma.action.count({ where: { sdrId: userId } }),
            prisma.action.count({
                where: { sdrId: userId, result: "MEETING_BOOKED" },
            }),
            prisma.action.count({
                where: { sdrId: userId, createdAt: { gte: today } },
            }),
            prisma.focusSession.count({
                where: { userId, endedAt: { not: null } },
            }),
            prisma.user.findUnique({
                where: { id: userId },
                select: { currentStreak: true, xp: true },
            }),
        ]);

    // Conversion rate (only meaningful with 100+ actions)
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

    const newlyUnlocked: { code: string; name: string; icon: string; xpReward: number }[] = [];

    for (const achievement of locked) {
        const metricValue = metricsMap[achievement.metric] ?? 0;
        if (metricValue >= achievement.threshold) {
            await prisma.userAchievement.create({
                data: { userId, achievementId: achievement.id },
            });
            // Award XP
            if (user) {
                await prisma.user.update({
                    where: { id: userId },
                    data: {
                        xp: { increment: achievement.xpReward },
                        level: getLevel((user.xp ?? 0) + achievement.xpReward),
                    },
                });
            }
            newlyUnlocked.push({
                code: achievement.code,
                name: achievement.name,
                icon: achievement.icon,
                xpReward: achievement.xpReward,
            });
        }
    }

    return newlyUnlocked;
}
