import { NextRequest } from "next/server";
import { NotFoundError, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { getCallDetail } from "@/lib/calls-journal/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/sdr/calls/[id]?kind=action|call — one of the signed-in user's own calls. */
export const GET = withErrorHandler(
    async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
        const session = await requireRole(["SDR", "BUSINESS_DEVELOPER", "BOOKER"], request);
        const { id } = await params;
        const kind = new URL(request.url).searchParams.get("kind") === "call" ? "call" : "action";
        const detail = await getCallDetail(kind, id);
        if (!detail || detail.sdr.id !== session.user.id) throw new NotFoundError("Appel introuvable");
        // The prospect's other calls include colleagues', as everywhere in the SDR workspace.
        return successResponse(detail);
    },
);
