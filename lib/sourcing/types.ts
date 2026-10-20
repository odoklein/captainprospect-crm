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

export interface SourcingQuery {
    activities: ActivityTerm[];
    locations: string[];
    /** Max results per (activity × location) search. */
    perSearch: number;
    /** Registry only: active companies. Maps: hide permanently closed. */
    activeOnly: boolean;
    /** Registry / Apollo headcount band filter, INSEE codes ("11" = 10-19). */
    headcount?: string[];
}

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
