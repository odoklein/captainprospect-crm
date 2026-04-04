import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    successResponse,
    requireAuth,
    withErrorHandler,
} from "@/lib/api-utils";

const DAILY_CHALLENGES = [
    { description: "Décrochez 3 RDV aujourd'hui", metric: "meetings", target: 3 },
    { description: "Atteignez 100 actions aujourd'hui", metric: "actions", target: 100 },
    { description: "Passez 50 appels avant midi", metric: "calls", target: 50 },
    { description: "Obtenez 5 rappels programmés", metric: "callbacks", target: 5 },
    { description: "Complétez une session focus de 1h", metric: "focus", target: 1 },
    { description: "Décrochez un RDV avant 10h", metric: "early_meeting", target: 1 },
];

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const [user, actionsToday, callbacksDueToday, callbacksOverdue, yesterdayActions, yesterdayMeetings, todaySchedule] =
        await Promise.all([
            prisma.user.findUnique({
                where: { id: userId },
                select: {
                    name: true,
                    currentStreak: true,
                    longestStreak: true,
                    lastStreakDate: true,
                    dailyGoal: true,
                },
            }),
            prisma.action.count({
                where: { sdrId: userId, createdAt: { gte: today } },
            }),
            // Callbacks scheduled for today
            prisma.action.count({
                where: {
                    sdrId: userId,
                    result: "CALLBACK_REQUESTED",
                    callbackDate: {
                        gte: today,
                        lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
                    },
                },
            }),
            // Overdue callbacks (before today)
            prisma.action.count({
                where: {
                    sdrId: userId,
                    result: "CALLBACK_REQUESTED",
                    callbackDate: { lt: today },
                },
            }),
            // Yesterday's actions
            prisma.action.count({
                where: {
                    sdrId: userId,
                    createdAt: { gte: yesterday, lt: today },
                },
            }),
            // Yesterday's meetings
            prisma.action.count({
                where: {
                    sdrId: userId,
                    result: "MEETING_BOOKED",
                    createdAt: { gte: yesterday, lt: today },
                },
            }),
            // Today's assigned missions (schedule blocks)
            prisma.mission.findMany({
                where: {
                    assignedSDRs: { some: { id: userId } },
                    isActive: true,
                },
                select: {
                    id: true,
                    name: true,
                    client: { select: { name: true } },
                },
                take: 5,
            }),
        ]);

    const firstName = user?.name?.split(" ")[0] || "SDR";
    const dailyGoal = user?.dailyGoal || 80;
    const yesterdayGoalMet = yesterdayActions >= dailyGoal;

    // Streak message
    let streakMessage = "";
    const streak = user?.currentStreak ?? 0;
    if (streak > 0) {
        streakMessage = `Jour ${streak} de votre série! 🔥`;
        if (streak >= 20) streakMessage = `${streak} jours d'affilée — inarrêtable! 💪🔥`;
        else if (streak >= 10) streakMessage = `${streak} jours de suite! Continuez! 🔥`;
    }

    // Pick a daily challenge (seeded by date for consistency within the day)
    const dayIndex = Math.floor(today.getTime() / (24 * 60 * 60 * 1000));
    const challenge = DAILY_CHALLENGES[dayIndex % DAILY_CHALLENGES.length];

    // Build schedule blocks from missions
    const scheduleBlocks = todaySchedule.map((m, i) => ({
        mission: m.name,
        client: m.client?.name || null,
        startTime: `${9 + i * 2}:00`,
        endTime: `${11 + i * 2}:00`,
    }));

    const hour = new Date().getHours();
    let greeting: string;
    if (hour < 12) greeting = `Bonjour ${firstName} !`;
    else if (hour < 18) greeting = `Bon après-midi ${firstName} !`;
    else greeting = `Bonsoir ${firstName} !`;

    return successResponse({
        greeting,
        scheduleBlocks,
        callbacksDueToday,
        callbacksOverdue,
        actionsToday,
        dailyGoal,
        yesterday: {
            actions: yesterdayActions,
            meetings: yesterdayMeetings,
            goalMet: yesterdayGoalMet,
        },
        streak: {
            current: streak,
            message: streakMessage,
        },
        dailyChallenge: challenge,
    });
});
