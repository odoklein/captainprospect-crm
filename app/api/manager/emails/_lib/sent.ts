// ============================================
// SENT EMAILS — shared by the manager (/api/manager/emails/sent) and SDR
// (/api/sdr/emails/sent) routes: filters, list, status counts, CSV, resend.
// The SDR routes pass `sentById` so an SDR only ever sees their own emails.
// Emails are history: nothing here deletes a row.
// ============================================

import { DateTime } from "luxon";
import type { EmailStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { emailSendingService } from "@/lib/email/services/sending-service";

const ZONE = "Europe/Paris";
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const STATUS_FILTERS = ["SENT", "OPENED", "REPLIED", "BOUNCED", "FAILED", "PENDING"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

const DELIVERED: EmailStatus[] = ["SENT", "DELIVERED", "OPENED", "CLICKED", "REPLIED"];

export interface SentFilters {
    status: StatusFilter | null;
    missionId: string | null;
    sdrId: string | null;
    mailboxId: string | null;
    templateId: string | null;
    sequenceId: string | null;
    q: string | null;
    from: string | null;
    to: string | null;
    page: number;
    limit: number;
    sort: "sentAt" | "subject" | "status" | "openCount";
    order: "asc" | "desc";
}

export function parseSentFilters(sp: URLSearchParams): SentFilters {
    const get = (...keys: string[]) => {
        for (const k of keys) {
            const v = sp.get(k)?.trim();
            if (v) return v;
        }
        return null;
    };
    const rawStatus = get("status")?.toUpperCase() ?? null;
    const status = (STATUS_FILTERS as readonly string[]).includes(rawStatus ?? "") ? (rawStatus as StatusFilter) : null;
    const sort = get("sort", "sortBy");
    const from = get("from", "dateFrom");
    const to = get("to", "dateTo");
    return {
        status,
        missionId: get("mission", "missionId"),
        sdrId: get("sdr", "sdrId"),
        mailboxId: get("mailbox", "mailboxId"),
        templateId: get("template", "templateId"),
        sequenceId: get("sequence", "sequenceId"),
        q: get("q", "search"),
        from: from && DAY_RE.test(from) ? from : null,
        to: to && DAY_RE.test(to) ? to : null,
        page: Math.max(1, parseInt(get("page") ?? "1", 10) || 1),
        limit: Math.min(100, Math.max(1, parseInt(get("limit") ?? "25", 10) || 25)),
        sort: sort === "subject" || sort === "status" || sort === "openCount" ? sort : "sentAt",
        order: get("order", "sortOrder") === "asc" ? "asc" : "desc",
    };
}

function statusWhere(s: StatusFilter): Prisma.EmailWhereInput {
    switch (s) {
        case "SENT":
            return { status: { in: DELIVERED } };
        case "OPENED":
            return { status: { in: DELIVERED }, OR: [{ openCount: { gt: 0 } }, { firstOpenedAt: { not: null } }, { status: { in: ["OPENED", "CLICKED"] } }] };
        case "REPLIED":
            return { OR: [{ status: "REPLIED" }, { status: { in: DELIVERED }, thread: { emails: { some: { direction: "INBOUND" } } } }] };
        case "BOUNCED":
            return { status: "BOUNCED" };
        case "FAILED":
            return { status: "FAILED" };
        case "PENDING":
            return { status: { in: ["QUEUED", "SENDING"] } };
    }
}

/** Everything but the status filter (the status chips count against this). */
export function baseWhere(f: SentFilters, scope: { sentById?: string }): Prisma.EmailWhereInput {
    const and: Prisma.EmailWhereInput[] = [{ direction: "OUTBOUND" }, { status: { not: "DRAFT" } }];
    if (scope.sentById) and.push({ sentById: scope.sentById });
    if (f.sdrId && !scope.sentById) and.push({ sentById: f.sdrId });
    if (f.missionId) and.push({ missionId: f.missionId });
    if (f.mailboxId) and.push({ mailboxId: f.mailboxId });
    if (f.templateId) and.push({ templateId: f.templateId });
    if (f.sequenceId) and.push({ OR: [{ sequenceStep: { sequenceId: f.sequenceId } }, { sequenceEnrollment: { sequenceId: f.sequenceId } }] });

    if (f.from || f.to) {
        const range: Prisma.DateTimeFilter = {};
        if (f.from) range.gte = DateTime.fromISO(f.from, { zone: ZONE }).startOf("day").toJSDate();
        if (f.to) range.lte = DateTime.fromISO(f.to, { zone: ZONE }).endOf("day").toJSDate();
        and.push({ OR: [{ sentAt: range }, { sentAt: null, createdAt: range }] });
    }

    if (f.q) {
        const q = f.q;
        const ci = { contains: q, mode: "insensitive" as const };
        and.push({
            OR: [
                { subject: ci },
                { toAddresses: { has: q.toLowerCase() } },
                { contact: { firstName: ci } },
                { contact: { lastName: ci } },
                { contact: { email: ci } },
                { contact: { company: { name: ci } } },
                ...(scope.sentById ? [] : [{ sentBy: { name: ci } }]),
            ],
        });
    }
    return { AND: and };
}

export function sentWhere(f: SentFilters, scope: { sentById?: string }): Prisma.EmailWhereInput {
    const base = baseWhere(f, scope);
    return f.status ? { AND: [base, statusWhere(f.status)] } : base;
}

export const sentListSelect = {
    id: true,
    subject: true,
    snippet: true,
    status: true,
    sentAt: true,
    createdAt: true,
    openCount: true,
    clickCount: true,
    firstOpenedAt: true,
    lastOpenedAt: true,
    toAddresses: true,
    threadId: true,
    errorMessage: true,
    bounceType: true,
    trackingPixelId: true,
    contact: {
        select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            company: { select: { id: true, name: true, listId: true } },
        },
    },
    mission: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
    sentBy: { select: { id: true, name: true } },
    template: { select: { id: true, name: true } },
    mailbox: { select: { id: true, email: true } },
    sequenceStep: { select: { order: true, sequence: { select: { id: true, name: true } } } },
    thread: { select: { _count: { select: { emails: { where: { direction: "INBOUND" as const } } } } } },
} satisfies Prisma.EmailSelect;

type ListRow = Prisma.EmailGetPayload<{ select: typeof sentListSelect }>;

/** Flattens a row for the client: no tracking id leaks, a `replies` count, ISO dates. */
export function serializeSent(e: ListRow) {
    const { trackingPixelId, thread, ...rest } = e;
    return {
        ...rest,
        tracked: !!trackingPixelId,
        replies: thread?._count.emails ?? 0,
    };
}

function orderBy(f: SentFilters): Prisma.EmailOrderByWithRelationInput[] {
    switch (f.sort) {
        case "subject":
            return [{ subject: f.order }, { createdAt: "desc" }];
        case "status":
            return [{ status: f.order }, { createdAt: "desc" }];
        case "openCount":
            return [{ openCount: f.order }, { createdAt: "desc" }];
        default:
            return [{ sentAt: { sort: f.order, nulls: "last" } }, { createdAt: f.order }];
    }
}

export async function listSent(f: SentFilters, scope: { sentById?: string }) {
    const where = sentWhere(f, scope);
    const base = baseWhere(f, scope);
    const [rows, total, ...counts] = await Promise.all([
        prisma.email.findMany({ where, orderBy: orderBy(f), skip: (f.page - 1) * f.limit, take: f.limit, select: sentListSelect }),
        prisma.email.count({ where }),
        prisma.email.count({ where: base }),
        ...STATUS_FILTERS.map((s) => prisma.email.count({ where: { AND: [base, statusWhere(s)] } })),
    ]);
    const statusCounts = Object.fromEntries(STATUS_FILTERS.map((s, i) => [s, counts[i + 1]])) as Record<StatusFilter, number>;
    return {
        data: rows.map(serializeSent),
        pagination: { page: f.page, limit: f.limit, total, totalPages: Math.max(1, Math.ceil(total / f.limit)) },
        counts: { ALL: counts[0], ...statusCounts },
    };
}

/** Filter options limited to what actually has sent emails in this scope. */
export async function sentOptions(scope: { sentById?: string }) {
    const has: Prisma.EmailWhereInput = { direction: "OUTBOUND", status: { not: "DRAFT" }, ...(scope.sentById ? { sentById: scope.sentById } : {}) };
    const [missions, senders, mailboxes, templates, sequences] = await Promise.all([
        prisma.mission.findMany({
            where: { sentEmails: { some: has } },
            select: { id: true, name: true, client: { select: { name: true } } },
            orderBy: { name: "asc" },
        }),
        scope.sentById
            ? Promise.resolve([])
            : prisma.user.findMany({ where: { sentEmails: { some: has } }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
        prisma.mailbox.findMany({ where: { emails: { some: has } }, select: { id: true, email: true }, orderBy: { email: "asc" } }),
        prisma.emailTemplate.findMany({ where: { sentEmails: { some: has } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
        prisma.emailSequence.findMany({ where: { steps: { some: { emails: { some: has } } } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    return {
        missions: missions.map((m) => ({ id: m.id, label: m.name, hint: m.client?.name ?? null })),
        senders: senders.map((u) => ({ id: u.id, label: u.name, hint: u.role })),
        mailboxes: mailboxes.map((m) => ({ id: m.id, label: m.email })),
        templates: templates.map((t) => ({ id: t.id, label: t.name })),
        sequences: sequences.map((s) => ({ id: s.id, label: s.name })),
    };
}

// ── CSV ──────────────────────────────────────────────────────────────

export const CSV_CAP = 10_000;

const STATUS_LABEL: Record<string, string> = {
    DRAFT: "Brouillon",
    QUEUED: "En attente",
    SENDING: "En cours d'envoi",
    SENT: "Envoyé",
    DELIVERED: "Délivré",
    OPENED: "Ouvert",
    CLICKED: "Cliqué",
    REPLIED: "Répondu",
    BOUNCED: "Rebond",
    FAILED: "Échec",
};

function csvCell(v: string | number | null | undefined): string {
    if (v === null || v === undefined) return "";
    let s = String(v);
    // Formula injection guard for Excel/Sheets.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const csvDate = (d: Date | null) =>
    d ? DateTime.fromJSDate(d).setZone(ZONE).toFormat("dd/MM/yyyy HH:mm") : "";

/** UTF-8 BOM + `;` separator: opens cleanly in Excel FR. */
export async function sentCsv(f: SentFilters, scope: { sentById?: string }) {
    const where = sentWhere(f, scope);
    const [rows, total] = await Promise.all([
        prisma.email.findMany({ where, orderBy: orderBy(f), take: CSV_CAP, select: sentListSelect }),
        prisma.email.count({ where }),
    ]);
    const headers = [
        "Date d'envoi",
        "Statut",
        "Objet",
        "Destinataire",
        "Contact",
        "Société",
        "Mission",
        "Client",
        ...(scope.sentById ? [] : ["Envoyé par"]),
        "Boîte d'envoi",
        "Template",
        "Séquence",
        "Ouvertures",
        "Clics",
        "Réponses",
        "Première ouverture",
        "Erreur",
    ];
    const lines = rows.map((e) =>
        [
            csvDate(e.sentAt ?? e.createdAt),
            STATUS_LABEL[e.status] ?? e.status,
            e.subject,
            e.toAddresses.join(", "),
            [e.contact?.firstName, e.contact?.lastName].filter(Boolean).join(" "),
            e.contact?.company?.name,
            e.mission?.name,
            e.mission?.client?.name,
            ...(scope.sentById ? [] : [e.sentBy?.name ?? ""]),
            e.mailbox.email,
            e.template?.name,
            e.sequenceStep ? `${e.sequenceStep.sequence.name} (étape ${e.sequenceStep.order + 1})` : "",
            e.trackingPixelId ? e.openCount : "",
            e.trackingPixelId ? e.clickCount : "",
            e.thread?._count.emails ?? 0,
            csvDate(e.firstOpenedAt),
            e.errorMessage,
        ]
            .map(csvCell)
            .join(";"),
    );
    const body = "﻿" + [headers.map(csvCell).join(";"), ...lines].join("\r\n") + "\r\n";
    const filename = `emails-envoyes-${DateTime.now().setZone(ZONE).toFormat("yyyy-MM-dd")}.csv`;
    return { body, filename, total, exported: rows.length };
}

export function csvResponseHeaders(filename: string, total: number, exported: number): HeadersInit {
    return {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Total-Count": String(total),
        "X-Exported-Count": String(exported),
    };
}

// ── Resend (FAILED only) ─────────────────────────────────────────────

export const RESEND_CAP = 20;

/** Removes our open-tracking pixel so a resend gets a fresh one (or none). */
function stripTracking(html: string | null): string | undefined {
    if (!html) return undefined;
    return html.replace(/<img[^>]+\/api\/email\/tracking\/open[^>]*>/gi, "");
}

/**
 * Sends a failed email again through the sending service — a NEW Email row is
 * created on success, the failed one stays as history with a note.
 * Bounced emails are not resent: the address itself is rejecting mail.
 */
export async function resendFailed(ids: string[], scope: { sentById?: string }, actorId: string) {
    const emails = await prisma.email.findMany({
        where: {
            id: { in: ids.slice(0, RESEND_CAP) },
            direction: "OUTBOUND",
            status: "FAILED",
            ...(scope.sentById ? { sentById: scope.sentById } : {}),
        },
        select: {
            id: true,
            mailboxId: true,
            threadId: true,
            toAddresses: true,
            ccAddresses: true,
            subject: true,
            bodyHtml: true,
            bodyText: true,
            contactId: true,
            missionId: true,
            sentById: true,
            templateId: true,
            trackingPixelId: true,
            errorMessage: true,
        },
    });

    const results: { id: string; ok: boolean; newEmailId?: string; error?: string }[] = [];
    for (const e of emails) {
        if (e.toAddresses.length === 0) {
            results.push({ id: e.id, ok: false, error: "Aucun destinataire" });
            continue;
        }
        const res = await emailSendingService.sendEmail(e.mailboxId, {
            to: e.toAddresses.map((email) => ({ email })),
            cc: e.ccAddresses.length ? e.ccAddresses.map((email) => ({ email })) : undefined,
            subject: e.subject,
            bodyHtml: stripTracking(e.bodyHtml),
            bodyText: e.bodyText ?? undefined,
            threadId: e.threadId,
            contactId: e.contactId ?? undefined,
            missionId: e.missionId ?? undefined,
            sentById: e.sentById ?? actorId,
            templateId: e.templateId ?? undefined,
            trackOpens: !!e.trackingPixelId,
        });
        if (res.success) {
            const stamp = DateTime.now().setZone(ZONE).toFormat("dd/MM/yyyy HH:mm");
            await prisma.email.update({
                where: { id: e.id },
                data: { errorMessage: `Renvoyé le ${stamp}${e.errorMessage ? ` — erreur initiale : ${e.errorMessage}` : ""}`.slice(0, 1000) },
            });
            results.push({ id: e.id, ok: true, newEmailId: res.emailId });
        } else {
            results.push({ id: e.id, ok: false, error: res.error || "Échec de l'envoi" });
        }
    }
    const skipped = ids.length - emails.length;
    return { results, sent: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, skipped };
}

// ── Detail ───────────────────────────────────────────────────────────

export async function sentDetail(id: string, scope: { sentById?: string }) {
    const e = await prisma.email.findFirst({
        where: { id, direction: "OUTBOUND", ...(scope.sentById ? { sentById: scope.sentById } : {}) },
        select: {
            ...sentListSelect,
            bodyHtml: true,
            bodyText: true,
            ccAddresses: true,
            fromAddress: true,
            fromName: true,
            attachments: { select: { id: true, filename: true, mimeType: true, size: true } },
        },
    });
    if (!e) return null;
    const { bodyHtml, bodyText, ccAddresses, fromAddress, fromName, attachments, ...row } = e;
    return {
        ...serializeSent(row),
        body: { html: stripTracking(bodyHtml) ?? null, text: bodyText },
        ccAddresses,
        from: { address: fromAddress, name: fromName },
        attachments,
    };
}
