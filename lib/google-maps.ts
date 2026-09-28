/**
 * Google Maps search link for a free-text address (e.g. a physical RDV location).
 * Uses the cross-platform Maps URLs format: it opens the Maps app on mobile and
 * google.com/maps on desktop, and needs no API key.
 */
export function getGoogleMapsUrl(address: string): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
}
