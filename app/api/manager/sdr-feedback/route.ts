import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { MAIN_BLOCKER_VALUES } from "@/lib/sdr-daily-report/options";
import {
    errorResponse,
    requireRole,
    successResponse,
    withErrorHandler,
} from "@/lib/api-utils";

const querySchema = z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    missionId: z.string().optional(),
    sdrId: z.string().optional(),
    search: z.string().trim().max(200).optional(),
    minScore: z.coerce.number().int().min(1).max(5).optional(),
    maxScore: z.coerce.number().int().min(1).max(5).optional(),
    withObjections: z.enum(["true", "false"]).optional(),
    withMissionComment: z.enum(["true", "false"]).optional(),
    blocker: z.enum(MAIN_BLOCKER_VALUES).optional(),
    /** Has a field comment (structured form) or a mission comment (legacy form). */
    withComment: z.enum(["true", "false"]).optional(),
    sortBy: z.enum(["submittedAt", "score", "sdr"]).default("submittedAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
    limit: z.coerce.number().int().min(1).max(500).default(100),
});

function parseDateRange(from?: string, to?: string): { gte?: Date; lte?: Date } {
    const out: { gte?: Date; lte?: Date } = {};
    if (from) {
        const fromDate = new Date(from);
        if (!Number.isNaN(fromDate.getTime())) {
            fromDate.setHours(0, 0, 0, 0);
            out.gte = fromDate;
        }
    }
    if (to) {
        const toDate = new Date(to);
        if (!Number.isNaN(toDate.getTime())) {
            toDate.setHours(23, 59, 59, 999);
            out.lte = toDate;
        }
    }
    return out;
}

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
        from: searchParams.get("from") ?? undefined,
        to: searchParams.get("to") ?? undefined,
        missionId: searchParams.get("missionId") ?? undefined,
        sdrId: searchParams.get("sdrId") ?? undefined,
        search: searchParams.get("search") ?? undefined,
        minScore: searchParams.get("minScore") ?? undefined,
        maxScore: searchParams.get("maxScore") ?? undefined,
        withObjections: searchParams.get("withObjections") ?? undefined,
        withMissionComment: searchParams.get("withMissionComment") ?? undefined,
        blocker: searchParams.get("blocker") ?? undefined,
        withComment: searchParams.get("withComment") ?? undefined,
        sortBy: searchParams.get("sortBy") ?? undefined,
        sortOrder: searchParams.get("sortOrder") ?? undefined,
        limit: searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) {
        return errorResponse("Paramètres invalides", 400);
    }

    const range = parseDateRange(parsed.data.from, parsed.data.to);
    const submittedAtFilter = range.gte || range.lte ? { submittedAt: range } : {};
    const missionId = parsed.data.missionId?.trim();
    const missionFilter = missionId
        ? {
              OR: [
                  { missionId },
                  {
                      missions: {
                          some: {
                              missionId,
                          },
                      },
                  },
              ],
          }
        : {};
    const sdrId = parsed.data.sdrId?.trim();
    const scoreFilters = {
        ...(parsed.data.minScore ? { gte: parsed.data.minScore } : {}),
        ...(parsed.data.maxScore ? { lte: parsed.data.maxScore } : {}),
    };
    const scoreFilter = Object.keys(scoreFilters).length ? { score: scoreFilters } : {};
    const search = parsed.data.search?.trim();

    const whereClauses: Array<Record<string, unknown>> = [
        submittedAtFilter,
        missionFilter,
        sdrId ? { sdrId } : {},
        scoreFilter,
        parsed.data.withObjections === "true"
            ? { objections: { not: null } }
            : parsed.data.withObjections === "false"
              ? { objections: null }
              : {},
        parsed.data.withMissionComment === "true"
            ? { missionComment: { not: null } }
            : parsed.data.withMissionComment === "false"
              ? { missionComment: null }
              : {},
        parsed.data.blocker ? { mainBlocker: parsed.data.blocker } : {},
        parsed.data.withComment === "true"
            ? { OR: [{ fieldComment: { not: null } }, { missionComment: { not: null } }] }
            : parsed.data.withComment === "false"
              ? { AND: [{ fieldComment: null }, { missionComment: null }] }
              : {},
    ];
    if (search) {
        whereClauses.push({
            OR: [
                { review: { contains: search, mode: "insensitive" as const } },
                { objections: { contains: search, mode: "insensitive" as const } },
                { missionComment: { contains: search, mode: "insensitive" as const } },
                { fieldComment: { contains: search, mode: "insensitive" as const } },
                { sdr: { name: { contains: search, mode: "insensitive" as const } } },
                {
                    missions: {
                        some: {
                            mission: {
                                name: { contains: search, mode: "insensitive" as const },
                            },
                        },
                    },
                },
            ],
        });
    }
    const where = { AND: whereClauses };

    const orderBy =
        parsed.data.sortBy === "score"
            ? { score: parsed.data.sortOrder }
            : parsed.data.sortBy === "sdr"
              ? { sdr: { name: parsed.data.sortOrder } }
              : { submittedAt: parsed.data.sortOrder };

    const rows = await prisma.sdrDailyFeedback.findMany({
        where,
        orderBy,
        take: parsed.data.limit,
        select: {
            id: true,
            score: true,
            review: true,
            objections: true,
            missionComment: true,
            reachability: true,
            prospectReturns: true,
            pitchFeeling: true,
            mainBlocker: true,
            fieldComment: true,
            pagePath: true,
            submittedAt: true,
            sdr: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                },
            },
            mission: {
                select: {
                    id: true,
                    name: true,
                },
            },
            missions: {
                select: {
                    mission: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            },
        },
    });

    return successResponse(rows);
});
