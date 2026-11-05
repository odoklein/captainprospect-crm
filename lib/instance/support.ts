// ============================================
// PLATFORM SUPPORT — pure rules of /api/instance/support/*.
//
// The Console gathers the Support Technique tickets of every agency into one
// inbox. It never reads an agency database: it calls each instance's signed
// API, which answers with the shapes below. Everything here is pure (no
// Prisma client, no env), so the rules are unit-tested without a database:
//     npm run test:instance-support
// ============================================

import { formatTicketRef } from "@/lib/tickets/constants";
import type { Prisma, TaskPriority, TicketCategory, TicketScope, TicketStatus, TicketValidation } from "@prisma/client";

export const SUPPORT_STATUSES = ["NEW", "TODO", "IN_PROGRESS", "BLOCKED", "TESTING", "COMPLETED"] as const satisfies readonly TicketStatus[];
export const SUPPORT_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const satisfies readonly TaskPriority[];
export const SUPPORT_CATEGORIES = ["BUG", "IMPROVEMENT", "FEATURE_REQUEST", "TECHNICAL_SUPPORT"] as const satisfies readonly TicketCategory[];
export const SUPPORT_SCOPES = ["INTERNAL", "CLIENT_FACING", "MISSION_RELATED"] as const satisfies readonly TicketScope[];
export const SUPPORT_VALIDATIONS = ["NOT_REQUIRED", "PENDING", "ACCEPTED", "REJECTED"] as const satisfies readonly TicketValidation[];

export const SUPPORT_LIST_DEFAULT_LIMIT = 50;
export const SUPPORT_LIST_MAX_LIMIT = 200;
export const SUPPORT_COMMENT_MAX = 10_000;

/**
 * The author of every Console reply inside an agency CRM. Inactive, so it
 * never logs in and never takes a seat (countStaffSeats counts active users).
 * `.invalid` is reserved (RFC 2606): no mail can ever reach it.
 */
export const PLATFORM_SUPPORT_EMAIL = "support-plateforme@platform.invalid";
export const PLATFORM_SUPPORT_NAME = "Support plateforme";

// ---------- list query ----------

export type SupportListQuery = {
    status: TicketStatus[] | null;
    priority: TaskPriority[] | null;
    category: TicketCategory[] | null;
    scope: TicketScope[] | null;
    validation: TicketValidation[] | null;
    /** Only tickets changed at or after this instant (incremental sync). */
    updatedSince: Date | null;
    /** Open = every status but COMPLETED. Ignored when `status` is given. */
    open: boolean;
    search: string | null;
    limit: number;
    cursor: SupportCursor | null;
};

export type SupportCursor = { updatedAt: Date; id: string };

export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

function parseEnumList<T extends string>(raw: string | null, allowed: readonly T[], key: string, errors: Record<string, string>): T[] | null {
    if (raw == null || raw.trim() === "") return null;
    const values = raw.split(",").map((v) => v.trim().toUpperCase()).filter(Boolean);
    const bad = values.filter((v) => !(allowed as readonly string[]).includes(v));
    if (bad.length) {
        errors[key] = `Valeur inconnue : ${bad.join(", ")} (attendu : ${allowed.join(", ")})`;
        return null;
    }
    return [...new Set(values)] as T[];
}

export function encodeSupportCursor(c: SupportCursor): string {
    return Buffer.from(`${c.updatedAt.toISOString()}|${c.id}`, "utf8").toString("base64url");
}

