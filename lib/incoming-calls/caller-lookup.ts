// Who is calling? Resolves an inbound number to the users owning the line and to
// the CRM contacts/companies behind the caller, then builds the dossier the
// incoming-call panel shows.
//
// Phones are free-form text in the CRM ("06 12 34 56 78", "+33612345678"…), so
// matching runs on phoneKey (last 9 digits) computed in SQL. That is a full scan
// of Contact/Company — fine once per ringing call, never on the poll path.

import { prisma } from "@/lib/prisma";
import { phoneKey } from "@/lib/exclusions/matching";
import { ACTION_RESULT_LABELS } from "@/lib/types";
import { fetchVaultCallMatches, isVaultConfigured } from "@/lib/call-vault-client";

const MAX_SQL_MATCHES = 40;
const MAX_CANDIDATES = 8;
const HISTORY_ACTIONS = 8;
const VAULT_WINDOW_DAYS = 180;

// ============================================
// LINE OWNERS
// ============================================

export interface LineOwner {
    id: string;
    name: string;
    alloPhoneNumber: string | null;
}

/**
 * Users whose Allo line was called. alloPhoneNumber is free text typed by a
 * manager, so it's compared by phoneKey rather than exact string. Falls back to
 * the Allo user's email when no line matches (number not filled in the CRM yet).
 */
export async function findLineOwners(lineNumber: string, userEmail: string | null): Promise<LineOwner[]> {
    const lineKey = phoneKey(lineNumber);
    const users = await prisma.user.findMany({
        where: { isActive: true, alloPhoneNumber: { not: null } },
        select: { id: true, name: true, alloPhoneNumber: true },
    });

    const byLine = lineKey ? users.filter((u) => phoneKey(u.alloPhoneNumber) === lineKey) : [];
    if (byLine.length > 0 || !userEmail) return byLine;

    const byEmail = await prisma.user.findFirst({
        where: { isActive: true, email: { equals: userEmail, mode: "insensitive" } },
        select: { id: true, name: true, alloPhoneNumber: true },
    });
    return byEmail ? [byEmail] : [];
}

// ============================================
// CANDIDATES
// ============================================

export interface CallerCandidate {
    /** null when the number is the company's (switchboard) rather than a person's */
    contactId: string | null;
    companyId: string;
    callerName: string | null;
    title: string | null;
    companyName: string;
    missionId: string | null;
    missionName: string | null;
    clientName: string | null;
    listName: string | null;
    missionActive: boolean;
    excluded: boolean;
    myActionCount: number;
    totalActionCount: number;
    lastActionAt: string | null;
}

function fullName(first: string | null, last: string | null): string | null {
    return [first, last].filter(Boolean).join(" ").trim() || null;
}

async function matchContactIds(key: string): Promise<string[]> {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT c.id
        FROM "Contact" c
        WHERE right(regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g'), 9) = ${key}
           OR EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(
                    CASE WHEN jsonb_typeof(c."additionalPhones") = 'array'
                         THEN c."additionalPhones" ELSE '[]'::jsonb END
                ) AS p(v)
                WHERE right(regexp_replace(p.v, '[^0-9]', '', 'g'), 9) = ${key}
           )
        LIMIT ${MAX_SQL_MATCHES}
    `;
    return rows.map((r) => r.id);
}

async function matchCompanyIds(key: string): Promise<string[]> {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT co.id
        FROM "Company" co
        WHERE right(regexp_replace(COALESCE(co.phone, ''), '[^0-9]', '', 'g'), 9) = ${key}
           OR EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(
                    CASE WHEN jsonb_typeof(co."customData"->'additionalPhones') = 'array'
                         THEN co."customData"->'additionalPhones' ELSE '[]'::jsonb END
                ) AS p(v)
                WHERE right(regexp_replace(p.v, '[^0-9]', '', 'g'), 9) = ${key}
           )
        LIMIT ${MAX_SQL_MATCHES}
    `;
    return rows.map((r) => r.id);
}

const companyContextSelect = {
    id: true,
    name: true,
    excludedAt: true,
    list: {
        select: {
            name: true,
            isActive: true,
            isArchived: true,
            mission: { select: { id: true, name: true, isActive: true, client: { select: { name: true } } } },
        },
    },
} as const;

/**
 * Every CRM record the number belongs to, best first. Ranking, strongest first:
 * the user already worked it, its mission is live, it's a person rather than a
 * switchboard, then most recent activity. The same prospect imported into
 * several missions shows up once per list, which is exactly the ambiguity the
 * panel lets the user resolve.
 */
