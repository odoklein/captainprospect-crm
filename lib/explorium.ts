import { prisma } from "@/lib/prisma";
import { integrationKey } from "@/lib/integrations/keys";

// ============================================
// EXPLORIUM TYPES
// ============================================

export interface ExploriumCompany {
    id: string; // Explorium Business ID
    name: string;
    website?: string;
    industry?: string;
    size?: string;
    revenue?: string;
    headquarters?: string;
    linkedin?: string;
}

export interface ExploriumSearchFilters {
    industry?: string;
    revenueRange?: string;
    headcountRange?: string;
    country?: string;
    linkedinCategory?: string;
    naicsCategory?: string;
    googleCategory?: string;
    region?: string;
    city?: string;
    companyAge?: string;
    numberOfLocations?: string;
    techStackCategory?: string;
    techStackTech?: string;
    websiteKeywords?: string;
}

export interface ExploriumSearchResult {
    totalMatches: number;
    sample: ExploriumCompany[];
    isMock?: boolean;
    error?: string;
}

export interface ExploriumStatsResult {
    totalCount: number;
    isMock?: boolean;
    error?: string;
}

const API_BASE_URL = "https://api.explorium.ai/v1";

// ============================================
// HELPER: Map our filters to Explorium format
// ============================================

function buildExploriumFilters(filters: ExploriumSearchFilters): Record<string, { values: string[] }> {
    const exploriumFilters: Record<string, { values: string[] }> = {};

    // Geographic filters - only ONE can be used at a time (city > region > country)
    // Priority: city_region_country > region_country_code > country_code
    
    if (filters.city && filters.country) {
        // City takes highest priority - format: "City, Country"
        exploriumFilters.city_region_country = { values: [`${filters.city}, ${filters.country}`] };
    } else if (filters.region && filters.country) {
        // Region takes second priority - format: "us-ca" for California, USA
        const countryCode = mapCountryToCode(filters.country);
        if (countryCode) {
            exploriumFilters.region_country_code = { values: [`${countryCode}-${filters.region.toLowerCase()}`] };
        }
    } else if (filters.country) {
        // Country is fallback - only use if no city or region specified
        const countryCode = mapCountryToCode(filters.country);
        if (countryCode) {
            exploriumFilters.country_code = { values: [countryCode] };
        }
    }

    // Company size (use Explorium's exact format)
    if (filters.headcountRange) {
        // Map UI values to Explorium format - use as-is since we're using Explorium's format directly
        const sizeMapping: Record<string, string> = {
            "1-10": "1-10",
            "11-50": "11-50",
            "51-200": "51-200",
            "201-500": "201-500",
            "501-1000": "501-1000",
            "1001-5000": "1001-5000",
            "5001-10000": "5001-10000",
            "10001+": "10001+",
        };
        const mappedSize = sizeMapping[filters.headcountRange] || filters.headcountRange;
        exploriumFilters.company_size = { values: [mappedSize] };
    }

    // Revenue range (use Explorium's exact format)
    if (filters.revenueRange) {
        // Map UI values to Explorium format if needed, otherwise use as-is
        const revenueMapping: Record<string, string> = {
            "0-500K": "0-500K",
            "500K-1M": "500K-1M",
            "1M-10M": "1M-10M",
            "10M-25M": "10M-25M",
            "25M-50M": "25M-50M",
            "50M-100M": "50M-100M",
            "100M-200M": "100M-200M",
            "200M-500M": "200M-500M",
            "500M-1B": "500M-1B",
            "1B-10B": "1B-10B",
            "10B-100B": "10B-100B",
        };
        const mappedRevenue = revenueMapping[filters.revenueRange] || filters.revenueRange;
        exploriumFilters.company_revenue = { values: [mappedRevenue] };
    }

    // Company age
    if (filters.companyAge) {
        exploriumFilters.company_age = { values: [filters.companyAge] };
    }

    // Number of locations
    if (filters.numberOfLocations) {
        exploriumFilters.number_of_locations = { values: [filters.numberOfLocations] };
    }

    // Tech stack category
    if (filters.techStackCategory) {
        exploriumFilters.company_tech_stack_category = { values: [filters.techStackCategory] };
    }

    // Tech stack specific technology
    if (filters.techStackTech) {
        exploriumFilters.company_tech_stack_tech = { values: [filters.techStackTech] };
    }

    // Website keywords (split by comma if multiple)
    if (filters.websiteKeywords) {
        const keywords = filters.websiteKeywords.split(',').map(k => k.trim()).filter(k => k.length > 0);
        if (keywords.length > 0) {
            exploriumFilters.website_keywords = { values: keywords };
        }
    }

    // Industry categories (only one can be used per request)
    if (filters.linkedinCategory) {
        exploriumFilters.linkedin_category = { values: [filters.linkedinCategory] };
    } else if (filters.naicsCategory) {
        exploriumFilters.naics_category = { values: [filters.naicsCategory] };
    } else if (filters.googleCategory) {
        exploriumFilters.google_category = { values: [filters.googleCategory] };
    } else if (filters.industry) {
        // Map generic industry to LinkedIn category as fallback
        const industryMapping: Record<string, string> = {
            "Technology": "software development",
            "Finance": "financial services",
            "Healthcare": "hospitals and health care",
            "Retail": "retail",
            "Consulting": "management consulting"
        };
        const mappedCategory = industryMapping[filters.industry];
        if (mappedCategory) {
            exploriumFilters.linkedin_category = { values: [mappedCategory] };
        }
    }

    return exploriumFilters;
}

