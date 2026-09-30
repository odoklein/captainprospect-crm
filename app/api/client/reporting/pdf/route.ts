import { NextRequest, NextResponse } from "next/server";
import {
    requireRole,
    withErrorHandler,
    AuthError,
} from "@/lib/api-utils";
import { generateClientReportPdf } from "@/lib/reporting/pdf";
import { parisDayRange } from "@/lib/reporting/period";
import { getReportData, toReportData } from "../get-report-data";

// ============================================
// GET /api/client/reporting/pdf
// Generate PDF report for client (CLIENT only). Query: dateFrom, dateTo, missionId (optional), comparePrevious (optional)
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["CLIENT"], request);
    const clientId = (session.user as { clientId?: string })?.clientId;
    if (!clientId) {
        throw new AuthError("Accès non autorisé", 403);
    }

    const { searchParams } = new URL(request.url);
    const missionIdParam = searchParams.get("missionId")?.trim() || null;
    const comparePrevious = searchParams.get("comparePrevious") !== "false";

    const dateFrom = searchParams.get("dateFrom")?.trim();
    const range = parisDayRange(dateFrom, searchParams.get("dateTo")?.trim());
    if (!range) {
        return NextResponse.json(
            { success: false, error: "Période invalide : dateFrom et dateTo (AAAA-MM-JJ), début avant fin" },
            { status: 400 }
        );
    }
    const { from: dateFromDate, to: dateToDate } = range;

    const raw = await getReportData({
        clientId,
        dateFrom: dateFromDate,
        dateTo: dateToDate,
        missionId: missionIdParam,
        comparePrevious,
    });

    if (!raw) {
        return NextResponse.json(
            { success: false, error: "Client ou mission introuvable" },
            { status: 404 }
        );
    }

    const reportData = toReportData(raw, dateFromDate, dateToDate);
    const pdfBuffer = await generateClientReportPdf(reportData);
    const filename = `rapport-${raw.client.name.replace(/[^a-z0-9]/gi, "_")}-${dateFrom}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Content-Length": String(pdfBuffer.length),
        },
    });
});