export async function findCallerCandidates(callerNumber: string, sdrId: string): Promise<CallerCandidate[]> {
    const key = phoneKey(callerNumber);
    if (!key) return [];

    const [contactIds, companyIds] = await Promise.all([matchContactIds(key), matchCompanyIds(key)]);
    if (contactIds.length === 0 && companyIds.length === 0) return [];

    const [contacts, companies] = await Promise.all([
        contactIds.length
            ? prisma.contact.findMany({
                  where: { id: { in: contactIds } },
                  select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      title: true,
                      excludedAt: true,
                      company: { select: companyContextSelect },
                  },
              })
            : Promise.resolve([]),
        companyIds.length
            ? prisma.company.findMany({ where: { id: { in: companyIds } }, select: companyContextSelect })
            : Promise.resolve([]),
    ]);

    // A company whose number matched is redundant when one of its people matched too.
    const companiesWithContact = new Set(contacts.map((c) => c.company.id));
    const switchboards = companies.filter((co) => !companiesWithContact.has(co.id));

    const [contactStats, companyStats] = await Promise.all([
        contacts.length ? actionStats("contactId", contacts.map((c) => c.id), sdrId) : Promise.resolve(new Map()),
        switchboards.length ? actionStats("companyId", switchboards.map((c) => c.id), sdrId) : Promise.resolve(new Map()),
    ]);

    const candidates: CallerCandidate[] = [
        ...contacts.map((c) => ({
            ...contextOf(c.company),
            contactId: c.id,
            callerName: fullName(c.firstName, c.lastName),
            title: c.title,
            excluded: Boolean(c.excludedAt || c.company.excludedAt),
            ...(contactStats.get(c.id) ?? EMPTY_STATS),
        })),
        ...switchboards.map((co) => ({
            ...contextOf(co),
            contactId: null,
            callerName: null,
            title: null,
            excluded: Boolean(co.excludedAt),
            ...(companyStats.get(co.id) ?? EMPTY_STATS),
        })),
    ];

    const score = new Map(candidates.map((cand) => [cand, rankScore(cand)]));
    candidates.sort((a, b) => score.get(b)! - score.get(a)!);
    return candidates.slice(0, MAX_CANDIDATES);
}

function rankScore(cand: CallerCandidate): number {
    const lastAt = cand.lastActionAt ? new Date(cand.lastActionAt).getTime() : 0;
    const ageDays = lastAt ? (Date.now() - lastAt) / 86_400_000 : 9999;
    return (
        (cand.myActionCount > 0 ? 10_000 : 0) +
        (cand.missionActive ? 1_000 : 0) +
        (cand.contactId ? 500 : 0) +
        (cand.totalActionCount > 0 ? 100 : 0) +
        Math.max(0, 99 - Math.min(99, ageDays))
    );
}

type CompanyContext = {
    id: string;
    name: string;
    list: {
        name: string;
        isActive: boolean;
        isArchived: boolean;
        mission: { id: string; name: string; isActive: boolean; client: { name: string } | null } | null;
    } | null;
};

function contextOf(company: CompanyContext) {
    const mission = company.list?.mission ?? null;
    return {
        companyId: company.id,
        companyName: company.name,
        missionId: mission?.id ?? null,
        missionName: mission?.name ?? null,
        clientName: mission?.client?.name ?? null,
        listName: company.list?.name ?? null,
        missionActive: Boolean(mission?.isActive && company.list?.isActive && !company.list?.isArchived),
    };
}

const EMPTY_STATS = { myActionCount: 0, totalActionCount: 0, lastActionAt: null as string | null };

async function actionStats(field: "contactId" | "companyId", ids: string[], sdrId: string) {
    const [all, mine] = await Promise.all([
        prisma.action.groupBy({
            by: [field],
            where: { [field]: { in: ids } },
            _count: { _all: true },
            _max: { createdAt: true },
        }),
        prisma.action.groupBy({
            by: [field],
            where: { [field]: { in: ids }, sdrId },
            _count: { _all: true },
        }),
    ]);

    const mineById = new Map(mine.map((row) => [row[field] as string, row._count._all]));
    const stats = new Map<string, typeof EMPTY_STATS>();
    for (const row of all) {
        const id = row[field] as string;
        stats.set(id, {
            totalActionCount: row._count._all,
            myActionCount: mineById.get(id) ?? 0,
            lastActionAt: row._max.createdAt?.toISOString() ?? null,
        });
    }
    return stats;
}

