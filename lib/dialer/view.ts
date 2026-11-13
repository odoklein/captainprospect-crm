// What the SDR's screen shows of a dialer session (server-only).
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface LineView {
    id: string;
    state: string;
    contactId: string | null;
    companyId: string | null;
    label: string;
    sublabel: string | null;
    headline: string | null;
    since: string;
}

export interface SessionStatsView {
    attempts: number;
    humanAnswers: number;
    conversations: number;
    abandoned: number;
    voicemails: number;
    /** Median answer → bridge, seconds; null without a bridged call. */
    medianBridgeSec: number | null;
    abandonRate: number | null;
}

export interface SessionView {
    id: string;
    status: string;
    agentState: string;
    maxLines: number;
    missionId: string | null;
    lines: LineView[];
    connected: (LineView & { telephonyCallId: string | null; campaignId: string | null }) | null;
    /** The last ended conversation, still to qualify (WRAP_UP). */
    toQualify: { telephonyCallId: string | null; contactId: string | null; companyId: string | null; campaignId: string | null; label: string } | null;
    stats: SessionStatsView;
}

async function names(rows: { contactId: string | null; companyId: string | null }[]) {
    const contactIds = [...new Set(rows.map((r) => r.contactId).filter((x): x is string => !!x))];
    const companyIds = [...new Set(rows.map((r) => r.companyId).filter((x): x is string => !!x))];
    const [contacts, companies] = await Promise.all([
        contactIds.length ? prisma.contact.findMany({ where: { id: { in: contactIds } }, select: { id: true, firstName: true, lastName: true, company: { select: { name: true } } } }) : [],
        companyIds.length ? prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true } }) : [],
    ]);
    const c = new Map(contacts.map((x) => [x.id, x]));
    const co = new Map(companies.map((x) => [x.id, x.name]));
    return (r: { contactId: string | null; companyId: string | null }) => {
        const contact = r.contactId ? c.get(r.contactId) : undefined;
        const person = contact ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") : "";
        const company = contact?.company?.name ?? (r.companyId ? co.get(r.companyId) : undefined) ?? null;
        return { label: person || company || "Prospect", sublabel: person ? company : null };
    };
}

export async function sessionStats(sdrId: string, since: Date): Promise<SessionStatsView> {
    const [row] = await prisma.$queryRaw<{ attempts: number; human: number; conv: number; aband: number; vm: number; median: number | null }[]>(Prisma.sql`
        SELECT count(*)::int AS attempts,
               count(*) FILTER (WHERE "outcome" IN ('CONVERSATION', 'ABANDONED'))::int AS human,
               count(*) FILTER (WHERE "outcome" = 'CONVERSATION')::int AS conv,
               count(*) FILTER (WHERE "outcome" = 'ABANDONED')::int AS aband,
               count(*) FILTER (WHERE "outcome" = 'VOICEMAIL')::int AS vm,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("bridgedAt" - "answeredAt"))) FILTER (WHERE "bridgedAt" IS NOT NULL AND "answeredAt" IS NOT NULL) AS median
          FROM "DialAttempt" WHERE "sdrId" = ${sdrId} AND "createdAt" >= ${since}`);
    const human = Number(row?.human ?? 0);
    const aband = Number(row?.aband ?? 0);
    return {
        attempts: Number(row?.attempts ?? 0),
        humanAnswers: human,
        conversations: Number(row?.conv ?? 0),
        abandoned: aband,
        voicemails: Number(row?.vm ?? 0),
        medianBridgeSec: row?.median == null ? null : Math.round(Number(row.median) * 10) / 10,
        abandonRate: human > 0 ? aband / human : null,
    };
}

export async function sessionView(sessionId: string): Promise<SessionView | null> {
    const session = await prisma.dialerSession.findUnique({ where: { id: sessionId } });
    if (!session) return null;
    const live = await prisma.dialAttempt.findMany({ where: { sessionId, state: { not: "ENDED" } }, orderBy: { createdAt: "asc" } });
    const last = session.agentState === "WRAP_UP"
        ? await prisma.dialAttempt.findFirst({ where: { sessionId, outcome: "CONVERSATION" }, orderBy: { endedAt: "desc" } })
        : null;
    const label = await names([...live, ...(last ? [last] : [])]);
    const line = (a: (typeof live)[number]): LineView => ({
        id: a.id,
        state: a.state,
        contactId: a.contactId,
        companyId: a.companyId,
        ...label(a),
        headline: (a.selection as { headline?: string } | null)?.headline ?? null,
        since: (a.answeredAt ?? a.ringingAt ?? a.placedAt ?? a.createdAt).toISOString(),
    });
    const connected = live.find((a) => a.state === "CONNECTED" || a.state === "BRIDGING");
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return {
        id: session.id,
        status: session.status,
        agentState: session.agentState,
        maxLines: session.maxLines,
        missionId: session.missionId,
        lines: live.filter((a) => a !== connected).map(line),
        connected: connected ? { ...line(connected), telephonyCallId: connected.telephonyCallId, campaignId: connected.campaignId } : null,
        toQualify: last ? { telephonyCallId: last.telephonyCallId, contactId: last.contactId, companyId: last.companyId, campaignId: last.campaignId, label: label(last).label } : null,
        stats: await sessionStats(session.sdrId, startOfDay),
    };
}
