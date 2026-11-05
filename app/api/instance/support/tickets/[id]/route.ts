import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/api-utils";
import { auditSystem } from "@/lib/audit";
import { guardInstanceRequest, instanceError, instanceJson, parseJsonBody } from "@/lib/instance/respond";
import { parseSupportAction, serializeSupportTicket, signedSupportComment } from "@/lib/instance/support";
import { findPlatformSupportUserId, getPlatformSupportUserId } from "@/lib/instance/support-server";
import { TICKET_STATUS_TRANSITIONS, formatTicketRef } from "@/lib/tickets/constants";
import { TICKET_DETAIL_INCLUDE, assertReleaseChecklistComplete, assertStatusTransition, recordHistory } from "@/lib/tickets/service";
import { notifyTicketPlatformReply, notifyTicketStatusChanged, notifyTicketUrgent } from "@/lib/tickets/notifications";

// One Support Technique ticket, for the Console. HMAC-signed.
//   GET  → { ok, ticket: { …summary, description, thread[], attachments[], releaseChecks[], allowedStatuses[] } }
//   POST { action: "comment", content, operator? }
//        { action: "status", status, comment?, operator? }   same transition + release-checklist rules as the CRM
//        { action: "priority", priority, operator? }
//     → { ok, ticket }  (same shape as GET)
// Writes are signed in the agency CRM by the inactive "Support plateforme"
// account; `operator` (the Console teammate) is appended to the comment text.
export const dynamic = "force-dynamic";

const ACTOR = "instance-api";
type Params = { params: Promise<{ id: string }> };

async function loadDetail(id: string) {
    const [t, platformUserId] = await Promise.all([
        prisma.ticket.findUnique({
            where: { id },
            include: { ...TICKET_DETAIL_INCLUDE, _count: { select: { comments: true, attachments: true } } },
        }),
        findPlatformSupportUserId(),
    ]);
    if (!t) return null;

    // Comments and history merged into one chronological thread: the Console
    // renders it as a conversation with status changes inline.
    const thread = [
        ...t.comments.map((c) => ({
            kind: "comment" as const,
            id: c.id,
            at: c.createdAt.toISOString(),
            author: { name: c.user.name, role: c.user.role, platform: c.user.id === platformUserId },
            content: c.content,
        })),
        ...t.history.map((h) => ({
            kind: "event" as const,
            id: h.id,
            at: h.createdAt.toISOString(),
            author: { name: h.user.name, role: h.user.role, platform: h.user.id === platformUserId },
            field: h.field,
            from: h.fromValue,
            to: h.toValue,
        })),
    ].sort((a, b) => a.at.localeCompare(b.at));

    return {
        ...serializeSupportTicket(t, Number.MAX_SAFE_INTEGER),
        description: t.description,
        mission: t.mission ? { name: t.mission.name } : null,
        // Names only: file URLs need a CRM session and must not leave the instance.
        attachments: t.attachments.map((a) => ({ id: a.id, name: a.originalName, mimeType: a.mimeType, size: a.size, createdAt: a.createdAt.toISOString() })),
        releaseChecks: t.releaseChecks.map((r) => ({ role: r.role, checked: r.checked, checkedBy: r.checkedBy?.name ?? null, checkedAt: r.checkedAt?.toISOString() ?? null })),
        allowedStatuses: TICKET_STATUS_TRANSITIONS[t.status] ?? [],
        thread,
    };
}

export async function GET(request: NextRequest, { params }: Params) {
    const guard = await guardInstanceRequest(request, "support");
    if (!guard.ok) return guard.response;
    const { id } = await params;
    try {
        const ticket = await loadDetail(id);
        if (!ticket) return instanceError(404, "ticket_not_found");
        return instanceJson({ ok: true, ticket });
    } catch (err) {
        console.error("[instance-api] support detail", err);
        return instanceError(500, "database_error");
    }
}

export async function POST(request: NextRequest, { params }: Params) {
    const guard = await guardInstanceRequest(request, "support");
    if (!guard.ok) return guard.response;
    const { id } = await params;

    const body = parseJsonBody(guard.rawBody);
    if (!body.ok) return instanceError(400, "invalid_json");
    const parsed = parseSupportAction(body.value);
    if (!parsed.ok) return instanceError(422, "validation_failed", { errors: parsed.errors });
    const input = parsed.value;

    const existing = await prisma.ticket.findUnique({
        where: { id },
        select: { id: true, number: true, title: true, status: true, priority: true, requesterId: true, assigneeId: true },
    });
    if (!existing) return instanceError(404, "ticket_not_found");

    const actorId = await getPlatformSupportUserId();
    const recipients = { requesterId: existing.requesterId, assigneeId: existing.assigneeId };

    try {
        if (input.action === "comment") {
            await prisma.$transaction(async (tx) => {
                await tx.ticketComment.create({
                    data: { ticketId: id, userId: actorId, content: signedSupportComment(input.content, input.operator) },
                });
                // Bumps updatedAt so the reply surfaces at the top of both inboxes.
                await tx.ticket.update({ where: { id }, data: { updatedAt: new Date() } });
            });
            await notifyTicketPlatformReply(existing, actorId, recipients);
        } else if (input.action === "status") {
            assertStatusTransition(existing.status, input.status);
            await prisma.$transaction(async (tx) => {
                if (input.status === "COMPLETED") await assertReleaseChecklistComplete(tx, id);
                await tx.ticket.update({
                    where: { id },
                    data: { status: input.status, completedAt: input.status === "COMPLETED" ? new Date() : null },
                });
                await recordHistory(tx, id, actorId, [{ field: "status", fromValue: existing.status, toValue: input.status }]);
                if (input.comment) {
                    await tx.ticketComment.create({
                        data: { ticketId: id, userId: actorId, content: signedSupportComment(input.comment, input.operator) },
                    });
                }
            });
            await notifyTicketStatusChanged(existing, input.status, actorId, "le support plateforme", recipients);
            if (input.comment) await notifyTicketPlatformReply(existing, actorId, recipients);
        } else {
            if (existing.priority !== input.priority) {
                await prisma.$transaction(async (tx) => {
                    await tx.ticket.update({ where: { id }, data: { priority: input.priority } });
                    await recordHistory(tx, id, actorId, [{ field: "priority", fromValue: existing.priority, toValue: input.priority }]);
                });
                await notifyTicketUrgent(existing, input.priority, actorId);
            }
        }
    } catch (err) {
        if (err instanceof ValidationError) return instanceError(422, "rule_violation", { message: err.message });
        console.error("[instance-api] support action", err);
        return instanceError(500, "database_error");
    }

    auditSystem(
        {
            action: "TICKET_PLATFORM_SUPPORT",
            entityType: "Ticket",
            entityId: id,
            summary: `Support plateforme : ${input.action} sur ${formatTicketRef(existing.number)}${input.operator ? ` (${input.operator})` : ""}`,
            metadata: { source: ACTOR, action: input.action, operator: input.operator },
        },
        ACTOR,
    );

    const ticket = await loadDetail(id);
    return instanceJson({ ok: true, ticket });
}
