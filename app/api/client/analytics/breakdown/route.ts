import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { portalVisibleMissionWhere } from "@/lib/portal-visibility";

function normalize(val: string | null | undefined): string {
    return val?.trim() || "Non renseigné";
}

function increment(
    map: Map<string, { calls: number; rdv: number }>,
    key: string,
    isRdv: boolean
) {
    const cur = map.get(key) ?? { calls: 0, rdv: 0 };
    cur.calls++;
    if (isRdv) cur.rdv++;
    map.set(key, cur);
}

function toSortedArray(map: Map<string, { calls: number; rdv: number }>, limit = 10) {
    return Array.from(map.entries())
        .map(([label, { calls, rdv }]) => ({
            label,
            calls,
            rdv,
            rate: calls > 0 ? Math.round((rdv / calls) * 1000) / 10 : 0,
        }))
        .sort((a, b) => b.calls - a.calls)
        .slice(0, limit);
}

function emptyResult() {
    return { totalCalls: 0, totalRdv: 0, byIndustry: [], bySize: [], byFunction: [] };
}

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["CLIENT"], request);
    const clientId = (session.user as { clientId?: string | null }).clientId;
    if (!clientId) return successResponse(emptyResult());

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const createdAtFilter: { gte?: Date; lte?: Date } = {};
    if (startDate) createdAtFilter.gte = new Date(startDate);
    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        createdAtFilter.lte = end;
    }

    const campaignIds = await prisma.campaign
        .findMany({
            where: { mission: { clientId, AND: [portalVisibleMissionWhere()] } },
            select: { id: true },
        })
        .then((list) => list.map((c) => c.id));

    if (campaignIds.length === 0) return successResponse(emptyResult());

    const actions = await prisma.action.findMany({
        where: {
            campaignId: { in: campaignIds },
            channel: "CALL",
            ...(Object.keys(createdAtFilter).length > 0
                ? { createdAt: createdAtFilter }
                : {}),
        },
        select: {
            id: true,
            result: true,
            contact: {
                select: {
                    title: true,
                    company: { select: { industry: true, size: true } },
                },
            },
            company: { select: { industry: true, size: true } },
        },
    });

    const byIndustry = new Map<string, { calls: number; rdv: number }>();
    const bySize = new Map<string, { calls: number; rdv: number }>();
    const byFunction = new Map<string, { calls: number; rdv: number }>();

    for (const action of actions) {
        const industry = normalize(
            action.contact?.company?.industry ?? action.company?.industry
        );
        const size = normalize(
            action.contact?.company?.size ?? action.company?.size
        );
        const fn = normalize(action.contact?.title);
        const isRdv = action.result === "MEETING_BOOKED";

        increment(byIndustry, industry, isRdv);
        increment(bySize, size, isRdv);
        increment(byFunction, fn, isRdv);
    }

    const totalCalls = actions.length;
    const totalRdv = actions.filter((a) => a.result === "MEETING_BOOKED").length;

    return successResponse({
        totalCalls,
        totalRdv,
        byIndustry: toSortedArray(byIndustry),
        bySize: toSortedArray(bySize),
        byFunction: toSortedArray(byFunction),
    });
});
