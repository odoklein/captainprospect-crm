/**
 * Server-only: fetch all data needed for client report.
 * Used by GET /api/client/reporting/data and PDF generation.
 */

import { prisma } from "@/lib/prisma";
import { portalVisibleMissionWhere } from "@/lib/portal-visibility";

const QUALIFIED_RESULTS = ["INTERESTED", "CALLBACK_REQUESTED", "MEETING_BOOKED"] as const;

export interface GetReportDataParams {
    clientId: string;
    dateFrom: Date;
    dateTo: Date;
    missionId: string | null;
    comparePrevious: boolean;
}

export interface GetReportDataResult {
    client: { name: string; logo: string | null };
    missions: Array<{
        id: string;
        name: string;
        isActive: boolean;
        objective: string | null;
        startDate: Date;
        endDate: Date;
        _count: { sdrAssignments: number };
    }>;
    contactsReached: number;
    qualifiedLeads: number;
    meetingsBooked: number;
    opportunities: number;
    conversionRate: number;
    meetingsByPeriod: Array<{ label: string; count: number }>;
    prevStats: {
        contactsReached: number;
        qualifiedLeads: number;
        meetingsBooked: number;
        conversionRate: number;
    } | null;
}

export async function getReportData(params: GetReportDataParams): Promise<GetReportDataResult | null> {
    const { clientId, dateFrom, dateTo, missionId, comparePrevious } = params;

    const dateFromDate = new Date(dateFrom);
    const dateToDate = new Date(dateTo);
    dateFromDate.setHours(0, 0, 0, 0);
    dateToDate.setHours(23, 59, 59, 999);

    const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { id: true, name: true, logo: true },
    });
    if (!client) return null;

    const missions = await prisma.mission.findMany({
        where: {
            clientId,
            AND: [portalVisibleMissionWhere()],
            ...(missionId ? { id: missionId } : {}),
        },
        select: {
            id: true,
            name: true,
            isActive: true,
            objective: true,
            startDate: true,
            endDate: true,
            _count: { select: { sdrAssignments: true } },
        },
    });

    if (missionId && missions.length === 0) return null;

    const missionIds = missions.map((m) => m.id);
    if (missionIds.length === 0) {
        return {
            client,
            missions: [],
            contactsReached: 0,
            qualifiedLeads: 0,
            meetingsBooked: 0,
            opportunities: 0,
            conversionRate: 0,
            meetingsByPeriod: [],
            prevStats: null,
        };
    }

    const campaignIds = await prisma.campaign
        .findMany({
            where: { missionId: { in: missionIds } },
            select: { id: true },
        })
        .then((list) => list.map((c) => c.id));

    if (campaignIds.length === 0) {
        return {
            client,
            missions,
            contactsReached: 0,
            qualifiedLeads: 0,
            meetingsBooked: 0,
            opportunities: 0,
            conversionRate: 0,
            meetingsByPeriod: [],
            prevStats: null,
        };
    }

    const [actionsInPeriod, meetingsBookedCount, opportunitiesCount, meetingsActions] = await Promise.all([
        prisma.action.findMany({
            where: {
                campaignId: { in: campaignIds },
                createdAt: { gte: dateFromDate, lte: dateToDate },
            },
            select: {
                id: true,
                contactId: true,
                companyId: true,
                result: true,
                createdAt: true,
            },
        }),
        prisma.action.count({
            where: {
                campaignId: { in: campaignIds },
                result: "MEETING_BOOKED",
                createdAt: { gte: dateFromDate, lte: dateToDate },
            },
        }),
        prisma.opportunity.count({
            where: {
                contact: {
                    company: {
                        list: { missionId: { in: missionIds } },
                    },
                },
                createdAt: { gte: dateFromDate, lte: dateToDate },
            },
        }),
        prisma.action.findMany({
            where: {
                campaignId: { in: campaignIds },
                result: "MEETING_BOOKED",
                createdAt: { gte: dateFromDate, lte: dateToDate },
            },
            select: { createdAt: true },
        }),
    ]);

    const byMonth = new Map<string, number>();
    for (const a of meetingsActions) {
        const d = new Date(a.createdAt);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
    }
    const meetingsByPeriod = Array.from(byMonth.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([label, count]) => ({
            label: label.slice(5) + "/" + label.slice(0, 4),
            count,
        }));

    const contactIdsReached = new Set<string>();
    const contactIdsQualified = new Set<string>();
    for (const a of actionsInPeriod) {
        if (a.contactId) {
            contactIdsReached.add(a.contactId);
            if (QUALIFIED_RESULTS.includes(a.result as (typeof QUALIFIED_RESULTS)[number])) {
                contactIdsQualified.add(a.contactId);
            }
        } else if (a.companyId) {
            contactIdsReached.add(`company:${a.companyId}`);
        }
    }

    const contactsReached = contactIdsReached.size;
    const qualifiedLeads = contactIdsQualified.size;
    const conversionRate =
        contactsReached > 0 ? Math.round((meetingsBookedCount / contactsReached) * 1000) / 10 : 0;

    let prevStats: GetReportDataResult["prevStats"] = null;
    if (comparePrevious) {
        const periodMs = dateToDate.getTime() - dateFromDate.getTime();
        const prevDateTo = new Date(dateFromDate);
        prevDateTo.setDate(prevDateTo.getDate() - 1);
        prevDateTo.setHours(23, 59, 59, 999);
        const prevDateFrom = new Date(prevDateTo.getTime() - periodMs);
        prevDateFrom.setHours(0, 0, 0, 0);
        if (prevDateFrom.getTime() < dateFromDate.getTime()) {
            const [prevActions, prevMeetingsCount] = await Promise.all([
                prisma.action.findMany({
                    where: {
                        campaignId: { in: campaignIds },
                        createdAt: { gte: prevDateFrom, lte: prevDateTo },
                    },
                    select: { contactId: true, companyId: true, result: true },
                }),
                prisma.action.count({
                    where: {
                        campaignId: { in: campaignIds },
                        result: "MEETING_BOOKED",
                        createdAt: { gte: prevDateFrom, lte: prevDateTo },
                    },
                }),
            ]);
            const prevContactIds = new Set<string>();
            const prevQualifiedIds = new Set<string>();
            for (const a of prevActions) {
                if (a.contactId) {
                    prevContactIds.add(a.contactId);
                    if (QUALIFIED_RESULTS.includes(a.result as (typeof QUALIFIED_RESULTS)[number])) {
                        prevQualifiedIds.add(a.contactId);
                    }
                } else if (a.companyId) prevContactIds.add(`company:${a.companyId}`);
            }
            const prevContactsReached = prevContactIds.size;
            prevStats = {
                contactsReached: prevContactsReached,
                qualifiedLeads: prevQualifiedIds.size,
                meetingsBooked: prevMeetingsCount,
                conversionRate:
                    prevContactsReached > 0
                        ? Math.round((prevMeetingsCount / prevContactsReached) * 1000) / 10
                        : 0,
            };
        }
    }

    return {
        client,
        missions,
        contactsReached,
        qualifiedLeads,
        meetingsBooked: meetingsBookedCount,
        opportunities: opportunitiesCount,
        conversionRate,
        meetingsByPeriod,
        prevStats,
    };
}