function mapCountryToCode(country: string): string | null {
    const countryMap: Record<string, string> = {
        "France": "fr",
        "USA": "us",
        "US": "us",
        "United States": "us",
        "UK": "gb",
        "United Kingdom": "gb",
        "Germany": "de",
        "Canada": "ca",
        "Spain": "es",
        "Italy": "it"
    };
    return countryMap[country] || country.toLowerCase().slice(0, 2);
}

// ============================================
// EXPLORIUM API CLIENT
// ============================================

/**
 * Get API key with proper error handling
 */
function getApiKey(): string | null {
    const apiKey = integrationKey("EXPLORIUM_API_KEY");
    if (!apiKey || apiKey.trim() === "") {
        console.error("[Explorium] EXPLORIUM_API_KEY is missing or empty in environment variables");
        return null;
    }
    return apiKey;
}

/**
 * Check market size using Explorium Statistics endpoint
 */
export async function getExploriumStats(filters: ExploriumSearchFilters): Promise<ExploriumStatsResult> {
    const apiKey = getApiKey();
    if (!apiKey) {
        return { totalCount: 0, isMock: true, error: "API key missing" };
    }

    try {
        const exploriumFilters = buildExploriumFilters(filters);

        // Stats endpoint has simpler structure - just filters and request_context
        const payload = {
            filters: exploriumFilters,
            request_context: null
        };

        console.log("[Explorium] Getting stats:", JSON.stringify(payload, null, 2));

        const res = await fetch(`${API_BASE_URL}/businesses/stats`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "api_key": apiKey // Correct header name per Explorium docs
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errorText = await res.text();
            console.error(`[Explorium] Stats API error: ${res.status} ${res.statusText}`, errorText);
            throw new Error(`Explorium API error: ${res.status} ${res.statusText}`);
        }

        const data = await res.json();
        const totalCount = data.total_results || 0;

        return { totalCount, isMock: false };
    } catch (err: any) {
        console.error("[Explorium] Stats failed:", err.message || err);
        return { totalCount: 0, isMock: true, error: err.message || "Failed to fetch stats" };
    }
}

/**
 * Searches companies in Explorium database (Real API)
 */
export async function searchExploriumCompanies(filters: ExploriumSearchFilters): Promise<ExploriumSearchResult> {
    const apiKey = getApiKey();
    if (!apiKey) {
        console.warn("[Explorium] Missing EXPLORIUM_API_KEY. Returning mock data.");
        return mockSearch(filters);
    }

    try {
        const exploriumFilters = buildExploriumFilters(filters);

        const payload = {
            mode: "full",
            size: 10, // Sample size for preview
            page_size: 10,
            page: 1,
            filters: exploriumFilters,
            request_context: null
        };

        console.log("[Explorium] Searching businesses:", JSON.stringify(payload, null, 2));

        const res = await fetch(`${API_BASE_URL}/businesses`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "api_key": apiKey // Correct header name per Explorium docs
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errorText = await res.text();
            console.error(`[Explorium] API error: ${res.status} ${res.statusText}`, errorText);
            
            // Don't silently fallback - throw error so caller knows
            throw new Error(`Explorium API error: ${res.status} ${res.statusText}. ${errorText}`);
        }

        const data = await res.json();
        
        // Handle Explorium response structure
        const businesses = data.data || [];
        const totalResults = data.total_results || 0;

        return {
            totalMatches: totalResults,
            sample: businesses.map(mapToExploriumCompany),
            isMock: false
        };
    } catch (err: any) {
        console.error("[Explorium] Search failed:", err.message || err);
        // Return error info instead of silently falling back
        return {
            totalMatches: 0,
            sample: [],
            isMock: true,
            error: err.message || "Failed to search companies"
        };
    }
}

/**
 * Fetches full details for a list of companies (Real API)
 * Fetches up to maxResults companies using pagination
 */
