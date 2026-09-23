import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse, requirePlanningAccess, withErrorHandler } from '@/lib/api-utils';

/**
 * GET /api/planning/month?month=2026-02
 *
 * Returns a full planning snapshot for a given month:
 * - All active missions with their MissionMonthPlan + SdrDayAllocation for that month
 * - All SDRs with their SdrMonthCapacity + SdrAbsences for that month
 * - All unresolved PlanningConflicts for that month
 * - Health summary (mission/SDR counts by status)
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
    await requirePlanningAccess(request);
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
        return errorResponse('Paramètre month requis (format YYYY-MM)', 400);
    }

    const [y, m] = month.split('-').map(Number);
    const monthStart = new Date(y, m - 1, 1);
    const monthEnd = new Date(y, m, 0);

    // -----------------------------------------------
    // 1. Missions active this month
    // -----------------------------------------------
    const missions = await prisma.mission.findMany({
        where: {
            isActive: true,
            startDate: { lte: monthEnd },
            endDate: { gte: monthStart },
        },
        select: {
            id: true,
            name: true,
            channel: true,
            channels: true,
            startDate: true,
            endDate: true,
            totalContractDays: true,
            teamLeadSdrId: true,
            client: { select: { id: true, name: true } },
            sdrAssignments: {
                include: { sdr: { select: { id: true, name: true } } },
            },
            missionMonthPlans: {
                orderBy: { month: 'asc' },
                include: {
                    allocations: {
                        include: { sdr: { select: { id: true, name: true } } },
                    },
                },
            },
        },
        orderBy: { name: 'asc' },
    });

    // -----------------------------------------------
    // 2. SDRs (active SDRs and BDs) with capacity
    // -----------------------------------------------
    const sdrs = await prisma.user.findMany({
        where: {
            isActive: true,
            role: { in: ['SDR', 'BUSINESS_DEVELOPER'] },
        },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            sdrMonthCapacities: {
                where: { month },
            },
            sdrAbsences: {
                where: {
                    startDate: { lte: monthEnd },
                    endDate: { gte: monthStart },
                },
                orderBy: { startDate: 'asc' },
            },
            sdrDayAllocations: {
                where: { missionMonthPlan: { month } },
                include: {
                    missionMonthPlan: {
                        include: { mission: { select: { id: true, name: true } } },
                    },
                },
            },
        },
        orderBy: { name: 'asc' },
    });

    // -----------------------------------------------
    // 3. ScheduleBlock details for this month
    //    - Used both for blocksBySdrMission and calendar views (MonthCalendar)
    // -----------------------------------------------
    const liveBlockFilter = {
        status: { not: 'CANCELLED' as const },
        OR: [
            { suggestionStatus: null },
            { suggestionStatus: 'SUGGESTED' as const },
            { suggestionStatus: 'CONFIRMED' as const },
        ],
    };
    const blockSelect = {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        status: true,
        suggestionStatus: true,
        notes: true,
        sdrId: true,
        missionId: true,
        allocationId: true,
        sdr: {
            select: { id: true, name: true, email: true, role: true },
        },
        mission: {
            select: {
                id: true,
                name: true,
                channel: true,
                client: { select: { id: true, name: true } },
            },
        },
        createdBy: {
            select: { id: true, name: true },
        },
    } as const;

    const blocks = await prisma.scheduleBlock.findMany({
        where: { date: { gte: monthStart, lte: monthEnd }, ...liveBlockFilter },
        select: blockSelect,
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });

    // The calendar grid shows whole Monday→Sunday weeks, so its first and last
    // weeks spill into the neighbouring months. Those days used to render as
    // "Libre" even when missions were booked on them. They are fetched apart
    // from `blocks` on purpose: `blocks` feeds the month's own totals
    // (blocksBySdrMission, monthScheduledDays), which must stay month-only.
    const gridStart = new Date(monthStart);
    gridStart.setDate(gridStart.getDate() - ((monthStart.getDay() + 6) % 7));
    const gridEnd = new Date(monthEnd);
    gridEnd.setDate(gridEnd.getDate() + ((7 - monthEnd.getDay()) % 7));

    const edgeRanges = [
        ...(gridStart < monthStart ? [{ date: { gte: gridStart, lt: monthStart } }] : []),
        ...(gridEnd > monthEnd ? [{ date: { gt: monthEnd, lte: gridEnd } }] : []),
    ];
    const edgeBlocks = edgeRanges.length === 0
        ? []
        : await prisma.scheduleBlock.findMany({
            where: { AND: [liveBlockFilter, { OR: edgeRanges }] },
            select: blockSelect,
            orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        });

    // Build blocksBySdrMission map: sdrId+missionId -> count
    const blocksBySdrMission: Record<string, number> = {};
    for (const b of blocks) {
        const key = `${b.sdrId}::${b.missionId}`;
        blocksBySdrMission[key] = (blocksBySdrMission[key] ?? 0) + 1;
    }

    // Group blocks by date string (YYYY-MM-DD) for calendar views
    const blocksByDate: Record<string, typeof blocks> = {};
    for (const block of [...blocks, ...edgeBlocks]) {
        const dateKey = block.date.toISOString().slice(0, 10);
        if (!blocksByDate[dateKey]) blocksByDate[dateKey] = [];
        blocksByDate[dateKey].push(block);
    }

    // -----------------------------------------------
    // 4. Unresolved conflicts for this month
    // -----------------------------------------------
    const conflicts = await prisma.planningConflict.findMany({
        where: { month, resolvedAt: null },
        orderBy: [{ severity: 'asc' }, { createdAt: 'asc' }],
    });

    const conflictSummary = {
        P0: conflicts.filter((c) => c.severity === 'P0').length,
        P1: conflicts.filter((c) => c.severity === 'P1').length,
        P2: conflicts.filter((c) => c.severity === 'P2').length,
        total: conflicts.length,
    };

    // -----------------------------------------------
    // 5. Health summary
    // -----------------------------------------------
    let missionsActive = 0;
    let missionsUnderstaffed = 0;
    let missionsNoSdr = 0;
    let missionsComplete = 0;

    for (const mission of missions) {
        const plan = mission.missionMonthPlans.find((p) => p.month === month);
        if (!plan) {
            missionsNoSdr++;
            continue;
        }
        const totalAllocated = plan.allocations.reduce((s: number, a: { allocatedDays: number }) => s + a.allocatedDays, 0);
        if (plan.allocations.length === 0 || totalAllocated === 0) {
            missionsNoSdr++;
        } else if (totalAllocated < plan.targetDays) {
            missionsUnderstaffed++;
        } else {
            missionsComplete++;
        }
        missionsActive++;
    }

    let sdrsOptimal = 0;
    let sdrsOverloaded = 0;
    let sdrsUnderutilized = 0;

    for (const sdr of sdrs) {
        const capacity = sdr.sdrMonthCapacities[0];
        const totalAllocated = sdr.sdrDayAllocations.reduce((s, a) => s + a.allocatedDays, 0);
        if (!capacity || capacity.effectiveAvailableDays === 0) continue;
        const pct = totalAllocated / capacity.effectiveAvailableDays;
        if (pct > 1) sdrsOverloaded++;
        else if (pct < 0.5) sdrsUnderutilized++;
        else sdrsOptimal++;
    }

    const healthSummary = {
        missions: {
            active: missionsActive,
            understaffed: missionsUnderstaffed,
            noSdr: missionsNoSdr,
            complete: missionsComplete,
        },
        sdrs: {
            optimal: sdrsOptimal,
            overloaded: sdrsOverloaded,
            underutilized: sdrsUnderutilized,
        },
    };

    // Slimmed-down team list for calendar usage
    const team = sdrs.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        role: s.role,
    }));

    return successResponse({
        month,
        missions,
        sdrs,
        daysInMonth: monthEnd.getDate(),
        blocks,
        edgeBlocks,
        blocksByDate,
        team,
        blocksBySdrMission,
        conflicts,
        conflictSummary,
        healthSummary,
    });
});
