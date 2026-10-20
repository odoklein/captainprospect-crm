import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { config } from "@/lib/config";
import { searchFromApollo } from "@/lib/listing/apollo-service";
import { ACTIVITIES, HEADCOUNT_LABEL } from "./catalog";
import { placeForMaps, placeName, parseLocation } from "./france";
import { cleanDomain } from "./merge";
import type { ActivityTerm, ProviderStatus, ProvidersStatus, SourcedContact, SourcedLead } from "./types";

// ============================================
// SOURCING — provider adapters (server only).
// Each returns SourcedLead[]; merging across sources happens client-side so
// results can stream in as each provider finishes.
// ============================================

const APIFY_TOKEN = () => process.env.APIFY_API_TOKEN;
const SERPER_KEY = () => process.env.SERPER_API_KEY;
const GMAPS_ACTOR = "compass~crawler-google-places";

/** Serper answers in seconds, so it wins over the Apify actor when both are set. */
export function gmapsEngine(): "serper" | "apify" | null {
    if (SERPER_KEY()) return "serper";
    if (APIFY_TOKEN()) return "apify";
    return null;
}

function gmapsStatus(): ProviderStatus {
    switch (gmapsEngine()) {
        case "serper":
            return { configured: true, engine: "serper", speed: "Quelques secondes", cost: "Crédits Serper" };
        case "apify":
            return { configured: true, engine: "apify" };
        default:
            return { configured: false, reason: "SERPER_API_KEY (ou APIFY_API_TOKEN) manquant" };
    }
}

