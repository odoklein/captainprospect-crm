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
import { Prisma } from '@prisma/client';
import { getClientProductionInsights } from '@/lib/client-insights';
import {
    addMonths,
    buildCampaignScript,
    defaultMissionName,
    plainTextToHtml,
    sequenceEmailName,
    templateVariables,
} from '@/lib/onboarding/client-create';
import { parisDayOf } from '@/lib/onboarding/checklist-template';
import { startChecklist } from '@/lib/onboarding/checklist-service';

// ============================================
// SCHEMAS
// ============================================

const contactSchema = z.object({
    name: z.string().trim().default(''),
    role: z.string().trim().optional().default(''),
    email: z.string().trim().optional().default(''),
    phone: z.string().trim().optional().default(''),
    /** Create a ClientInterlocuteur (RDV recipient) for this person. */
    asInterlocuteur: z.boolean().optional().default(false),
});

const channelSchema = z.enum(['CALL', 'EMAIL', 'LINKEDIN']);

const createClientSchema = z.object({
    name: z.string().trim().min(1, 'Nom requis'),
    email: z.string().email('Email invalide').optional().nullable(),
    phone: z.string().optional().nullable(),
    industry: z.string().optional().nullable(),
    logo: z.string().url('URL logo invalide').optional().nullable(),
    website: z.string().optional().nullable(),
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
        pitch: z.string().optional(),
        nextSteps: z.array(z.string()).optional(),
        rdvTargetPerMonth: z.number().optional(),
        workingDaysPerMonth: z.number().optional(),
        durationMonths: z.number().optional(),
    }).optional(),
    contacts: z.array(contactSchema).max(20).optional(),
    targetLaunchDate: z.string().optional().nullable(),
    scripts: z.record(z.string(), z.unknown()).optional(),
    notes: z.string().optional().nullable(),
    createMission: z.boolean().optional(),
    missionName: z.string().optional().nullable(),
    missionObjective: z.string().optional().nullable(),
    missionChannel: channelSchema.optional(),
    missionChannels: z.array(channelSchema).optional(),
    missionDurationMonths: z.number().optional().nullable(),
    missionWorkingDays: z.number().optional().nullable(),
    missionRdvTarget: z.number().optional().nullable(),
    campaignPitch: z.string().optional().nullable(),
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
        callDate: z.string().optional().nullable(),
        callDuration: z.number().optional(),
    }).optional().nullable(),
    // Onboarding checklist (lib/onboarding): started right after creation
    startChecklist: z.boolean().optional(),
    checklistStartDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

