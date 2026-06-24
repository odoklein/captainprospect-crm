import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
    successResponse,
    requireRole,
    withErrorHandler,
    validateRequest,
    NotFoundError,
    AuthError,
} from '@/lib/api-utils';
import { z } from 'zod';
import { getClientProductionInsight, getParisMonthWindow } from '@/lib/client-insights';

// ============================================
// SCHEMAS
// ============================================

const updateClientSchema = z.object({
    name: z.string().min(1).optional(),
    industry: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().optional(),
    bookingUrl: z.string().url().optional().or(z.literal('')),
    portalShowCallHistory: z.boolean().optional(),
    portalShowDatabase: z.boolean().optional(),
    rdvEmailNotificationsEnabled: z.boolean().optional(),
    /** Persona / ICP (Ideal Customer Profile) — stored in onboardingData.icp */
    icp: z.string().optional(),
    /** Default outbound mailbox for this client (stored in onboardingData.defaultMailboxId) */
    defaultMailboxId: z.string().optional().or(z.literal('')),
    status: z.enum(['ACTIVE', 'PAUSED', 'STOPPED']).optional(),
});

// ============================================
// GET /api/clients/[id] - Get client details
// ============================================

export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireRole(['MANAGER', 'CLIENT'], request);
    const { id } = await params;

    if (
        session.user.role === 'CLIENT' &&
        (session.user as { clientId?: string | null }).clientId !== id
    ) {
        throw new AuthError('Accès non autorisé', 403);
    }

    const { currentMonth, monthStart, monthEnd } = getParisMonthWindow();

    const client = await prisma.client.findUnique({
        where: { id },
        include: {
            missions: {
                include: {
                    _count: {
                        select: {
                            campaigns: true,
                            lists: true,
                            sdrAssignments: true,
                        },
                    },
                    lists: {
                        select: { id: true, name: true, type: true, _count: { select: { companies: true } } },
                        orderBy: { createdAt: 'desc' },
                    },
                    campaigns: {
                        select: { id: true, name: true, icp: true },
                        take: 5,
                    },
                    missionPlans: {
                        where: {
                            status: 'ACTIVE',
                            startDate: { lte: monthEnd },
                            OR: [
                                { endDate: null },
                                { endDate: { gte: monthStart } },
                            ],
                        },
                        orderBy: { updatedAt: 'desc' },
                        take: 1,
                        select: {
                            id: true,
                            frequency: true,
                            preferredDays: true,
                            timePreference: true,
                            customStartTime: true,
                            customEndTime: true,
                            startDate: true,
                            endDate: true,
                        },
                    },
                    missionMonthPlans: {
                        where: { month: currentMonth },
                        take: 1,
                        select: {
                            targetDays: true,
                            status: true,
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
            },
            users: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    createdAt: true,
                    isActive: true,
                    lastSignInAt: true,
                    lastSignInIp: true,
                    lastSignInCountry: true,
                    lastConnectedAt: true,
                },
                orderBy: { createdAt: 'desc' },
            },
            interlocuteurs: {
                include: {
                    portalUser: {
                        select: { id: true, email: true, name: true, isActive: true },
                    },
                },
                orderBy: { createdAt: 'asc' },
            },
            _count: {
                select: {
                    missions: true,
                    users: true,
                },
            },
            onboarding: {
                select: { onboardingData: true },
            },
        },
    });

    if (!client) {
        throw new NotFoundError('Client introuvable');
    }

    const [engagement, production, recentActions, sdrFeedback] = await Promise.all([
        prisma.engagement.findFirst({
            where: {
                clientId: id,
                statut: { in: ['ACTIF', 'RENOUVELE'] },
            },
            orderBy: { debut: 'desc' },
            select: {
                id: true,
                dureeMois: true,
                debut: true,
                fin: true,
                statut: true,
                renouvellement: true,
                offreTarif: {
                    select: { nom: true },
                },
            },
        }),
        getClientProductionInsight(id),
        prisma.action.findMany({
            where: {
                campaign: { mission: { clientId: id } },
            },
            orderBy: { createdAt: 'desc' },
            take: 80,
            select: {
                id: true,
                createdAt: true,
                callbackDate: true,
                result: true,
                channel: true,
                note: true,
                duration: true,
                sdr: {
                    select: { id: true, name: true },
                },
                company: {
                    select: { id: true, name: true },
                },
                contact: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        title: true,
                        company: {
                            select: { id: true, name: true },
                        },
                    },
                },
                campaign: {
                    select: {
                        id: true,
                        name: true,
                        mission: {
                            select: { id: true, name: true },
                        },
                    },
                },
            },
        }),
        prisma.sdrDailyFeedback.findMany({
            where: {
                OR: [
                    { mission: { clientId: id } },
                    {
                        missions: {
                            some: {
                                mission: { clientId: id },
                            },
                        },
                    },
                ],
            },
            orderBy: { submittedAt: 'desc' },
            take: 30,
            select: {
                id: true,
                score: true,
                review: true,
                objections: true,
                missionComment: true,
                submittedAt: true,
                sdr: {
                    select: { id: true, name: true, email: true },
                },
                mission: {
                    select: { id: true, name: true },
                },
                missions: {
                    where: {
                        mission: { clientId: id },
                    },
                    select: {
                        mission: {
                            select: { id: true, name: true },
                        },
                    },
                },
            },
        }),
    ]);

    return successResponse({
        ...client,
        insights: {
            production,
            engagement,
            recentActions,
            sdrFeedback,
        },
    });
});

