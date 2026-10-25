// ============================================
// GET /api/email/dashboard/overview
// Everything the Email Hub "Vue d'ensemble" shows, in one call.
//
// Query:
//   blocks=triage,mailboxes,sequences,templates,activity,kpis,setup (default: all)
//   period=7|30|90 (KPIs only)
// Each block is computed on its own: one failing block comes back as
// { ok: false, error } and the page shows a retry for that block only.
// Scope: managers see every mailbox, everywhere on the page.
// ============================================

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { computeEmailMetrics, resolvePeriod, startOfParisToday, parisDayKey, SENT_STATUSES } from "../../analytics/_lib/metrics";

const ALL_BLOCKS = ["setup", "triage", "mailboxes", "sequences", "templates", "activity", "kpis"] as const;
type BlockName = (typeof ALL_BLOCKS)[number];

type Block<T> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(name: string, fn: () => Promise<T>): Promise<Block<T>> {
    try {
        return { ok: true, data: await fn() };
    } catch (error) {
        console.error(`[Email overview] block ${name} failed:`, error);
        return { ok: false, error: "Impossible de charger ce bloc" };
    }
}

const fullName = (c: { firstName: string | null; lastName: string | null } | null | undefined) =>
    c ? [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || null : null;

const contactSelect = {
    id: true,
    firstName: true,
    lastName: true,
    email: true,
    company: { select: { id: true, name: true, listId: true } },
} as const;

type ContactRow = {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    company: { id: string; name: string; listId: string } | null;
};

const contactRef = (c: ContactRow | null | undefined) =>
    c
        ? {
              id: c.id,
              name: fullName(c),
              email: c.email,
              companyId: c.company?.id ?? null,
              companyName: c.company?.name ?? null,
              listId: c.company?.listId ?? null,
          }
        : null;

/** sentToday only counts if it was reset today (it resets lazily on the next send). */
function effectiveSentToday(mb: { sentToday: number; lastSendReset: Date }, todayStart: Date, countedToday: number) {
    const stored = mb.lastSendReset >= todayStart ? mb.sentToday : 0;
    return Math.max(stored, countedToday);
}

// ── Blocks ───────────────────────────────────────────────────────────

async function setupBlock() {
    const [mailboxes, templates, sequences, reachInbox] = await Promise.all([
        prisma.mailbox.count({ where: { isActive: true } }),
        prisma.emailTemplate.count(),
        prisma.emailSequence.count({ where: { status: { not: "ARCHIVED" } } }),
        prisma.mailbox.count({ where: { provider: "REACHINBOX" } }),
    ]);
    return { mailboxes, templates, sequences, reachInbox: reachInbox > 0 };
}

async function triageBlock() {
    const todayStart = startOfParisToday();
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const unreadWhere = {
        isRead: false,
        isArchived: false,
        isTrashed: false,
        emails: { some: { direction: "INBOUND" as const } },
    };

    const [unreadTotal, unread, bounceTotal, failedTotal, problems, mailboxErrors, activeSequences, countedToday] = await Promise.all([
        prisma.emailThread.count({ where: unreadWhere }),
        prisma.emailThread.findMany({
            where: unreadWhere,
            orderBy: { lastEmailAt: "desc" },
            take: 6,
            select: {
                id: true,
                subject: true,
                snippet: true,
                lastEmailAt: true,
                contact: { select: contactSelect },
                mission: { select: { id: true, name: true } },
                mailbox: { select: { id: true, email: true } },
                emails: {
                    where: { direction: "INBOUND" },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: { fromName: true, fromAddress: true, snippet: true, receivedAt: true, createdAt: true },
                },
            },
        }),
        prisma.email.count({ where: { direction: "OUTBOUND", status: "BOUNCED", updatedAt: { gte: weekAgo } } }),
        prisma.email.count({ where: { direction: "OUTBOUND", status: "FAILED", createdAt: { gte: weekAgo } } }),
        prisma.email.findMany({
            where: { direction: "OUTBOUND", status: { in: ["BOUNCED", "FAILED"] }, updatedAt: { gte: weekAgo } },
            orderBy: { updatedAt: "desc" },
            take: 5,
            select: {
                id: true,
                status: true,
                subject: true,
                toAddresses: true,
                threadId: true,
                errorMessage: true,
                bounceType: true,
                updatedAt: true,
                contact: { select: contactSelect },
                mailbox: { select: { id: true, email: true } },
            },
        }),
        prisma.mailbox.findMany({
            where: { OR: [{ syncStatus: "ERROR" }, { disabledAt: { not: null } }] },
            orderBy: { updatedAt: "desc" },
            select: {
                id: true,
                email: true,
                provider: true,
                syncStatus: true,
                lastError: true,
                disabledReason: true,
                disabledAt: true,
                lastSyncAt: true,
                isActive: true,
            },
        }),
        prisma.emailSequence.findMany({
            where: { status: "ACTIVE" },
            select: {
                id: true,
                name: true,
                _count: { select: { steps: true } },
                mailbox: {
                    select: {
                        id: true,
                        email: true,
                        isActive: true,
                        syncStatus: true,
                        disabledAt: true,
                        sentToday: true,
                        lastSendReset: true,
                        dailySendLimit: true,
                    },
                },
            },
        }),
        prisma.email.groupBy({
            by: ["mailboxId"],
            where: { direction: "OUTBOUND", status: { in: SENT_STATUSES }, sentAt: { gte: todayStart } },
            _count: { _all: true },
        }),
    ]);

    // Sequence problems: ACTIVE yet nothing will go out.
    const seqIds = activeSequences.map((s) => s.id);
    const [activeEnrollments, overdue] = seqIds.length
        ? await Promise.all([
              prisma.emailSequenceEnrollment.groupBy({
                  by: ["sequenceId"],
                  where: { sequenceId: { in: seqIds }, status: "ACTIVE" },
                  _count: { _all: true },
              }),
              prisma.emailSequenceEnrollment.groupBy({
                  by: ["sequenceId"],
                  where: { sequenceId: { in: seqIds }, status: "ACTIVE", nextStepAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } },
                  _count: { _all: true },
              }),
          ])
        : [[], []];
    const sentTodayBy = new Map(countedToday.map((g) => [g.mailboxId, g._count._all]));

    const sequenceIssues: { id: string; name: string; reason: "no_steps" | "no_contacts" | "mailbox" | "limit" | "overdue"; detail: string }[] = [];
    for (const s of activeSequences) {
        const enrolled = activeEnrollments.find((g) => g.sequenceId === s.id)?._count._all ?? 0;
        const late = overdue.find((g) => g.sequenceId === s.id)?._count._all ?? 0;
        const mb = s.mailbox;
        const sentToday = effectiveSentToday(mb, todayStart, sentTodayBy.get(mb.id) ?? 0);
        if (s._count.steps === 0) {
            sequenceIssues.push({ id: s.id, name: s.name, reason: "no_steps", detail: "Active mais sans aucune étape" });
        } else if (!mb.isActive || mb.disabledAt || mb.syncStatus === "ERROR") {
            sequenceIssues.push({ id: s.id, name: s.name, reason: "mailbox", detail: `Envoi bloqué : ${mb.email} ${mb.syncStatus === "ERROR" ? "est en erreur" : "est désactivée"}` });
        } else if (enrolled === 0) {
            sequenceIssues.push({ id: s.id, name: s.name, reason: "no_contacts", detail: "Active mais aucun contact inscrit" });
        } else if (mb.dailySendLimit > 0 && sentToday >= mb.dailySendLimit) {
            sequenceIssues.push({ id: s.id, name: s.name, reason: "limit", detail: `Limite du jour atteinte sur ${mb.email} (${sentToday}/${mb.dailySendLimit})` });
        } else if (late > 0) {
            sequenceIssues.push({ id: s.id, name: s.name, reason: "overdue", detail: `${late} envoi${late > 1 ? "s" : ""} en retard de plus d'une heure` });
        }
    }

    return {
        unread: {
            total: unreadTotal,
            items: unread.map((t) => {
                const last = t.emails[0];
                return {
                    id: t.id,
                    subject: t.subject,
                    snippet: last?.snippet ?? t.snippet ?? null,
                    fromName: last?.fromName ?? null,
                    fromAddress: last?.fromAddress ?? null,
                    receivedAt: (last?.receivedAt ?? last?.createdAt ?? t.lastEmailAt).toISOString(),
                    contact: contactRef(t.contact),
                    mission: t.mission,
                    mailbox: t.mailbox,
                };
            }),
        },
        problems: {
            bounced: bounceTotal,
            failed: failedTotal,
            items: problems.map((e) => ({
                id: e.id,
                status: e.status,
                subject: e.subject,
                to: e.toAddresses[0] ?? null,
                threadId: e.threadId,
                error: e.errorMessage,
                bounceType: e.bounceType,
                at: e.updatedAt.toISOString(),
                contact: contactRef(e.contact),
                mailbox: e.mailbox,
            })),
        },
        mailboxErrors: mailboxErrors.map((m) => ({
            id: m.id,
            email: m.email,
            provider: m.provider,
            syncStatus: m.syncStatus,
            error: m.disabledReason || m.lastError,
            disabled: !!m.disabledAt || !m.isActive,
            lastSyncAt: m.lastSyncAt?.toISOString() ?? null,
        })),
        sequenceIssues,
    };
}