function splitName(full: string): { firstName: string; lastName: string } {
    const parts = full.trim().split(/\s+/);
    return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
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
        website,
        onboardingData,
        contacts,
        targetLaunchDate,
        scripts,
        notes,
        createMission,
        missionName,
        missionObjective,
        missionChannel,
        missionChannels,
        missionDurationMonths,
        missionWorkingDays,
        missionRdvTarget,
        campaignPitch,
        salesPlaybook,
        emailTemplates,
        leexiImport,
    } = data;
    const userId = session.user.id;
    const playbookJson = (salesPlaybook ?? undefined) as Prisma.InputJsonValue | undefined;

    // Everything below lands together or not at all: a failure halfway used to
    // leave a client without its mission, campaign or templates.
    const { clientId, missionId } = await prisma.$transaction(async (tx) => {
        const client = await tx.client.create({
            data: {
                name,
                email: email || undefined,
                phone: phone || undefined,
                industry: industry || undefined,
                logo: logo || undefined,
                salesPlaybook: playbookJson,
            },
        });

        await tx.clientOnboarding.create({
            data: {
                clientId: client.id,
                status: 'IN_PROGRESS',
                // Client has no website column: it lives with the rest of the fiche.
                onboardingData: {
                    ...(onboardingData ?? {}),
                    ...(website ? { website } : {}),
                    ...(missionRdvTarget ? { rdvTargetPerMonth: missionRdvTarget } : {}),
                    ...(missionWorkingDays ? { workingDaysPerMonth: missionWorkingDays } : {}),
                    ...(missionDurationMonths ? { durationMonths: missionDurationMonths } : {}),
                    ...(contacts?.length ? { contacts: contacts.map(({ asInterlocuteur: _drop, ...c }) => c) } : {}),
                },
                scripts: (scripts ?? {}) as Prisma.InputJsonValue,
                notes: notes || undefined,
                targetLaunchDate: targetLaunchDate ? new Date(targetLaunchDate) : undefined,
                createdById: userId,
            },
        });

        const interlocuteurIds: string[] = [];
        for (const contact of contacts ?? []) {
            if (!contact.asInterlocuteur || !contact.name) continue;
            const { firstName, lastName } = splitName(contact.name);
            const created = await tx.clientInterlocuteur.create({
                data: {
                    clientId: client.id,
                    firstName,
                    lastName,
                    title: contact.role || null,
                    emails: contact.email ? [{ value: contact.email, label: 'Pro', isPrimary: true }] : [],
                    phones: contact.phone ? [{ value: contact.phone, label: 'Pro', isPrimary: true }] : [],
                    bookingLinks: [],
                },
                select: { id: true },
            });
            interlocuteurIds.push(created.id);
        }

        let createdMissionId: string | undefined;

        if (createMission) {
            const durationMonths = missionDurationMonths || 3;
            const startDate = targetLaunchDate ? new Date(targetLaunchDate) : new Date();
            const channels = missionChannels?.length ? missionChannels : [missionChannel || 'CALL'];

            const mission = await tx.mission.create({
                data: {
                    clientId: client.id,
                    name: missionName?.trim() || defaultMissionName(name),
                    objective: missionObjective || `Mission pour ${name}`,
                    channel: channels[0],
                    channels,
                    startDate,
                    endDate: addMonths(startDate, durationMonths),
                    isActive: true,
                    totalContractDays: missionWorkingDays ? missionWorkingDays * durationMonths : undefined,
                    playbook: playbookJson,
                    defaultInterlocuteurId: interlocuteurIds[0],
                },
            });

            createdMissionId = mission.id;

            const unifiedScript = buildCampaignScript(scripts);
            const icp = onboardingData?.icp?.trim();
            const pitch = campaignPitch?.trim() || onboardingData?.pitch?.trim();
            if (unifiedScript || icp || pitch) {
                await tx.campaign.create({
                    data: {
                        missionId: mission.id,
                        name: `Campagne ${name}`,
                        icp: icp || 'ICP à définir',
                        pitch: pitch || icp || 'Pitch à définir',
                        script: unifiedScript || undefined,
                        isActive: true,
                    },
                });
            }

            const templates = (emailTemplates ?? []).filter((t) => t.subject.trim() || t.body.trim());
            for (let i = 0; i < templates.length; i++) {
                const tpl = templates[i];
                const template = await tx.emailTemplate.create({
                    data: {
                        createdById: userId,
                        name: sequenceEmailName(i, name),
                        subject: tpl.subject,
                        bodyHtml: plainTextToHtml(tpl.body),
                        bodyText: tpl.body,
                        variables: templateVariables(tpl.subject, tpl.body),
                        category: 'sales',
                        isShared: true,
                    },
                });
                await tx.missionEmailTemplate.create({
                    data: {
                        missionId: mission.id,
                        templateId: template.id,
                        order: i + 1,
                    },
                });
            }
        }

        if (leexiImport) {
            await tx.leexiCallImport.create({
                data: {
                    leexiCallId: leexiImport.leexiCallId || `paste-${Date.now()}`,
                    clientId: client.id,
                    missionId: createdMissionId,
                    importedById: userId,
                    source: leexiImport.source,
                    rawRecap: leexiImport.rawRecap,
                    extractedData: playbookJson,
                    callTitle: leexiImport.callTitle || undefined,
                    callDate: leexiImport.callDate ? new Date(leexiImport.callDate) : undefined,
                    callDuration: leexiImport.callDuration || undefined,
                },
            });
        }

        return { clientId: client.id, missionId: createdMissionId };
    }, { timeout: 30_000 });

    // The checklist has its own transaction (and project); a failure there must
    // not undo the client: it is reported and can be started from the drawer.
    let checklist: { started: boolean; error?: string } | undefined;
    if (data.startChecklist) {
        try {
            await startChecklist(clientId, userId, {
                startDay: data.checklistStartDay || parisDayOf(new Date()),
                assigneeId: userId,
            });
            checklist = { started: true };
        } catch (err) {
            console.error('Onboarding checklist start failed:', err);
            checklist = { started: false, error: err instanceof Error ? err.message : 'Checklist non démarrée' };
        }
    }

    const clientWithOnboarding = await prisma.client.findUnique({
        where: { id: clientId },
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

    return successResponse({ ...clientWithOnboarding, missionId, checklist }, 201);
});
