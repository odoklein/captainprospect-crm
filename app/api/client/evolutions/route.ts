import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuth, successResponse, withErrorHandler } from "@/lib/api-utils";
import {
    CLIENT_TICKET_SELECT,
    clientChangelogWhere,
    clientRoadmapWhere,
    toRoadmapItem,
    type ClientEvolutions,
} from "@/lib/tickets/public";

/**
 * GET /api/client/evolutions — the client's published roadmap (in progress,
 * upcoming) and changelog (delivered) in one payload. Same field allowlist as
 * before; `clientId` comes from the session only.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireAuth(request);

    if (session.user.role !== "CLIENT" || !session.user.clientId) {
        throw new AuthError("Accès non autorisé", 403);
    }
    const clientId = session.user.clientId;

    const [active, delivered] = await Promise.all([
        prisma.ticket.findMany({
            where: { ...clientRoadmapWhere(clientId), status: { not: "COMPLETED" } },
            select: CLIENT_TICKET_SELECT,
            orderBy: [{ updatedAt: "desc" }],
            take: 50,
        }),
        prisma.ticket.findMany({
            where: clientChangelogWhere(clientId),
            select: CLIENT_TICKET_SELECT,
            orderBy: [{ completedAt: "desc" }],
            take: 100,
        }),
    ]);

    const activeItems = active.map(toRoadmapItem);
    const body: ClientEvolutions = {
        inProgress: activeItems.filter((i) => i.bucket === "IN_PROGRESS"),
        upcoming: activeItems.filter((i) => i.bucket === "UPCOMING"),
        delivered: delivered.map(toRoadmapItem),
        generatedAt: new Date().toISOString(),
    };
    return successResponse(body);
});
