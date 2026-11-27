// The SQL half of « La lettre de la semaine » (lib/client-portal/letter.ts):
// loads what the rules count, scoped to one client's running, portal-visible
// missions. Counting stays in the pure module.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { portalVisibleMissionWhere } from "@/lib/portal-visibility";
import { RESULT_META } from "@/lib/api-v1/glossary";
import {
    DISPOSITIONS,
    confirmedOn,
    cutoffLabel,
    funnelSteps,
    invoicedCost,
    isConfirmedNow,
    isHeldPending,
    letterHeadline,
    letterWeek,
    monthOf,
    monthPace,
    monthsLabel,
    prospectSnapshot,
    roi as computeRoi,
    shortDate,
    snapshotCutoff,
    weekRangeLabel,
    weeklyConfirmed,
    MAX_WEEKS,
    type ClientLetter,
    type InvoicedCost,
    type LetterMeeting,
    type LetterUpcomingMeeting,
    type ProspectSnapshot,
    type ProspectTouch,
    type StatusDictionary,
    type StatusMeaning,
} from "./letter";

/** The Monday snapshot holds still for the week: computed once per client and cutoff, kept this long. */
const SNAPSHOT_TTL_MS = 10 * 60_000;
const snapshotCache = new Map<string, { expires: number; value: Promise<{ snapshot: ProspectSnapshot; invested: InvoicedCost | null }> }>();

function cachedSnapshot(
    key: string,
    compute: () => Promise<{ snapshot: ProspectSnapshot; invested: InvoicedCost | null }>,
): Promise<{ snapshot: ProspectSnapshot; invested: InvoicedCost | null }> {
    const at = Date.now();
    const hit = snapshotCache.get(key);
    if (hit && hit.expires > at) return hit.value;
    const value = compute();
    value.catch(() => snapshotCache.delete(key));
    snapshotCache.set(key, { expires: at + SNAPSHOT_TTL_MS, value });
    if (snapshotCache.size > 500) for (const [k, v] of snapshotCache) if (v.expires <= at) snapshotCache.delete(k);
    return value;
}

/** Missions the letter reports on: running (active or paused) and visible on the portal. */
export function letterMissionWhere(clientId: string, now: Date): Prisma.MissionWhereInput {
    return { clientId, status: { in: ["ACTIVE", "PAUSED"] }, AND: [portalVisibleMissionWhere(now)] };
}

const MEETING_FORMAT: Record<string, string> = { VISIO: "Visio", PHYSIQUE: "Sur site", TELEPHONIQUE: "Téléphone" };
const UPCOMING_LIMIT = 6;
const SCOPE_RANK: Record<string, number> = { GLOBAL: 0, CLIENT: 1, MISSION: 2 };

/** Status meaning per mission, most specific scope first (MISSION > CLIENT > GLOBAL), as StatusConfigService merges them. */
async function loadDictionary(clientId: string, missionIds: string[]): Promise<StatusDictionary> {
    const defs = await prisma.actionStatusDefinition.findMany({
        where: {
            isActive: true,
            OR: [
                { scopeType: "GLOBAL" },
                { scopeType: "CLIENT", scopeId: clientId },
                { scopeType: "MISSION", scopeId: { in: missionIds } },
            ],
        },
        select: { scopeType: true, scopeId: true, code: true, label: true, resultCategoryCode: true },
    });
    const ranked = new Map<string, { rank: number; meaning: StatusMeaning }>();
    for (const d of defs) {
        const key = `${d.scopeType === "MISSION" ? d.scopeId : "*"}|${d.code}`;
        const rank = SCOPE_RANK[d.scopeType] ?? 0;
        const prev = ranked.get(key);
        if (!prev || rank > prev.rank) ranked.set(key, { rank, meaning: { label: d.label, category: d.resultCategoryCode } });
    }
    return (missionId, code) => {
        const meaning = ranked.get(`${missionId}|${code}`)?.meaning ?? ranked.get(`*|${code}`)?.meaning;
        // The client reads the shared glossary's wording (« Refus argumenté »), the same for every
        // agency; the configured label is the SDR-side shorthand and only fills a gap.
        const glossary = (RESULT_META as Record<string, { label: string } | undefined>)[code]?.label.replace(/\s*\(ancien code\)$/, "");
        return { label: glossary || meaning?.label || null, category: meaning?.category ?? null };
    };
}

async function loadTouches(missionIds: string[], cutoff: Date): Promise<ProspectTouch[]> {
    const rows = await prisma.$queryRaw<Array<{ missionId: string; prospect: string; code: string; lastAt: Date }>>(Prisma.sql`
        SELECT c."missionId" AS "missionId",
               COALESCE(a."contactId", a."companyId") AS prospect,
               a."result"::text AS code,
               MAX(a."createdAt") AS "lastAt"
        FROM "Action" a
        JOIN "Campaign" c ON c.id = a."campaignId"
        WHERE c."missionId" = ANY(${missionIds})
          AND a."createdAt" < ${cutoff}
          AND COALESCE(a."contactId", a."companyId") IS NOT NULL
        GROUP BY 1, 2, 3
    `);
    return rows.map((r) => ({ missionId: r.missionId, prospect: r.prospect, code: r.code, lastAt: new Date(r.lastAt) }));
}

