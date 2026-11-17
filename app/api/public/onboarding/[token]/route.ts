// ============================================
// /api/public/onboarding/[token] — the client's onboarding portal (no account:
// the unguessable token is the credential; excluded from the auth middleware).
// GET → portal data          PUT { answers, screen } → autosave
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateRequest, withErrorHandler } from "@/lib/api-utils";
import { NO_STORE, overBudget, runLink } from "@/lib/client-onboarding/http";
import { SCREEN_KEYS } from "@/lib/client-onboarding/questionnaire";
import { openPortal, saveFromPortal } from "@/lib/client-onboarding/service";

type Ctx = { params: Promise<{ token: string }> };

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (request: NextRequest, { params }: Ctx) => {
    const { token } = await params;
    const limited = overBudget(request, "get", token, 60);
    if (limited) return limited;
    const found = await openPortal(token);
    if (found.kind === "not_found") return NextResponse.json({ success: false, error: "Lien introuvable" }, { status: 404, headers: NO_STORE });
    if (found.kind === "expired") return NextResponse.json({ success: false, error: "Ce lien a expiré" }, { status: 410, headers: NO_STORE });
    return NextResponse.json({ success: true, data: found.view }, { headers: NO_STORE });
});

const saveSchema = z.object({
    // Validated and normalised by the questionnaire schema in saveFromPortal.
    answers: z.unknown(),
    screen: z.enum(SCREEN_KEYS as [string, ...string[]]),
});

export const PUT = withErrorHandler(async (request: NextRequest, { params }: Ctx) => {
    const { token } = await params;
    const limited = overBudget(request, "save", token, 120);
    if (limited) return limited;
    if (Number(request.headers.get("content-length") ?? 0) > 128_000) {
        return NextResponse.json({ success: false, error: "Réponses trop volumineuses" }, { status: 413 });
    }
    const body = await validateRequest(request, saveSchema);
    const result = await runLink(() => saveFromPortal(token, { answers: body.answers, screen: body.screen as (typeof SCREEN_KEYS)[number] }));
    return result instanceof NextResponse ? result : NextResponse.json({ success: true, data: result }, { headers: NO_STORE });
});
