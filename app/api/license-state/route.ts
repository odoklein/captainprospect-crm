import { NextResponse } from "next/server";
import { getLicense } from "@/lib/license/server";

// Public, minimal: is this instance suspended, and which features are off? The
// edge middleware cannot read the database, so it asks this route (cached in
// process there). Reveals only what the agency's own staff already see (the
// suspension banner, hidden features).
export const dynamic = "force-dynamic";

export async function GET() {
    const license = await getLicense();
    return NextResponse.json(
        { status: license.status, reason: license.suspendedReason, features: license.features },
        { headers: { "Cache-Control": "no-store" } },
    );
}