export async function bulkEnrichCompanies(
    filters: ExploriumSearchFilters,
    maxResults: number = 1000
): Promise<ExploriumCompany[]> {
    const apiKey = getApiKey();
    if (!apiKey) {
        console.warn("[Explorium] Missing EXPLORIUM_API_KEY. Returning mock data.");
        return mockEnrich(filters);
    }

    try {
        const exploriumFilters = buildExploriumFilters(filters);
        const allCompanies: ExploriumCompany[] = [];
        const pageSize = 100; // Max page size per Explorium API
        let currentPage = 1;
        let hasMore = true;
        const maxPages = Math.ceil(maxResults / pageSize);

        console.log(`[Explorium] Bulk enriching: fetching up to ${maxResults} companies...`);

        while (hasMore && currentPage <= maxPages) {
            const payload = {
                mode: "full",
                size: Math.min(pageSize, maxResults - allCompanies.length),
                page_size: pageSize,
                page: currentPage,
                filters: exploriumFilters,
                request_context: null
            };

            console.log(`[Explorium] Fetching page ${currentPage}...`);

            const res = await fetch(`${API_BASE_URL}/businesses`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "api_key": apiKey
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errorText = await res.text();
                console.error(`[Explorium] Enrich API error: ${res.status} ${res.statusText}`, errorText);
                
                // If it's the first page, throw error. Otherwise, return what we have.
                if (currentPage === 1) {
                    throw new Error(`Explorium API error: ${res.status} ${res.statusText}`);
                } else {
                    console.warn(`[Explorium] Error on page ${currentPage}, returning ${allCompanies.length} companies fetched so far.`);
                    break;
                }
            }

            const data = await res.json();
            const businesses = data.data || [];
            const totalResults = data.total_results || 0;
            const totalPages = data.total_pages || 1;

            console.log(`[Explorium] Page ${currentPage}: Got ${businesses.length} companies (Total: ${totalResults})`);

            // Map and add companies
            const mappedCompanies = businesses.map(mapToExploriumCompany);
            allCompanies.push(...mappedCompanies);

            // Check if we should continue
            hasMore = businesses.length === pageSize && allCompanies.length < maxResults && currentPage < totalPages;
            currentPage++;

            // Small delay to respect rate limits (200 qpm = ~3.3 requests per second)
            if (hasMore) {
                await new Promise(resolve => setTimeout(resolve, 400)); // ~2.5 requests per second
            }
        }

        console.log(`[Explorium] Bulk enrich completed: ${allCompanies.length} companies fetched.`);
        return allCompanies;

    } catch (err: any) {
        console.error("[Explorium] Enrich failed:", err.message || err);
        // For bulk operations, throw error so caller can handle it
        throw new Error(`Failed to enrich companies: ${err.message || "Unknown error"}`);
    }
}

// ============================================
// HELPERS
// ============================================

function mapToExploriumCompany(raw: any): ExploriumCompany {
    // Handle Explorium API response structure
    return {
        id: raw.business_id || raw.id || "",
        name: raw.legal_name || raw.name || raw.company_name || "Unknown",
        website: raw.website || raw.domain || raw.primary_domain,
        industry: raw.linkedin_category || raw.naics_category || raw.google_category || raw.industry,
        size: raw.company_size || raw.employee_count_range || raw.employee_count,
        revenue: raw.company_revenue || raw.revenue_range || raw.estimated_revenue,
        headquarters: raw.country_code || raw.country || raw.location?.country || raw.hq_country,
        linkedin: raw.linkedin_url || raw.social_media?.linkedin
    };
}

// ============================================
// MOCKS (Fallback - Only used when API key is missing)
// ============================================

async function mockSearch(filters: ExploriumSearchFilters): Promise<ExploriumSearchResult> {
    await new Promise(resolve => setTimeout(resolve, 800));

    const totalMatches = Math.floor(Math.random() * 500) + 50;
    const mockCompanies: ExploriumCompany[] = [
        {
            id: "exp_mock_1",
            name: "Acme Corp (Mock - API Key Missing)",
            industry: filters.industry || "Technology",
            revenue: "10M",
            size: "100-250",
            website: "https://acme.com"
        },
        {
            id: "exp_mock_2",
            name: "Global Tech (Mock - API Key Missing)",
            industry: filters.industry || "Technology",
            revenue: "5M",
            size: "50-100",
            website: "https://globaltech.io"
        }
    ];

    return { 
        totalMatches, 
        sample: mockCompanies, 
        isMock: true,
        error: "EXPLORIUM_API_KEY environment variable is not set. Please configure your API key to use real data."
    };
}

async function mockEnrich(filters: ExploriumSearchFilters): Promise<ExploriumCompany[]> {
    await new Promise(resolve => setTimeout(resolve, 1500));
    return Array.from({ length: 10 }).map((_, i) => ({
        id: `exp_mock_enriched_${i}`,
        name: `Enriched Company ${i + 1} (Mock - API Key Missing)`,
        industry: filters.industry || "General",
        revenue: filters.revenueRange || "Unknown",
        size: filters.headcountRange || "Unknown",
        website: `https://company${i}.com`,
        linkedin: `https://linkedin.com/company/company${i}`,
        headquarters: filters.country || "USA"
    }));
}
