import { Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { prisma } from "@/lib/prisma";

// ============================================
// FIRST CALL OF A CLIENT
// The earliest CALL action logged on any of the client's missions. Shown on the
// client page (lib/client-insights.ts) and used as the anchor of the monthly
// billing schedule (lib/billing/schedule-service.ts).
// ============================================

/**
 * First call instant per client. `clientIds` omitted = every client with at
 * least one call; an empty list returns an empty map without querying.
 * Clients that were never called are absent from the map.
 */
export async function getFirstCallAtByClient(clientIds?: string[]): Promise<Map<string, Date>> {
    const ids = clientIds ? Array.from(new Set(clientIds.filter(Boolean))) : null;
    if (ids && ids.length === 0) return new Map();

    const clientFilter = ids ? Prisma.sql`AND m."clientId" IN (${Prisma.join(ids)})` : Prisma.empty;
    const rows = await prisma.$queryRaw<Array<{ clientId: string; firstCallAt: Date | null }>>(Prisma.sql`
        SELECT m."clientId" AS "clientId", MIN(a."createdAt") AS "firstCallAt"
        FROM "Action" a
        INNER JOIN "Campaign" c ON c."id" = a."campaignId"
        INNER JOIN "Mission" m ON m."id" = c."missionId"
        WHERE a."channel"::text = 'CALL'
          ${clientFilter}
        GROUP BY m."clientId"
    `);

    const result = new Map<string, Date>();
    for (const row of rows) {
        if (row.firstCallAt) result.set(row.clientId, row.firstCallAt);
    }
    return result;
}

/** Calendar day of an instant in Paris time, as "YYYY-MM-DD". */
export function parisDay(date: Date): string {
    return DateTime.fromJSDate(date).setZone("Europe/Paris").toFormat("yyyy-MM-dd");
}
