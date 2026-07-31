import { NextRequest, NextResponse } from "next/server";
import { requireRole, withErrorHandler } from "@/lib/api-utils";

// Browser-based Analytics PDF export is intentionally disabled.
// Keeping this route gives the existing UI a clear response without shipping Chromium.
export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER", "DEVELOPER"], request);

    return NextResponse.json(
        {
            success: false,
            error: "L’export PDF Analytics est temporairement désactivé.",
        },
        { status: 503 }
    );
});
