import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    AuthError,
    NotFoundError,
    ValidationError,
    requireAuth,
    successResponse,
    validateRequest,
    withErrorHandler,
} from "@/lib/api-utils";
import { canPublishToRoadmap, type TicketActor } from "@/lib/tickets/permissions";
import { publishTicketSchema } from "@/lib/tickets/schemas";
import { TICKET_DETAIL_INCLUDE, recordHistory } from "@/lib/tickets/service";

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /api/tickets/[id]/publish — MANAGER only.
 *
 * Publication is the only action that makes a ticket visible outside the
 * company, so it lives on its own endpoint with a single authorisation check
 * rather than as one more field in the generic PATCH.
 */
export const PATCH = withErrorHandler(async (request: NextRequest, { params }: Params) => {
    const session = await requireAuth(request);
    const actor: TicketActor = { id: session.user.id, role: session.user.role as TicketActor["role"] };

    if (!canPublishToRoadmap(actor)) {
        throw new AuthError("Seul un manager peut publier sur la roadmap", 403);
    }

    const { id } = await params;
    const input = await validateRequest(request, publishTicketSchema);

    const existing = await prisma.ticket.findUnique({
        where: { id },
        select: { id: true, scope: true, clientId: true, publishToRoadmap: true },
    });
    if (!existing) throw new NotFoundError("Ticket introuvable");

    if (input.publishToRoadmap) {
        if (existing.scope !== "CLIENT_FACING") {
            throw new ValidationError("Seul un ticket de type Client peut être publié");
        }
        if (!existing.clientId) {
            throw new ValidationError("Ce ticket n'est rattaché à aucun client");
        }
    }

    const ticket = await prisma.$transaction(async (tx) => {
        const updated = await tx.ticket.update({
            where: { id },
            data: {
                publishToRoadmap: input.publishToRoadmap,
                publicTitle: input.publicTitle?.trim() || null,
                publicDescription: input.publicDescription?.trim() || null,
            },
            include: TICKET_DETAIL_INCLUDE,
        });

        if (existing.publishToRoadmap !== input.publishToRoadmap) {
            await recordHistory(tx, id, session.user.id, [
                {
                    field: "publishToRoadmap",
                    fromValue: String(existing.publishToRoadmap),
                    toValue: String(input.publishToRoadmap),
                },
            ]);
        }

        return updated;
    });

    return successResponse(ticket);
});