async function mailboxesBlock() {
    const todayStart = startOfParisToday();
    const [mailboxes, counted] = await Promise.all([
        prisma.mailbox.findMany({
            orderBy: [{ isActive: "desc" }, { email: "asc" }],
            select: {
                id: true,
                email: true,
                displayName: true,
                provider: true,
                syncStatus: true,
                warmupStatus: true,
                isActive: true,
                disabledAt: true,
                disabledReason: true,
                lastSyncAt: true,
                lastError: true,
                sentToday: true,
                lastSendReset: true,
                dailySendLimit: true,
                owner: { select: { id: true, name: true } },
            },
        }),
        prisma.email.groupBy({
            by: ["mailboxId"],
            where: { direction: "OUTBOUND", status: { in: SENT_STATUSES }, sentAt: { gte: todayStart } },
            _count: { _all: true },
        }),
    ]);
    const byId = new Map(counted.map((g) => [g.mailboxId, g._count._all]));
    return mailboxes.map((m) => ({
        id: m.id,
        email: m.email,
        displayName: m.displayName,
        provider: m.provider,
        syncStatus: m.syncStatus,
        warmupStatus: m.warmupStatus,
        isActive: m.isActive && !m.disabledAt,
        lastSyncAt: m.lastSyncAt?.toISOString() ?? null,
        error: m.disabledReason || (m.syncStatus === "ERROR" ? m.lastError : null),
        sentToday: effectiveSentToday(m, todayStart, byId.get(m.id) ?? 0),
        dailySendLimit: m.dailySendLimit,
        ownerName: m.owner?.name ?? null,
    }));
}