/** Transform getReportData result + dates into ReportData for API/UI. */
export function toReportData(
    raw: GetReportDataResult,
    dateFrom: Date,
    dateTo: Date
): import("@/lib/reporting/types").ReportData {
    const missionLabel =
        raw.missions.length === 1 ? raw.missions[0].name : "Toutes les missions";
    const periodLabel = `${dateFrom.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
    })} – ${dateTo.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
    })}`;
    const generatedDate = new Date().toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
    });

    const pct = (curr: number, prev: number) =>
        prev > 0 ? Math.round(((curr - prev) / prev) * 100) : null;
    const meetingsDelta =
        raw.prevStats && raw.prevStats.meetingsBooked > 0
            ? Math.round(
                  ((raw.meetingsBooked - raw.prevStats.meetingsBooked) / raw.prevStats.meetingsBooked) * 100
              )
            : undefined;
    const deltas: import("@/lib/reporting/types").ReportData["deltas"] = raw.prevStats
        ? [
              pct(raw.contactsReached, raw.prevStats.contactsReached),
              pct(raw.qualifiedLeads, raw.prevStats.qualifiedLeads),
              pct(raw.meetingsBooked, raw.prevStats.meetingsBooked),
              raw.prevStats.conversionRate > 0
                  ? Math.round(raw.conversionRate - raw.prevStats.conversionRate)
                  : null,
          ]
        : undefined;

    return {
        clientName: raw.client.name,
        missionLabel,
        periodLabel,
        generatedDate,
        meetingsBooked: raw.meetingsBooked,
        meetingsDelta,
        contactsReached: raw.contactsReached,
        qualifiedLeads: raw.qualifiedLeads,
        opportunities: raw.opportunities,
        conversionRate: raw.conversionRate,
        deltas,
        meetingsByPeriod: raw.meetingsByPeriod,
        missions: raw.missions.map((m) => ({
            id: m.id,
            name: m.name,
            isActive: m.isActive,
            objective: m.objective,
            startDate: m.startDate.toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "short",
                year: "numeric",
            }),
            endDate: m.endDate.toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "short",
                year: "numeric",
            }),
            sdrCount: m._count.sdrAssignments,
        })),
    };
}

