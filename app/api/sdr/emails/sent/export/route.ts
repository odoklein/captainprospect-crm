// ============================================
// GET /api/sdr/emails/sent/export — CSV of my sent emails (same filters as the list).
// Kept for old links; the page now uses /api/sdr/emails/sent?format=csv.
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, withErrorHandler } from "@/lib/api-utils";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { csvResponseHeaders, parseSentFilters, sentCsv } from "@/app/api/manager/emails/_lib/sent";

export const GET = withErrorHandler(async (req: NextRequest) => {
    // requireAuth(req) reads the token from the request, so a deactivated /
    // force-logged-out user is rejected here too — see sessionFromToken in lib/auth.ts.
    const session = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const { body, filename, total, exported } = await sentCsv(parseSentFilters(searchParams), { sentById: session.user.id });
    audit(req, session, {
        action: AUDIT_ACTIONS.EXPORT,
        entityType: "Email",
        summary: `Export CSV de ${exported} email(s) envoyé(s)`,
        metadata: { total, exported, query: searchParams.toString() },
    });
    return new NextResponse(body, { status: 200, headers: csvResponseHeaders(filename, total, exported) });
});
