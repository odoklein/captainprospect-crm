import { NextRequest } from "next/server";
import { NotFoundError, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { getExclusionImport } from "@/lib/exclusions/service";

// GET /api/exclusions/import/[id] — the stored file: every line and what became of it
export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    await requireRole(["MANAGER"], request);
    const { id } = await params;

    const record = await getExclusionImport(id);
    if (!record) throw new NotFoundError("Import introuvable");

    return successResponse({ id: record.id, fileName: record.fileName, createdAt: record.createdAt, rows: record.rows });
});