/**
 * Contacts in the missions' active lists (the base of lib/missions fetchProspectCount),
 * as they stood at the cutoff: a contact added since waits for next Monday, unless it
 * was already called before the cutoff (a re-imported row keeps its history).
 */
async function loadBase(missionIds: string[], cutoff: Date): Promise<number> {
    const rows = await prisma.$queryRaw<Array<{ n: number }>>(Prisma.sql`
        SELECT COUNT(ct.id)::int AS n
        FROM "Contact" ct
        JOIN "Company" co ON co.id = ct."companyId"
        JOIN "List" l ON l.id = co."listId"
        WHERE l."missionId" = ANY(${missionIds})
          AND l."isActive" = true AND l."isArchived" = false
          AND (ct."createdAt" < ${cutoff}
               OR EXISTS (SELECT 1 FROM "Action" a WHERE a."contactId" = ct.id AND a."createdAt" < ${cutoff}))
    `);
    return Number(rows[0]?.n ?? 0);
}

function personName(c: { firstName: string | null; lastName: string | null } | null): string {
    return c ? [c.firstName, c.lastName].filter(Boolean).join(" ") || "Contact" : "Contact entreprise";
}

/** Questionnaire answer « Panier moyen » (free text), shown as a reminder next to the input. */
function onboardingDealValue(data: unknown): string | null {
    const value = (data as { clientQuestionnaire?: { company?: { dealValue?: unknown } } } | null)?.clientQuestionnaire?.company?.dealValue;
    return typeof value === "string" && value.trim() ? value.trim().slice(0, 120) : null;
}

