import { NextRequest } from "next/server";
import { DateTime } from "luxon";
import { prisma } from "@/lib/prisma";
import { requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { APP_TIMEZONE } from "@/lib/manager-home/rules";
import { computeListReadiness, defaultCampaignOf, summarizeReadiness, type ReadinessCampaign } from "@/lib/missions/readiness";
import { isReached } from "@/lib/workspace/status-family";
import type { MissionPulseRow } from "@/lib/missions/board";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHANNELS = ["CALL", "EMAIL", "LINKEDIN"] as const;
type ChannelValue = (typeof CHANNELS)[number];

/**
 * GET /api/manager/missions/pulse?channel=CALL
 * The rail of « Appels » (/manager/prospection): every running or paused
 * mission on that channel, with what a manager triages on — meetings against
 * the target (for the pace), today's activity, who acted on it today and
 * when, and whether its lists are ready. Sorting is the client's job
 * (lib/missions/board).
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);
    const raw = (new URL(request.url).searchParams.get("channel") ?? "CALL").toUpperCase();
    const channel: ChannelValue = (CHANNELS as readonly string[]).includes(raw) ? (raw as ChannelValue) : "CALL";

    const missions = await prisma.mission.findMany({
        where: { status: { in: ["ACTIVE", "PAUSED"] }, channels: { has: channel } },
        orderBy: { name: "asc" },
        take: 200,
        select: {
            id: true,
            name: true,
            status: true,
            channels: true,
            targetMeetings: true,
            startDate: true,
            endDate: true,
            client: { select: { id: true, name: true } },
            sdrAssignments: { select: { sdr: { select: { id: true, name: true } } } },
            campaigns: { select: { id: true, name: true, icp: true, pitch: true, script: true, isActive: true, missionId: true } },
            lists: {
                select: {
                    id: true,
                    isActive: true,
                    isArchived: true,
                    campaign: { select: { id: true, name: true, icp: true, pitch: true, script: true, isActive: true } },
                },
            },
        },
    });
    if (missions.length === 0) return successResponse([] as MissionPulseRow[]);

    const campaignMission = new Map<string, string>();
    for (const m of missions) for (const c of m.campaigns) campaignMission.set(c.id, m.id);
    const campaignIds = [...campaignMission.keys()];
    const dayStart = DateTime.now().setZone(APP_TIMEZONE).startOf("day").toJSDate();

    const [meetings, todayByResult, todayBySdr, defs] = await Promise.all([
        prisma.action.groupBy({ by: ["campaignId"], where: { campaignId: { in: campaignIds }, result: "MEETING_BOOKED" }, _count: { _all: true } }),
        prisma.action.groupBy({
            by: ["campaignId", "result"],
            where: { campaignId: { in: campaignIds }, channel, createdAt: { gte: dayStart } },
            _count: { _all: true },
        }),
        prisma.action.groupBy({
            by: ["campaignId", "sdrId"],
            where: { campaignId: { in: campaignIds }, channel, createdAt: { gte: dayStart } },
            _max: { createdAt: true },
        }),
        prisma.actionStatusDefinition.findMany({ where: { scopeType: "GLOBAL", isActive: true }, select: { code: true, resultCategoryCode: true } }),
    ]);
    const categoryOf = new Map(defs.map((d) => [d.code, d.resultCategoryCode]));

    const meetingsOf = new Map<string, number>();
    for (const g of meetings) {
        const m = campaignMission.get(g.campaignId);
        if (m) meetingsOf.set(m, (meetingsOf.get(m) ?? 0) + g._count._all);
    }
    const today = new Map<string, MissionPulseRow["today"]>();
    for (const g of todayByResult) {
        const m = campaignMission.get(g.campaignId);
        if (!m) continue;
        const t = today.get(m) ?? { actions: 0, reached: 0, meetings: 0 };
        t.actions += g._count._all;
        if (isReached(g.result, categoryOf.get(g.result))) t.reached += g._count._all;
        if (g.result === "MEETING_BOOKED") t.meetings += g._count._all;
        today.set(m, t);
    }
    // Last action today per (mission, SDR): an SDR can act on a mission without being assigned to it.
    const lastAt = new Map<string, Map<string, Date>>();
    for (const g of todayBySdr) {
        const m = campaignMission.get(g.campaignId);
        if (!m || !g._max.createdAt) continue;
        const bySdr = lastAt.get(m) ?? new Map<string, Date>();
        const cur = bySdr.get(g.sdrId);
        if (!cur || g._max.createdAt > cur) bySdr.set(g.sdrId, g._max.createdAt);
        lastAt.set(m, bySdr);
    }

    const rows: MissionPulseRow[] = missions.map((m) => {
        const defaultCampaign = defaultCampaignOf(m.campaigns) as ReadinessCampaign;
        const readiness = summarizeReadiness(
            m.lists.map((l) => ({ ...l, readiness: computeListReadiness(l.campaign as ReadinessCampaign, defaultCampaign) })),
        );
        const acted = lastAt.get(m.id) ?? new Map<string, Date>();
        const sdrs = m.sdrAssignments.map(({ sdr }) => ({ id: sdr.id, name: sdr.name, lastActionAt: acted.get(sdr.id)?.toISOString() ?? null }));
        // Most recent first, so the avatars a manager sees are the people on it now.
        sdrs.sort((a, b) => (b.lastActionAt ?? "").localeCompare(a.lastActionAt ?? "") || a.name.localeCompare(b.name, "fr"));
        return {
            id: m.id,
            name: m.name,
            client: m.client ? { id: m.client.id, name: m.client.name } : null,
            channels: m.channels,
            status: m.status,
            targetMeetings: m.targetMeetings,
            startDate: m.startDate?.toISOString() ?? null,
            endDate: m.endDate?.toISOString() ?? null,
            meetings: meetingsOf.get(m.id) ?? 0,
            today: today.get(m.id) ?? { actions: 0, reached: 0, meetings: 0 },
            sdrs,
            activeLists: readiness.activeLists,
            readyLists: readiness.readyLists,
        };
    });
    return successResponse(rows);
});
