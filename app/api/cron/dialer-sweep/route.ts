import { NextRequest, NextResponse } from "next/server";
import { sweep } from "@/lib/dialer/orchestrator";
import { buildDialerDeps } from "@/lib/dialer/runtime";

// GET /api/cron/dialer-sweep — every minute (lib/instance/cron-jobs.ts).
// Safety net for lost provider callbacks: times out stuck lines, ends sessions
// whose tab went silent, frees SDRs reserved for calls that already ended.
// Bearer CRON_SECRET, fail closed.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const built = await buildDialerDeps();
    if (!built.ok) return NextResponse.json({ skipped: built.reason });
    const report = await sweep(built.deps);
    return NextResponse.json(report);
}
