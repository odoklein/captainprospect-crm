import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    errorResponse,
    requireRole,
    successResponse,
    withErrorHandler,
} from "@/lib/api-utils";
import { getTodaySdrMissionIds } from "@/lib/sdr-today-missions";
import { dailyReportSchema } from "@/lib/sdr-daily-report/schema";
import { reportDayBounds, reportDayKey } from "@/lib/sdr-daily-report/day";

const DEFAULT_PROMPT_TIME = "15:45";

const REPORT_SELECT = {
    id: true,
    submittedAt: true,
    reachability: true,
    prospectReturns: true,
    pitchFeeling: true,
    mainBlocker: true,
    fieldComment: true,
    missions: { select: { missionId: true } },
} as const;

/**
 * Where the SDR stands on today's "Retour journée".
 *
 * This — not the browser's localStorage — decides whether the report is still
 * owed, so it can't be dodged by clearing site data or switching browser.
 * `required` is false on a day the SDR neither is planned nor has done any
 * action, so a mandatory form never locks someone out on a day off.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["SDR"], request);
    const sdrId = session.user.id;
    const reportDate = reportDayKey();
    const { start, end } = reportDayBounds();

    const [user, report, todayMissionIds, firstActionToday] = await Promise.all([
        prisma.user.findUnique({ where: { id: sdrId }, select: { preferences: true } }),
        prisma.sdrDailyFeedback.findUnique({
            where: { sdrId_reportDate: { sdrId, reportDate } },
            select: REPORT_SELECT,
        }),
        getTodaySdrMissionIds(sdrId),
        prisma.action.findFirst({
            where: { sdrId, createdAt: { gte: start, lt: end } },
            select: { id: true },
        }),
    ]);

    const prefs = (user?.preferences ?? {}) as {
        sdrFeedback?: { promptTime?: string; requiredDaily?: boolean };
    };
    const requiredDaily = prefs.sdrFeedback?.requiredDaily ?? true;
    const workedToday = todayMissionIds.length > 0 || firstActionToday !== null;

    const missions = todayMissionIds.length
        ? await prisma.mission.findMany({
              where: { id: { in: todayMissionIds } },
              select: { id: true, name: true, client: { select: { name: true } } },
              orderBy: { name: "asc" },
          })
        : [];

    return successResponse({
        reportDate,
        promptTime: prefs.sdrFeedback?.promptTime ?? DEFAULT_PROMPT_TIME,
        required: requiredDaily && workedToday,
        report: report
            ? {
                  id: report.id,
                  submittedAt: report.submittedAt,
                  reachability: report.reachability,
                  prospectReturns: report.prospectReturns,
                  pitchFeeling: report.pitchFeeling,
                  mainBlocker: report.mainBlocker,
                  fieldComment: report.fieldComment,
                  missionIds: report.missions.map((link) => link.missionId),
              }
            : null,
        missions,
    });
});

/**
 * Submit today's report. One per SDR per day: sending again the same day
 * replaces it, so a mistake can be corrected rather than stacked.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["SDR"], request);
    const sdrId = session.user.id;

    const parsed = dailyReportSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return errorResponse(parsed.error.issues[0]?.message ?? "Données invalides", 400);
    }
    const data = parsed.data;
    const missionIds = Array.from(new Set(data.missionIds));

    if (missionIds.length > 0) {
        const accessible = await findAccessibleMissionIds(sdrId, missionIds);
        if (missionIds.some((id) => !accessible.has(id))) {
            return errorResponse("Mission non accessible", 403);
        }
    }

    const reportDate = reportDayKey();
    const fields = {
        // legacy primary mission (first selected)
        missionId: missionIds[0] ?? null,
        reachability: data.reachability,
        prospectReturns: data.prospectReturns,
        pitchFeeling: data.pitchFeeling,
        mainBlocker: data.mainBlocker,
        fieldComment: data.fieldComment,
        pagePath: data.pagePath?.trim() || null,
    };

    const saved = await prisma.$transaction(async (tx) => {
        const row = await tx.sdrDailyFeedback.upsert({
            where: { sdrId_reportDate: { sdrId, reportDate } },
            create: { sdrId, reportDate, ...fields },
            update: { ...fields, submittedAt: new Date() },
            select: { id: true, submittedAt: true },
        });
        await tx.sdrDailyFeedbackMission.deleteMany({ where: { feedbackId: row.id } });
        if (missionIds.length > 0) {
            await tx.sdrDailyFeedbackMission.createMany({
                data: missionIds.map((missionId) => ({ feedbackId: row.id, missionId })),
            });
        }
        return row;
    });

    return successResponse({ ...saved, reportDate });
});

/**
 * Missions the SDR may attach to a report: assigned, scheduled on, or already
 * worked — the assignment record alone can be missing or stale.
 */
async function findAccessibleMissionIds(sdrId: string, missionIds: string[]): Promise<Set<string>> {
    const [assignments, scheduledBlocks, actions] = await Promise.all([
        prisma.sDRAssignment.findMany({
            where: { missionId: { in: missionIds }, sdrId },
            select: { missionId: true },
        }),
        prisma.scheduleBlock.findMany({
            where: { missionId: { in: missionIds }, sdrId, status: { not: "CANCELLED" } },
            select: { missionId: true },
        }),
        prisma.action.findMany({
            where: { sdrId, campaign: { missionId: { in: missionIds } } },
            select: { campaign: { select: { missionId: true } } },
            distinct: ["campaignId"],
        }),
    ]);

    return new Set<string>([
        ...assignments.map((row) => row.missionId),
        ...scheduledBlocks.map((row) => row.missionId),
        ...actions.map((row) => row.campaign.missionId),
    ]);
}
