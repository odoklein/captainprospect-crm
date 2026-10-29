// ============================================
// GET /api/manager/agent/runs/[id]/pdf — the run's REPORT (body + visuals) as a branded PDF
// 404 when the run is unknown or produced no report. Managers only, like the run detail.
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireRole, withErrorHandler } from "@/lib/api-utils";
import { getRunDetail, isAgentUnavailable } from "@/lib/agent/api";
import { getBrand } from "@/lib/brand/server";
import { renderAssistantPdf } from "@/lib/assistant/pdf/render";
import { loadPdfLogo } from "@/lib/assistant/pdf/server";
import { attachmentHeader, pdfFileName } from "@/lib/assistant/pdf/text";
import { EXPORT_MESSAGES, PdfExportError, runReportPdfContent } from "@/lib/assistant/pdf/exports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export const GET = withErrorHandler(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    await requireRole(["MANAGER"], request);
    const { id } = await params;
    if (!ID.test(id ?? "")) return errorResponse(EXPORT_MESSAGES.runNotFound, 404);

    try {
        const detail = await getRunDetail(id).catch((error: unknown) => {
            if (isAgentUnavailable(error)) return null;
            throw error;
        });
        const content = runReportPdfContent(detail);
        const brand = await getBrand();
        const generatedAt = new Date();
        const buffer = await renderAssistantPdf({
            title: content.title,
            subtitle: content.subtitle,
            // A scheduled run has no actor: the cover then shows no « Préparé par ».
            author: detail?.actorName ?? undefined,
            generatedAt,
            brand,
            logo: await loadPdfLogo(brand).catch(() => null),
            sections: content.sections,
        });
        return new NextResponse(new Uint8Array(buffer), {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": attachmentHeader(pdfFileName(content.fileBase, generatedAt)),
                "Content-Length": String(buffer.length),
                "Cache-Control": "no-store",
            },
        });
    } catch (error) {
        if (error instanceof PdfExportError) return errorResponse(error.message, error.status);
        throw error;
    }
});
