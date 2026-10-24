// ============================================
// POST /api/clients/[id]/weekly-bilan { weekStart?: "YYYY-MM-DD", withAi?: boolean }
// Draft of the Friday client bilan: figures (lib/stats), confirmed RDVs, and an
// AI summary when available. Nothing is stored — the manager reviews it and
// publishes through POST /api/clients/[id]/sessions (type "Reporting").
// ============================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, requireRole, successResponse, validateRequest, withErrorHandler } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { AiCallError } from "@/lib/ai/json-call";
import { friendlyAiError } from "@/lib/analyse-ia/errors";
import { collectWeeklyBilanData } from "@/lib/reporting/weekly-bilan";
import { generateBilanNarrative } from "@/lib/reporting/weekly-bilan-ai";
import { bilanSessionDate, bilanWeek } from "@/lib/reporting/weekly-bilan-week";
import {
    allowedNumbers,
    findUnverifiedNumbers,
    renderBilanEmail,
    renderBilanMarkdown,
    type BilanNarrative,
} from "@/lib/reporting/weekly-bilan-render";
import { addDay, parisMidnight } from "@/lib/manager-home/today-rules";

const schema = z.object({
    weekStart: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    withAi: z.boolean().optional().default(true),
});

export const POST = withErrorHandler(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    await requireRole(["MANAGER", "BUSINESS_DEVELOPER"], request);
    const { id } = await params;
    const body = await validateRequest(request, schema);

    let week = bilanWeek(new Date());
    if (body.weekStart) {
        // Any day of the wanted week works: use the Wednesday to land inside it.
        week = bilanWeek(new Date(`${addDay(body.weekStart, 2)}T12:00:00Z`));
    }

    const client = await prisma.client.findUnique({ where: { id }, select: { id: true, email: true } });
    if (!client) return errorResponse("Client introuvable", 404);

    const data = await collectWeeklyBilanData(id, week);

    let ai: BilanNarrative | null = null;
    let aiStatus: { status: "ok" | "failed" | "skipped"; error?: string } = { status: "skipped" };
    if (body.withAi && data.stats.calls > 0) {
        try {
            ai = await generateBilanNarrative(data);
            aiStatus = { status: "ok" };
        } catch (err) {
            const stored = err instanceof AiCallError ? err.toStored() : (err as Error)?.message;
            aiStatus = { status: "failed", error: friendlyAiError(stored).title };
        }
    }

    const markdown = renderBilanMarkdown(data, ai, aiStatus.status === "failed" ? aiStatus.error : undefined);
    const aiText = ai ? [ai.synthese, ...ai.pointsForts, ...ai.vigilance, ...ai.prochainesEtapes].join("\n") : "";
    const warnings = ai ? findUnverifiedNumbers(aiText, allowedNumbers(data)) : [];

    const existing = await prisma.clientSession.findFirst({
        where: {
            clientId: id,
            type: "Reporting",
            date: { gte: parisMidnight(week.start), lt: parisMidnight(addDay(week.end, 3)) },
        },
        select: { id: true },
    });

    return successResponse({
        week,
        sessionDate: bilanSessionDate(week).toISOString(),
        clientEmail: client.email,
        stats: data.stats,
        meetings: data.meetings,
        markdown,
        email: renderBilanEmail(data, ai),
        ai: aiStatus,
        unverifiedNumbers: warnings,
        existingReportingSessionId: existing?.id ?? null,
    });
});
