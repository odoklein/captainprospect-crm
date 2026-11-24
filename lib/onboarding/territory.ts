// ============================================
// TERRITORY — the client's target area as structured département codes.
//
// Pure (no database, no network): shared by the mission brief page (map,
// region chips, searchable list), the brief schema and the market counter.
// Régions and départements come from lib/sourcing/france (one list for the
// whole app). The selection is stored as codes in the brief JSON; the
// free-text `geography` the agency reads is derived from it (summarizeTerritory).
//
//   npx tsx --test lib/onboarding/territory.test.ts
// ============================================

import { DEPARTEMENTS, DEPT_NAME, REGIONS, type Region } from "@/lib/sourcing/france";

export const ALL_CODES: readonly string[] = DEPARTEMENTS.map((d) => d.code).sort();
export const METRO_CODES: readonly string[] = ALL_CODES.filter((code) => code.length === 2);
const KNOWN = new Set(ALL_CODES);

const REGION_OF: Record<string, string> = Object.fromEntries(
    REGIONS.flatMap((r) => r.departements.map((d) => [d.code, r.name] as const)),
);

/**
 * French postcode → département code, or undefined when it is not one.
 *   "69003" → "69", "1000" → "01" (Excel drops the leading zero), "75 008" → "75",
 *   "20090" → "2A", "20200" → "2B", "97411" → "974".
 * Not départements: 975xx (Saint-Pierre-et-Miquelon), 977/978, 98xxx (Monaco, Pacific), 00xxx.
 * Saint-Barthélemy (97133) and Saint-Martin (97150) share Guadeloupe's range and map to 971.
 */
export function departementFromPostcode(raw: string | number | null | undefined): string | undefined {
    if (raw === null || raw === undefined) return undefined;
    let code = String(raw).replace(/[\s .]/g, "");
    if (/^\d{4}$/.test(code)) code = `0${code}`;
    if (!/^\d{5}$/.test(code)) return undefined;
    if (code.startsWith("97")) {
        const dom = code.slice(0, 3);
        return KNOWN.has(dom) ? dom : undefined;
    }
    if (code.startsWith("20")) return Number(code) < 20200 ? "2A" : "2B";
    const metro = code.slice(0, 2);
    return KNOWN.has(metro) ? metro : undefined;
}

/** The first three digits are enough (the counter groups postcodes by them): "750" → "75", "202" → "2B". */
export function departementFromPrefix(prefix: string | null | undefined): string | undefined {
    return prefix && /^\d{3}$/.test(prefix) ? departementFromPostcode(`${prefix}00`) : undefined;
}

export function isDepartementCode(code: string): boolean {
    return KNOWN.has(code);
}

export function departementName(code: string): string {
    return DEPT_NAME[code] ?? code;
}

export function regionOf(code: string): string | undefined {
    return REGION_OF[code];
}

export function findRegion(name: string): Region | undefined {
    return REGIONS.find((r) => r.name === name);
}

export function departementsOf(regionName: string): string[] {
    return findRegion(regionName)?.departements.map((d) => d.code) ?? [];
}

/** Known codes only, de-duplicated, in a stable order (01 … 29, 2A, 2B, 30 … 95, 971 …). */
export function normalizeCodes(codes: readonly string[]): string[] {
    return [...new Set(codes.map((c) => String(c).trim().toUpperCase()).filter((c) => KNOWN.has(c)))].sort();
}

export type CoverState = "none" | "partial" | "full";

export function regionCover(selected: readonly string[], regionName: string): { state: CoverState; picked: number; total: number } {
    const codes = departementsOf(regionName);
    const set = new Set(selected);
    const picked = codes.filter((c) => set.has(c)).length;
    return { state: picked === 0 ? "none" : picked === codes.length ? "full" : "partial", picked, total: codes.length };
}

/** Region chip click: a fully selected region is cleared, otherwise it is completed. */
export function toggleRegion(selected: readonly string[], regionName: string): string[] {
    const codes = departementsOf(regionName);
    const set = new Set(selected);
    if (codes.every((c) => set.has(c))) codes.forEach((c) => set.delete(c));
    else codes.forEach((c) => set.add(c));
    return normalizeCodes([...set]);
}

