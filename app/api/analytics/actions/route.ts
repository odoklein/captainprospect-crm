import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
    requireRole,
    withErrorHandler,
    getPaginationParams,
    paginatedResponse,
    errorResponse,
} from '@/lib/api-utils';
import { Prisma } from '@prisma/client';
import { parsePeriodRange } from '@/lib/manager-home/rules';
import { KNOWN_RESULT_CODES, OUTCOME_ORDER, codesOfFamily, type OutcomeKey } from '@/lib/manager-home/outcomes';

// GET /api/analytics/actions — the Journal of the Statistiques page.
//   startDate / endDate  Paris days (inclusive), same as /api/analytics/overview
//   sdrIds[] missionIds[] clientIds[] listIds[]   scope filters
//   families[]           outcome families (meeting, interested, callback, refusal,
//                        noReach, dataIssue, other) — not raw codes, so the filter
//                        matches the families the rest of the page speaks
//   q                    free text: contact, company or note
//   page / limit         server-side pagination

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(['MANAGER', 'DEVELOPER'], request);
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(searchParams);

    const range = parsePeriodRange(searchParams.get('startDate'), searchParams.get('endDate'));
    if (!range) return errorResponse('Période invalide', 400);

    const sdrIds = searchParams.getAll('sdrIds[]');
    const missionIds = searchParams.getAll('missionIds[]');
    const clientIds = searchParams.getAll('clientIds[]');
    const listIds = searchParams.getAll('listIds[]');
    const families = searchParams.getAll('families[]').filter((f): f is OutcomeKey => (OUTCOME_ORDER as string[]).includes(f));
    const q = (searchParams.get('q') || '').trim();

    const and: Prisma.ActionWhereInput[] = [];

    if (listIds.length > 0) {
        and.push({
            OR: [
                { company: { listId: { in: listIds } } },
                { contact: { company: { listId: { in: listIds } } } },
            ],
        });
    }

    if (families.length > 0) {
        const explicit = families.filter((f) => f !== 'other').flatMap(codesOfFamily);
        const clauses: Prisma.ActionWhereInput[] = [];
        if (explicit.length) clauses.push({ result: { in: explicit as never[] } });
        // "other" = every code that has no explicit family.
        if (families.includes('other')) clauses.push({ result: { notIn: KNOWN_RESULT_CODES as never[] } });
        and.push({ OR: clauses });
    }

    if (q) {
        and.push({
            OR: [
                { note: { contains: q, mode: 'insensitive' } },
                { contact: { firstName: { contains: q, mode: 'insensitive' } } },
                { contact: { lastName: { contains: q, mode: 'insensitive' } } },
                { contact: { company: { name: { contains: q, mode: 'insensitive' } } } },
                { company: { name: { contains: q, mode: 'insensitive' } } },
            ],
        });
    }

    const where: Prisma.ActionWhereInput = {
        channel: 'CALL',
        createdAt: { gte: range.from, lt: range.to },
        ...(sdrIds.length > 0 && { sdrId: { in: sdrIds } }),
        ...((missionIds.length > 0 || clientIds.length > 0) && {
            campaign: {
                mission: {
                    ...(missionIds.length > 0 && { id: { in: missionIds } }),
                    ...(clientIds.length > 0 && { clientId: { in: clientIds } }),
                },
            },
        }),
        ...(and.length > 0 && { AND: and }),
    };

    const [actions, total] = await Promise.all([
        prisma.action.findMany({
            where,
            select: {
                id: true,
                createdAt: true,
                result: true,
                duration: true,
                note: true,
                callbackDate: true,
                sdr: { select: { id: true, name: true } },
                contact: {
                    select: {
                        firstName: true,
                        lastName: true,
                        title: true,
                        company: { select: { name: true } },
                    },
                },
                company: { select: { name: true } },
                campaign: { select: { mission: { select: { id: true, name: true } } } },
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
        }),
        prisma.action.count({ where }),
    ]);

    const items = actions.map((a) => {
        const contactName = a.contact
            ? [a.contact.firstName, a.contact.lastName].filter(Boolean).join(' ').trim() || null
            : null;
        return {
            id: a.id,
            createdAt: a.createdAt,
            sdrId: a.sdr.id,
            sdrName: a.sdr.name,
            contactName,
            contactTitle: a.contact?.title ?? null,
            companyName: a.contact?.company?.name ?? a.company?.name ?? null,
            missionName: a.campaign?.mission?.name ?? null,
            result: a.result,
            duration: a.duration,
            callbackDate: a.callbackDate,
            note: a.note,
        };
    });

    return paginatedResponse(items, total, page, limit);
});