export async function buildClientLetter(clientId: string, now: Date = new Date()): Promise<ClientLetter> {
    const cutoff = snapshotCutoff(now);
    const week = letterWeek(cutoff);
    const month = monthOf(now);

    const [missions, client] = await Promise.all([
        prisma.mission.findMany({
            where: letterMissionWhere(clientId, now),
            select: {
                id: true, name: true, status: true, startDate: true, endDate: true, targetMeetings: true,
                sdrAssignments: { select: { sdrId: true } },
            },
            orderBy: { startDate: "asc" },
        }),
        prisma.client.findUnique({
            where: { id: clientId },
            select: {
                portalAvgDealValue: true,
                portalMeetingToOppRate: true,
                portalAssumptionsUpdatedAt: true,
                onboarding: { select: { onboardingData: true } },
            },
        }),
    ]);

    const assumptions = {
        avgDealValue: client?.portalAvgDealValue ?? null,
        meetingToOppRate: client?.portalMeetingToOppRate ?? null,
        updatedAt: client?.portalAssumptionsUpdatedAt?.toISOString() ?? null,
        onboardingDealValue: onboardingDealValue(client?.onboarding?.onboardingData),
    };
    const missionIds = missions.map((m) => m.id);
    const since = missions.length ? new Date(Math.min(...missions.map((m) => m.startDate.getTime()))) : null;

    const rawMeetings = missionIds.length
        ? await prisma.action.findMany({
            where: {
                campaign: { missionId: { in: missionIds } },
                result: { in: ["MEETING_BOOKED", "MEETING_CANCELLED"] },
                // Anything that is, or once was, confirmed: the rules decide what counts when.
                OR: [{ confirmationStatus: "CONFIRMED" }, { confirmedAt: { not: null } }],
            },
            select: {
                id: true, contactId: true, companyId: true, result: true, confirmationStatus: true,
                confirmedAt: true, confirmationUpdatedAt: true, createdAt: true, callbackDate: true,
                meetingFeedback: { select: { outcome: true, createdAt: true, standByAt: true, outOfScopeAt: true } },
            },
        })
        : [];

    const meetings: LetterMeeting[] = rawMeetings.map((m) => ({
        id: m.id,
        prospect: m.contactId ?? m.companyId,
        result: m.result,
        confirmationStatus: m.confirmationStatus,
        confirmedAt: m.confirmedAt,
        confirmationUpdatedAt: m.confirmationUpdatedAt,
        createdAt: m.createdAt,
        callbackDate: m.callbackDate,
        feedback: m.meetingFeedback,
    }));

    // ── Live: confirmed RDV ──
    const live = meetings.filter(isConfirmedNow);
    const liveDates = live.map((m) => confirmedOn(m) as Date);
    const allWeeks = since ? weeklyConfirmed(liveDates, since, now, 520) : [];
    const weekIndex = allWeeks.findIndex((w) => Date.parse(w.start) === week.start.getTime());
    const weekConfirmed = weekIndex >= 0 ? allWeeks[weekIndex].count : 0;
    const earlier = weekIndex > 0 ? allWeeks.slice(0, weekIndex).map((w) => w.count) : [];
    const monthConfirmed = liveDates.filter((d) => d >= month.start && d < month.end).length;
    const periods = missions.map((m) => ({ startDate: m.startDate, endDate: m.endDate, targetMeetings: m.targetMeetings }));
    const monthStatus = monthPace(periods, monthConfirmed, now);

    // ── Snapshot: everything else, as of Monday 06:00 (frozen for the week, so cached) ──
    const { snapshot, invested } = missionIds.length && since
        ? await cachedSnapshot(`${clientId}|${cutoff.toISOString()}|${missionIds.join(",")}`, async () => {
            const [dictionary, touches, base, billing] = await Promise.all([
                loadDictionary(clientId, missionIds),
                loadTouches(missionIds, cutoff),
                loadBase(missionIds, cutoff),
                prisma.billingClient.findUnique({
                    where: { clientId },
                    select: {
                        invoices: {
                            where: { status: { not: "DRAFT" } },
                            select: {
                                documentType: true, status: true, totalHt: true, issueDate: true, validatedAt: true,
                                cancelledAt: true, periodStart: true, periodEnd: true,
                            },
                        },
                    },
                }),
            ]);
            return {
                snapshot: prospectSnapshot({ base, touches, meetings, cutoff, dictionary }),
                invested: invoicedCost((billing?.invoices ?? []).map((i) => ({ ...i, totalHt: Number(i.totalHt) })), { since, cutoff }),
            };
        })
        : { snapshot: prospectSnapshot({ base: 0, touches: [], meetings: [], cutoff, dictionary: () => ({ label: null, category: null }) }), invested: null };
    const roi = computeRoi({ meetings, cutoff, assumptions, invested });

    // ── Upcoming confirmed RDV ──
    const upcomingAll = live
        .filter((m) => m.callbackDate && m.callbackDate >= now)
        .sort((a, b) => (a.callbackDate as Date).getTime() - (b.callbackDate as Date).getTime());
    const details = upcomingAll.length
        ? await prisma.action.findMany({
            where: { id: { in: upcomingAll.slice(0, UPCOMING_LIMIT).map((m) => m.id) } },
            select: {
                id: true, callbackDate: true, meetingType: true, rdvFiche: true,
                contact: { select: { firstName: true, lastName: true, title: true, company: { select: { name: true } } } },
                company: { select: { name: true } },
                campaign: { select: { mission: { select: { name: true } } } },
            },
        })
        : [];
    const byId = new Map(details.map((d) => [d.id, d]));
    const upcoming: LetterUpcomingMeeting[] = upcomingAll.slice(0, UPCOMING_LIMIT).flatMap((m) => {
        const d = byId.get(m.id);
        if (!d) return [];
        return [{
            id: d.id,
            date: d.callbackDate?.toISOString() ?? null,
            person: personName(d.contact),
            title: d.contact?.title ?? null,
            company: d.contact?.company?.name ?? d.company?.name ?? "Entreprise",
            format: d.meetingType ? MEETING_FORMAT[d.meetingType] ?? null : null,
            hasFiche: d.rdvFiche !== null && d.rdvFiche !== undefined,
            missionName: d.campaign.mission.name,
        }];
    });

    const headline = letterHeadline({ count: weekConfirmed, previous: earlier.length ? earlier[earlier.length - 1] : null, earlier });

    return {
        hasMission: missions.length > 0,
        generatedAt: now.toISOString(),
        cutoff: cutoff.toISOString(),
        cutoffLabel: cutoffLabel(cutoff),
        week: {
            number: week.number,
            start: week.start.toISOString(),
            end: week.end.toISOString(),
            rangeLabel: weekRangeLabel(week),
            confirmed: weekConfirmed,
        },
        headline,
        missions: missions.map((m) => ({ id: m.id, name: m.name, status: m.status })),
        sdrCount: new Set(missions.flatMap((m) => m.sdrAssignments.map((a) => a.sdrId))).size,
        since: since?.toISOString() ?? null,
        sinceLabel: since ? shortDate(since) : null,
        month: { label: month.label, confirmed: monthConfirmed, target: monthStatus.target, pace: monthStatus.pace },
        funnel: funnelSteps(snapshot.funnel),
        dispositions: DISPOSITIONS.map((d) => ({ ...d, count: snapshot.dispositions[d.key] })),
        refusals: snapshot.refusals,
        weeks: allWeeks.slice(-MAX_WEEKS),
        roi: {
            ...roi,
            invested: roi.invested?.amountHt ?? null,
            investedLabel: roi.invested ? monthsLabel(roi.invested.from, roi.invested.to) : null,
            heldOutsideInvoices: roi.invested ? roi.held - roi.heldInvoiced : 0,
        },
        assumptions,
        upcoming,
        upcomingTotal: upcomingAll.length,
        heldPending: meetings.filter((m) => isHeldPending(m, cutoff)).length,
    };
}