async function sequencesBlock() {
    const sevenDaysStart = new Date(startOfParisToday().getTime() - 6 * 24 * 3600 * 1000);
    const [statusCounts, sequences] = await Promise.all([
        prisma.emailSequence.groupBy({ by: ["status"], _count: { _all: true } }),
        prisma.emailSequence.findMany({
            where: { status: { in: ["ACTIVE", "PAUSED"] } },
            orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
            take: 12,
            select: {
                id: true,
                name: true,
                status: true,
                totalReplied: true,
                campaign: { select: { mission: { select: { id: true, name: true } } } },
                mailbox: { select: { id: true, email: true } },
                _count: { select: { steps: true } },
            },
        }),
    ]);
    const ids = sequences.map((s) => s.id);

    const [enrollmentGroups, nextSends, recentSends] = ids.length
        ? await Promise.all([
              prisma.emailSequenceEnrollment.groupBy({ by: ["sequenceId", "status"], where: { sequenceId: { in: ids } }, _count: { _all: true } }),
              prisma.emailSequenceEnrollment.groupBy({
                  by: ["sequenceId"],
                  where: { sequenceId: { in: ids }, status: "ACTIVE", nextStepAt: { not: null } },
                  _min: { nextStepAt: true },
              }),
              prisma.email.findMany({
                  where: {
                      direction: "OUTBOUND",
                      status: { in: SENT_STATUSES },
                      sentAt: { gte: sevenDaysStart },
                      OR: [{ sequenceStep: { sequenceId: { in: ids } } }, { sequenceEnrollment: { sequenceId: { in: ids } } }],
                  },
                  select: { sentAt: true, sequenceStep: { select: { sequenceId: true } }, sequenceEnrollment: { select: { sequenceId: true } } },
                  take: 20_000,
              }),
          ])
        : [[], [], []];

    const dayKeys: string[] = [];
    for (let i = 0; i < 7; i++) dayKeys.push(parisDayKey(new Date(sevenDaysStart.getTime() + i * 24 * 3600 * 1000 + 12 * 3600 * 1000)));

    const rows = sequences.map((s) => {
        const groups = enrollmentGroups.filter((g) => g.sequenceId === s.id);
        const count = (st?: string) => groups.filter((g) => !st || g.status === st).reduce((n, g) => n + g._count._all, 0);
        const spark = dayKeys.map(() => 0);
        for (const e of recentSends) {
            const sid = e.sequenceStep?.sequenceId ?? e.sequenceEnrollment?.sequenceId;
            if (sid !== s.id || !e.sentAt) continue;
            const i = dayKeys.indexOf(parisDayKey(e.sentAt));
            if (i >= 0) spark[i]++;
        }
        return {
            id: s.id,
            name: s.name,
            status: s.status,
            mission: s.campaign?.mission ?? null,
            mailboxEmail: s.mailbox.email,
            steps: s._count.steps,
            enrolled: count(),
            inProgress: count("ACTIVE"),
            replied: Math.max(count("REPLIED"), s.totalReplied),
            nextSendAt: nextSends.find((n) => n.sequenceId === s.id)?._min.nextStepAt?.toISOString() ?? null,
            sent7d: spark,
        };
    });

    const byStatus = Object.fromEntries(statusCounts.map((g) => [g.status, g._count._all])) as Record<string, number>;
    const nextSendAt = rows.filter((r) => r.status === "ACTIVE" && r.nextSendAt).map((r) => r.nextSendAt as string).sort()[0] ?? null;
    return {
        counts: { active: byStatus.ACTIVE ?? 0, paused: byStatus.PAUSED ?? 0, draft: byStatus.DRAFT ?? 0 },
        enrolled: rows.reduce((n, r) => n + r.enrolled, 0),
        inProgress: rows.reduce((n, r) => n + r.inProgress, 0),
        replied: rows.reduce((n, r) => n + r.replied, 0),
        nextSendAt,
        rows,
    };
}

