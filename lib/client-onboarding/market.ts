// Server-only: live market size and sample companies for the client's target
// profile, from the French company registry (recherche-entreprises.api.gouv.fr,
// free, no key — the same source as the sourcing screen). Real numbers only:
// when the registry cannot answer, the portal says so instead of guessing.

import { LRUCache } from "lru-cache";
import { REGIONS } from "@/lib/sourcing/france";
import { SECTOR_LABEL, SIZES } from "./questionnaire";

export interface MarketFilters {
    sectors: string[];
    sizes: string[];
    regions: string[];
}

export interface MarketSample {
    siren: string;
    name: string;
    city: string | null;
    headcount: string | null;
    sector: string | null;
}

export interface MarketResult {
    /** null when the registry did not answer. */
    total: number | null;
    /** The registry stops counting at 10 000. */
    capped: boolean;
    samples: MarketSample[];
}

const REGISTRY_URL = "https://recherche-entreprises.api.gouv.fr/search";
const REGISTRY_CAP = 10_000;
const SAMPLE_SIZE = 6;

const HEADCOUNT_TEXT: Record<string, string> = {
    "01": "1-2 salariés", "02": "3-5 salariés", "03": "6-9 salariés", "11": "10-19 salariés",
    "12": "20-49 salariés", "21": "50-99 salariés", "22": "100-199 salariés", "31": "200-249 salariés",
    "32": "250-499 salariés", "41": "500-999 salariés", "42": "1 000-1 999 salariés",
    "51": "2 000-4 999 salariés", "52": "5 000-9 999 salariés", "53": "10 000+ salariés",
};

const cache = new LRUCache<string, MarketResult>({ max: 500, ttl: 30 * 60_000 });

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase());

/** Canonical, de-duplicated filters (also the cache key). */
export function normalizeFilters(f: MarketFilters): MarketFilters {
    const known = new Set(REGIONS.map((r) => r.name));
    return {
        sectors: [...new Set(f.sectors.filter((s) => SECTOR_LABEL[s]))].sort(),
        sizes: [...new Set(f.sizes.filter((s) => SIZES.some((x) => x.key === s)))].sort(),
        regions: [...new Set(f.regions.filter((r) => known.has(r)))].sort(),
    };
}

export function registryQuery(f: MarketFilters): URLSearchParams {
    const qs = new URLSearchParams({
        per_page: String(SAMPLE_SIZE),
        page: "1",
        minimal: "true",
        include: "siege",
        etat_administratif: "A",
    });
    if (f.sectors.length) qs.set("section_activite_principale", f.sectors.join(","));
    const codes = SIZES.filter((s) => f.sizes.includes(s.key)).flatMap((s) => [...s.codes]);
    // No size picked = companies with employees (not the millions of one-person shells).
    qs.set("tranche_effectif_salarie", (codes.length ? codes : SIZES.flatMap((s) => [...s.codes])).join(","));
    const depts = REGIONS.filter((r) => f.regions.includes(r.name)).flatMap((r) => r.departements.map((d) => d.code));
    if (depts.length) qs.set("departement", depts.join(","));
    return qs;
}

interface RegistryItem {
    siren: string;
    nom_complet?: string | null;
    nom_raison_sociale?: string | null;
    section_activite_principale?: string | null;
    tranche_effectif_salarie?: string | null;
    siege?: { libelle_commune?: string | null; liste_enseignes?: string[] | null } | null;
}

const visible = (s?: string | null) => (s && !s.includes("NON-DIFFUSIBLE") ? s : undefined);

export function toSample(r: RegistryItem): MarketSample {
    const name = visible(r.siege?.liste_enseignes?.[0]) ?? visible(r.nom_raison_sociale) ?? visible(r.nom_complet) ?? `SIREN ${r.siren}`;
    return {
        siren: r.siren,
        name: titleCase(name),
        city: r.siege?.libelle_commune ? titleCase(r.siege.libelle_commune) : null,
        headcount: r.tranche_effectif_salarie ? HEADCOUNT_TEXT[r.tranche_effectif_salarie] ?? null : null,
        sector: r.section_activite_principale ? SECTOR_LABEL[r.section_activite_principale] ?? null : null,
    };
}

export async function marketSize(input: MarketFilters): Promise<MarketResult> {
    const f = normalizeFilters(input);
    const key = JSON.stringify(f);
    const hit = cache.get(key);
    if (hit) return hit;

    try {
        const res = await fetch(`${REGISTRY_URL}?${registryQuery(f)}`, {
            cache: "no-store",
            signal: AbortSignal.timeout(8_000),
            headers: { Accept: "application/json" },
        });
        if (!res.ok) return { total: null, capped: false, samples: [] };
        const json = (await res.json()) as { total_results?: number; results?: RegistryItem[] };
        const total = typeof json.total_results === "number" ? json.total_results : null;
        const result: MarketResult = {
            total,
            capped: total !== null && total >= REGISTRY_CAP,
            samples: (json.results ?? []).map(toSample),
        };
        cache.set(key, result);
        return result;
    } catch {
        return { total: null, capped: false, samples: [] };
    }
}
