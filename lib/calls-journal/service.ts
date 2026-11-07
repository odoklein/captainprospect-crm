// ============================================
// CALL JOURNAL — manager queries (server-only).
//
// Source of truth for a call's STATUS is the Action the SDR logged
// (channel CALL: result, note, recording, summary). The integrated phone adds
// what Twilio saw (TelephonyCall, linked by actionId). Calls placed from the
// browser that never got a status are the journal's second view: they are the
// process gap a manager wants to see.
//
//   getJournal(filters, range)  list + facets + KPIs
//   getCallDetail(id)           one call, with summary / transcription / history
// ============================================

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { PeriodRange } from "@/lib/manager-home/rules";
import { getTwilioConfig } from "@/lib/telephony/config";
import { readSummaryState } from "@/lib/telephony/summary";
import { QUALIFY_GRACE_MINUTES, callSource, resolveStatus, type JournalFilters, type StatusDef } from "./filters";
import type { CallDetail, JournalFacet, JournalResponse, JournalRow } from "./types";

type Defs = Map<string, StatusDef>;

async function loadStatusDefs(): Promise<Defs> {
    const rows = await prisma.actionStatusDefinition.findMany({
        where: { scopeType: "GLOBAL", isActive: true },
        select: { code: true, label: true, color: true, resultCategoryCode: true },
    });
    return new Map(rows.map((r) => [r.code, { label: r.label, color: r.color, resultCategoryCode: r.resultCategoryCode }]));
}

function fullName(first: string | null | undefined, last: string | null | undefined): string {
    return [first, last].filter(Boolean).join(" ").trim();
}

// ── where builders ──────────────────────────────────────────────────────────

function searchClause(q: string): Prisma.ActionWhereInput | null {
    if (!q) return null;
    const text = { contains: q, mode: "insensitive" as const };
    return {
        OR: [
            { contact: { OR: [{ firstName: text }, { lastName: text }, { company: { name: text } }] } },
            { company: { name: text } },
            // Searchable conversations: what was said (transcript) and the call's summary.
            { callTranscription: text },
            { callSummary: text },
            { note: text },
        ],
    };
}

/** Period + mission + search: what every facet shares. */
function baseWhere(f: JournalFilters, range: PeriodRange): Prisma.ActionWhereInput {
    const search = searchClause(f.q);
    return {
        channel: "CALL",
        createdAt: { gte: range.from, lt: range.to },
        ...(f.missionId ? { campaign: { missionId: f.missionId } } : {}),
        ...(search ?? {}),
    };
}

const graceCutoff = () => new Date(Date.now() - QUALIFY_GRACE_MINUTES * 60_000);

function unqualifiedWhere(f: JournalFilters, range: PeriodRange, withSdr = true): Prisma.TelephonyCallWhereInput {
    const numberClause = /[a-zà-ÿ]/i.test(f.q)
        ? { transcript: { some: { text: { contains: f.q, mode: "insensitive" as const } } } }
        : phoneSearchClause(f.q);
    return {
        parentCallSid: { not: null }, // Twilio actually placed it
        actionId: null,
        startedAt: { gte: range.from, lt: range.to, lte: graceCutoff() },
        ...(withSdr && f.sdrIds.length ? { sdrId: { in: f.sdrIds } } : {}),
        ...(f.withRecording ? { recordingUrl: { not: null } } : {}),
        ...(numberClause ?? {}),
    };
}

/**
 * Numbers are stored as E.164 (+33142…) but managers type them as they read them
 * (01 42…, +33 1 42…, 0033 1 42…): match the national form with its +33 prefix.
 */
export function phoneSearchClause(q: string): Prisma.TelephonyCallWhereInput | null {
    let digits = q.replace(/[^\d]/g, "");
    if (digits.length < 3) return null;
    if (digits.startsWith("00")) digits = digits.slice(2);
    else if (digits.startsWith("0")) digits = `33${digits.slice(1)}`;
    return { toNumber: { contains: digits } };
}

// ── list ────────────────────────────────────────────────────────────────────

