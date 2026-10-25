import { NextRequest, NextResponse } from "next/server";
import { sequenceService } from "@/lib/email/services/sequence-service";

/**
 * GET /api/cron/email-sequences
 *
 * The email-sequence engine. Sends the steps that are due (ACTIVE enrollments
 * of ACTIVE sequences whose nextStepAt has passed), in small batches, within
 * each mailbox's daily limit and the sequence's sending window. No Redis
 * needed: the BullMQ workers in lib/email/queue are never started in prod.
 *
 * SCHEDULING — must run every 5 minutes:
 *   - Vercel: declared in vercel.json ("*\/5 * * * *").
 *   - Dokploy (current prod, nixpacks only starts the Next server): add a
 *     Schedule Job / cron on the server that runs every 5 minutes:
 *       curl -fsS -H "Authorization: Bearer $CRON_SECRET" -H "x-api-key: cron" \
 *            https://<app-domain>/api/cron/email-sequences
 *     The x-api-key header only gets the request past middleware.ts (which
 *     otherwise redirects session-less /api calls to the login page); the
 *     CRON_SECRET bearer below is the real check. Unlike the other crons this
 *     one fails closed: it sends real emails, so no CRON_SECRET = no run.
 *   Without it nothing is ever sent; the Séquences page warns when the last
 *   run is older than 15 minutes.
 *
 * Idempotent and overlap-safe: each enrollment is claimed with a lease before
 * sending, so a double run cannot send the same step twice.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
        return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
    }
    if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const result = await sequenceService.processDueEnrollments();
        return NextResponse.json({ success: true, ...result });
    } catch (error) {
        console.error("Email sequence engine failed:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Engine run failed" },
            { status: 500 }
        );
    }
}
