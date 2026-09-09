import prisma from "@/lib/prisma";

// ============================================
// Shared CSV-import dedup logic.
// Used by both the real import route (app/api/lists/import/route.ts) and the
// pre-import simulation route (app/api/lists/import/simulate/route.ts) so the
// two can never drift out of sync on what counts as "a duplicate".
// ============================================

export type DuplicateStrategy = "smart_merge" | "skip" | "overwrite";
export type DuplicateScope = "list" | "mission";

export function normalizeCompanyName(value: string): string {
    return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizePersonName(value: string | null | undefined): string {
    return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeEmail(value: string | null | undefined): string | null {
    const normalized = (value ?? "").trim().toLowerCase();
    return normalized || null;
}

export function splitPhoneValues(value: string | null | undefined): string[] {
    return (value ?? "")
        .split(/[;,]/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
}

export type CompanyMatch = {
    id: string;
    listId: string;
    hasActions: boolean;
    /** true when this match lives in a different list than the import target (mission-scope match). */
    crossList: boolean;
    name: string;
    industry: string | null;
    country: string | null;
    website: string | null;
    size: string | null;
    phone: string | null;
    customData: unknown;
};

/**
 * Resolve, for a set of normalized company names, the best existing match to dedup against.
 * - Always checks the target list first (exact identity — one row, updated/skipped in place).
 * - When scope is "mission", also checks every other list in the same mission; if a name only
 *   matches there, it's a cross-list match (a new linked row gets created in the target list —
 *   see Company.linkedFromId in prisma/schema.prisma).
 * A same-list match always wins over a cross-list one for the same normalized name.
 */
export async function resolveCompanyMatches(params: {
    listId: string;
    missionId: string | null;
    scope: DuplicateScope;
    normalizedNames: string[];
}): Promise<Map<string, CompanyMatch>> {
    const { listId, missionId, scope, normalizedNames } = params;
    const wanted = new Set(normalizedNames);
    const result = new Map<string, CompanyMatch>();

    const select = {
        id: true,
        listId: true,
        name: true,
        industry: true,
        country: true,
        website: true,
        size: true,
        phone: true,
        customData: true,
        _count: { select: { actions: true } },
    } as const;

    const sameListCompanies = await prisma.company.findMany({
        where: { listId },
        select,
    });
    for (const c of sameListCompanies) {
        const key = normalizeCompanyName(c.name);
        if (!wanted.has(key)) continue;
        result.set(key, {
            id: c.id,
            listId: c.listId,
            hasActions: (c._count?.actions ?? 0) > 0,
            crossList: false,
            name: c.name,
            industry: c.industry,
            country: c.country,
            website: c.website,
            size: c.size,
            phone: c.phone,
            customData: c.customData,
        });
    }

    if (scope === "mission" && missionId) {
        const remaining = [...wanted].filter((n) => !result.has(n));
        if (remaining.length > 0) {
            const missionCompanies = await prisma.company.findMany({
                where: { list: { missionId }, listId: { not: listId } },
                select,
            });
            for (const c of missionCompanies) {
                const key = normalizeCompanyName(c.name);
                if (!wanted.has(key) || result.has(key)) continue;
                result.set(key, {
                    id: c.id,
                    listId: c.listId,
                    hasActions: (c._count?.actions ?? 0) > 0,
                    crossList: true,
                    name: c.name,
                    industry: c.industry,
                    country: c.country,
                    website: c.website,
                    size: c.size,
                    phone: c.phone,
                    customData: c.customData,
                });
            }
        }
    }

    return result;
}
