import { Prisma } from "@prisma/client";

// SQL pieces of the pending-callback rule (lib/callbacks/pending.ts), kept free of
// the Prisma client instance so they run on PGlite in tests.
// Aliases expected: "Action" a, "Campaign" c, "User" u.

// "b is newer than a": createdAt, then id (CSV imports stamp a batch with one createdAt).
const NEWER = Prisma.sql`(b."createdAt" > a."createdAt" OR (b."createdAt" = a."createdAt" AND b.id > a.id))`;

// One subquery per way an action can supersede `a`, each an equality join the
// existing indexes serve: Action(contactId), Action(companyId),
// Company(linkedFromId) and the primary keys. This used to be one EXISTS whose
// OR mixed the contact and the company set (built by a sub-select): Postgres
// ran it as a scan of the whole mission for every callback (60 s+ at ~87k
// actions).
function supersedingActions(): Prisma.Sql[] {
    return [
        // Contact callback: a newer action on the same contact.
        Prisma.sql`SELECT 1 FROM "Action" b
            JOIN "Campaign" cb ON cb.id = b."campaignId"
            WHERE b."contactId" = a."contactId"
              AND cb."missionId" = c."missionId"
              AND ${NEWER}`,
        // Company-only callback: a newer action on the same company...
        Prisma.sql`SELECT 1 FROM "Company" co
            JOIN "Action" b ON b."companyId" = co.id
            JOIN "Campaign" cb ON cb.id = b."campaignId"
            WHERE a."contactId" IS NULL
              AND co.id = a."companyId"
              AND cb."missionId" = c."missionId"
              AND ${NEWER}`,
        // ...on one of its imported copies...
        Prisma.sql`SELECT 1 FROM "Company" co
            JOIN "Action" b ON b."companyId" = co.id
            JOIN "Campaign" cb ON cb.id = b."campaignId"
            WHERE a."contactId" IS NULL
              AND co."linkedFromId" = a."companyId"
              AND cb."missionId" = c."missionId"
              AND ${NEWER}`,
        // ...or on the company it was imported from.
        Prisma.sql`SELECT 1 FROM "Company" ac
            JOIN "Company" co ON co.id = ac."linkedFromId"
            JOIN "Action" b ON b."companyId" = co.id
            JOIN "Campaign" cb ON cb.id = b."campaignId"
            WHERE a."contactId" IS NULL
              AND ac.id = a."companyId"
              AND cb."missionId" = c."missionId"
              AND ${NEWER}`,
    ];
}

/**
 * SQL: the action aliased `a` (campaign aliased `c`) has been superseded.
 * Used negated in the live query: Postgres keeps each EXISTS as a per-row
 * index probe, stopping at the first match.
 */
export function supersededSql(): Prisma.Sql {
    return Prisma.sql`(${Prisma.join(supersedingActions().map((q) => Prisma.sql`EXISTS (${q})`), " OR ")})`;
}

/** SQL: the callback's author no longer works its mission. */
export function orphanSql(): Prisma.Sql {
    return Prisma.sql`(
        u."isActive" = false
        OR (u."role"::text <> 'BOOKER' AND NOT EXISTS (
            SELECT 1 FROM "SDRAssignment" s WHERE s."sdrId" = a."sdrId" AND s."missionId" = c."missionId"))
    )`;
}

export interface CallbackScope {
    /** Restrict to these missions; null/undefined = every mission. */
    missionIds?: string[] | null;
    /** Authors whose callbacks are included; null/undefined = any author. */
    sdrIds?: string[] | null;
    /** With sdrIds: only count authors still assigned to the mission. */
    requireAuthorAssigned?: boolean;
    /** Also include orphaned callbacks (any author) on these missions. */
    orphanMissionIds?: string[];
    listId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    /** Only callbacks with a date strictly before this instant. */
    dueBefore?: Date;
}

export interface LiveCallbackRow {
    id: string;
    sdrId: string;
    sdrName: string | null;
    result: string;
    missionId: string;
    callbackDate: Date | null;
    createdAt: Date;
    orphan: boolean;
}

/** The full live-callbacks query for a scope (callers handle the empty-scope shortcuts). */
export function buildLiveCallbacksQuery(scope: CallbackScope, codes: string[]): Prisma.Sql {
    const parts: Prisma.Sql[] = [Prisma.sql`a."result"::text IN (${Prisma.join(codes)})`];

    if (scope.missionIds) parts.push(Prisma.sql`c."missionId" IN (${Prisma.join(scope.missionIds)})`);

    if (scope.sdrIds) {
        const authorParts: Prisma.Sql[] = [];
        if (scope.sdrIds.length > 0) {
            authorParts.push(
                scope.requireAuthorAssigned
                    ? Prisma.sql`(a."sdrId" IN (${Prisma.join(scope.sdrIds)}) AND NOT ${orphanSql()})`
                    : Prisma.sql`a."sdrId" IN (${Prisma.join(scope.sdrIds)})`,
            );
        }
        if (scope.orphanMissionIds && scope.orphanMissionIds.length > 0) {
            authorParts.push(
                Prisma.sql`(c."missionId" IN (${Prisma.join(scope.orphanMissionIds)}) AND ${orphanSql()})`,
            );
        }
        parts.push(Prisma.sql`(${Prisma.join(authorParts, " OR ")})`);
    }

    if (scope.listId) {
        parts.push(Prisma.sql`(
            EXISTS (SELECT 1 FROM "Company" lc WHERE lc.id = a."companyId" AND lc."listId" = ${scope.listId})
            OR EXISTS (SELECT 1 FROM "Contact" lct JOIN "Company" lcc ON lcc.id = lct."companyId"
                       WHERE lct.id = a."contactId" AND lcc."listId" = ${scope.listId})
        )`);
    }
    if (scope.dateFrom) parts.push(Prisma.sql`a."callbackDate" >= ${scope.dateFrom}`);
    if (scope.dateTo) parts.push(Prisma.sql`a."callbackDate" <= ${scope.dateTo}`);
    if (scope.dueBefore) parts.push(Prisma.sql`a."callbackDate" IS NOT NULL AND a."callbackDate" < ${scope.dueBefore}`);

    parts.push(Prisma.sql`NOT ${supersededSql()}`);

    return Prisma.sql`
        SELECT a.id, a."sdrId" AS "sdrId", u.name AS "sdrName", a.result::text AS result,
               c."missionId" AS "missionId", a."callbackDate" AS "callbackDate",
               a."createdAt" AS "createdAt", ${orphanSql()} AS orphan
        FROM "Action" a
        JOIN "Campaign" c ON c.id = a."campaignId"
        JOIN "User" u ON u.id = a."sdrId"
        WHERE ${Prisma.join(parts, " AND ")}
        ORDER BY a."callbackDate" ASC NULLS LAST, a."createdAt" DESC, a.id ASC
    `;
}
