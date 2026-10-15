import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { config } from "@/lib/config";
import { searchFromApollo } from "@/lib/listing/apollo-service";
import { ACTIVITIES, HEADCOUNT_LABEL } from "./catalog";
import { cleanDomain } from "./merge";
import type { ActivityTerm, ProvidersStatus, SourcedContact, SourcedLead } from "./types";

// ============================================
// SOURCING — provider adapters (server only).
// Each returns SourcedLead[]; merging across sources happens client-side so
// results can stream in as each provider finishes.
// ============================================

const APIFY_TOKEN = () => process.env.APIFY_API_TOKEN;
const GMAPS_ACTOR = "compass~crawler-google-places";

export function providersStatus(): ProvidersStatus {
    const apolloOn = config.integrations.apollo.enabled && !!config.integrations.apollo.apiKey;
    return {
        gmaps: APIFY_TOKEN() ? { configured: true } : { configured: false, reason: "APIFY_API_TOKEN manquant" },
        annuaire: { configured: true },
        apollo: apolloOn ? { configured: true } : { configured: false, reason: "Apollo désactivé ou clé API manquante" },
    };
}

function toE164(raw: string | null | undefined, country?: string): string | undefined {
    if (!raw) return undefined;
    const cc = (country && /^[a-z]{2}$/i.test(country) ? country.toUpperCase() : "FR") as CountryCode;
    try {
        const parsed = parsePhoneNumberFromString(raw, cc);
        if (parsed?.isValid()) return parsed.number;
    } catch {
        // Unknown country or garbage: keep what the provider gave us.
    }
    return raw.trim() || undefined;
}

// ============================================
// GOOGLE MAPS (Apify actor, async run)
// ============================================

interface GmapsItem {
    title?: string;
    placeId?: string;
    categoryName?: string;
    address?: string;
    street?: string;
    city?: string;
    postalCode?: string;
    countryCode?: string;
    website?: string;
    phone?: string;
    phoneUnformatted?: string;
    totalScore?: number;
    reviewsCount?: number;
    url?: string;
    permanentlyClosed?: boolean;
    temporarilyClosed?: boolean;
}