export function toggleDepartement(selected: readonly string[], code: string): string[] {
    if (!KNOWN.has(code)) return normalizeCodes(selected);
    return selected.includes(code) ? selected.filter((c) => c !== code) : normalizeCodes([...selected, code]);
}

export interface Territory {
    /** « Toute la France »: every département, mainland and overseas. */
    all: boolean;
    codes: string[];
    /** Anything the map cannot say (Belgique, « hors centre-ville »…). */
    note: string;
}

export const EMPTY_TERRITORY: Territory = { all: false, codes: [], note: "" };

/** The codes a territory covers ([] = no constraint picked yet). */
export function coveredCodes(t: Pick<Territory, "all" | "codes">): string[] {
    return t.all ? [...ALL_CODES] : normalizeCodes(t.codes);
}

/**
 * Readable area for the agency, grouped by région:
 *   "France entière" · "France métropolitaine" · "Île-de-France (région entière), Rhône (69), Isère (38)".
 */
export function summarizeTerritory(t: Pick<Territory, "all" | "codes">): string {
    const codes = coveredCodes(t);
    if (!codes.length) return "";
    if (codes.length === ALL_CODES.length) return "France entière";
    const set = new Set(codes);
    const parts: string[] = [];
    const metroAll = METRO_CODES.every((c) => set.has(c));
    if (metroAll) parts.push("France métropolitaine");
    for (const region of REGIONS) {
        const inRegion = region.departements.filter((d) => set.has(d.code));
        if (!inRegion.length) continue;
        const overseas = region.departements[0].code.length === 3;
        if (metroAll && !overseas) continue;
        if (inRegion.length === region.departements.length && region.departements.length > 1) {
            parts.push(overseas ? "Outre-mer (tous les départements)" : `${region.name} (région entière)`);
        } else {
            parts.push(...inRegion.map((d) => `${d.name} (${d.code})`));
        }
    }
    return parts.join(", ");
}

/** The brief's free-text geography: the map's summary, then the client's own words. */
export function composeGeography(t: Territory, max = 2000): string {
    const text = [summarizeTerritory(t), t.note.trim()].filter(Boolean).join(" — ");
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export interface PlaceOption {
    kind: "region" | "departement";
    /** Département code, or the région name. */
    id: string;
    label: string;
    hint: string;
}

const PLACE_OPTIONS: PlaceOption[] = [
    ...REGIONS.map((r) => ({ kind: "region" as const, id: r.name, label: r.name, hint: `${r.departements.length} départements` })),
    ...DEPARTEMENTS.map((d) => ({ kind: "departement" as const, id: d.code, label: d.name, hint: `${d.code} · ${REGION_OF[d.code]}` })),
];
const PLACE_KEYS = PLACE_OPTIONS.map((o) => `${fold(o.label)} ${o.kind === "departement" ? fold(o.id) : ""}`);

/**
 * Searchable list of départements and régions, accent- and case-insensitive:
 * "rhone" → Rhône, "69" → Rhône, "cote" → Côte-d'Or, Côtes-d'Armor, Provence-Alpes-Côte d'Azur.
 * A code typed exactly comes first, then names that start with the query.
 */
export function searchPlaces(query: string, limit = 12): PlaceOption[] {
    const q = fold(query);
    if (!q) return PLACE_OPTIONS.filter((o) => o.kind === "region").slice(0, limit);
    const scored: { option: PlaceOption; score: number }[] = [];
    PLACE_OPTIONS.forEach((option, i) => {
        const key = PLACE_KEYS[i];
        const words = key.split(" ");
        let score = -1;
        if (option.kind === "departement" && fold(option.id) === q) score = 0;
        else if (key.startsWith(q)) score = 1;
        else if (words.some((w) => w.startsWith(q))) score = 2;
        else if (key.includes(q)) score = 3;
        if (score >= 0) scored.push({ option, score });
    });
    return scored.sort((a, b) => a.score - b.score).slice(0, limit).map((s) => s.option);
}
