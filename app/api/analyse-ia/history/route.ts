import { NextRequest } from 'next/server';
import { successResponse, requireRole, withErrorHandler } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';
import { friendlyAiError } from '@/lib/analyse-ia/errors';

/** A run still "running" after this long died with its request (deploy, crash). */
const STALE_RUN_MS = 10 * 60 * 1000;

// ============================================
// GET /api/analyse-ia/history
// Returns paginated list of past weekly analyses
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(['MANAGER', 'BUSINESS_DEVELOPER'], request);

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const status = searchParams.get('status') || undefined;

    // Runs that never finished would otherwise spin forever on the page.
    await prisma.weeklyAnalysis.updateMany({
        where: { status: 'running', createdAt: { lt: new Date(Date.now() - STALE_RUN_MS) } },
        data: { status: 'failed', errorMessage: 'TIMEOUT: analyse interrompue' },
    });

    const where: any = {};
    if (status) where.status = status.includes(',') ? { in: status.split(',') } : status;

    const [analyses, total] = await Promise.all([
        prisma.weeklyAnalysis.findMany({
            where,
            orderBy: { weekStart: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
            select: {
                id: true,
                weekStart: true,
                weekEnd: true,
                label: true,
                status: true,
                confidenceScore: true,
                dataQualityScore: true,
                missionIds: true,
                sdrIds: true,
                clientIds: true,
                errorMessage: true,
                modelUsed: true,
                recommendations: true,
                expectedImpacts: true,
                trendAlerts: true,
                dataSnapshot: true,
                executiveSummary: true,
                priorAnalysisId: true,
                recommendationOutcomes: true,
                createdAt: true,
                durationMs: true,
                tokensUsed: true,
            },
        }),
        prisma.weeklyAnalysis.count({ where }),
    ]);

    return successResponse({
        analyses: analyses.map((a) => ({
            ...a,
            friendlyError: a.status === 'failed' ? friendlyAiError(a.errorMessage) : null,
        })),
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            hasMore: page * limit < total,
        },
    });
});
