import { NextRequest } from "next/server";
import { z } from "zod";
import {
    requireRole,
    successResponse,
    validateRequest,
    withErrorHandler,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { notifyAllManagers } from "@/lib/notifications";

const SuggestionSchema = z.object({
    type: z.enum(["IMPROVEMENT", "BUG", "MISSING_DATA", "OTHER"]).default("IMPROVEMENT"),
    title: z.string().min(3).max(120),
    description: z.string().min(5).max(4000),
    urgency: z.enum(["NORMAL", "URGENT"]).default("NORMAL"),
});

const TYPE_LABELS: Record<string, string> = {
    IMPROVEMENT: "Idée d'amélioration",
    BUG: "Bug / Problème technique",
    MISSING_DATA: "Donnée manquante",
    OTHER: "Autre suggestion",
};

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["SDR", "BUSINESS_DEVELOPER", "BOOKER"], request);
    const body = await validateRequest(request, SuggestionSchema);

    const sdrUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, name: true, email: true },
    });

    const sdrName = sdrUser?.name || sdrUser?.email || "Un télépro (SDR)";
    const typeLabel = TYPE_LABELS[body.type] || body.type;

    // Send notifications to all managers
    await notifyAllManagers({
        title: `Suggestion SDR : ${body.title}`,
        message: `${sdrName} (${typeLabel}) :\n${body.description.slice(0, 200)}`,
        type: body.urgency === "URGENT" ? "warning" : "info",
    });

    return successResponse({
        ok: true,
        message: "Merci ! Votre suggestion a bien été transmise aux managers.",
    }, 201);
});
