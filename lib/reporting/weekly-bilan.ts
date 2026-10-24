import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parsePeriodRange } from "@/lib/manager-home/rules";
import { getStatsOverview } from "@/lib/stats/overview";
import { buildInsights, MIN_CALLS_FOR_RATE } from "@/lib/stats/metrics";
import { clientCountableMeetingWhere } from "@/lib/meetings/clientVisibility";
import { portalVisibleMissionWhere } from "@/lib/portal-visibility";
import { parisMidnight, addDay } from "@/lib/manager-home/today-rules";
import type { WeeklyBilanData } from "./weekly-bilan-render";
import { bilanTodoWindow } from "./weekly-bilan-week";
import type { WeeklyBilanTodo } from "@/lib/manager-home/today-slots";

// ============================================
// WEEKLY CLIENT BILAN — data
// Valentin runs his client reviews on Friday. The figures come from the same
// definitions as Statistiques (lib/stats); the RDV list shows what the client
// portal shows (SAS-confirmed, mission visible in the portal).
// ============================================

export async function collectWeeklyBilanData(
    clientId: string,
    week: { start: string; end: string; label: string },
): Promise<WeeklyBilanData> {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
    if (!client) throw new Error("Client introuvable");

    const range = parsePeriodRange(week.start, week.end);
    if (!range) throw new Error("Semaine invalide");

    const overview = await getStatsOverview(range, { clientIds: [clientId], sdrIds: [], missionIds: [], listIds: [] });
    const from = parisMidnight(week.start);
    const to = parisMidnight(addDay(week.end, 1));

    const [meetings, noteRows] = await Promise.all([
        prisma.action.findMany({
            where: {
                ...clientCountableMeetingWhere,
                createdAt: { gte: from, lt: to },
                campaign: { mission: { clientId, ...portalVisibleMissionWhere() } },
            },
            select: {
                callbackDate: true,
                company: { select: { name: true } },
                contact: { select: { title: true, company: { select: { name: true } } } },
                campaign: { select: { mission: { select: { name: true } } } },
            },
            orderBy: { callbackDate: "asc" },
            take: 50,
        }),
        prisma.action.findMany({
            where: {
                createdAt: { gte: from, lt: to },
                note: { not: null },
                campaign: { mission: { clientId } },
                channel: "CALL",
            },
            select: { note: true, result: true },
            orderBy: { createdAt: "desc" },
            take: 120,
        }),
    ]);

    const cur = overview.current;
    return {
        clientId,
        clientName: client.name,
        week,
        stats: {
            calls: cur.calls,
            previousCalls: overview.previous.calls,
            conversations: cur.joined,
            meetings: overview.rdv.confirmed + overview.rdv.pending,
            meetingsConfirmed: overview.rdv.confirmed,
            meetingsPending: overview.rdv.pending,
            prospects: cur.prospects,
            lowVolume: cur.calls < MIN_CALLS_FOR_RATE,
        },
        meetings: meetings.map((m) => ({
            company: m.company?.name ?? m.contact?.company?.name ?? "Société",
            contactTitle: m.contact?.title ?? null,
            at: m.callbackDate ? m.callbackDate.toISOString() : null,
            missionName: m.campaign?.mission?.name ?? "",
        })),
        highlights: buildInsights(overview).map((i) => `${i.title} — ${i.detail}`),
        notes: noteRows
            .filter((n) => n.note && n.note.trim().length > 15)
            .slice(0, 40)
            .map((n) => `[${n.result}] ${n.note!.trim().slice(0, 300)}`),
    };
}

/**
 * Clients whose bilan of the week is still to publish: active clients called
 * that week with no « Reporting » session dated in it. Friday → Sunday for
 * the current week; Monday for the week just ended (overdue). [] otherwise.
 */
export async function getWeeklyBilanTodos(userId: string, now: Date = new Date()): Promise<WeeklyBilanTodo[]> {
    const window = bilanTodoWindow(now);
    if (!window) return [];
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!user) return [];

    let clientFilter = Prisma.empty;
    if (user.role === "BUSINESS_DEVELOPER") {
        const links = await prisma.businessDeveloperClient.findMany({ where: { bdUserId: userId }, select: { clientId: true } });
        if (links.length === 0) return [];
        clientFilter = Prisma.sql`AND cl.id IN (${Prisma.join(links.map((l) => l.clientId))})`;
    } else if (user.role !== "MANAGER") {
        return [];
    }

    const from = parisMidnight(window.week.start);
    const to = parisMidnight(addDay(window.week.end, 3)); // Friday's bilan covers calls up to Sunday
    const rows = await prisma.$queryRaw<Array<{ clientId: string; clientName: string; calls: bigint; meetings: bigint }>>(Prisma.sql`
        SELECT cl.id AS "clientId", cl.name AS "clientName",
               COUNT(*) FILTER (WHERE a.channel::text = 'CALL') AS calls,
               COUNT(*) FILTER (WHERE a.result::text = 'MEETING_BOOKED' AND a."confirmationStatus"::text = 'CONFIRMED') AS meetings
        FROM "Action" a
        INNER JOIN "Campaign" c ON c.id = a."campaignId"
        INNER JOIN "Mission" m ON m.id = c."missionId"
        INNER JOIN "Client" cl ON cl.id = m."clientId"
        WHERE a."createdAt" >= ${from} AND a."createdAt" < ${to}
          AND cl.status::text = 'ACTIVE'
          ${clientFilter}
          AND NOT EXISTS (
            SELECT 1 FROM "ClientSession" s
            WHERE s."clientId" = cl.id AND s.type = 'Reporting'
              AND s.date >= ${from} AND s.date < ${to}
          )
        GROUP BY cl.id, cl.name
        HAVING COUNT(*) FILTER (WHERE a.channel::text = 'CALL') > 0
        ORDER BY meetings DESC, calls DESC
        LIMIT 30
    `);

    return rows.map((r) => ({
        clientId: r.clientId,
        clientName: r.clientName,
        weekStart: window.week.start,
        weekEnd: window.week.end,
        calls: Number(r.calls),
        meetings: Number(r.meetings),
        overdue: window.overdue,
        href: `/manager/clients/${r.clientId}?bilan=${window.week.start}`,
    }));
}
