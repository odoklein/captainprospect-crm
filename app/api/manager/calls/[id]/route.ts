import { NextRequest } from "next/server";
import { NotFoundError, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { getCallDetail } from "@/lib/calls-journal/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/manager/calls/[id]?kind=action|call — one call with summary, transcription and the prospect's history. */
export const GET = withErrorHandler(
    async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
        await requireRole(["MANAGER"], request);
        const { id } = await params;
        const kind = new URL(request.url).searchParams.get("kind") === "call" ? "call" : "action";
        const detail = await getCallDetail(kind, id);
        if (!detail) throw new NotFoundError("Appel introuvable");
        return successResponse(detail);
    },
);
