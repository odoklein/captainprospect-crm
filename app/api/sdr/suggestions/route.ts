import { NextRequest } from "next/server";
import { z } from "zod";
import type { TicketCategory } from "@prisma/client";
import {
    requireRole,
    successResponse,
    validateRequest,
    withErrorHandler,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { notifyAllManagers } from "@/lib/notifications";
import { formatTicketRef } from "@/lib/tickets/constants";

const SuggestionSchema = z.object({
    type: z.enum(["IMPROVEMENT", "BUG", "MISSING_DATA", "OTHER"]).default("IMPROVEMENT"),
    title: z.string().min(3).max(120),
    description: z.string().min(5).max(4000),
    urgency: z.enum(["NORMAL", "URGENT"]).default("NORMAL"),
});

const TYPE_LABELS: Record<string, string> = {
    IMPROVEMENT: "Idée d'amélioration",
    BUG: "Bug / Problème technique",
    MISSING_DATA: "Donnée manquante",
    OTHER: "Autre suggestion",
};

/**
 * The launcher offers four intents; the board only knows four categories.
 * "Donnée manquante" and "Autre" have no board equivalent, so they land in
 * TECHNICAL_SUPPORT and the original intent is kept in the description.
 */
const TYPE_TO_CATEGORY: Record<string, TicketCategory> = {
    IMPROVEMENT: "IMPROVEMENT",
    BUG: "BUG",
    MISSING_DATA: "TECHNICAL_SUPPORT",
    OTHER: "TECHNICAL_SUPPORT",
};

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["SDR", "BUSINESS_DEVELOPER", "BOOKER"], request);
    const body = await validateRequest(request, SuggestionSchema);

    const sdrUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, name: true, email: true },
    });

    const sdrName = sdrUser?.name || sdrUser?.email || "Un télépro (SDR)";
    const typeLabel = TYPE_LABELS[body.type] || body.type;

    // A suggestion used to be a notification and nothing else: managers saw it
    // in the Alertes panel and it never reached Support technique. It is filed
    // as a real pending request now, exactly like /api/tickets/requests, so it
    // shows up in the "À valider" queue. Priority stays at its default — the
    // manager owns it — and the declared urgency is carried in the description.
    const ticket = await prisma.$transaction(async (tx) => {
        const created = await tx.ticket.create({
            data: {
                title: body.title,
                description: [
                    `**${typeLabel}**${body.urgency === "URGENT" ? " · signalé comme urgent par le demandeur" : ""}`,
                    body.description,
                ].join("\n\n"),
                category: TYPE_TO_CATEGORY[body.type] || "TECHNICAL_SUPPORT",
                scope: "INTERNAL",
                // Affected roles are part of the manager's triage, so the
                // release checklist is only synced on acceptance.
                affectedRoles: [],
                requesterId: session.user.id,
                validation: "PENDING",
            },
            select: { id: true, number: true, title: true },
        });

        await tx.ticketHistory.create({
            data: {
                ticketId: created.id,
                userId: session.user.id,
                field: "created",
                toValue: "PENDING_VALIDATION",
            },
        });

        return created;
    });

    // Title prefix kept as-is: the manager Alertes panel matches on
    // "Suggestion SDR" (app/api/support/manager/alerts/route.ts).
    await notifyAllManagers({
        title: `Suggestion SDR : ${body.title}`,
        message: `${formatTicketRef(ticket.number)} · ${sdrName} (${typeLabel}) :\n${body.description.slice(0, 200)}`,
        type: body.urgency === "URGENT" ? "warning" : "info",
        link: `/manager/tickets?validation=PENDING&ticket=${ticket.id}`,
    });

    return successResponse({
        ok: true,
        ticketId: ticket.id,
        ticketNumber: ticket.number,
        message: "Merci ! Votre suggestion a bien été transmise aux managers.",
    }, 201);
});
