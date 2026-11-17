// POST /api/public/onboarding/[token]/submit — the client approves the questionnaire.

import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-utils";
import { NO_STORE, overBudget, runLink } from "@/lib/client-onboarding/http";
import { submitFromPortal } from "@/lib/client-onboarding/service";

type Ctx = { params: Promise<{ token: string }> };

export const POST = withErrorHandler(async (request: NextRequest, { params }: Ctx) => {
    const { token } = await params;
    const limited = overBudget(request, "submit", token, 10);
    if (limited) return limited;
    const result = await runLink(() => submitFromPortal(token));
    return result instanceof NextResponse ? result : NextResponse.json({ success: true, data: result }, { headers: NO_STORE });
});
