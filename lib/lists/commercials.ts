/**
 * "Base de données par commercial": a list can be shared by several commercials.
 * `commercialInterlocuteurId` is the primary one (first calendar the SDR sees),
 * `secondaryCommercialIds` the others. Returns them in display order, deduped.
 */
export function listCommercialIds(list: {
    commercialInterlocuteurId?: string | null;
    secondaryCommercialIds?: string[] | null;
} | null | undefined): string[] {
    if (!list) return [];
    const ids = [list.commercialInterlocuteurId, ...(list.secondaryCommercialIds ?? [])];
    return Array.from(new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0)));
}