export function providersStatus(): ProvidersStatus {
    const apolloOn = config.integrations.apollo.enabled && !!config.integrations.apollo.apiKey;
    return {
        gmaps: gmapsStatus(),
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
    const searchStringsArray = params.activities.flatMap((a) => params.locations.map((l) => `${a.label} ${placeForMaps(l).place}`));
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
// GOOGLE MAPS (Serper.dev /maps, sync, 20 places per page)
// ============================================

interface SerperPlace {
    title?: string;
    address?: string;
    rating?: number;
    ratingCount?: number;
    type?: string;
    types?: string[];
    category?: string;
    website?: string;
    phoneNumber?: string;
    cid?: string;
    placeId?: string;
    latitude?: number;
    longitude?: number;
}

const SERPER_PAGE_SIZE = 20;

/** "@lat,lng,zoomz" centred on page 1's places (median, so one outlier can't drag it). */
function viewportOf(places: SerperPlace[], zoom: number): string | undefined {
    const pts = places.filter((p) => typeof p.latitude === "number" && typeof p.longitude === "number");
    if (pts.length === 0) return undefined;
    const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const lat = median(pts.map((p) => p.latitude!));
    const lng = median(pts.map((p) => p.longitude!));
    return `@${lat.toFixed(6)},${lng.toFixed(6)},${zoom}z`;
}

/** One activity × location search, paged until perSearch places or Maps runs dry. */
export async function searchSerperMaps(params: {
    activity: ActivityTerm;
    location: string;
    perSearch: number;
}): Promise<SourcedLead[]> {
    const key = SERPER_KEY();
    if (!key) throw new Error("Google Maps n'est pas configuré (SERPER_API_KEY)");
    const { place, iso, zoom } = placeForMaps(params.location);
    const q = `${params.activity.label} ${place}`;
    const pages = Math.ceil(params.perSearch / SERPER_PAGE_SIZE);
    const seen = new Set<string>();
    const out: SourcedLead[] = [];
    // Serper only paginates maps searches with a GPS viewport ("ll"); page 1
    // geocodes the query itself, so later pages reuse the area it landed on.
    let ll: string | undefined;

    for (let page = 1; page <= pages; page++) {
        if (page > 1 && !ll) break;
        const res = await fetch("https://google.serper.dev/maps", {
            method: "POST",
            headers: { "X-API-KEY": key, "Content-Type": "application/json" },
            body: JSON.stringify({ q, gl: iso.toLowerCase(), hl: "fr", page, ...(page > 1 ? { ll } : {}) }),
            cache: "no-store",
        });
        if (!res.ok) {
            const message = `Serper ${res.status}: ${(await res.text()).slice(0, 200)}`;
            // A later page failing must not throw away what page 1 found.
            if (page === 1) throw new Error(message);
            console.warn(`[sourcing] ${q} page ${page}: ${message}`);
            break;
        }
        const json = (await res.json()) as { places?: SerperPlace[]; ll?: string; searchParameters?: { ll?: string } };
        const places = json.places ?? [];
        if (page === 1) ll = json.ll ?? json.searchParameters?.ll ?? viewportOf(places, zoom);
        for (const p of places) {
            if (!p.title) continue;
            const lead = normalizeSerper(p, iso);
            if (seen.has(lead.id)) continue;
            seen.add(lead.id);
            out.push(lead);
        }
        if (places.length < SERPER_PAGE_SIZE || out.length >= params.perSearch) break;
    }
    return out.slice(0, params.perSearch);
}

/** "12 Rue X, 69002 Lyon, France" → street / postcode / city. */
function splitAddress(address?: string): Pick<SourcedLead, "address" | "postalCode" | "city"> {
    if (!address) return {};
    const m = address.match(/^(.*?),?\s*(\d{5})\s+([^,]+)/);
    if (!m) return { address };
    return { address: m[1].trim() || undefined, postalCode: m[2], city: m[3].trim() };
}

function normalizeSerper(p: SerperPlace, iso: string): SourcedLead {
    const ref = p.placeId ?? p.cid ?? `${p.title}|${p.address ?? ""}`;
    const mapsUrl = p.placeId
        ? `https://www.google.com/maps/place/?q=place_id:${p.placeId}`
        : p.cid
          ? `https://maps.google.com/?cid=${p.cid}`
          : undefined;
    return {
        id: `gmaps:${ref}`,
        sources: ["gmaps"],
        name: p.title!.trim(),
        industry: p.type ?? p.types?.[0] ?? p.category,
        website: cleanDomain(p.website),
        phone: toE164(p.phoneNumber, iso),
        ...splitAddress(p.address),
        country: iso,
        rating: p.rating ?? undefined,
        reviews: p.ratingCount ?? undefined,
        mapsUrl,
        contacts: [],
    };
}

// ============================================
// ANNUAIRE DES ENTREPRISES (recherche-entreprises.api.gouv.fr, free, no key)
// ============================================

/** Empty filter = all of France (the activity filter alone narrows the search). */
type AreaFilter = { code_postal: string } | { departement: string } | Record<string, never>;

async function communePostcodes(name: string, deptCode?: string): Promise<AreaFilter | null> {
    const qs = new URLSearchParams({ nom: name.replace(/,.*$/, ""), fields: "codesPostaux", boost: "population", limit: "1" });
    if (deptCode) qs.set("codeDepartement", deptCode);
    const res = await fetch(`https://geo.api.gouv.fr/communes?${qs}`, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const [commune] = (await res.json()) as { codesPostaux?: string[] }[];
    return commune?.codesPostaux?.length ? { code_postal: commune.codesPostaux.join(",") } : null;
}

/**
 * Location chip → registry filter. "Lyon" → its 9 postcodes; "69" or
 * "Rhône (69)" → département; "Bretagne (région)" → its départements;
 * "France (pays)" → no area filter; another country → null.
 */
export async function resolveFrenchArea(text: string): Promise<AreaFilter | null> {
    const loc = parseLocation(text);
    switch (loc.kind) {
        case "departement":
            return { departement: loc.code };
        case "region":
            return { departement: loc.region.departements.map((x) => x.code).join(",") };
        case "pays":
            return loc.iso === "FR" ? {} : null;
        case "ville":
            return communePostcodes(loc.name, loc.deptCode);
    }
    const v = loc.name;
    if (/^\d{5}$/.test(v)) return { code_postal: v };
    if (/^(\d{2}|2[AB]|97\d)$/i.test(v)) return { departement: v.toUpperCase() };
    return communePostcodes(v);
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
        country: placeName(params.location),
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
