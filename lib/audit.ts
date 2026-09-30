// ============================================
// UNIFIED AUDIT TRAIL
// Append-only "who did what" log — exports, deletes, role/permission
// changes, forced logouts, bulk actions. See prisma/schema.prisma AuditEvent
// for the full doc comment and how this relates to the narrower AuthEvent /
// per-module logs (VaultAuditEvent, InvoiceAuditLog, HrAuditLog, …).
// ============================================

import { NextRequest } from "next/server";
import { prisma } from "./prisma";
import { getClientIp } from "./geo-ip";

const MAX_UA_LENGTH = 512;

// Known actions — kept as a plain string column (like AuthEventView.action)
// so a new call site can introduce a new one without a migration. This list
// is the set actually wired up so far; add to it as more routes call audit().
export const AUDIT_ACTIONS = {
    CREATE: "CREATE",
    UPDATE: "UPDATE",
    DELETE: "DELETE",
    EXPORT: "EXPORT",
    ROLE_CHANGE: "ROLE_CHANGE",
    STATUS_CHANGE: "STATUS_CHANGE",
    PERMISSION_CHANGE: "PERMISSION_CHANGE",
    SESSION_REVOKE: "SESSION_REVOKE",
    FORCE_LOGOUT: "FORCE_LOGOUT",
    BULK_ACTION: "BULK_ACTION",
} as const;

// `& {}` keeps the union's autocomplete while still accepting any string —
// same trick as AuditEvent.action being a free-text column.
export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS] | (string & {});

export interface AuditEventInput {
    action: AuditAction;
    entityType: string;
    entityId?: string | null;
    summary: string;
    /** State before the change — omit entirely for actions with no "before" (e.g. CREATE, EXPORT). */
    before?: unknown;
    /** State after the change — omit entirely for actions with no "after" (e.g. DELETE, EXPORT). */
    after?: unknown;
    metadata?: Record<string, unknown> | null;
}

interface AuditActor {
    user: { id: string; role: string; sessionId?: string | null };
}

/**
 * Records one audit event. Fire-and-forget — must never throw or block the
 * caller; a logging failure must not fail the action it's describing.
 */
export function audit(request: NextRequest, session: AuditActor, input: AuditEventInput): void {
    const ip = getClientIp(request);
    const userAgent = request.headers.get("user-agent");

    prisma.auditEvent
        .create({
            data: {
                actorId: session.user.id,
                actorRole: session.user.role,
                action: input.action,
                entityType: input.entityType,
                entityId: input.entityId ?? null,
                summary: input.summary,
                before: input.before === undefined ? undefined : (input.before as any),
                after: input.after === undefined ? undefined : (input.after as any),
                metadata: input.metadata ? (input.metadata as any) : undefined,
                ip,
                userAgent: userAgent ? userAgent.slice(0, MAX_UA_LENGTH) : null,
                sessionId: session.user.sessionId ?? null,
            },
        })
        .catch((err) => {
            console.error(`[Audit] failed to record ${input.action} ${input.entityType}`, err);
        });
}

export interface AuditEventRow {
    id: string;
    actorId: string | null;
    actorRole: string | null;
    action: string;
    entityType: string;
    entityId: string | null;
    summary: string;
    before: unknown;
    after: unknown;
    metadata: unknown;
    ip: string | null;
    createdAt: Date;
    actor: { id: string; name: string; email: string } | null;
}

export interface ListAuditEventsOptions {
    actorId?: string;
    action?: string;
    entityType?: string;
    entityId?: string;
    from?: Date;
    to?: Date;
    limit?: number;
    offset?: number;
}

export async function listAuditEvents(
    options: ListAuditEventsOptions = {}
): Promise<{ events: AuditEventRow[]; total: number }> {
    const { actorId, action, entityType, entityId, from, to, limit = 50, offset = 0 } = options;

    const where: Record<string, unknown> = {};
    if (actorId) where.actorId = actorId;
    if (action) where.action = action;
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (from || to) {
        where.createdAt = {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
        };
    }

    const [events, total] = await Promise.all([
        prisma.auditEvent.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: Math.min(limit, 500),
            skip: offset,
            select: {
                id: true,
                actorId: true,
                actorRole: true,
                action: true,
                entityType: true,
                entityId: true,
                summary: true,
                before: true,
                after: true,
                metadata: true,
                ip: true,
                createdAt: true,
                actor: { select: { id: true, name: true, email: true } },
            },
        }),
        prisma.auditEvent.count({ where }),
    ]);

    return { events, total };
}

/** Deletes audit events older than retentionDays. Returns count deleted. */
export async function deleteOldAuditEvents(retentionDays = 90): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const result = await prisma.auditEvent.deleteMany({
        where: { createdAt: { lt: cutoff } },
    });
    return result.count;
}