// ============================================
// DOSSIER
// ============================================

export interface DossierAction {
    id: string;
    createdAt: string;
    result: string;
    resultLabel: string;
    channel: string;
    note: string | null;
    callSummary: string | null;
    callbackDate: string | null;
    durationSec: number | null;
    sdrName: string | null;
    isMine: boolean;
    missionName: string | null;
}

export interface CallerDossier {
    contact: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        title: string | null;
        email: string | null;
        phone: string | null;
        linkedin: string | null;
    } | null;
    company: {
        id: string;
        name: string;
        industry: string | null;
        website: string | null;
        phone: string | null;
        country: string | null;
        size: string | null;
    };
    mission: { id: string; name: string; clientName: string | null } | null;
    listName: string | null;
    exclusion: { label: string; reason: string; createdAt: string } | null;
    stats: { totalActions: number; myActions: number; lastMyActionAt: string | null; otherSdrNames: string[] };
    lastAction: DossierAction | null;
    callback: { date: string; note: string | null; sdrName: string | null; overdue: boolean } | null;
    meeting: { date: string | null; bookedAt: string; sdrName: string | null; cancelled: boolean } | null;
    actions: DossierAction[];
    previousInbound: { count: number; lastAt: string | null };
}

const CALLBACK_RESULTS = new Set(["CALLBACK_REQUESTED", "RAPPEL"]);

export async function buildCallerDossier(params: {
    contactId: string | null;
    companyId: string;
    sdrId: string;
    callerKey: string | null;
    excludeIncomingCallId?: string;
}): Promise<CallerDossier | null> {
    const { contactId, companyId, sdrId } = params;

    const [contact, company] = await Promise.all([
        contactId
            ? prisma.contact.findUnique({
                  where: { id: contactId },
                  select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      title: true,
                      email: true,
                      phone: true,
                      linkedin: true,
                      exclusionId: true,
                  },
              })
            : Promise.resolve(null),
        prisma.company.findUnique({
            where: { id: companyId },
            select: {
                id: true,
                name: true,
                industry: true,
                website: true,
                phone: true,
                country: true,
                size: true,
                exclusionId: true,
                list: {
                    select: {
                        name: true,
                        mission: { select: { id: true, name: true, client: { select: { name: true } } } },
                    },
                },
            },
        }),
    ]);
    if (!company) return null;

    // Person-level history plus anything logged on the company itself.
    const actionWhere = contactId
        ? { OR: [{ contactId }, { companyId, contactId: null }] }
        : { companyId };

    const exclusionId = contact?.exclusionId ?? company.exclusionId ?? null;

    const [actions, totalActions, myActions, lastMine, sdrGroups, meetingBooked, exclusion, inbound] = await Promise.all([
        prisma.action.findMany({
            where: actionWhere,
            orderBy: { createdAt: "desc" },
            take: HISTORY_ACTIONS,
            select: {
                id: true,
                createdAt: true,
                result: true,
                channel: true,
                note: true,
                callSummary: true,
                callbackDate: true,
                duration: true,
                sdrId: true,
                sdr: { select: { name: true } },
                campaign: { select: { mission: { select: { name: true } } } },
            },
        }),
        prisma.action.count({ where: actionWhere }),
        prisma.action.count({ where: { ...actionWhere, sdrId } }),
        prisma.action.findFirst({
            where: { ...actionWhere, sdrId },
            orderBy: { createdAt: "desc" },
            select: { createdAt: true },
        }),
        prisma.action.groupBy({ by: ["sdrId"], where: { ...actionWhere, sdrId: { not: sdrId } } }),
        prisma.action.findFirst({
            where: { ...actionWhere, result: "MEETING_BOOKED" },
            orderBy: { createdAt: "desc" },
            select: { createdAt: true, callbackDate: true, sdr: { select: { name: true } } },
        }),
        exclusionId
            ? prisma.exclusion.findUnique({
                  where: { id: exclusionId },
                  select: { label: true, reason: true, createdAt: true, liftedAt: true },
              })
            : Promise.resolve(null),
        params.callerKey
            ? prisma.incomingCall.aggregate({
                  where: {
                      callerKey: params.callerKey,
                      ...(params.excludeIncomingCallId ? { id: { not: params.excludeIncomingCallId } } : {}),
                  },
                  _count: { _all: true },
                  _max: { startedAt: true },
              })
            : Promise.resolve(null),
    ]);

    const otherSdrIds = sdrGroups.map((g) => g.sdrId);
    const otherSdrs = otherSdrIds.length
        ? await prisma.user.findMany({ where: { id: { in: otherSdrIds } }, select: { name: true } })
        : [];

    const items: DossierAction[] = actions.map((a) => ({
        id: a.id,
        createdAt: a.createdAt.toISOString(),
        result: a.result,
        resultLabel: ACTION_RESULT_LABELS[a.result] ?? a.result,
        channel: a.channel,
        note: a.note,
        callSummary: a.callSummary,
        callbackDate: a.callbackDate?.toISOString() ?? null,
        durationSec: a.duration,
        sdrName: a.sdr?.name ?? null,
        isMine: a.sdrId === sdrId,
        missionName: a.campaign?.mission?.name ?? null,
    }));

    const lastAction = items[0] ?? null;
    const callback =
        lastAction && CALLBACK_RESULTS.has(lastAction.result) && lastAction.callbackDate
            ? {
                  date: lastAction.callbackDate,
                  note: lastAction.note,
                  sdrName: lastAction.sdrName,
                  overdue: new Date(lastAction.callbackDate).getTime() < Date.now(),
              }
            : null;

    const cancelledAfter = meetingBooked
        ? await prisma.action.count({
              where: { ...actionWhere, result: "MEETING_CANCELLED", createdAt: { gt: meetingBooked.createdAt } },
          })
        : 0;

    const mission = company.list?.mission ?? null;

    return {
        contact: contact
            ? {
                  id: contact.id,
                  firstName: contact.firstName,
                  lastName: contact.lastName,
                  title: contact.title,
                  email: contact.email,
                  phone: contact.phone,
                  linkedin: contact.linkedin,
              }
            : null,
        company: {
            id: company.id,
            name: company.name,
            industry: company.industry,
            website: company.website,
            phone: company.phone,
            country: company.country,
            size: company.size,
        },
        mission: mission ? { id: mission.id, name: mission.name, clientName: mission.client?.name ?? null } : null,
        listName: company.list?.name ?? null,
        exclusion:
            exclusion && !exclusion.liftedAt
                ? { label: exclusion.label, reason: exclusion.reason, createdAt: exclusion.createdAt.toISOString() }
                : null,
        stats: {
            totalActions,
            myActions,
            lastMyActionAt: lastMine?.createdAt.toISOString() ?? null,
            otherSdrNames: otherSdrs.map((u) => u.name).filter(Boolean),
        },
        lastAction,
        callback,
        meeting: meetingBooked
            ? {
                  date: meetingBooked.callbackDate?.toISOString() ?? null,
                  bookedAt: meetingBooked.createdAt.toISOString(),
                  sdrName: meetingBooked.sdr?.name ?? null,
                  cancelled: cancelledAfter > 0,
              }
            : null,
        actions: items,
        previousInbound: {
            count: inbound?._count._all ?? 0,
            lastAt: inbound?._max.startedAt?.toISOString() ?? null,
        },
    };
}