export function decodeSupportCursor(raw: string): SupportCursor | null {
    try {
        const text = Buffer.from(raw, "base64url").toString("utf8");
        const sep = text.indexOf("|");
        if (sep <= 0) return null;
        const updatedAt = new Date(text.slice(0, sep));
        const id = text.slice(sep + 1);
        if (Number.isNaN(updatedAt.getTime()) || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
        return { updatedAt, id };
    } catch {
        return null;
    }
}

export function parseSupportListQuery(params: URLSearchParams): ParseResult<SupportListQuery> {
    const errors: Record<string, string> = {};

    const status = parseEnumList(params.get("status"), SUPPORT_STATUSES, "status", errors);
    const priority = parseEnumList(params.get("priority"), SUPPORT_PRIORITIES, "priority", errors);
    const category = parseEnumList(params.get("category"), SUPPORT_CATEGORIES, "category", errors);
    const scope = parseEnumList(params.get("scope"), SUPPORT_SCOPES, "scope", errors);
    const validation = parseEnumList(params.get("validation"), SUPPORT_VALIDATIONS, "validation", errors);

    let updatedSince: Date | null = null;
    const since = params.get("updatedSince");
    if (since) {
        const d = new Date(since);
        if (Number.isNaN(d.getTime())) errors.updatedSince = "Date ISO 8601 attendue";
        else updatedSince = d;
    }

    let limit = SUPPORT_LIST_DEFAULT_LIMIT;
    const rawLimit = params.get("limit");
    if (rawLimit != null && rawLimit !== "") {
        const n = Number(rawLimit);
        if (!Number.isInteger(n) || n < 1 || n > SUPPORT_LIST_MAX_LIMIT) errors.limit = `Entier entre 1 et ${SUPPORT_LIST_MAX_LIMIT}`;
        else limit = n;
    }

    let cursor: SupportCursor | null = null;
    const rawCursor = params.get("cursor");
    if (rawCursor) {
        cursor = decodeSupportCursor(rawCursor);
        if (!cursor) errors.cursor = "Curseur invalide";
    }

    const search = params.get("q")?.trim().slice(0, 200) || null;
    const open = params.get("open") === "true";

    if (Object.keys(errors).length) return { ok: false, errors };
    return { ok: true, value: { status, priority, category, scope, validation, updatedSince, open, search, limit, cursor } };
}

/** Prisma filter for a parsed query. Order is always updatedAt desc, id desc. */
export function supportListWhere(q: SupportListQuery): Prisma.TicketWhereInput {
    const and: Prisma.TicketWhereInput[] = [];
    if (q.status) and.push({ status: { in: q.status } });
    else if (q.open) and.push({ status: { not: "COMPLETED" } });
    if (q.priority) and.push({ priority: { in: q.priority } });
    if (q.category) and.push({ category: { in: q.category } });
    if (q.scope) and.push({ scope: { in: q.scope } });
    if (q.validation) and.push({ validation: { in: q.validation } });
    if (q.updatedSince) and.push({ updatedAt: { gte: q.updatedSince } });
    if (q.search) {
        const asNumber = Number(q.search.replace(/^#?(TC-)?/i, ""));
        and.push({
            OR: [
                { title: { contains: q.search, mode: "insensitive" } },
                { description: { contains: q.search, mode: "insensitive" } },
                ...(Number.isInteger(asNumber) && asNumber > 0 ? [{ number: asNumber }] : []),
            ],
        });
    }
    // Keyset pagination on (updatedAt desc, id desc): stable while tickets move.
    if (q.cursor) {
        and.push({
            OR: [
                { updatedAt: { lt: q.cursor.updatedAt } },
                { updatedAt: q.cursor.updatedAt, id: { lt: q.cursor.id } },
            ],
        });
    }
    return and.length ? { AND: and } : {};
}

// ---------- actions ----------

export type SupportAction =
    | { action: "comment"; content: string; operator: string | null }
    | { action: "status"; status: TicketStatus; comment: string | null; operator: string | null }
    | { action: "priority"; priority: TaskPriority; operator: string | null };

function cleanText(v: unknown, max: number): string | null {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t ? t.slice(0, max) : null;
}

/**
 * Body of POST /api/instance/support/tickets/:id.
 * `operator` is the Console teammate's name; it signs the reply so the agency
 * sees "Support plateforme (Inès)" instead of an anonymous account.
 */
export function parseSupportAction(body: unknown): ParseResult<SupportAction> {
    if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, errors: { _: "Objet JSON attendu" } };
    const b = body as Record<string, unknown>;
    const operator = cleanText(b.operator, 80);

    switch (b.action) {
        case "comment": {
            const content = cleanText(b.content, SUPPORT_COMMENT_MAX + 1);
            if (!content) return { ok: false, errors: { content: "Message vide" } };
            if (content.length > SUPPORT_COMMENT_MAX) return { ok: false, errors: { content: `${SUPPORT_COMMENT_MAX} caractères maximum` } };
            return { ok: true, value: { action: "comment", content, operator } };
        }
        case "status": {
            if (typeof b.status !== "string" || !(SUPPORT_STATUSES as readonly string[]).includes(b.status)) {
                return { ok: false, errors: { status: `Attendu : ${SUPPORT_STATUSES.join(", ")}` } };
            }
            return { ok: true, value: { action: "status", status: b.status as TicketStatus, comment: cleanText(b.comment, SUPPORT_COMMENT_MAX), operator } };
        }
        case "priority": {
            if (typeof b.priority !== "string" || !(SUPPORT_PRIORITIES as readonly string[]).includes(b.priority)) {
                return { ok: false, errors: { priority: `Attendu : ${SUPPORT_PRIORITIES.join(", ")}` } };
            }
            return { ok: true, value: { action: "priority", priority: b.priority as TaskPriority, operator } };
        }
        default:
            return { ok: false, errors: { action: "Attendu : comment, status ou priority" } };
    }
}

/** Comment text as stored in the agency CRM: signed with the operator's name. */
export function signedSupportComment(content: string, operator: string | null): string {
    return operator ? `${content}\n\n— ${operator}, ${PLATFORM_SUPPORT_NAME}` : content;
}

// ---------- serialisation ----------

type Person = { id: string; name: string; role: string } | null;

export type SupportTicketRow = {
    id: string;
    number: number;
    title: string;
    description: string | null;
    category: TicketCategory;
    scope: TicketScope;
    priority: TaskPriority;
    status: TicketStatus;
    validation: TicketValidation;
    dueDate: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    requester: Person;
    assignee: Person;
    client: { id: string; name: string } | null;
    _count?: { comments: number; attachments: number };
};

/** One list row. The description is cut to a preview: the inbox shows a line, not the ticket. */
export function serializeSupportTicket(t: SupportTicketRow, previewLength = 280) {
    const description = t.description ?? null;
    return {
        id: t.id,
        number: t.number,
        ref: formatTicketRef(t.number),
        title: t.title,
        preview: description ? (description.length > previewLength ? `${description.slice(0, previewLength - 1)}…` : description) : null,
        category: t.category,
        scope: t.scope,
        priority: t.priority,
        status: t.status,
        validation: t.validation,
        dueDate: t.dueDate?.toISOString() ?? null,
        overdue: Boolean(t.dueDate && t.status !== "COMPLETED" && t.dueDate.getTime() < Date.now()),
        completedAt: t.completedAt?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        requester: t.requester ? { name: t.requester.name, role: t.requester.role } : null,
        assignee: t.assignee ? { name: t.assignee.name, role: t.assignee.role } : null,
        client: t.client ? { name: t.client.name } : null,
        comments: t._count?.comments ?? 0,
        attachments: t._count?.attachments ?? 0,
    };
}

export type SupportTicketSummary = ReturnType<typeof serializeSupportTicket>;

/** True when the author is the platform account: the Console marks those messages as its own. */
export function isPlatformAuthor(user: { email?: string | null } | null | undefined): boolean {
    return user?.email === PLATFORM_SUPPORT_EMAIL;
}
