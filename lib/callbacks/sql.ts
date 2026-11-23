import { Prisma } from "@prisma/client";

// SQL pieces of the pending-callback rule (lib/callbacks/pending.ts), kept free of
// the Prisma client instance so they run on PGlite in tests.
// Aliases expected: "Action" a, "Campaign" c, "User" u.

/** SQL: the action aliased `a` (campaign aliased `c`) has been superseded. */
export function supersededSql(): Prisma.Sql {
    return Prisma.sql`EXISTS (
        SELECT 1 FROM "Action" b
        JOIN "Campaign" cb ON cb.id = b."campaignId"
        WHERE cb."missionId" = c."missionId"
          AND b.id <> a.id
          AND (b."createdAt" > a."createdAt" OR (b."createdAt" = a."createdAt" AND b.id > a.id))
          AND (
            (a."contactId" IS NOT NULL AND b."contactId" = a."contactId")
            OR (
              a."contactId" IS NULL AND a."companyId" IS NOT NULL AND b."companyId" IN (
                SELECT co.id FROM "Company" co
                WHERE co.id = a."companyId"
                   OR co."linkedFromId" = a."companyId"
                   OR co.id = (SELECT "linkedFromId" FROM "Company" WHERE id = a."companyId")
              )
            )
          )
    )`;
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
