/**
 * Persona / Target Intelligence API
 *
 * Cross-references call results by:
 * - Function (Contact.title)
 * - Company size (Company.size)
 * - Sector (Company.industry)
 * - Geography (Company.country)
 * - Campaign (Campaign.name)
 *
 * Supports comparison mode:
 * - Two lists within one mission: compareListA, compareListB, missionId
 * - Two missions: compareMissionA, compareMissionB
 */

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
    successResponse,
    errorResponse,
    requireRole,
    withErrorHandler,
} from '@/lib/api-utils';
import { Prisma } from '@prisma/client';
import { codesOfFamily } from '@/lib/manager-home/outcomes';
import { parsePeriodRange } from '@/lib/manager-home/rules';

interface DimensionRow {
    value: string;
    calls: number;
    /** Calls where somebody was reached (not no-answer / switchboard, not a bad number). */
    joined: number;
    meetings: number;
    /** Interested + callback families — teams log RAPPEL / RELANCE / PROJET_A_SUIVRE, not only the legacy codes. */
    callbacks: number;
    /** RDV per call, %. */
    conversionRate: number;
    /** Joints per call, %. */
    reachRate: number;
    /** RDV per joint, %. */
    joinedConversionRate: number;
}

const sqlList = (codes: string[]) => Prisma.join(codes);
const HOT_CODES = [...codesOfFamily('interested'), ...codesOfFamily('callback')];
const UNREACHED_CODES = [...codesOfFamily('noReach'), ...codesOfFamily('dataIssue')];
const metricCols = Prisma.sql`
    COUNT(a.id)::int as calls,
    COUNT(CASE WHEN a."result" NOT IN (${sqlList(UNREACHED_CODES)}) THEN 1 END)::int as joined,
    COUNT(CASE WHEN a."result" = 'MEETING_BOOKED' THEN 1 END)::int as meetings,
    COUNT(CASE WHEN a."result" IN (${sqlList(HOT_CODES)}) THEN 1 END)::int as callbacks`;

function buildWhereClause(
    dateFrom: Date,
    dateTo: Date,
    missionIds: string[],
    listIds: string[],
    sdrIds: string[],
    clientIds: string[] = []
): Prisma.Sql {
    const parts: Prisma.Sql[] = [
        Prisma.sql`a."channel" = 'CALL'`,
        Prisma.sql`a."createdAt" >= ${dateFrom}`,
        Prisma.sql`a."createdAt" < ${dateTo}`,
    ];
    if (missionIds.length > 0) {
        parts.push(Prisma.sql`m.id IN (${Prisma.join(missionIds)})`);
    }
    if (clientIds.length > 0) {
        parts.push(Prisma.sql`m."clientId" IN (${Prisma.join(clientIds)})`);
    }
    if (sdrIds.length > 0) {
        parts.push(Prisma.sql`a."sdrId" IN (${Prisma.join(sdrIds)})`);
    }
    if (listIds.length > 0) {
        parts.push(Prisma.sql`(
            (a."companyId" IS NOT NULL AND a."companyId" IN (SELECT id FROM "Company" WHERE "listId" IN (${Prisma.join(listIds)})))
            OR (a."contactId" IS NOT NULL AND a."contactId" IN (SELECT c.id FROM "Contact" c JOIN "Company" co ON c."companyId" = co.id WHERE co."listId" IN (${Prisma.join(listIds)})))
        )`);
    }
    return Prisma.join(parts, ' AND ');
}

