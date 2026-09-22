import { NextRequest, NextResponse } from "next/server";
import { sweepExpiredExclusions } from "@/lib/exclusions/service";

/**
 * GET /api/cron/exclusion-sweep
 *
 * Releases prospects held by exclusions whose expiry has passed. Without this,
 * a "3 mois" exclusion would be permanent in practice: nothing else ever clears
 * Company.excludedAt, and the SDR queue only reads that stamp.
 *
 * Idempotent — a missed run is caught by the next one, and a double run is a
 * no-op.
 */
export async function GET(request: NextRequest) {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const result = await sweepExpiredExclusions();
        return NextResponse.json({ success: true, ...result });
    } catch (error) {
        console.error("Exclusion sweep failed:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Sweep failed" },
            { status: 500 }
        );
    }
}
