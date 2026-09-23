import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
    successResponse,
    requireRole,
    withErrorHandler,
    NotFoundError,
} from '@/lib/api-utils';

// Lightweight endpoint: returns only client bookingUrl + active interlocuteurs
// Used by the SDR drawer to avoid loading the full mission payload
export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    await requireRole(['MANAGER', 'CLIENT', 'SDR', 'BUSINESS_DEVELOPER'], request);
    const { id } = await params;

    const mission = await prisma.mission.findUnique({
        where: { id },
        select: {
            id: true,
            defaultInterlocuteurId: true,
            client: {
                select: {
                    bookingUrl: true,
                    interlocuteurs: {
                        where: { isActive: true },
                        orderBy: { createdAt: 'asc' },
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            title: true,
                            isActive: true,
                            emails: true,
                            phones: true,
                            bookingLinks: true,
                        },
                    },
                },
            },
        },
    });

    if (!mission) {
        throw new NotFoundError('Mission introuvable');
    }

    const rawInterlocuteurs = mission.client?.interlocuteurs || [];
    const interlocuteurs = rawInterlocuteurs.map((i) => {
        const links = Array.isArray(i.bookingLinks) ? i.bookingLinks : [];
        return {
            id: i.id,
            firstName: i.firstName,
            lastName: i.lastName,
            title: i.title ?? undefined,
            isActive: i.isActive,
            emails: Array.isArray(i.emails) ? i.emails : [],
            phones: Array.isArray(i.phones) ? i.phones : [],
            bookingLinks: links.map((bl: { label?: string; url?: string; durationMinutes?: number }) => ({
                label: typeof bl?.label === 'string' ? bl.label : '',
                url: typeof bl?.url === 'string' ? bl.url : '',
                durationMinutes: typeof bl?.durationMinutes === 'number' ? bl.durationMinutes : 30,
            })),
        };
    });

    // "Base de données par commercial": with ?companyId=, resolve the commercial owning
    // that company's list (mission default as fallback) — same rule as /api/actions/next,
    // so drawers opened outside the action queue (rappels, historique…) open on that calendar.
    let preferredInterlocuteurId: string | null = null;
    const companyId = request.nextUrl.searchParams.get('companyId');
    if (companyId) {
        const company = await prisma.company.findUnique({
            where: { id: companyId },
            select: { list: { select: { missionId: true, commercialInterlocuteurId: true } } },
        });
        if (company?.list?.missionId === id) {
            preferredInterlocuteurId = company.list.commercialInterlocuteurId ?? null;
        }
    }
    if (!preferredInterlocuteurId) {
        preferredInterlocuteurId = mission.defaultInterlocuteurId ?? null;
    }

    return successResponse({
        bookingUrl: mission.client?.bookingUrl || null,
        interlocuteurs,
        preferredInterlocuteurId,
    });
});
