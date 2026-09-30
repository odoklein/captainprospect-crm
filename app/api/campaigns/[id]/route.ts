import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
    successResponse,
    errorResponse,
    requireRole,
    withErrorHandler,
    validateRequest,
    NotFoundError,
} from '@/lib/api-utils';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';
import { z } from 'zod';

// ============================================
// SCHEMAS
// ============================================

const updateCampaignSchema = z.object({
    name: z.string().min(1).optional(),
    /** Allow empty strings so managers can save script-only edits or clear draft text without Zod rejecting the body. */
    icp: z.string().optional(),
    pitch: z.string().optional(),
    script: z.union([
        z.string(),
        z.object({
            intro: z.string().optional(),
            discovery: z.string().optional(),
            objection: z.string().optional(),
            closing: z.string().optional(),
        }),
    ]).optional(),
    isActive: z.boolean().optional(),
});

function normalizeScriptToSingleText(script: unknown): string | null {
    if (typeof script === 'string') {
        const trimmed = script.trim();
        if (!trimmed) return '';
        try {
            const parsed = JSON.parse(trimmed) as Record<string, unknown>;
            if (parsed && typeof parsed === 'object') {
                const ordered = [
                    ['Introduction', parsed.intro],
                    ['Decouverte', parsed.discovery],
                    ['Objections', parsed.objection],
                    ['Closing', parsed.closing],
                ]
                    .map(([label, value]) =>
                        typeof value === 'string' && value.trim() ? `--- ${label} ---\n${value.trim()}` : null
                    )
                    .filter((v): v is string => Boolean(v));
                if (ordered.length > 0) return ordered.join('\n\n');
            }
        } catch {
            // keep plain string as-is
        }
        return script;
    }
    if (script && typeof script === 'object') {
        const parsed = script as Record<string, unknown>;
        const ordered = [
            ['Introduction', parsed.intro],
            ['Decouverte', parsed.discovery],
            ['Objections', parsed.objection],
            ['Closing', parsed.closing],
        ]
            .map(([label, value]) =>
                typeof value === 'string' && value.trim() ? `--- ${label} ---\n${value.trim()}` : null
            )
            .filter((v): v is string => Boolean(v));
        return ordered.join('\n\n');
    }
    return null;
}

// ============================================
// GET /api/campaigns/[id] - Get campaign details
// ============================================

export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    await requireRole(['MANAGER', 'CLIENT', 'SDR', 'BUSINESS_DEVELOPER', 'BOOKER'], request);
    const { id } = await params;

    const campaign = await prisma.campaign.findUnique({
        where: { id },
        include: {
            mission: {
                include: {
                    client: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            },
            _count: {
                select: {
                    actions: true,
                },
            },
        },
    });

    if (!campaign) {
        throw new NotFoundError('Campagne introuvable');
    }

    // Get stats
    const actions = await prisma.action.findMany({
        where: { campaignId: id },
    });

    const stats = {
        totalActions: actions.length,
        meetings: actions.filter(a => a.result === 'MEETING_BOOKED').length,
        interested: actions.filter(a => a.result === 'INTERESTED').length,
        notInterested: actions.filter(a => a.result === 'DISQUALIFIED').length,
        noAnswer: actions.filter(a => a.result === 'NO_RESPONSE').length,
        conversionRate: actions.length > 0
            ? (actions.filter(a => a.result === 'MEETING_BOOKED').length / actions.length) * 100
            : 0,
    };

    return successResponse({
        ...campaign,
        script: normalizeScriptToSingleText(campaign.script),
        stats,
    });
});

// ============================================
// PUT /api/campaigns/[id] - Update campaign
// ============================================

export const PUT = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    await requireRole(['MANAGER', 'BUSINESS_DEVELOPER', 'BOOKER'], request);
    const { id } = await params;
    const data = await validateRequest(request, updateCampaignSchema);

    const campaign = await prisma.campaign.update({
        where: { id },
        data: {
            ...data,
            script: data.script !== undefined ? normalizeScriptToSingleText(data.script) : undefined,
        },
        include: {
            mission: {
                select: {
                    id: true,
                    name: true,
                    channel: true,
                },
            },
        },
    });

    return successResponse(campaign);
});

// ============================================
// DELETE /api/campaigns/[id] - Delete campaign
// ============================================

export const DELETE = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireRole(['MANAGER', 'BUSINESS_DEVELOPER'], request);
    const { id } = await params;

    const campaign = await prisma.campaign.findUnique({
        where: { id },
        select: { name: true, missionId: true },
    });
    if (!campaign) {
        throw new NotFoundError('Stratégie introuvable');
    }

    await prisma.campaign.delete({
        where: { id },
    });

    audit(request, session, {
        action: AUDIT_ACTIONS.DELETE,
        entityType: 'Campaign',
        entityId: id,
        summary: `Stratégie "${campaign.name}" supprimée`,
        before: { name: campaign.name, missionId: campaign.missionId },
    });

    return successResponse({ deleted: true });
});