// ============================================
// PHONE HISTORY (call-vault)
// ============================================

export interface PhoneHistoryCall {
    callId: string;
    direction: "INBOUND" | "OUTBOUND";
    startedAt: string | null;
    durationSec: number;
    status: string | null;
    summary: string | null;
    /** true when the call went through this user's own Allo line */
    onMyLine: boolean;
}

/**
 * Every synced Allo call with this number — the ground truth for "did I call
 * them before?", including dials nobody logged as an action. Empty (not an
 * error) when the vault isn't configured or is down.
 */
export async function fetchPhoneHistory(callerNumber: string, myLine: string | null): Promise<{
    available: boolean;
    calls: PhoneHistoryCall[];
}> {
    if (!isVaultConfigured()) return { available: false, calls: [] };

    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - VAULT_WINDOW_DAYS * 86_400_000);
    const matches = await fetchVaultCallMatches({ phones: [callerNumber], windowStart, windowEnd, limit: 30 });

    const myKey = phoneKey(myLine);
    const calls = matches
        .map((m) => ({
            callId: m.callId,
            direction: m.direction,
            startedAt: m.startedAt,
            durationSec: m.durationSec,
            status: m.status,
            summary: m.summary?.trim() ? m.summary.trim().slice(0, 400) : null,
            onMyLine: Boolean(myKey && (phoneKey(m.fromNumber) === myKey || phoneKey(m.toNumber) === myKey)),
        }))
        .sort((a, b) => (b.startedAt ? Date.parse(b.startedAt) : 0) - (a.startedAt ? Date.parse(a.startedAt) : 0));

    return { available: true, calls };
}
