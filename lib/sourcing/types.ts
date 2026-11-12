// ============================================
// SOURCING — shared types (client + server).
//
// Every provider is normalized to SourcedLead, so the workspace can merge the
// same company found by several sources into a single row before import.
// ============================================

export type SourceId = "gmaps" | "annuaire" | "apollo";

export interface SourcedContact {
    firstName?: string;
    lastName?: string;
    title?: string;
    email?: string;
    phone?: string;
    linkedin?: string;
}

export interface SourcedLead {
    /** Stable id inside one workspace session (first source's ref). */
    id: string;
    sources: SourceId[];
    name: string;
    industry?: string;
    /** NAF/APE code from the registry, e.g. "43.22A". */
    naf?: string;
    /** Bare domain, no protocol or trailing slash. */
    website?: string;
    /** E.164 when parseable, raw otherwise. */
    phone?: string;
    address?: string;
    postalCode?: string;
    city?: string;
    /** ISO-2. */
    country?: string;
    siren?: string;
    /** Headcount band label ("10-19"). */
    headcount?: string;
    rating?: number;
    reviews?: number;
    mapsUrl?: string;
    linkedin?: string;
    /** Google Maps marks the place permanently closed / registry says ceased. */
    closed?: boolean;
    contacts: SourcedContact[];
}

/** One activity chip in the query composer. */
export interface ActivityTerm {
    label: string;
    /** When set, the registry searches by NAF code instead of name text. */
    naf?: string;
}

/**
 * How hard Google Maps digs into each zone.
 * - standard: one text search per zone ("plombier Lyon 69"), as Google ranks it.
 * - deep: the zone is cut into map tiles (communes for a département), and a
 *   tile that comes back full is split once more.
 * - max: smaller tiles, more communes, splits until tiles stop saturating.
 * The registry reads it as a page budget (it is free).
 */
export type SourcingDepth = "standard" | "deep" | "max";

export interface SourcingQuery {
    activities: ActivityTerm[];
    locations: string[];
    /** Max results per (activity × location) search. */
    perSearch: number;
    /** Registry only: active companies. Maps: hide permanently closed. */
    activeOnly: boolean;
    /** Registry / Apollo headcount band filter, INSEE codes ("11" = 10-19). */
    headcount?: string[];
    depth?: SourcingDepth;
    /** Deep Maps runs stop once this many Serper credits are spent. */
    creditBudget?: number;
}

/** What a deep run will do, before anything is spent. */
export interface ZonePlan {
    zone: string;
    /** Sub-areas the zone was cut into (communes, départements). */
    seeds: number;
    /** Map tiles searched at least once (before saturation splits). */
    tiles: number;
    note?: string;
}

export interface SourcingPlan {
    depth: SourcingDepth;
    zones: ZonePlan[];
    /** Maps calls before any split: tiles × activities. */
    searches: number;
    /** Credit range: one page per tile … every page plus splits, capped by the budget. */
    minCredits: number;
    maxCredits: number;
    budget?: number;
}

/** Per-zone yield after a run: where Maps ran dry and where it is still full. */
export interface ZoneCoverage {
    zone: string;
    searches: number;
    found: number;
    /** Tiles that were still full at the deepest level allowed. */
    saturated: number;
    /** Tiles split because they came back full. */
    splits: number;
    /** Searches dropped because the credit budget ran out. */
    skipped: number;
}

/** NDJSON lines streamed by POST /api/prospects/sourcing/gmaps (Serper engine). */
export type GmapsEvent =
    | { t: "plan"; plan: SourcingPlan }
    | { t: "leads"; leads: SourcedLead[] }
    | { t: "progress"; done: number; total: number; calls: number; found: number; outside: number }
    | { t: "warning"; message: string }
    | { t: "done"; calls: number; credits: number; coverage: ZoneCoverage[]; outside: number; budgetHit: boolean }
    | { t: "error"; message: string };

export type ProviderStatus = {
    configured: boolean;
    reason?: string;
    /** Google Maps backend actually used by this deployment. */
    engine?: "serper" | "apify";
    /** Override the catalog's speed / cost line for this engine. */
    speed?: string;
    cost?: string;
};
export type ProvidersStatus = Record<SourceId, ProviderStatus>;

/** CRM duplicate found for a sourced lead. */
export interface CrmMatch {
    companyId: string;
    companyName: string;
    listId: string;
    listName: string;
    /** What matched: phone, domain or name. */
    by: "phone" | "domain" | "name";
}

export interface SourcingImportResult {
    listId: string;
    listName: string;
    created: number;
    skipped: number;
    contacts: number;
    phones: number;
}