export async function getJournal(f: JournalFilters, range: PeriodRange): Promise<JournalResponse> {
    const telephonyEnabled = getTwilioConfig() !== null;
    return f.view === "unqualified"
        ? journalUnqualified(f, range, telephonyEnabled)
        : journalActions(f, range, telephonyEnabled);
}

async function journalActions(f: JournalFilters, range: PeriodRange, telephonyEnabled: boolean): Promise<JournalResponse> {
    const base = baseWhere(f, range);
    const sdrClause: Prisma.ActionWhereInput = f.sdrIds.length ? { sdrId: { in: f.sdrIds } } : {};
    const resultClause: Prisma.ActionWhereInput = f.results.length ? { result: { in: f.results as never[] } } : {};
    const recordingClause: Prisma.ActionWhereInput = f.withRecording ? { callRecordingUrl: { not: null } } : {};
    const full: Prisma.ActionWhereInput = { AND: [base, sdrClause, resultClause, recordingClause] };

    // Facets ignore their own dimension so the other options stay visible.
    const statusFacetWhere: Prisma.ActionWhereInput = { AND: [base, sdrClause, recordingClause] };
    const sdrFacetWhere: Prisma.ActionWhereInput = { AND: [base, resultClause, recordingClause] };
    // The mission facet ignores the mission filter, like the other facets ignore their own dimension.
    const search = searchClause(f.q);
    const missionFacetWhere: Prisma.ActionWhereInput = {
        AND: [
            { channel: "CALL", createdAt: { gte: range.from, lt: range.to } },
            ...(search ? [search] : []),
            sdrClause,
            resultClause,
            recordingClause,
        ],
    };

    const [defs, rows, total, agg, withRecording, meetings, statusGroups, sdrGroups, campaignGroups, unqualified] = await Promise.all([
        loadStatusDefs(),
        prisma.action.findMany({
            where: full,
            orderBy: { createdAt: "desc" },
            skip: (f.page - 1) * f.limit,
            take: f.limit,
            select: {
                id: true,
                createdAt: true,
                result: true,
                note: true,
                duration: true,
                callRecordingUrl: true,
                callSummary: true,
                callEnrichmentAt: true,
                sdr: { select: { id: true, name: true } },
                contact: { select: { id: true, firstName: true, lastName: true, title: true, phone: true, company: { select: { id: true, name: true, phone: true } } } },
                company: { select: { id: true, name: true, phone: true } },
                campaign: { select: { mission: { select: { id: true, name: true, client: { select: { name: true } } } } } },
            },
        }),
        prisma.action.count({ where: full }),
        prisma.action.aggregate({ where: { AND: [full, { duration: { not: null } }] }, _sum: { duration: true }, _count: { _all: true } }),
        prisma.action.count({ where: { AND: [full, { callRecordingUrl: { not: null } }] } }),
        prisma.action.count({ where: { AND: [full, { result: "MEETING_BOOKED" }] } }),
        prisma.action.groupBy({ by: ["result"], where: statusFacetWhere, _count: { _all: true } }),
        prisma.action.groupBy({ by: ["sdrId"], where: sdrFacetWhere, _count: { _all: true } }),
        prisma.action.groupBy({ by: ["campaignId"], where: missionFacetWhere, _count: { _all: true } }),
        prisma.telephonyCall.count({ where: unqualifiedWhere(f, range) }),
    ]);

    // Telephony data of the rows shown (Twilio status, talk time).
    const telephony = rows.length
        ? await prisma.telephonyCall.findMany({
              where: { actionId: { in: rows.map((r) => r.id) } },
              select: { actionId: true, status: true, durationSec: true, toNumber: true },
          })
        : [];
    const tByAction = new Map(telephony.map((t) => [t.actionId, t]));

    const jr: JournalRow[] = rows.map((r) => {
        const t = tByAction.get(r.id);
        const company = r.company ?? r.contact?.company ?? null;
        const m = r.campaign?.mission ?? null;
        const s = resolveStatus(r.result, defs);
        return {
            id: r.id,
            kind: "action",
            at: r.createdAt.toISOString(),
            sdr: { id: r.sdr.id, name: r.sdr.name },
            contact: r.contact ? { id: r.contact.id, name: fullName(r.contact.firstName, r.contact.lastName) || "Contact", title: r.contact.title } : null,
            company: company ? { id: company.id, name: company.name } : null,
            phone: t?.toNumber ?? r.contact?.phone ?? company?.phone ?? null,
            mission: m ? { id: m.id, name: m.name, client: m.client?.name ?? null } : null,
            status: { code: s.code, label: s.label, color: s.color },
            telephonyStatus: t?.status ?? null,
            durationSec: r.duration ?? t?.durationSec ?? null,
            hasRecording: Boolean(r.callRecordingUrl),
            hasSummary: Boolean(r.callSummary),
            note: r.note,
            source: callSource({ hasTelephonyCall: Boolean(t), hasRecording: Boolean(r.callRecordingUrl), enriched: Boolean(r.callEnrichmentAt) }),
        };
    });

    // Facet labels
    const sdrNames = sdrGroups.length
        ? await prisma.user.findMany({ where: { id: { in: sdrGroups.map((g) => g.sdrId) } }, select: { id: true, name: true } })
        : [];
    const nameOf = new Map(sdrNames.map((u) => [u.id, u.name]));
    const campaigns = campaignGroups.length
        ? await prisma.campaign.findMany({
              where: { id: { in: campaignGroups.map((g) => g.campaignId) } },
              select: { id: true, mission: { select: { id: true, name: true } } },
          })
        : [];
    const missionOfCampaign = new Map(campaigns.map((c) => [c.id, c.mission]));
    const missionCounts = new Map<string, JournalFacet>();
    for (const g of campaignGroups) {
        const m = missionOfCampaign.get(g.campaignId);
        if (!m) continue;
        const cur = missionCounts.get(m.id);
        if (cur) cur.count += g._count._all;
        else missionCounts.set(m.id, { id: m.id, label: m.name, count: g._count._all });
    }

    const statuses: JournalFacet[] = statusGroups
        .map((g) => {
            const s = resolveStatus(g.result, defs);
            return { id: s.code, label: s.label, color: s.color, count: g._count._all };
        })
        .sort((a, b) => b.count - a.count);

    return {
        view: "journal",
        start: f.start,
        end: f.end,
        page: f.page,
        limit: f.limit,
        total,
        rows: jr,
        kpis: {
            calls: total,
            meetings,
            talkSeconds: agg._sum.duration ?? 0,
            measuredCalls: agg._count._all,
            withRecording,
        },
        unqualified,
        facets: {
            statuses,
            sdrs: sdrGroups
                .map((g) => ({ id: g.sdrId, label: nameOf.get(g.sdrId) ?? "SDR", count: g._count._all }))
                .sort((a, b) => b.count - a.count),
            missions: [...missionCounts.values()].sort((a, b) => b.count - a.count),
        },
        telephonyEnabled,
    };
}

