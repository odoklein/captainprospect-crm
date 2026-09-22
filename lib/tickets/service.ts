import { Prisma, type TicketScope, type TicketStatus, type UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/api-utils";
import { TICKET_STATUS_TRANSITIONS, TICKET_STATUS_LABELS, USER_ROLE_LABELS } from "./constants";

type Tx = Prisma.TransactionClient;

/** Shape returned by the internal detail endpoints. */
export const TICKET_DETAIL_INCLUDE = {
    requester: { select: { id: true, name: true, email: true, role: true } },
    assignee: { select: { id: true, name: true, email: true, role: true } },
    client: { select: { id: true, name: true } },
    mission: { select: { id: true, name: true } },
    attachments: {
        where: { deletedAt: null },
        select: { id: true, originalName: true, mimeType: true, size: true, url: true, createdAt: true },
    },
    comments: {
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true, role: true } } },
    },
    history: {
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true, role: true } } },
    },
    releaseChecks: {
        include: { checkedBy: { select: { id: true, name: true } } },
    },
} satisfies Prisma.TicketInclude;

/** Shape returned by the internal list endpoint — no comment/history payload. */
export const TICKET_LIST_INCLUDE = {
    // `role` matters on the board now that the sales team files requests:
    // "who asked, and from which team" is the first triage signal.
    requester: { select: { id: true, name: true, role: true } },
    assignee: { select: { id: true, name: true, role: true } },
    client: { select: { id: true, name: true } },
    _count: { select: { comments: true, attachments: true } },
} satisfies Prisma.TicketInclude;

export function assertStatusTransition(from: TicketStatus, to: TicketStatus) {
    if (from === to) return;
    const allowed = TICKET_STATUS_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
        throw new ValidationError(
            `Transition impossible : ${TICKET_STATUS_LABELS[from]} → ${TICKET_STATUS_LABELS[to]}`,
        );
    }
}

/**
 * A client-facing ticket changes what the client sees, so CLIENT always belongs
 * in `affectedRoles` — otherwise the release checklist signs the ticket off on
 * the developer's word alone and nobody ever verifies the client side.
 * Enforced here rather than only in the form so a crafted POST/PATCH cannot
 * drop the role.
 */
export function assertAffectedRolesMatchScope(scope: TicketScope, affectedRoles: UserRole[]) {
    if (scope === "CLIENT_FACING" && !affectedRoles.includes("CLIENT")) {
        throw new ValidationError("Un ticket client doit inclure le rôle Client dans les rôles impactés");
    }
}

/**
 * Keeps one release-check row per affected role. Rows for roles that are no
 * longer affected are dropped; existing rows (and their sign-off) are kept.
 */
export async function syncReleaseChecks(tx: Tx, ticketId: string, affectedRoles: UserRole[]) {
    const existing = await tx.ticketReleaseCheck.findMany({
        where: { ticketId },
        select: { id: true, role: true },
    });

    const wanted = new Set(affectedRoles);
    const current = new Set(existing.map((row) => row.role));

    const toCreate = affectedRoles.filter((role) => !current.has(role));
    const toDelete = existing.filter((row) => !wanted.has(row.role)).map((row) => row.id);

    if (toCreate.length) {
        await tx.ticketReleaseCheck.createMany({
            data: toCreate.map((role) => ({ ticketId, role })),
            skipDuplicates: true,
        });
    }
    if (toDelete.length) {
        await tx.ticketReleaseCheck.deleteMany({ where: { id: { in: toDelete } } });
    }
}

/**
 * The guarantee behind "test every affected role before release": COMPLETED is
 * unreachable while any affected role is unsigned.
 */
export async function assertReleaseChecklistComplete(tx: Tx, ticketId: string) {
    const pending = await tx.ticketReleaseCheck.findMany({
        where: { ticketId, checked: false },
        select: { role: true },
    });

    if (pending.length) {
        const roles = pending.map((row) => USER_ROLE_LABELS[row.role]).join(", ");
        throw new ValidationError(`Rôles non testés : ${roles}`);
    }
}

export interface HistoryEntry {
    field: string;
    fromValue: string | null;
    toValue: string | null;
}

export async function recordHistory(tx: Tx, ticketId: string, userId: string, entries: HistoryEntry[]) {
    if (!entries.length) return;
    await tx.ticketHistory.createMany({
        data: entries.map((entry) => ({ ticketId, userId, ...entry })),
    });
}

/** Builds history rows by diffing the fields a manager just edited. */
export function diffTicketFields(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    fields: string[],
): HistoryEntry[] {
    const entries: HistoryEntry[] = [];

    for (const field of fields) {
        if (!(field in after)) continue;
        const from = normalise(before[field]);
        const to = normalise(after[field]);
        if (from !== to) {
            entries.push({ field, fromValue: from, toValue: to });
        }
    }

    return entries;
}

function normalise(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return [...value].sort().join(",");
    return String(value);
}

/** Dashboard counters: urgent / blocked / active / overdue. */
export async function getTicketDashboardCounts() {
    const now = new Date();

    const [urgent, blocked, active, overdue, pendingValidation, unassigned] = await Promise.all([
        prisma.ticket.count({
            where: { priority: "URGENT", status: { not: "COMPLETED" }, validation: { not: "PENDING" } },
        }),
        prisma.ticket.count({ where: { status: "BLOCKED" } }),
        prisma.ticket.count({ where: { status: { in: ["TODO", "IN_PROGRESS", "TESTING"] } } }),
        prisma.ticket.count({
            where: { dueDate: { lt: now }, status: { not: "COMPLETED" }, validation: { not: "PENDING" } },
        }),
        // The two counters a manager can actually act on: requests waiting on a
        // ruling, and triaged work nobody owns. Without them the board reports
        // its own state but never asks anything of the person reading it.
        prisma.ticket.count({ where: { validation: "PENDING" } }),
        prisma.ticket.count({
            where: {
                assigneeId: null,
                status: { notIn: ["COMPLETED"] },
                validation: { not: "PENDING" },
            },
        }),
    ]);

    return { urgent, blocked, active, overdue, pendingValidation, unassigned };
}