async function apify<T>(path: string, init?: RequestInit): Promise<T> {
    const token = APIFY_TOKEN();
    if (!token) throw new Error("Google Maps n'est pas configuré (APIFY_API_TOKEN)");
    const sep = path.includes("?") ? "&" : "?";
    const res = await fetch(`https://api.apify.com/v2${path}${sep}token=${token}`, {
        ...init,
        headers: { "Content-Type": "application/json", ...init?.headers },
        cache: "no-store",
    });
    if (!res.ok) throw new Error(`Apify ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json() as Promise<T>;
}

/** One actor run covering every activity × location pair. */
export async function startGmapsRun(params: {
    activities: ActivityTerm[];
    locations: string[];
    perSearch: number;
    activeOnly: boolean;
}): Promise<{ runId: string; searches: number }> {
    const searchStringsArray = params.activities.flatMap((a) => params.locations.map((l) => `${a.label} ${l}`));
    const { data } = await apify<{ data: { id: string } }>(`/acts/${GMAPS_ACTOR}/runs`, {
        method: "POST",
        body: JSON.stringify({
            searchStringsArray,
            maxCrawledPlacesPerSearch: params.perSearch,
            language: "fr",
            skipClosedPlaces: params.activeOnly,
            maxImages: 0,
            maxReviews: 0,
            scrapeContacts: false,
        }),
    });
    return { runId: data.id, searches: searchStringsArray.length };
}

export type GmapsRunState = {
    status: "RUNNING" | "SUCCEEDED" | "FAILED";
    found: number;
    startedAt?: string;
    leads?: SourcedLead[];
    error?: string;
};

export async function getGmapsRun(runId: string): Promise<GmapsRunState> {
    const { data: run } = await apify<{
        data: { status: string; startedAt?: string; defaultDatasetId: string };
    }>(`/actor-runs/${encodeURIComponent(runId)}`);

    if (["FAILED", "ABORTED", "TIMED-OUT"].includes(run.status)) {
        return { status: "FAILED", found: 0, startedAt: run.startedAt, error: `Run ${run.status.toLowerCase()}` };
    }

    if (run.status !== "SUCCEEDED") {
        const { data: ds } = await apify<{ data: { itemCount?: number } }>(`/datasets/${run.defaultDatasetId}`).catch(
            () => ({ data: { itemCount: 0 } }),
        );
        return { status: "RUNNING", found: ds.itemCount ?? 0, startedAt: run.startedAt };
    }

    const items = await apify<GmapsItem[]>(`/datasets/${run.defaultDatasetId}/items?clean=true&format=json`);
    const leads = items.filter((i) => i.title).map(normalizeGmaps);
    return { status: "SUCCEEDED", found: leads.length, startedAt: run.startedAt, leads };
}

function normalizeGmaps(i: GmapsItem): SourcedLead {
    const country = i.countryCode?.toUpperCase();
    return {
        id: `gmaps:${i.placeId ?? i.title}`,
        sources: ["gmaps"],
        name: i.title!.trim(),
        industry: i.categoryName,
        website: cleanDomain(i.website),
        phone: toE164(i.phoneUnformatted ?? i.phone, country),
        address: i.street ?? i.address,
        postalCode: i.postalCode,
        city: i.city,
        country,
        rating: i.totalScore ?? undefined,
        reviews: i.reviewsCount ?? undefined,
        mapsUrl: i.url,
        closed: i.permanentlyClosed || undefined,
        contacts: [],
    };
}

// ============================================
// ANNUAIRE DES ENTREPRISES (recherche-entreprises.api.gouv.fr, free, no key)
// ============================================

type AreaFilter = { code_postal: string } | { departement: string };

/** "Lyon" → its 9 postcodes; "69" → département; "69003" → that postcode. */
export async function resolveFrenchArea(text: string): Promise<AreaFilter | null> {
    const v = text.trim();
    if (/^\d{5}$/.test(v)) return { code_postal: v };
    if (/^(\d{2}|2[AB]|97\d)$/i.test(v)) return { departement: v.toUpperCase() };
    const res = await fetch(
        `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(v.replace(/,.*$/, ""))}&fields=codesPostaux&boost=population&limit=1`,
        { next: { revalidate: 86400 } },
    );
    if (!res.ok) return null;
    const [commune] = (await res.json()) as { codesPostaux?: string[] }[];
    return commune?.codesPostaux?.length ? { code_postal: commune.codesPostaux.join(",") } : null;
}

interface RegistryEtab {
    adresse?: string | null;
    code_postal?: string | null;
    libelle_commune?: string | null;
    liste_enseignes?: string[] | null;
    nom_commercial?: string | null;
    etat_administratif?: string | null;
}
interface RegistryItem {
    siren: string;
    nom_complet?: string | null;
    nom_raison_sociale?: string | null;
    activite_principale?: string | null;
    tranche_effectif_salarie?: string | null;
    etat_administratif?: string | null;
    siege?: RegistryEtab | null;
    matching_etablissements?: RegistryEtab[] | null;
    dirigeants?: { type_dirigeant?: string; nom?: string | null; prenoms?: string | null; qualite?: string | null }[] | null;
}

const visible = (s?: string | null) => (s && !s.includes("NON-DIFFUSIBLE") ? s : undefined);
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase());
const NAF_LABEL = Object.fromEntries(ACTIVITIES.map((a) => [a.naf, a.nafLabel]));

export async function searchAnnuaire(params: {
    activity: ActivityTerm;
    area: AreaFilter;
    perSearch: number;
    activeOnly: boolean;
    headcount?: string[];
}): Promise<SourcedLead[]> {
    const perPage = 25;
    const pages = Math.min(Math.ceil(params.perSearch / perPage), 8);
    const out: SourcedLead[] = [];

    for (let page = 1; page <= pages; page++) {
        const qs = new URLSearchParams({
            per_page: String(perPage),
            page: String(page),
            minimal: "true",
            include: "siege,dirigeants,matching_etablissements",
            ...params.area,
        });
        if (params.activity.naf) qs.set("activite_principale", params.activity.naf);
        else qs.set("q", params.activity.label);
        if (params.activeOnly) qs.set("etat_administratif", "A");
        if (params.headcount?.length) qs.set("tranche_effectif_salarie", params.headcount.join(","));

        const res = await fetch(`https://recherche-entreprises.api.gouv.fr/search?${qs}`, { cache: "no-store" });
        if (res.status === 429) {
            await new Promise((r) => setTimeout(r, 1200));
            page--;
            continue;
        }
        if (!res.ok) throw new Error(`Annuaire ${res.status}`);
        const json = (await res.json()) as { results: RegistryItem[]; total_pages: number };
        out.push(...json.results.map(normalizeRegistry));
        if (page >= json.total_pages || out.length >= params.perSearch) break;
    }
    return out.slice(0, params.perSearch);
}

