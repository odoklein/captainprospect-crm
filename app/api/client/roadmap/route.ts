import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuth, successResponse, withErrorHandler } from "@/lib/api-utils";
import { CLIENT_TICKET_SELECT, clientRoadmapWhere, toRoadmapItem } from "@/lib/tickets/public";

/**
 * GET /api/client/roadmap — the client's own published roadmap.
 *
 * Deliberately not a mode of /api/tickets: it reads through its own
 * field-allowlisted select so a future change to the internal ticket payload
 * cannot widen what a client receives. `clientId` comes from the session only.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireAuth(request);

    if (session.user.role !== "CLIENT" || !session.user.clientId) {
        throw new AuthError("Accès non autorisé", 403);
    }

    const rows = await prisma.ticket.findMany({
        where: clientRoadmapWhere(session.user.clientId),
        select: CLIENT_TICKET_SELECT,
        orderBy: [{ updatedAt: "desc" }],
        take: 100,
    });

    return successResponse(rows.map(toRoadmapItem));
});
