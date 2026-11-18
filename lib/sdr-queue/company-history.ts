import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

interface HistoryDb {
    $queryRaw<T>(sql: Prisma.Sql): Promise<T>;
}

/**
 * Whether ANY action exists for a company, its contacts, or its imported copies.
 * The drawer's includeTwins history already groups equal normalized names within
 * a mission and explicit linkedFromId copies. A last-action badge on one physical
 * company row cannot establish that the whole company has never been worked.
 *
 * Resolve the identities once for the batch, then probe Action's company/contact
 * indexes. No per-row queries, date/status/SDR restrictions, or fail-open fallback.
 */
export function companyHistorySql(companyIds: string[]) {
    return Prisma.sql`
        WITH targets AS MATERIALIZED (
            SELECT c.id, c."linkedFromId", l."missionId",
                   lower(btrim(regexp_replace(c.name, '[[:space:]]+', ' ', 'g'))) AS name_key
            FROM "Company" c
            JOIN "List" l ON l.id = c."listId"
            WHERE c.id = ANY(${companyIds}::text[])
        ), mission_companies AS MATERIALIZED (
            SELECT c.id, l."missionId",
                   lower(btrim(regexp_replace(c.name, '[[:space:]]+', ' ', 'g'))) AS name_key
            FROM "Company" c
            JOIN "List" l ON l.id = c."listId"
            WHERE l."missionId" IN (SELECT "missionId" FROM targets)
        ), identities AS MATERIALIZED (
            SELECT t.id AS target_id, t.id AS member_id FROM targets t
            UNION
            SELECT t.id, c.id FROM targets t
            JOIN mission_companies c ON c."missionId" = t."missionId" AND c.name_key = t.name_key
            WHERE t.name_key <> ''
            UNION
            SELECT t.id, c.id FROM targets t JOIN "Company" c ON c.id = t."linkedFromId"
            UNION
            SELECT t.id, c.id FROM targets t JOIN "Company" c ON c."linkedFromId" = t.id
            UNION
            SELECT t.id, c.id FROM targets t JOIN "Company" c ON c."linkedFromId" = t."linkedFromId"
            WHERE t."linkedFromId" IS NOT NULL
        ), members AS (
            SELECT DISTINCT member_id FROM identities
        ), worked AS (
            SELECT m.member_id FROM members m
            WHERE EXISTS (SELECT 1 FROM "Action" a WHERE a."companyId" = m.member_id)
               OR EXISTS (
                   SELECT 1 FROM "Contact" c JOIN "Action" a ON a."contactId" = c.id
                   WHERE c."companyId" = m.member_id
               )
        )
        SELECT DISTINCT i.target_id AS id
        FROM identities i JOIN worked w ON w.member_id = i.member_id
    `;
}

export async function findWorkedCompanyIds(companyIds: string[], db: HistoryDb = prisma): Promise<Set<string>> {
    const ids = [...new Set(companyIds)];
    if (!ids.length) return new Set();
    const rows = await db.$queryRaw<Array<{ id: string }>>(companyHistorySql(ids));
    return new Set(rows.map((row) => row.id));
}
