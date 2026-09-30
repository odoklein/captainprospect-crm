import { NextRequest, NextResponse } from "next/server";
import {
    requireRole,
    withErrorHandler,
    AuthError,
} from "@/lib/api-utils";
import { parisDayRange } from "@/lib/reporting/period";
import { getReportData, toReportData } from "../get-report-data";

/**
 * GET /api/client/reporting/data
 * Returns report data for preview (CLIENT only).
 * Query: dateFrom, dateTo, missionId (optional), comparePrevious (optional, default true).
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["CLIENT"], request);
    const clientId = (session.user as { clientId?: string })?.clientId;
    if (!clientId) {
        throw new AuthError("Accès non autorisé", 403);
    }

    const { searchParams } = new URL(request.url);
    const missionId = searchParams.get("missionId")?.trim() || null;
    const comparePrevious = searchParams.get("comparePrevious") !== "false";

    const range = parisDayRange(searchParams.get("dateFrom")?.trim(), searchParams.get("dateTo")?.trim());
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
        missionId,
        comparePrevious,
    });

    if (!raw) {
        return NextResponse.json(
            { success: false, error: "Client ou mission introuvable" },
            { status: 404 }
        );
    }

    const data = toReportData(raw, dateFromDate, dateToDate);
    return NextResponse.json({ success: true, data });
});
