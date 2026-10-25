// ============================================
// GET  /api/manager/emails/sent            — every outbound email of the team
//      ?status=SENT|OPENED|REPLIED|BOUNCED|FAILED|PENDING&mission=&sdr=&mailbox=
//       &template=&sequence=&q=&from=yyyy-MM-dd&to=yyyy-MM-dd&page=&limit=&sort=&order=
//      &format=csv → CSV download (same filters, up to 10 000 rows)
// POST /api/manager/emails/sent            — { action: "resend", emailIds } (FAILED only)
// Emails are history: there is no delete.
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { csvResponseHeaders, listSent, parseSentFilters, resendFailed, RESEND_CAP, sentCsv, sentOptions } from "../_lib/sent";

export const GET = withErrorHandler(async (req: NextRequest) => {
    const session = await requireRole(["MANAGER", "DEVELOPER"], req);
    const { searchParams } = new URL(req.url);
    const filters = parseSentFilters(searchParams);

    if (searchParams.get("format") === "csv") {
        const { body, filename, total, exported } = await sentCsv(filters, {});
        audit(req, session, {
            action: AUDIT_ACTIONS.EXPORT,
            entityType: "Email",
            summary: `Export CSV de ${exported} email(s) envoyé(s) de l'équipe`,
            metadata: { total, exported, query: searchParams.toString() },
        });
        return new NextResponse(body, { status: 200, headers: csvResponseHeaders(filename, total, exported) });
    }

    const [{ data, pagination, counts }, options] = await Promise.all([
        listSent(filters, {}),
        searchParams.get("options") === "1" ? sentOptions({}) : Promise.resolve(undefined),
    ]);
    return NextResponse.json({ success: true, data, pagination, counts, ...(options ? { options } : {}) });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
    const session = await requireRole(["MANAGER", "DEVELOPER"], req);
    const body = await req.json().catch(() => null);
    const action = body?.action;
    const emailIds: unknown = body?.emailIds;

    if (action !== "resend") return errorResponse("Action invalide (seul « resend » est possible)", 400);
    if (!Array.isArray(emailIds) || emailIds.length === 0 || !emailIds.every((x) => typeof x === "string")) {
        return errorResponse("emailIds requis", 400);
    }
    if (emailIds.length > RESEND_CAP) return errorResponse(`Maximum ${RESEND_CAP} emails par renvoi`, 400);

    const result = await resendFailed(emailIds as string[], {}, session.user.id);
    if (result.sent > 0) {
        audit(req, session, {
            action: AUDIT_ACTIONS.BULK_ACTION,
            entityType: "Email",
            summary: `Renvoi de ${result.sent} email(s) en échec`,
            metadata: { results: result.results },
        });
    }
    return successResponse(result);
});