// ============================================
// PUT /api/clients/[id] - Update client
// ============================================

export const PUT = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireRole(['MANAGER'], request);
    const { id } = await params;
    const data = await validateRequest(request, updateClientSchema);

    // Clean up empty strings for client fields
    const { icp, defaultMailboxId, ...rest } = data;
    const cleanData = {
        ...rest,
        email: data.email || undefined,
        phone: data.phone || undefined,
        industry: data.industry || undefined,
        bookingUrl: data.bookingUrl || undefined,
    };

    await prisma.$transaction(async (tx) => {
        await tx.client.update({
            where: { id },
            data: cleanData,
        });

        if (icp !== undefined || defaultMailboxId !== undefined) {
            const existing = await tx.clientOnboarding.findUnique({
                where: { clientId: id },
                select: { onboardingData: true },
            });
            const prevData = (existing?.onboardingData as Record<string, unknown>) || {};
            const merged: Record<string, unknown> = { ...prevData };

            if (icp !== undefined) {
                merged.icp = icp.trim() === '' ? undefined : icp;
            }
            if (defaultMailboxId !== undefined) {
                merged.defaultMailboxId = defaultMailboxId === '' ? undefined : defaultMailboxId;
            }

            await tx.clientOnboarding.upsert({
                where: { clientId: id },
                create: {
                    clientId: id,
                    onboardingData: merged as object,
                    createdById: session.user.id,
                },
                update: {
                    onboardingData: merged as object,
                },
            });
        }
    });

    const client = await prisma.client.findUnique({
        where: { id },
        include: {
            _count: {
                select: {
                    missions: true,
                    users: true,
                },
            },
            onboarding: {
                select: { onboardingData: true },
            },
        },
    });

    return successResponse(client);
});

// ============================================
// DELETE /api/clients/[id] - Delete client and all connected data
// ============================================

export const DELETE = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    await requireRole(['MANAGER'], request);
    const { id } = await params;

    const client = await prisma.client.findUnique({
        where: { id },
    });

    if (!client) {
        throw new NotFoundError('Client introuvable');
    }

    // Delete client and all connected data in a transaction.
    // Order: unlink/drop relations that don't cascade, then delete client (DB cascades the rest).
    await prisma.$transaction(async (tx) => {
        // Unlink users from this client (they keep their account, just lose client access)
        await tx.user.updateMany({
            where: { clientId: id },
            data: { clientId: null },
        });

        // Delete client-scoped files and folders
        await tx.file.deleteMany({ where: { clientId: id } });
        await tx.folder.deleteMany({ where: { clientId: id } });

        // Unlink optional client references
        await tx.project.updateMany({
            where: { clientId: id },
            data: { clientId: null },
        });
        await tx.emailThread.updateMany({
            where: { clientId: id },
            data: { clientId: null },
        });
        await tx.prospectSource.updateMany({
            where: { clientId: id },
            data: { clientId: null },
        });
        await tx.prospectRule.updateMany({
            where: { clientId: id },
            data: { clientId: null },
        });

        // Remove client-specific pipeline config (1:1)
        await tx.prospectPipelineConfig.deleteMany({ where: { clientId: id } });

        // Campaign is cascade-deleted with Mission when Client is deleted; Action/File/EmailThread
        // reference Campaign without onDelete, so we must clear them first.
        const clientCampaignIds = await tx.campaign.findMany({
            where: { mission: { clientId: id } },
            select: { id: true },
        }).then(rows => rows.map(r => r.id));

        if (clientCampaignIds.length > 0) {
            await tx.action.deleteMany({
                where: { campaignId: { in: clientCampaignIds } },
            });
            await tx.file.updateMany({
                where: { campaignId: { in: clientCampaignIds } },
                data: { campaignId: null },
            });
            await tx.emailThread.updateMany({
                where: { campaignId: { in: clientCampaignIds } },
                data: { campaignId: null },
            });
            await tx.emailSequence.updateMany({
                where: { campaignId: { in: clientCampaignIds } },
                data: { campaignId: null },
            });
        }

        // Delete client; DB/Prisma cascades: Mission (and its Campaign, List, etc.),
        // ClientOnboarding, BusinessDeveloperClient, CommsChannel
        await tx.client.delete({
            where: { id },
        });
    });

    return successResponse({ deleted: true });
});
