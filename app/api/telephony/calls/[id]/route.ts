import { NextRequest } from "next/server";
import { NotFoundError, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { TELEPHONY_ROLES } from "@/lib/telephony/roles";
import { presentCall } from "@/lib/telephony/service";

export const dynamic = "force-dynamic";

/** GET /api/telephony/calls/[id] — the caller's own call, as Twilio last reported it. */
export const GET = withErrorHandler(
    async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
        const session = await requireRole([...TELEPHONY_ROLES], request);
        const { id } = await params;
        const call = await prisma.telephonyCall.findUnique({ where: { id } });
        if (!call || call.sdrId !== session.user.id) throw new NotFoundError("Appel introuvable");
        return successResponse(presentCall(call));
    },
);
