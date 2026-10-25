// ============================================
// EMAIL METRICS — computed straight from the Email table.
//
// EmailAnalyticsDaily is never filled (its worker never runs), so every figure
// of the Email Hub (Vue d'ensemble KPIs, Analytics) comes from here instead.
//
// Definitions (keep in sync with the copy in AnalyticsView / the dashboard):
//   sent      OUTBOUND, status not DRAFT/QUEUED/SENDING/FAILED, dated by sentAt (createdAt if null)
//   delivered sent − bounced
//   opened    firstOpenedAt set or openCount > 0 (only meaningful when a pixel was injected)
//   clicked   clickCount > 0 or status CLICKED
//   replied   status REPLIED, or an INBOUND email on the same thread after the send
//   bounced   status BOUNCED
//   failed    OUTBOUND status FAILED, dated by createdAt
//   tracked   sent with a trackingPixelId — the denominator of open/click rates
// Days are Europe/Paris days.
// ============================================

import { DateTime } from "luxon";
import type { EmailStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const EMAIL_ZONE = "Europe/Paris";

export const SENT_STATUSES: EmailStatus[] = ["SENT", "DELIVERED", "OPENED", "CLICKED", "REPLIED", "BOUNCED"];

const ROW_CAP = 20_000;
const MAX_DAYS = 366;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export type PeriodPreset = "7" | "30" | "90" | "custom";

export interface EmailPeriod {
    preset: PeriodPreset;
    from: Date;
    to: Date;
    /** yyyy-MM-dd (Paris) of each day in the period, oldest first. */
    days: string[];
}

export function parisDayKey(d: Date): string {
    return DateTime.fromJSDate(d).setZone(EMAIL_ZONE).toISODate() ?? "";
}

export function startOfParisToday(now: Date = new Date()): Date {
    return DateTime.fromJSDate(now).setZone(EMAIL_ZONE).startOf("day").toJSDate();
}

/** `period=7|30|90|custom` (+ `from`/`to` as yyyy-MM-dd for custom). */
export function resolvePeriod(params: URLSearchParams, fallback: PeriodPreset = "30"): EmailPeriod {
    const raw = params.get("period") ?? params.get("days") ?? fallback;
    const preset: PeriodPreset = raw === "7" || raw === "30" || raw === "90" || raw === "custom" ? raw : raw === "7d" ? "7" : raw === "90d" ? "90" : fallback;
    const now = DateTime.now().setZone(EMAIL_ZONE);

    let from: DateTime;
    let to: DateTime;
    const f = params.get("from");
    const t = params.get("to");
    if (preset === "custom" && f && t && DAY_RE.test(f) && DAY_RE.test(t)) {
        from = DateTime.fromISO(f, { zone: EMAIL_ZONE }).startOf("day");
        to = DateTime.fromISO(t, { zone: EMAIL_ZONE }).endOf("day");
        if (!from.isValid || !to.isValid || from > to) {
            from = now.minus({ days: 29 }).startOf("day");
            to = now.endOf("day");
        }
        if (to.diff(from, "days").days > MAX_DAYS) from = to.minus({ days: MAX_DAYS - 1 }).startOf("day");
    } else {
        const n = preset === "custom" ? 30 : Number(preset);
        from = now.minus({ days: n - 1 }).startOf("day");
        to = now.endOf("day");
    }

    const days: string[] = [];
    for (let d = from; d <= to && days.length < MAX_DAYS; d = d.plus({ days: 1 })) days.push(d.toISODate() ?? "");
    return { preset: preset === "custom" && !(f && t) ? fallback : preset, from: from.toJSDate(), to: to.toJSDate(), days };
}

// ── Types ────────────────────────────────────────────────────────────

export interface MetricTotals {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    replied: number;
    bounced: number;
    failed: number;
    tracked: number;
    inbound: number;
}

export interface MetricRates {
    /** null when no sent email carried a tracking pixel. */
    openRate: number | null;
    clickRate: number | null;
    replyRate: number | null;
    bounceRate: number | null;
}

export interface DailyPoint {
    date: string;
    sent: number;
    opened: number;
    clicked: number;
    replied: number;
    bounced: number;
    failed: number;
    inbound: number;
}

export interface BreakdownRow {
    id: string;
    label: string;
    hint?: string | null;
    sent: number;
    tracked: number;
    opened: number;
    replied: number;
    bounced: number;
    failed: number;
}

export type BreakdownKey = "mailbox" | "mission" | "sdr" | "sequence" | "template";

export interface EmailMetrics {
    period: { preset: PeriodPreset; from: string; to: string; days: number };
    totals: MetricTotals;
    rates: MetricRates;
    daily: DailyPoint[];
    breakdowns?: Record<BreakdownKey, BreakdownRow[]>;
    responseTime: { medianMinutes: number | null; samples: number };
    sequences: { enrolled: number; completed: number; replied: number; active: number };
    /** True when the row cap was hit: figures are a lower bound. */
    truncated: boolean;
}

export interface MetricFilters {
    mailboxId?: string | null;
    missionId?: string | null;
    sentById?: string | null;
}

const rate = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

export function toRates(t: MetricTotals): MetricRates {
    return {
        openRate: rate(t.opened, t.tracked),
        clickRate: rate(t.clicked, t.tracked),
        replyRate: rate(t.replied, t.sent),
        bounceRate: rate(t.bounced, t.sent),
    };
}

// ── Core ─────────────────────────────────────────────────────────────

export async function computeEmailMetrics(
    period: EmailPeriod,
    filters: MetricFilters = {},
    opts: { breakdowns?: boolean } = {},
): Promise<EmailMetrics> {
    const range = { gte: period.from, lte: period.to };
    const scope: Prisma.EmailWhereInput[] = [];
    if (filters.mailboxId) scope.push({ mailboxId: filters.mailboxId });
    if (filters.missionId) scope.push({ OR: [{ missionId: filters.missionId }, { thread: { missionId: filters.missionId } }] });
    if (filters.sentById) scope.push({ sentById: filters.sentById });

    const outboundWhere: Prisma.EmailWhereInput = {
        AND: [
            ...scope,
            { direction: "OUTBOUND" },
            {
                OR: [
                    { status: { in: SENT_STATUSES }, OR: [{ sentAt: range }, { sentAt: null, createdAt: range }] },
                    { status: "FAILED", createdAt: range },
                ],
            },
        ],
    };

    const inboundWhere: Prisma.EmailWhereInput = {
        AND: [
            ...scope.filter((s) => !("sentById" in s)),
            { direction: "INBOUND" },
            { OR: [{ receivedAt: range }, { receivedAt: null, createdAt: range }] },
        ],
    };

    const [outbound, inbound, enrollments] = await Promise.all([
        prisma.email.findMany({
            where: outboundWhere,
            select: {
                id: true,
                threadId: true,
                status: true,
                sentAt: true,
                createdAt: true,
                openCount: true,
                clickCount: true,
                firstOpenedAt: true,
                trackingPixelId: true,
                mailboxId: true,
                missionId: true,
                sentById: true,
                templateId: true,
                sequenceStep: { select: { sequenceId: true } },
                sequenceEnrollment: { select: { sequenceId: true } },
            },
            orderBy: { createdAt: "desc" },
            take: ROW_CAP,
        }),
        prisma.email.findMany({
            where: inboundWhere,
            select: { receivedAt: true, createdAt: true },
            take: ROW_CAP,
        }),
        prisma.emailSequenceEnrollment.findMany({
            where: {
                enrolledAt: range,
                ...(filters.mailboxId ? { sequence: { mailboxId: filters.mailboxId } } : {}),
                ...(filters.missionId ? { sequence: { campaign: { missionId: filters.missionId } } } : {}),
            },
            select: { status: true },
            take: ROW_CAP,
        }),
    ]);

    // First inbound per thread after each send → replies + response time.
    const sentRows = outbound.filter((e) => e.status !== "FAILED");
    const threadIds = Array.from(new Set(sentRows.map((e) => e.threadId)));
    const inboundByThread = new Map<string, number[]>();
    for (let i = 0; i < threadIds.length; i += 5000) {
        const chunk = threadIds.slice(i, i + 5000);
        const replies = await prisma.email.findMany({
            where: { direction: "INBOUND", threadId: { in: chunk } },
            select: { threadId: true, receivedAt: true, createdAt: true },
        });
        for (const r of replies) {
            const at = (r.receivedAt ?? r.createdAt).getTime();
            const list = inboundByThread.get(r.threadId) ?? [];
            list.push(at);
            inboundByThread.set(r.threadId, list);
        }
    }
    inboundByThread.forEach((list) => list.sort((a, b) => a - b));

    const totals: MetricTotals = { sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, failed: 0, tracked: 0, inbound: inbound.length };
    const dailyMap = new Map<string, DailyPoint>(
        period.days.map((d) => [d, { date: d, sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, failed: 0, inbound: 0 }]),
    );
    const responseMinutes: number[] = [];

    const buckets: Record<BreakdownKey, Map<string, BreakdownRow>> = {
        mailbox: new Map(),
        mission: new Map(),
        sdr: new Map(),
        sequence: new Map(),
        template: new Map(),
    };
    const bump = (key: BreakdownKey, id: string | null | undefined, f: (r: BreakdownRow) => void) => {
        if (!opts.breakdowns) return;
        const k = id ?? "__none__";
        let row = buckets[key].get(k);
        if (!row) {
            row = { id: k, label: "", sent: 0, tracked: 0, opened: 0, replied: 0, bounced: 0, failed: 0 };
            buckets[key].set(k, row);
        }
        f(row);
    };

    for (const e of outbound) {
        const sequenceId = e.sequenceStep?.sequenceId ?? e.sequenceEnrollment?.sequenceId ?? null;
        const dims: [BreakdownKey, string | null][] = [
            ["mailbox", e.mailboxId],
            ["mission", e.missionId],
            ["sdr", e.sentById],
            ["sequence", sequenceId],
            ["template", e.templateId],
        ];

        if (e.status === "FAILED") {
            totals.failed++;
            const day = dailyMap.get(parisDayKey(e.createdAt));
            if (day) day.failed++;
            for (const [k, id] of dims) bump(k, id, (r) => r.failed++);
            continue;
        }

        const at = e.sentAt ?? e.createdAt;
        const day = dailyMap.get(parisDayKey(at));
        const tracked = !!e.trackingPixelId;
        const opened = !!e.firstOpenedAt || e.openCount > 0;
        const clicked = e.clickCount > 0 || e.status === "CLICKED";
        const bounced = e.status === "BOUNCED";
        const firstReply = inboundByThread.get(e.threadId)?.find((t) => t >= at.getTime());
        const replied = e.status === "REPLIED" || firstReply !== undefined;

        totals.sent++;
        if (tracked) totals.tracked++;
        if (opened) totals.opened++;
        if (clicked) totals.clicked++;
        if (bounced) totals.bounced++;
        if (replied) totals.replied++;
        if (firstReply !== undefined) responseMinutes.push((firstReply - at.getTime()) / 60_000);

        if (day) {
            day.sent++;
            if (opened) day.opened++;
            if (clicked) day.clicked++;
            if (bounced) day.bounced++;
            if (replied) day.replied++;
        }
        for (const [k, id] of dims) {
            bump(k, id, (r) => {
                r.sent++;
                if (tracked) r.tracked++;
                if (opened) r.opened++;
                if (replied) r.replied++;
                if (bounced) r.bounced++;
            });
        }
    }
    totals.delivered = totals.sent - totals.bounced;

    for (const m of inbound) {
        const day = dailyMap.get(parisDayKey(m.receivedAt ?? m.createdAt));
        if (day) day.inbound++;
    }

    responseMinutes.sort((a, b) => a - b);
    const mid = Math.floor(responseMinutes.length / 2);
    const medianMinutes = responseMinutes.length === 0
        ? null
        : Math.round(responseMinutes.length % 2 ? responseMinutes[mid] : (responseMinutes[mid - 1] + responseMinutes[mid]) / 2);

    const result: EmailMetrics = {
        period: { preset: period.preset, from: period.from.toISOString(), to: period.to.toISOString(), days: period.days.length },
        totals,
        rates: toRates(totals),
        daily: Array.from(dailyMap.values()),
        responseTime: { medianMinutes, samples: responseMinutes.length },
        sequences: {
            enrolled: enrollments.length,
            active: enrollments.filter((e) => e.status === "ACTIVE").length,
            completed: enrollments.filter((e) => e.status === "COMPLETED").length,
            replied: enrollments.filter((e) => e.status === "REPLIED").length,
        },
        truncated: outbound.length >= ROW_CAP || inbound.length >= ROW_CAP,
    };

    if (opts.breakdowns) result.breakdowns = await labelBreakdowns(buckets);
    return result;
}

async function labelBreakdowns(buckets: Record<BreakdownKey, Map<string, BreakdownRow>>): Promise<Record<BreakdownKey, BreakdownRow[]>> {
    const ids = (k: BreakdownKey) => Array.from(buckets[k].keys()).filter((id) => id !== "__none__");
    const [mailboxes, missions, users, sequences, templates] = await Promise.all([
        prisma.mailbox.findMany({ where: { id: { in: ids("mailbox") } }, select: { id: true, email: true, provider: true } }),
        prisma.mission.findMany({ where: { id: { in: ids("mission") } }, select: { id: true, name: true, client: { select: { name: true } } } }),
        prisma.user.findMany({ where: { id: { in: ids("sdr") } }, select: { id: true, name: true, role: true } }),
        prisma.emailSequence.findMany({ where: { id: { in: ids("sequence") } }, select: { id: true, name: true, status: true } }),
        prisma.emailTemplate.findMany({ where: { id: { in: ids("template") } }, select: { id: true, name: true } }),
    ]);

    const NONE: Record<BreakdownKey, string> = {
        mailbox: "Boîte inconnue",
        mission: "Sans mission",
        sdr: "Envoi automatique",
        sequence: "Hors séquence",
        template: "Sans template",
    };
    const label = (k: BreakdownKey, id: string): { label: string; hint?: string | null } => {
        if (id === "__none__") return { label: NONE[k] };
        switch (k) {
            case "mailbox": {
                const m = mailboxes.find((x) => x.id === id);
                return { label: m?.email ?? "Boîte supprimée", hint: m?.provider ?? null };
            }
            case "mission": {
                const m = missions.find((x) => x.id === id);
                return { label: m?.name ?? "Mission supprimée", hint: m?.client?.name ?? null };
            }
            case "sdr": {
                const u = users.find((x) => x.id === id);
                return { label: u?.name ?? "Utilisateur supprimé", hint: u?.role ?? null };
            }
            case "sequence": {
                const s = sequences.find((x) => x.id === id);
                return { label: s?.name ?? "Séquence supprimée", hint: s?.status ?? null };
            }
            case "template": {
                const t = templates.find((x) => x.id === id);
                return { label: t?.name ?? "Template supprimé" };
            }
        }
    };

    const out = {} as Record<BreakdownKey, BreakdownRow[]>;
    (Object.keys(buckets) as BreakdownKey[]).forEach((k) => {
        out[k] = Array.from(buckets[k].values())
            .map((r) => ({ ...r, ...label(k, r.id) }))
            .sort((a, b) => b.sent - a.sent || b.failed - a.failed);
    });
    return out;
}
