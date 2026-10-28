import { ApolloEnrichmentResult } from "./apollo-service";
import { integrationKey } from "@/lib/integrations/keys";

const apifyToken = () => integrationKey("APIFY_API_TOKEN");
const GOOGLE_MAPS_ACTOR_ID = "compass~crawler-google-places";

export interface ApifySearchParams {
  keywords: string;
  location: string;
  limit?: number;
}

export interface ApifyRunResponse {
  id: string;
  actId: string;
  status: string;
  defaultDatasetId: string;
}

export interface ApifyGoogleMapsItem {
  title: string;
  categoryName?: string;
  address?: string;
  city?: string;
  state?: string;
  countryCode?: string;
  website?: string;
  phone?: string;
  totalScore?: number;
  reviewsCount?: number;
  url?: string;
}

/**
 * Starts the Apify Google Maps Scraper Actor
 */
export async function startApifyRun(
  params: ApifySearchParams,
): Promise<string> {
  const APIFY_API_TOKEN = apifyToken();
  if (!APIFY_API_TOKEN) {
    throw new Error("APIFY_API_TOKEN is not configured");
  }

  const searchString = `${params.keywords} in ${params.location}`;

  const input = {
    searchStringsArray: [searchString],
    maxCrawledPlacesPerSearch: params.limit || 20,
    language: "fr", // Default to French as it's a French CRM
    maxImages: 0,
    maxReviews: 0,
  };

  const response = await fetch(
    `https://api.apify.com/v2/acts/${GOOGLE_MAPS_ACTOR_ID}/runs?token=${APIFY_API_TOKEN}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Apify run failed: ${response.statusText} - ${errorBody}`);
  }

  const data = (await response.json()) as { data: ApifyRunResponse };
  return data.data.id;
}

/**
 * Checks the status of an Apify Run
 */
export async function getApifyRunStatus(
  runId: string,
): Promise<{ status: string; datasetId?: string }> {
  const APIFY_API_TOKEN = apifyToken();
  if (!APIFY_API_TOKEN) {
    throw new Error("APIFY_API_TOKEN is not configured");
  }

  const response = await fetch(
    `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_API_TOKEN}`,
    { method: "GET" },
  );

  if (!response.ok) {
    throw new Error(`Failed to check run status: ${response.statusText}`);
  }

  const data = (await response.json()) as { data: ApifyRunResponse };

  return {
    status: data.data.status, // READY, RUNNING, SUCCEEDED, FAILED, ABORTED
    datasetId: data.data.defaultDatasetId,
  };
}

/**
 * Fetches the dataset results from a successful run
 */
export async function getApifyRunResults(
  datasetId: string,
): Promise<ApifyGoogleMapsItem[]> {
  const APIFY_API_TOKEN = apifyToken();
  if (!APIFY_API_TOKEN) {
    throw new Error("APIFY_API_TOKEN is not configured");
  }

  const response = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_API_TOKEN}`,
    { method: "GET" },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch dataset: ${response.statusText}`);
  }

  const data = await response.json();
  return data as ApifyGoogleMapsItem[];
}

/**
 * Maps Apify Google Maps data to our normalized format
 * We reuse ApolloEnrichmentResult interface to maintain consistency across the app,
 * even though it's technically coming from Apify.
 */
export function normalizeApifyResults(
  items: ApifyGoogleMapsItem[],
): ApolloEnrichmentResult[] {
  return items.map((item) => {
    // Extract domain from website if possible, otherwise use raw website
    const domain = item.website
      ? item.website.replace(/^https?:\/\//, "").replace(/\/$/, "")
      : undefined;

    return {
      company: {
        name: item.title,
        domain: domain,
        industry: item.categoryName,
        country: item.countryCode,
        city: item.city || extractCityFromAddress(item.address),
        state: item.state,
        phone: item.phone,
        address: item.address,
      },
      source: "apify-google-maps",
      confidence: item.totalScore ? Math.round(item.totalScore * 20) : 0, // Map 5-star to 100%, default 0
      metadata: {
        rawUrl: item.url,
        reviewsCount: item.reviewsCount,
      },
    };
  });
}

function extractCityFromAddress(address?: string): string | undefined {
  if (!address) return undefined;
  // Simple heuristic for French addresses: "123 Rue X, 75000 Paris, France"
  // This is a naive implementation, real parsing is harder
  const parts = address.split(",");
  if (parts.length >= 2) {
    // Often city is in the second to last part
    return parts[parts.length - 2].trim().replace(/[0-9]/g, "").trim();
  }
  return undefined;
}
