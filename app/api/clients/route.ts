import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
    successResponse,
    paginatedResponse,
    requireRole,
    withErrorHandler,
    validateRequest,
    getPaginationParams,
} from '@/lib/api-utils';
import { z } from 'zod';
import { getClientProductionInsights } from '@/lib/client-insights';

// ============================================
// SCHEMAS
// ============================================

const createClientSchema = z.object({
    name: z.string().min(1, 'Nom requis'),
    email: z.string().email('Email invalide').optional().nullable(),
    phone: z.string().optional().nullable(),
    industry: z.string().optional().nullable(),
    logo: z.string().url('URL logo invalide').optional().nullable(),
    onboardingData: z.object({
        icp: z.string().optional(),
        targetIndustries: z.array(z.string()).optional(),
        targetCompanySize: z.string().optional(),
        targetJobTitles: z.array(z.string()).optional(),
        targetGeographies: z.array(z.string()).optional(),
        listingSources: z.array(z.string()).optional(),
        listingCriteria: z.string().optional(),
        estimatedContacts: z.string().optional(),
        aiAnalysis: z.any().optional(),
    }).optional(),
    targetLaunchDate: z.string().optional().nullable(),
    scripts: z.record(z.string(), z.unknown()).optional(),
    notes: z.string().optional().nullable(),
    createMission: z.boolean().optional(),
    missionName: z.string().optional().nullable(),
    missionObjective: z.string().optional().nullable(),
    missionChannel: z.enum(['CALL', 'EMAIL', 'LINKEDIN']).optional(),
    missionDurationMonths: z.number().optional().nullable(),
    missionWorkingDays: z.number().optional().nullable(),
    missionRdvTarget: z.number().optional().nullable(),
    salesPlaybook: z.record(z.string(), z.unknown()).optional().nullable(),
    // Email templates from playbook sequence
    emailTemplates: z.array(z.object({
        subject: z.string(),
        body: z.string(),
    })).optional().nullable(),
    // Leexi import audit trail
    leexiImport: z.object({
        leexiCallId: z.string().optional(),
        source: z.enum(['api', 'paste', 'webhook']),
        rawRecap: z.string(),
        callTitle: z.string().optional(),
        callDate: z.string().optional(),
        callDuration: z.number().optional(),
    }).optional().nullable(),
});

function extractUnifiedScript(scripts: Record<string, unknown> | undefined): string {
    if (!scripts || typeof scripts !== 'object') return '';
    if (typeof scripts.base === 'string' && scripts.base.trim()) return scripts.base;
    const ordered = [
        ['Introduction', scripts.intro],
        ['Decouverte', scripts.discovery],
        ['Objections', scripts.objection],
        ['Closing', scripts.closing],
    ]
        .map(([label, value]) =>
            typeof value === 'string' && value.trim() ? `--- ${label} ---\n${value.trim()}` : null
        )
        .filter((v): v is string => Boolean(v));
    return ordered.join('\n\n');
}

// ============================================
// GET /api/clients - List all clients
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(['MANAGER', 'CLIENT'], request);
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(searchParams);

    const where: Record<string, unknown> = {};

    // Clients can only see their own company
    if (session.user.role === 'CLIENT') {
        where.users = { some: { id: session.user.id } };
    }

    const search = searchParams.get('search');
    if (search) {
        where.name = { contains: search, mode: 'insensitive' };
    }

    const [clients, total] = await Promise.all([
        prisma.client.findMany({
            where,
            include: {
                _count: {
                    select: {
                        missions: true,
                        users: true,
                    },
                },
                missions: {
                    select: { id: true, name: true, endDate: true, isActive: true, status: true },
                    orderBy: { endDate: 'desc' },
                    take: 5,
                },
                onboarding: {
                    select: { onboardingData: true },
                },
            },
            orderBy: { name: 'asc' },
            skip,
            take: limit,
        }),
        prisma.client.count({ where }),
    ]);

    const productionByClient = await getClientProductionInsights(clients.map((c) => c.id));

    const clientsWithReadiness = clients.map((c) => {
        const od = c.onboarding?.onboardingData as { icp?: string } | null;
        const personaSet = !!(od?.icp && String(od.icp).trim());
        return {
            ...c,
            insights: {
                production: productionByClient.get(c.id),
            },
            readiness: {
                calendarConnected: !!(c as { bookingUrl?: string }).bookingUrl?.trim(),
                personaSet,
                missionCreated: (c._count?.missions ?? 0) > 0,
            },
        };
    });

    return paginatedResponse(clientsWithReadiness, total, page, limit);
});