async function templatesBlock() {
    const [total, sendsByTemplate, mostUsedField, missionsWithout, activeMissions] = await Promise.all([
        prisma.emailTemplate.count(),
        prisma.email.groupBy({
            by: ["templateId"],
            where: { direction: "OUTBOUND", templateId: { not: null }, status: { notIn: ["DRAFT"] } },
            _count: { _all: true },
            _max: { sentAt: true },
        }),
        prisma.emailTemplate.findMany({
            where: { useCount: { gt: 0 } },
            orderBy: { useCount: "desc" },
            take: 5,
            select: { id: true },
        }),
        prisma.mission.findMany({
            where: { status: "ACTIVE", isActive: true, emailTemplates: { none: {} } },
            orderBy: { updatedAt: "desc" },
            take: 6,
            select: { id: true, name: true, client: { select: { name: true } } },
        }),
        prisma.mission.count({ where: { status: "ACTIVE", isActive: true } }),
    ]);
    const missionsWithoutCount = await prisma.mission.count({ where: { status: "ACTIVE", isActive: true, emailTemplates: { none: {} } } });

    const candidateIds = Array.from(new Set([...sendsByTemplate.map((g) => g.templateId as string), ...mostUsedField.map((t) => t.id)]));
    const templates = candidateIds.length
        ? await prisma.emailTemplate.findMany({
              where: { id: { in: candidateIds } },
              select: { id: true, name: true, category: true, useCount: true, lastUsedAt: true, _count: { select: { missionTemplates: true } } },
          })
        : [];
    const top = templates
        .map((t) => {
            const g = sendsByTemplate.find((x) => x.templateId === t.id);
            const sends = g?._count._all ?? 0;
            const lastUsed = [t.lastUsedAt, g?._max.sentAt].filter(Boolean).sort((a, b) => (b as Date).getTime() - (a as Date).getTime())[0] as Date | undefined;
            return {
                id: t.id,
                name: t.name,
                category: t.category,
                sends,
                uses: Math.max(t.useCount, sends),
                missions: t._count.missionTemplates,
                lastUsedAt: lastUsed?.toISOString() ?? null,
            };
        })
        .sort((a, b) => b.uses - a.uses || b.sends - a.sends)
        .slice(0, 5);

    return {
        total,
        activeMissions,
        top,
        missionsWithout: {
            total: missionsWithoutCount,
            items: missionsWithout.map((m) => ({ id: m.id, name: m.name, clientName: m.client?.name ?? null })),
        },
    };
}

