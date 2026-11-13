import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { clientMayExport } from "@/lib/client-portal-export";

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["CLIENT"], request);
    const clientId = session.user.clientId;

    if (!clientId) {
        return successResponse({
            portalShowCallHistory: false,
            portalShowDatabase: false,
        });
    }

    const client = await prisma.client.findUnique({
        where: { id: clientId },
    });

    if (!client) {
        return successResponse({
            portalShowCallHistory: false,
            portalShowDatabase: false,
        });
    }

    return successResponse({
        portalShowCallHistory: (client as Record<string, unknown>).portalShowCallHistory ?? false,
        portalShowDatabase: (client as Record<string, unknown>).portalShowDatabase ?? false,
        portalAllowExport: await clientMayExport(clientId),
    });
});