// ============================================
// POST /api/clients - Create new client with onboarding
// ============================================

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(['MANAGER'], request);
    const data = await validateRequest(request, createClientSchema);

    const {
        name,
        email,
        phone,
        industry,
        logo,
        onboardingData,
        targetLaunchDate,
        scripts,
        notes,
        createMission,
        missionName,
        missionObjective,
        missionChannel,
        missionDurationMonths,
        missionWorkingDays,
        missionRdvTarget,
        salesPlaybook,
        emailTemplates,
        leexiImport,
    } = data;

    const client = await prisma.client.create({
        data: {
            name,
            email: email || undefined,
            phone: phone || undefined,
            industry: industry || undefined,
            logo: logo || undefined,
            salesPlaybook: salesPlaybook || undefined,
        },
    });

    const hasOnboardingData = onboardingData || scripts || notes || targetLaunchDate;

    if (hasOnboardingData) {
        await prisma.clientOnboarding.create({
            data: {
                clientId: client.id,
                status: 'IN_PROGRESS',
                onboardingData: onboardingData || {},
                scripts: scripts || {},
                notes: notes || undefined,
                targetLaunchDate: targetLaunchDate ? new Date(targetLaunchDate) : undefined,
                createdById: session.user.id,
            },
        });
    }

    let missionId: string | undefined;

    if (createMission && missionName) {
        const durationMonths = missionDurationMonths || 3;
        const startDate = targetLaunchDate ? new Date(targetLaunchDate) : new Date();
        const endDate = new Date(startDate.getTime() + durationMonths * 30 * 24 * 60 * 60 * 1000);

        const mission = await prisma.mission.create({
            data: {
                clientId: client.id,
                name: missionName,
                objective: missionObjective || `Mission pour ${name}`,
                channel: missionChannel || 'CALL',
                startDate,
                endDate,
                isActive: true,
                totalContractDays: missionWorkingDays ? missionWorkingDays * durationMonths : undefined,
                playbook: salesPlaybook || undefined,
            },
        });

        missionId = mission.id;

        const unifiedScript = extractUnifiedScript(scripts as Record<string, unknown> | undefined);
        if (unifiedScript || onboardingData?.icp) {
            await prisma.campaign.create({
                data: {
                    missionId: mission.id,
                    name: `Campagne ${name}`,
                    icp: onboardingData?.icp || 'ICP à définir',
                    pitch: onboardingData?.icp || 'Pitch à définir',
                    script: unifiedScript || undefined,
                    isActive: true,
                },
            });
        }

        if (emailTemplates && emailTemplates.length > 0) {
            for (let i = 0; i < emailTemplates.length; i++) {
                const tpl = emailTemplates[i];
                const template = await prisma.emailTemplate.create({
                    data: {
                        createdById: session.user.id,
                        name: `Email ${i + 1} — ${name}`,
                        subject: tpl.subject,
                        bodyHtml: tpl.body,
                        category: 'sales',
                        isShared: true,
                    },
                });
                await prisma.missionEmailTemplate.create({
                    data: {
                        missionId: mission.id,
                        templateId: template.id,
                        order: i + 1,
                    },
                });
            }
        }
    }

    if (leexiImport) {
        await prisma.leexiCallImport.create({
            data: {
                leexiCallId: leexiImport.leexiCallId || `paste-${Date.now()}`,
                clientId: client.id,
                missionId: missionId || undefined,
                importedById: session.user.id,
                source: leexiImport.source,
                rawRecap: leexiImport.rawRecap,
                extractedData: salesPlaybook || undefined,
                callTitle: leexiImport.callTitle || undefined,
                callDate: leexiImport.callDate ? new Date(leexiImport.callDate) : undefined,
                callDuration: leexiImport.callDuration || undefined,
            },
        });
    }

    const clientWithOnboarding = await prisma.client.findUnique({
        where: { id: client.id },
        include: {
            onboarding: true,
            missions: { select: { id: true, name: true }, take: 5 },
            _count: {
                select: {
                    missions: true,
                    users: true,
                },
            },
        },
    });

    return successResponse(clientWithOnboarding, 201);
});
