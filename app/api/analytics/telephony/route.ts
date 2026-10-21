import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { parsePeriodRange } from "@/lib/manager-home/rules";
import { fetchAlloMetricsForLine } from "@/lib/call-enrichment/allo-metrics";
import type { AlloSdrMetrics, TelephonyResponse } from "@/lib/stats/types";

// ============================================
// GET /api/analytics/telephony?startDate=&endDate=[&sdrIds[]=…]
// Allo phone-line metrics per SDR (calls, connected, talk time). Split from
// /api/analytics/overview because it calls an external API: the page renders
// first and fills these figures in when they arrive. Lines are fetched in
// parallel (the old route walked them one after the other).
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER", "DEVELOPER"], request);

    const { searchParams } = new URL(request.url);
    const range = parsePeriodRange(searchParams.get("startDate"), searchParams.get("endDate"));
    if (!range) return errorResponse("Période invalide", 400);

    const empty: TelephonyResponse = { available: false, bySdr: {}, totals: { alloCalls: 0, connectedCalls: 0, talkTimeSeconds: 0 } };
    const apiKey = process.env.ALLO_API_KEY;
    if (!apiKey) return successResponse(empty);

    const sdrIds = searchParams.getAll("sdrIds[]");
    const users = await prisma.user.findMany({
        where: {
            alloPhoneNumber: { not: null },
            ...(sdrIds.length ? { id: { in: sdrIds } } : {}),
        },
        select: { id: true, alloPhoneNumber: true },
    });
    const withLine = users.filter((u) => (u.alloPhoneNumber ?? "").trim() !== "");
    if (withLine.length === 0) return successResponse(empty);

    // One Allo query per distinct line, whatever the number of users sharing it.
    const lines = [...new Set(withLine.map((u) => (u.alloPhoneNumber ?? "").trim()))];
    const metrics = await Promise.all(
        lines.map(async (line): Promise<[string, AlloSdrMetrics]> => {
            try {
                const m = await fetchAlloMetricsForLine(line, range.from, range.to, apiKey);
                return [line, { alloCalls: m.calls, connectedCalls: m.connectedCalls, talkTimeSeconds: m.talkTimeSeconds }];
            } catch {
                return [line, { alloCalls: 0, connectedCalls: 0, talkTimeSeconds: 0 }];
            }
        }),
    );
    const byLine = new Map(metrics);

    const bySdr: Record<string, AlloSdrMetrics> = {};
    for (const u of withLine) bySdr[u.id] = byLine.get((u.alloPhoneNumber ?? "").trim())!;
    // Totals count each line once, even when several CRM users share it.
    const totals = [...byLine.values()].reduce<AlloSdrMetrics>(
        (acc, m) => ({
            alloCalls: acc.alloCalls + m.alloCalls,
            connectedCalls: acc.connectedCalls + m.connectedCalls,
            talkTimeSeconds: acc.talkTimeSeconds + m.talkTimeSeconds,
        }),
        { alloCalls: 0, connectedCalls: 0, talkTimeSeconds: 0 },
    );

    return successResponse<TelephonyResponse>({ available: true, bySdr, totals });
});
