// ============================================
// FEATURE GATES (pure, edge-safe) — which API paths a license feature switches
// off. The middleware applies this to every /api request, so a feature that is
// off answers 403 everywhere at once instead of each route remembering to ask.
// ============================================

import type { LicenseFeature } from "./resolve";

type Gate = { feature: LicenseFeature; prefix: string; writesOnly?: boolean };

export const FEATURE_GATES: Gate[] = [
    { feature: "aiAssistant", prefix: "/api/manager/assistant" },
    // Reading the brand stays open (the login page and the settings form need it); editing is the paid feature.
    { feature: "whiteLabel", prefix: "/api/manager/brand", writesOnly: true },
];

const READ_METHODS = ["GET", "HEAD", "OPTIONS"];

/** The switched-off feature that blocks this request, or null. */
export function blockingFeature(path: string, method: string, features: Partial<Record<LicenseFeature, boolean>>): LicenseFeature | null {
    const isRead = READ_METHODS.includes(method.toUpperCase());
    for (const g of FEATURE_GATES) {
        if (features[g.feature] !== false) continue;
        if (g.writesOnly && isRead) continue;
        if (path === g.prefix || path.startsWith(`${g.prefix}/`)) return g.feature;
    }
    return null;
}
