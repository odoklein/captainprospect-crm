import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuth, successResponse, withErrorHandler } from "@/lib/api-utils";
import { CLIENT_TICKET_SELECT, clientChangelogWhere, toRoadmapItem } from "@/lib/tickets/public";

/** GET /api/client/changelog — shipped items, newest first. Same allowlist as the roadmap. */
export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireAuth(request);

    if (session.user.role !== "CLIENT" || !session.user.clientId) {
        throw new AuthError("Accès non autorisé", 403);
    }

    const rows = await prisma.ticket.findMany({
        where: clientChangelogWhere(session.user.clientId),
        select: CLIENT_TICKET_SELECT,
        orderBy: [{ completedAt: "desc" }],
        take: 50,
    });

    return successResponse(rows.map(toRoadmapItem));
});
