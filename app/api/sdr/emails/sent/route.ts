// ============================================
// GET /api/sdr/emails/sent — the current user's outbound emails.
// Same filters as /api/manager/emails/sent (minus `sdr`), scoped to sentById = me.
//      &format=csv → CSV download (up to 10 000 rows)
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, withErrorHandler } from "@/lib/api-utils";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { csvResponseHeaders, listSent, parseSentFilters, sentCsv, sentOptions } from "@/app/api/manager/emails/_lib/sent";

export const GET = withErrorHandler(async (req: NextRequest) => {
    const session = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const filters = parseSentFilters(searchParams);
    const scope = { sentById: session.user.id };

    if (searchParams.get("format") === "csv") {
        const { body, filename, total, exported } = await sentCsv(filters, scope);
        audit(req, session, {
            action: AUDIT_ACTIONS.EXPORT,
            entityType: "Email",
            summary: `Export CSV de ${exported} email(s) envoyé(s)`,
            metadata: { total, exported, query: searchParams.toString() },
        });
        return new NextResponse(body, { status: 200, headers: csvResponseHeaders(filename, total, exported) });
    }

    const [{ data, pagination, counts }, options] = await Promise.all([
        listSent(filters, scope),
        searchParams.get("options") === "1" ? sentOptions(scope) : Promise.resolve(undefined),
    ]);
    return NextResponse.json({ success: true, data, pagination, counts, ...(options ? { options } : {}) });
});