function normalizeRegistry(r: RegistryItem): SourcedLead {
    // The establishment inside the searched area beats the head office (often Paris).
    const etab = r.matching_etablissements?.[0] ?? r.siege ?? {};
    const tradeName = visible(etab.liste_enseignes?.[0]) ?? visible(etab.nom_commercial);
    const legalName = visible(r.nom_raison_sociale) ?? visible(r.nom_complet) ?? `SIREN ${r.siren}`;
    const naf = r.activite_principale ?? undefined;
    const contacts: SourcedContact[] = (r.dirigeants ?? [])
        .filter((d) => d.type_dirigeant === "personne physique" && visible(d.nom) && !/commissaire/i.test(d.qualite ?? ""))
        .slice(0, 3)
        .map((d) => ({
            firstName: visible(d.prenoms) ? titleCase(d.prenoms!.split(/\s+/)[0]) : undefined,
            // "JARJAILLE FRAGOLA (JARJAILLE)": the parenthesis is a usage name.
            lastName: titleCase(d.nom!.replace(/\s*\(.*\)\s*$/, "")),
            title: d.qualite ?? undefined,
        }));

    return {
        id: `annuaire:${r.siren}`,
        sources: ["annuaire"],
        name: titleCase(tradeName ?? legalName),
        industry: (naf && NAF_LABEL[naf]) || undefined,
        naf,
        address: visible(etab.adresse) ? titleCase(etab.adresse!.replace(/\s\d{5}\s.*$/, "")) : undefined,
        postalCode: etab.code_postal ?? undefined,
        city: etab.libelle_commune ? titleCase(etab.libelle_commune) : undefined,
        country: "FR",
        siren: r.siren,
        headcount: r.tranche_effectif_salarie ? HEADCOUNT_LABEL[r.tranche_effectif_salarie] : undefined,
        closed: r.etat_administratif === "C" || undefined,
        contacts,
    };
}

// ============================================
// APOLLO (organization search, sync)
// ============================================

export async function searchApollo(params: { activity: ActivityTerm; location: string; perSearch: number }): Promise<SourcedLead[]> {
    const { results } = await searchFromApollo({
        keywords: params.activity.label,
        country: params.location,
        limit: Math.min(params.perSearch, 100),
    });
    return results
        .filter((r) => r.company?.name)
        .map((r, i) => {
            const c = r.company!;
            const p = r.person;
            const contact: SourcedContact | null =
                p && (p.firstName || p.lastName)
                    ? { firstName: p.firstName, lastName: p.lastName, title: p.title, email: p.email, phone: toE164(p.phone), linkedin: p.linkedin }
                    : null;
            return {
                id: `apollo:${r.metadata?.apolloId ?? `${c.name}-${i}`}`,
                sources: ["apollo"],
                name: c.name!,
                industry: c.industry,
                website: cleanDomain(c.domain),
                phone: toE164(c.phone, c.country),
                city: c.city,
                country: c.country,
                headcount: c.size,
                linkedin: c.linkedin,
                contacts: contact ? [contact] : [],
            } satisfies SourcedLead;
        });
}