async function getPersonaBreakdown(
    dateFrom: Date,
    dateTo: Date,
    missionIds: string[],
    listIds: string[],
    sdrIds: string[],
    clientIds: string[] = []
): Promise<{
    byFunction: DimensionRow[];
    byCompanySize: DimensionRow[];
    bySector: DimensionRow[];
    byGeography: DimensionRow[];
    byCampaign: DimensionRow[];
}> {
    const whereClause = buildWhereClause(dateFrom, dateTo, missionIds, listIds, sdrIds, clientIds);

    const baseJoin = Prisma.sql`
        FROM "Action" a
        LEFT JOIN "Campaign" c ON a."campaignId" = c.id
        LEFT JOIN "Mission" m ON c."missionId" = m.id
        LEFT JOIN "Contact" ct ON a."contactId" = ct.id
        LEFT JOIN "Company" co ON (ct."companyId" = co.id OR (a."companyId" IS NOT NULL AND a."companyId" = co.id))
        WHERE ${whereClause}
    `;

    const [byFunction, byCompanySize, bySector, byGeography, byCampaign] = await Promise.all([
        // By function (Contact.title)
        prisma.$queryRaw<any[]>(Prisma.sql`
            SELECT 
                COALESCE(NULLIF(TRIM(ct.title), ''), 'Non renseigné') as value,
                ${metricCols}
            ${baseJoin}
            GROUP BY COALESCE(NULLIF(TRIM(ct.title), ''), 'Non renseigné')
            HAVING COUNT(a.id) >= 1
            ORDER BY calls DESC
        `),
        // By company size
        prisma.$queryRaw<any[]>(Prisma.sql`
            SELECT 
                COALESCE(NULLIF(TRIM(co.size), ''), 'Non renseigné') as value,
                ${metricCols}
            ${baseJoin}
            GROUP BY COALESCE(NULLIF(TRIM(co.size), ''), 'Non renseigné')
            HAVING COUNT(a.id) >= 1
            ORDER BY calls DESC
        `),
        // By sector (industry)
        prisma.$queryRaw<any[]>(Prisma.sql`
            SELECT 
                COALESCE(NULLIF(TRIM(co.industry), ''), 'Non renseigné') as value,
                ${metricCols}
            ${baseJoin}
            GROUP BY COALESCE(NULLIF(TRIM(co.industry), ''), 'Non renseigné')
            HAVING COUNT(a.id) >= 1
            ORDER BY calls DESC
        `),
        // By geography (country)
        prisma.$queryRaw<any[]>(Prisma.sql`
            SELECT 
                COALESCE(NULLIF(TRIM(co.country), ''), 'Non renseigné') as value,
                ${metricCols}
            ${baseJoin}
            GROUP BY COALESCE(NULLIF(TRIM(co.country), ''), 'Non renseigné')
            HAVING COUNT(a.id) >= 1
            ORDER BY calls DESC
        `),
        // By campaign
        prisma.$queryRaw<any[]>(Prisma.sql`
            SELECT 
                COALESCE(NULLIF(TRIM(c.name), ''), 'Sans campagne') as value,
                ${metricCols}
            ${baseJoin}
            GROUP BY COALESCE(NULLIF(TRIM(c.name), ''), 'Sans campagne')
            HAVING COUNT(a.id) >= 1
            ORDER BY calls DESC
        `),
    ]);

    const rate = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 10000) / 100 : 0);
    const formatRow = (row: { value: string; calls: number; joined: number; meetings: number; callbacks: number }): DimensionRow => ({
        value: row.value || 'Non renseigné',
        calls: row.calls,
        joined: row.joined,
        meetings: row.meetings,
        callbacks: row.callbacks,
        conversionRate: rate(row.meetings, row.calls),
        reachRate: rate(row.joined, row.calls),
        joinedConversionRate: rate(row.meetings, row.joined),
    });

    return {
        byFunction: byFunction.map(formatRow),
        byCompanySize: byCompanySize.map(formatRow),
        bySector: bySector.map(formatRow),
        byGeography: byGeography.map(formatRow),
        byCampaign: byCampaign.map(formatRow),
    };
}

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(['MANAGER', 'DEVELOPER'], request);
    const { searchParams } = new URL(request.url);

    // `from` / `to` are the legacy names (still sent by the client detail page).
    const range = parsePeriodRange(
        searchParams.get('startDate') ?? searchParams.get('from'),
        searchParams.get('endDate') ?? searchParams.get('to'),
    );
    if (!range) return errorResponse('Période invalide', 400);
    // Paris days, [from, to) — same period semantics as /api/analytics/overview.
    const dateFrom = range.from;
    const dateTo = range.to;
    const sdrIds = searchParams.getAll('sdrIds[]');
    const missionIds = searchParams.getAll('missionIds[]');
    const clientIds = searchParams.getAll('clientIds[]');
    const listIds = searchParams.getAll('listIds[]');

    // Comparison mode: two segments
    const compareListA = searchParams.get('compareListA');
    const compareListB = searchParams.get('compareListB');
    const compareMissionA = searchParams.getAll('compareMissionA[]');
    const compareMissionB = searchParams.getAll('compareMissionB[]');

    const singleMode = !compareListA && !compareListB && compareMissionA.length === 0 && compareMissionB.length === 0;

    if (singleMode) {
        const data = await getPersonaBreakdown(dateFrom, dateTo, missionIds, listIds, sdrIds, clientIds);
        return successResponse({
            mode: 'single',
            timeframe: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
            ...data,
        });
    }

    // Comparison mode
    let labelA = 'Segment A';
    let labelB = 'Segment B';
    let segmentA: Awaited<ReturnType<typeof getPersonaBreakdown>>;
    let segmentB: Awaited<ReturnType<typeof getPersonaBreakdown>>;

    if (compareListA && compareListB && missionIds.length === 1) {
        // Two lists within one mission
        const [listA, listB] = await Promise.all([
            prisma.list.findUnique({ where: { id: compareListA }, select: { name: true } }),
            prisma.list.findUnique({ where: { id: compareListB }, select: { name: true } }),
        ]);
        labelA = listA?.name ?? 'Liste A';
        labelB = listB?.name ?? 'Liste B';
        segmentA = await getPersonaBreakdown(dateFrom, dateTo, missionIds, [compareListA], sdrIds, clientIds);
        segmentB = await getPersonaBreakdown(dateFrom, dateTo, missionIds, [compareListB], sdrIds, clientIds);
    } else if (compareMissionA.length > 0 && compareMissionB.length > 0) {
        // Two missions
        const [missionA, missionB] = await Promise.all([
            prisma.mission.findMany({ where: { id: { in: compareMissionA } }, select: { name: true } }),
            prisma.mission.findMany({ where: { id: { in: compareMissionB } }, select: { name: true } }),
        ]);
        labelA = missionA.map((m) => m.name).join(', ') || 'Mission(s) A';
        labelB = missionB.map((m) => m.name).join(', ') || 'Mission(s) B';
        segmentA = await getPersonaBreakdown(dateFrom, dateTo, compareMissionA, [], sdrIds, clientIds);
        segmentB = await getPersonaBreakdown(dateFrom, dateTo, compareMissionB, [], sdrIds, clientIds);
    } else {
        return errorResponse('Invalid compare params: use compareListA+compareListB+missionIds, or compareMissionA[]+compareMissionB[]', 400);
    }

    return successResponse({
        mode: 'compare',
        timeframe: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
        segmentA: { label: labelA, ...segmentA },
        segmentB: { label: labelB, ...segmentB },
    });
});