async function activityBlock() {
    const select = {
        id: true,
        direction: true,
        status: true,
        subject: true,
        fromName: true,
        fromAddress: true,
        toAddresses: true,
        sentAt: true,
        receivedAt: true,
        createdAt: true,
        updatedAt: true,
        lastOpenedAt: true,
        openCount: true,
        threadId: true,
        contact: { select: contactSelect },
        mission: { select: { id: true, name: true } },
        sentBy: { select: { id: true, name: true } },
        mailbox: { select: { id: true, email: true } },
        sequenceStep: { select: { order: true, sequence: { select: { id: true, name: true } } } },
    } as const;

    const [inbound, outbound, opens] = await Promise.all([
        prisma.email.findMany({ where: { direction: "INBOUND" }, orderBy: { createdAt: "desc" }, take: 12, select }),
        prisma.email.findMany({ where: { direction: "OUTBOUND", status: { notIn: ["DRAFT"] } }, orderBy: { updatedAt: "desc" }, take: 12, select }),
        prisma.email.findMany({ where: { direction: "OUTBOUND", lastOpenedAt: { not: null } }, orderBy: { lastOpenedAt: "desc" }, take: 6, select }),
    ]);

    type Row = (typeof inbound)[number];
    const event = (e: Row, kind: "received" | "sent" | "bounced" | "failed" | "opened" | "queued", at: Date) => ({
        id: `${e.id}-${kind}`,
        emailId: e.id,
        kind,
        at: at.toISOString(),
        subject: e.subject,
        threadId: e.threadId,
        counterpart: e.direction === "INBOUND" ? e.fromName || e.fromAddress : e.toAddresses[0] ?? null,
        contact: contactRef(e.contact),
        mission: e.mission,
        sentByName: e.sentBy?.name ?? null,
        mailboxEmail: e.mailbox.email,
        sequence: e.sequenceStep ? { id: e.sequenceStep.sequence.id, name: e.sequenceStep.sequence.name, step: e.sequenceStep.order + 1 } : null,
        openCount: kind === "opened" ? e.openCount : undefined,
    });

    const events = [
        ...inbound.map((e) => event(e, "received", e.receivedAt ?? e.createdAt)),
        ...outbound.map((e) =>
            e.status === "BOUNCED"
                ? event(e, "bounced", e.updatedAt)
                : e.status === "FAILED"
                  ? event(e, "failed", e.updatedAt)
                  : e.status === "QUEUED" || e.status === "SENDING"
                    ? event(e, "queued", e.createdAt)
                    : event(e, "sent", e.sentAt ?? e.createdAt),
        ),
        ...opens.map((e) => event(e, "opened", e.lastOpenedAt as Date)),
    ];
    events.sort((a, b) => b.at.localeCompare(a.at));
    const seen = new Set<string>();
    return events.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true))).slice(0, 15);
}

async function kpisBlock(searchParams: URLSearchParams) {
    const period = resolvePeriod(searchParams, "30");
    const [metrics, trackedEver] = await Promise.all([
        computeEmailMetrics(period),
        prisma.email.count({ where: { direction: "OUTBOUND", trackingPixelId: { not: null } } }),
    ]);
    return { ...metrics, trackedEver };
}

// ── Handler ──────────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
    await requireRole(["MANAGER", "DEVELOPER"], req);

    const { searchParams } = new URL(req.url);
    const asked = (searchParams.get("blocks") ?? "").split(",").map((b) => b.trim()).filter(Boolean);
    const blocks: BlockName[] = asked.length ? (ALL_BLOCKS.filter((b) => asked.includes(b)) as BlockName[]) : [...ALL_BLOCKS];

    const runners: Record<BlockName, () => Promise<unknown>> = {
        setup: setupBlock,
        triage: triageBlock,
        mailboxes: mailboxesBlock,
        sequences: sequencesBlock,
        templates: templatesBlock,
        activity: activityBlock,
        kpis: () => kpisBlock(searchParams),
    };

    const results = await Promise.all(blocks.map((b) => run(b, runners[b])));
    const data: Partial<Record<BlockName, Block<unknown>>> = {};
    blocks.forEach((b, i) => {
        data[b] = results[i];
    });

    return successResponse({ generatedAt: new Date().toISOString(), blocks: data });
});
