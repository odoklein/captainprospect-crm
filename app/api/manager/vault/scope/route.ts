// ============================================
// GET /api/manager/vault/scope
//
// Fills the vault's pickers: the client list, and — when `clientId` is given —
// that client's missions and commerciaux with their portal status.
//
// Its own endpoint rather than a reuse of /api/clients: that one is paginated
// and carries a lot of payload this page has no use for.
// ============================================

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { primaryEmailOf } from "@/lib/vault/portalAccounts";

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");

    const clients = await prisma.client.findMany({
        where: { archivedAt: null },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
    });

    if (!clientId) {
        return successResponse({ clients, missions: [], commerciaux: [] });
    }

    const [missions, interlocuteurs] = await Promise.all([
        prisma.mission.findMany({
            where: { clientId },
            orderBy: { startDate: "desc" },
            select: { id: true, name: true, status: true },
        }),
        prisma.clientInterlocuteur.findMany({
            where: { clientId, isActive: true },
            orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
            select: {
                id: true,
                firstName: true,
                lastName: true,
                title: true,
                emails: true,
                portalUser: { select: { id: true, email: true, isActive: true } },
            },
        }),
    ]);

    return successResponse({
        clients,
        missions,
        commerciaux: interlocuteurs.map((i) => ({
            id: i.id,
            name: `${i.firstName} ${i.lastName}`.trim(),
            title: i.title,
            email: primaryEmailOf(i.emails),
            hasPortalAccount: !!i.portalUser,
            portalEmail: i.portalUser?.email ?? null,
        })),
    });
});