async function journalUnqualified(f: JournalFilters, range: PeriodRange, telephonyEnabled: boolean): Promise<JournalResponse> {
    const where = unqualifiedWhere(f, range);
    const [rows, total, agg, withRecording, sdrGroups] = await Promise.all([
        prisma.telephonyCall.findMany({
            where,
            orderBy: { startedAt: "desc" },
            skip: (f.page - 1) * f.limit,
            take: f.limit,
            select: {
                id: true, startedAt: true, toNumber: true, status: true, durationSec: true, recordingUrl: true,
                contactId: true, companyId: true, campaignId: true,
                sdr: { select: { id: true, name: true } },
            },
        }),
        prisma.telephonyCall.count({ where }),
        prisma.telephonyCall.aggregate({ where: { ...where, durationSec: { not: null } }, _sum: { durationSec: true }, _count: { _all: true } }),
        prisma.telephonyCall.count({ where: { ...where, recordingUrl: { not: null } } }),
        prisma.telephonyCall.groupBy({ by: ["sdrId"], where: unqualifiedWhere(f, range, false), _count: { _all: true } }),
    ]);

    const contactIds = [...new Set(rows.map((r) => r.contactId).filter((v): v is string => Boolean(v)))];
    const companyIds = [...new Set(rows.map((r) => r.companyId).filter((v): v is string => Boolean(v)))];
    const [contacts, companies, sdrNames] = await Promise.all([
        contactIds.length ? prisma.contact.findMany({ where: { id: { in: contactIds } }, select: { id: true, firstName: true, lastName: true, title: true } }) : [],
        companyIds.length ? prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true } }) : [],
        sdrGroups.length ? prisma.user.findMany({ where: { id: { in: sdrGroups.map((g) => g.sdrId) } }, select: { id: true, name: true } }) : [],
    ]);
    const contactOf = new Map(contacts.map((c) => [c.id, c]));
    const companyOf = new Map(companies.map((c) => [c.id, c]));
    const nameOf = new Map(sdrNames.map((u) => [u.id, u.name]));

    const jr: JournalRow[] = rows.map((r) => {
        const c = r.contactId ? contactOf.get(r.contactId) : undefined;
        const co = r.companyId ? companyOf.get(r.companyId) : undefined;
        return {
            id: r.id,
            kind: "call",
            at: r.startedAt.toISOString(),
            sdr: { id: r.sdr.id, name: r.sdr.name },
            contact: c ? { id: c.id, name: fullName(c.firstName, c.lastName) || "Contact", title: c.title } : null,
            company: co ? { id: co.id, name: co.name } : null,
            phone: r.toNumber,
            mission: null,
            status: null,
            telephonyStatus: r.status,
            durationSec: r.durationSec,
            hasRecording: Boolean(r.recordingUrl),
            hasSummary: false,
            note: null,
            source: "crm",
        };
    });

    return {
        view: "unqualified",
        start: f.start,
        end: f.end,
        page: f.page,
        limit: f.limit,
        total,
        rows: jr,
        kpis: { calls: total, meetings: 0, talkSeconds: agg._sum.durationSec ?? 0, measuredCalls: agg._count._all, withRecording },
        unqualified: total,
        facets: {
            statuses: [],
            sdrs: sdrGroups.map((g) => ({ id: g.sdrId, label: nameOf.get(g.sdrId) ?? "SDR", count: g._count._all })).sort((a, b) => b.count - a.count),
            missions: [],
        },
        telephonyEnabled,
    };
}

