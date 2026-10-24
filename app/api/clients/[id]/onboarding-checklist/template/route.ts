// POST   /api/clients/[id]/onboarding-checklist/template — this client's checklist becomes the default for new clients.
// DELETE /api/clients/[id]/onboarding-checklist/template — back to the built-in default.
import { NextRequest, NextResponse } from "next/server";
import { requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { audit } from "@/lib/audit";
import { resetTemplate, saveTemplateFromClient } from "@/lib/onboarding/checklist-service";
import { runChecklist } from "@/lib/onboarding/route-helpers";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withErrorHandler(async (request: NextRequest, { params }: Ctx) => {
    const session = await requireRole(["MANAGER"], request);
    const { id } = await params;
    const result = await runChecklist(() => saveTemplateFromClient(id));
    if (result instanceof NextResponse) return result;
    audit(request, session, {
        action: "UPDATE",
        entityType: "OnboardingTemplate",
        summary: "Modèle d'onboarding par défaut remplacé",
        after: result,
        metadata: { fromClientId: id },
    });
    return successResponse(result);
});

export const DELETE = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);
    await resetTemplate();
    audit(request, session, {
        action: "DELETE",
        entityType: "OnboardingTemplate",
        summary: "Modèle d'onboarding réinitialisé",
    });
    return successResponse({ reset: true });
});
