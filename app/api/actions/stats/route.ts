import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DateTime } from "luxon";

// ============================================
// GET /api/actions/stats
// Returns action statistics per user for team dashboard (bulk queries, no N+1)
// ============================================

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json(
                { success: false, error: "Non autorisé" },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(request.url);
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");
        const userId = searchParams.get("userId");

        const dateFilter: { gte?: Date; lte?: Date } = {};
        if (startDate) dateFilter.gte = new Date(startDate);
        if (endDate) dateFilter.lte = new Date(endDate);
        const hasDateFilter = Object.keys(dateFilter).length > 0;

        // Anchored to Europe/Paris (not server-local time) and to luxon's ISO
        // week (Monday start), so "this week" doesn't jump to tomorrow on
        // Sundays and "this month" matches the calendar month the télépro is
        // actually in.
        const nowParis = DateTime.now().setZone("Europe/Paris");
        const startOfWeek = nowParis.startOf("week").toJSDate();
        const startOfDay = nowParis.startOf("day").toJSDate();
        const startOfMonth = nowParis.startOf("month").toJSDate();

        const users = await prisma.user.findMany({
            where: {
                role: { in: ["SDR", "BUSINESS_DEVELOPER"] },
                isActive: true,
                ...(userId ? { id: userId } : {}),
            },
            select: { id: true, name: true },
        });
        const userIds = users.map((u) => u.id);
        if (userIds.length === 0) {
            return NextResponse.json({
                success: true,
                data: {},
                teamStats: { totalCalls: 0, totalMeetings: 0, weeklyTotal: 0, weeklyMeetings: 0 },
            });
        }

        const sdrWhere = { sdrId: { in: userIds } };

        // Bulk queries: 4 groupBy + 1 findMany (no N+1)
        const [rangeGroup, weekGroup, dayGroup, monthGroup, actionsForMission] = await Promise.all([
            hasDateFilter
                ? prisma.action.groupBy({
                    by: ["sdrId", "result"],
                    where: { ...sdrWhere, createdAt: dateFilter },
                    _count: true,
                })
                : prisma.action.groupBy({
                    by: ["sdrId", "result"],
                    where: sdrWhere,
                    _count: true,
                }),
            prisma.action.groupBy({
                by: ["sdrId", "result"],
                where: { ...sdrWhere, createdAt: { gte: startOfWeek } },
                _count: true,
            }),
            prisma.action.groupBy({
                by: ["sdrId", "result"],
                where: { ...sdrWhere, createdAt: { gte: startOfDay } },
                _count: true,
            }),
            prisma.action.groupBy({
                by: ["sdrId", "result"],
                where: { ...sdrWhere, createdAt: { gte: startOfMonth } },
                _count: true,
            }),
            prisma.action.findMany({
                where: {
                    ...sdrWhere,
                    ...(hasDateFilter && { createdAt: dateFilter }),
                },
                select: {
                    sdrId: true,
                    result: true,
                    campaign: {
                        select: {
                            missionId: true,
                            mission: { select: { name: true } },
                        },
                    },
                },
            }),
        ]);

        // Aggregate groupBy results per user
        function agg(rows: { sdrId: string; result: string; _count: number }[]) {
            const byUser: Record<string, { total: number; MEETING_BOOKED: number; byResult: Record<string, number> }> = {};
            for (const r of rows) {
                if (!byUser[r.sdrId]) {
                    byUser[r.sdrId] = { total: 0, MEETING_BOOKED: 0, byResult: {} };
                }
                byUser[r.sdrId].total += r._count;
                byUser[r.sdrId].byResult[r.result] = r._count;
                if (r.result === "MEETING_BOOKED") byUser[r.sdrId].MEETING_BOOKED += r._count;
            }
            return byUser;
        }

        const rangeAgg = agg(rangeGroup.map((g) => ({ sdrId: g.sdrId, result: g.result, _count: g._count })));
        const weekAgg = agg(weekGroup.map((g) => ({ sdrId: g.sdrId, result: g.result, _count: g._count })));
        const dayAgg = agg(dayGroup.map((g) => ({ sdrId: g.sdrId, result: g.result, _count: g._count })));
        const monthAgg = agg(monthGroup.map((g) => ({ sdrId: g.sdrId, result: g.result, _count: g._count })));

        const missionMap = new Map<string, Record<string, { missionId: string; missionName: string; calls: number; meetings: number }>>();
        for (const a of actionsForMission) {
            const missionId = a.campaign?.missionId ?? "";
            const missionName = a.campaign?.mission?.name ?? "Mission";
            if (!missionId) continue;
            if (!missionMap.has(a.sdrId)) missionMap.set(a.sdrId, {});
            const userMissions = missionMap.get(a.sdrId)!;
            const existing = userMissions[missionId];
            if (existing) {
                existing.calls += 1;
                if (a.result === "MEETING_BOOKED") existing.meetings += 1;
            } else {
                userMissions[missionId] = { missionId, missionName, calls: 1, meetings: a.result === "MEETING_BOOKED" ? 1 : 0 };
            }
        }

        const userStats: Record<string, any> = {};
        for (const user of users) {
            const r = rangeAgg[user.id];
            const w = weekAgg[user.id];
            const d = dayAgg[user.id];
            const m = monthAgg[user.id];
            const totalActions = r?.total ?? 0;
            const meetingsBooked = r?.MEETING_BOOKED ?? 0;
            const conversionRate = totalActions > 0 ? ((meetingsBooked / totalActions) * 100).toFixed(1) : 0;
            const byMission = missionMap.get(user.id) ? Object.values(missionMap.get(user.id)!) : [];

            userStats[user.id] = {
                userId: user.id,
                userName: user.name,
                totalActions,
                meetingsBooked,
                interested: r?.byResult?.INTERESTED ?? 0,
                callbacks: r?.byResult?.CALLBACK_REQUESTED ?? 0,
                conversionRate: Number(conversionRate),
                callsThisWeek: w?.total ?? 0,
                meetingsThisWeek: w?.MEETING_BOOKED ?? 0,
                callsToday: d?.total ?? 0,
                meetingsToday: d?.MEETING_BOOKED ?? 0,
                resultBreakdownToday: d?.byResult ? Object.entries(d.byResult).map(([result, count]) => ({ result, count })) : [],
                callsThisMonth: m?.total ?? 0,
                meetingsThisMonth: m?.MEETING_BOOKED ?? 0,
                byMission,
            };
        }

        const teamStats = {
            totalCalls: Object.values(userStats).reduce((sum: number, u: any) => sum + u.totalActions, 0),
            totalMeetings: Object.values(userStats).reduce((sum: number, u: any) => sum + u.meetingsBooked, 0),
            weeklyTotal: Object.values(userStats).reduce((sum: number, u: any) => sum + u.callsThisWeek, 0),
            weeklyMeetings: Object.values(userStats).reduce((sum: number, u: any) => sum + u.meetingsThisWeek, 0),
        };

        return NextResponse.json(
            { success: true, data: userStats, teamStats },
            {
                headers: {
                    "Cache-Control": "private, s-maxage=15, stale-while-revalidate=30",
                },
            }
        );
    } catch (error) {
        console.error("[GET /api/actions/stats] Error:", error);
        return NextResponse.json(
            { success: false, error: "Erreur serveur" },
            { status: 500 }
        );
    }
}