// ── detail ──────────────────────────────────────────────────────────────────

/** A call by Action id or by TelephonyCall id (unqualified calls have no Action). */
export async function getCallDetail(kind: "action" | "call", id: string): Promise<CallDetail | null> {
    const defs = await loadStatusDefs();

    if (kind === "call") {
        const t = await prisma.telephonyCall.findUnique({
            where: { id },
            include: { sdr: { select: { id: true, name: true } }, transcript: { orderBy: [{ at: "asc" }, { seq: "asc" }] } },
        });
        if (!t) return null;
        const [contact, company] = await Promise.all([
            t.contactId ? prisma.contact.findUnique({ where: { id: t.contactId }, select: { id: true, firstName: true, lastName: true, title: true, email: true } }) : null,
            t.companyId ? prisma.company.findUnique({ where: { id: t.companyId }, select: { id: true, name: true } }) : null,
        ]);
        return {
            id: t.id,
            kind: "call",
            at: t.startedAt.toISOString(),
            sdr: t.sdr,
            contact: contact ? { id: contact.id, name: fullName(contact.firstName, contact.lastName) || "Contact", title: contact.title, email: contact.email } : null,
            company,
            phone: t.toNumber,
            mission: null,
            status: null,
            note: null,
            callbackDate: null,
            durationSec: t.durationSec,
            source: "crm",
            recordingUrl: t.recordingUrl ? `/api/telephony/calls/${t.id}/recording` : null,
            summary: null,
            transcription: null,
            ai: readSummaryState(t),
            transcript: lines(t.transcript),
            telephony: {
                status: t.status,
                from: t.fromNumber,
                to: t.toNumber,
                startedAt: t.startedAt.toISOString(),
                answeredAt: t.answeredAt?.toISOString() ?? null,
                endedAt: t.endedAt?.toISOString() ?? null,
            },
            history: await callHistory(t.contactId, t.companyId, defs, null),
        };
    }

    const a = await prisma.action.findFirst({
        where: { id, channel: "CALL" },
        include: {
            sdr: { select: { id: true, name: true } },
            contact: { select: { id: true, firstName: true, lastName: true, title: true, email: true, phone: true, company: { select: { id: true, name: true, phone: true } } } },
            company: { select: { id: true, name: true, phone: true } },
            campaign: { select: { mission: { select: { id: true, name: true, client: { select: { name: true } } } } } },
        },
    });
    if (!a) return null;
    const t = await prisma.telephonyCall.findUnique({
        where: { actionId: a.id },
        include: { transcript: { orderBy: [{ at: "asc" }, { seq: "asc" }] } },
    });
    const company = a.company ?? a.contact?.company ?? null;
    const m = a.campaign?.mission ?? null;
    const s = resolveStatus(a.result, defs);

    return {
        id: a.id,
        kind: "action",
        at: a.createdAt.toISOString(),
        sdr: a.sdr,
        contact: a.contact ? { id: a.contact.id, name: fullName(a.contact.firstName, a.contact.lastName) || "Contact", title: a.contact.title, email: a.contact.email } : null,
        company: company ? { id: company.id, name: company.name } : null,
        phone: t?.toNumber ?? a.contact?.phone ?? company?.phone ?? null,
        mission: m ? { id: m.id, name: m.name, client: m.client?.name ?? null } : null,
        status: { code: s.code, label: s.label, color: s.color },
        note: a.note,
        callbackDate: a.callbackDate?.toISOString() ?? null,
        durationSec: a.duration ?? t?.durationSec ?? null,
        source: callSource({ hasTelephonyCall: Boolean(t), hasRecording: Boolean(a.callRecordingUrl), enriched: Boolean(a.callEnrichmentAt) }),
        // Streamed (with the provider's credentials) by the existing action route.
        recordingUrl: a.callRecordingUrl ? `/api/actions/${a.id}/recording` : null,
        summary: a.callSummary,
        transcription: a.callTranscription,
        ai: t ? readSummaryState(t) : { status: "none" },
        transcript: t ? lines(t.transcript) : [],
        telephony: t
            ? {
                  status: t.status,
                  from: t.fromNumber,
                  to: t.toNumber,
                  startedAt: t.startedAt.toISOString(),
                  answeredAt: t.answeredAt?.toISOString() ?? null,
                  endedAt: t.endedAt?.toISOString() ?? null,
              }
            : null,
        history: await callHistory(a.contactId, a.companyId ?? company?.id ?? null, defs, a.id),
    };
}

function lines(rows: { speaker: string; text: string; at: Date }[]): CallDetail["transcript"] {
    return rows.map((l) => ({ speaker: l.speaker === "sdr" ? "sdr" : "prospect", text: l.text, at: l.at.toISOString() }));
}

async function callHistory(contactId: string | null, companyId: string | null, defs: Defs, excludeActionId: string | null) {
    const who: Prisma.ActionWhereInput[] = [
        ...(contactId ? [{ contactId }] : []),
        ...(!contactId && companyId ? [{ companyId }] : []),
    ];
    if (who.length === 0) return [];
    const rows = await prisma.action.findMany({
        where: { channel: "CALL", OR: who, ...(excludeActionId ? { id: { not: excludeActionId } } : {}) },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { id: true, createdAt: true, result: true, duration: true, sdr: { select: { name: true } } },
    });
    return rows.map((r) => {
        const s = resolveStatus(r.result, defs);
        return { id: r.id, at: r.createdAt.toISOString(), sdr: r.sdr.name, status: { code: s.code, label: s.label, color: s.color }, durationSec: r.duration };
    });
}
