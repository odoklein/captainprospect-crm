// ============================================
// LICENSE STATE FOR THE EDGE MIDDLEWARE — middleware cannot use Prisma, so it
// asks this container's own GET /api/license-state and keeps the answer in
// module memory for a few seconds. Edge-safe: no Node or Prisma import.
//
// Fails open: if the probe fails the instance is treated as not suspended with
// every feature on, and the miss is cached only briefly so the next request
// retries. Suspension and feature gates are a commercial lock, not a security
// boundary; a transient error must not take an agency offline.
// ============================================

import type { LicenseFeature } from "./resolve";

const TTL_MS = 15_000;
const FAIL_TTL_MS = 3_000;

export type EdgeLicenseState = {
    suspended: boolean;
    reason: string | null;
    features: Partial<Record<LicenseFeature, boolean>>;
};
type Cached = EdgeLicenseState & { until: number };

let cached: Cached | null = null;
let inflight: Promise<Cached> | null = null;

async function probe(baseUrls: string[]): Promise<Cached> {
    for (const base of baseUrls) {
        try {
            const res = await fetch(`${base}/api/license-state`, { cache: "no-store", signal: AbortSignal.timeout(1500) });
            if (!res.ok) continue;
            const body = (await res.json()) as { status?: string; reason?: string | null; features?: Partial<Record<LicenseFeature, boolean>> };
            return { suspended: body.status === "SUSPENDED", reason: body.reason ?? null, features: body.features ?? {}, until: Date.now() + TTL_MS };
        } catch {
            // try the next base
        }
    }
    return { suspended: false, reason: null, features: {}, until: Date.now() + FAIL_TTL_MS };
}

/**
 * `origin` is the request's own origin (fallback). The container's loopback is
 * tried first so the probe never leaves the machine or depends on DNS / TLS.
 */
export async function getEdgeLicenseState(origin: string): Promise<EdgeLicenseState> {
    if (cached && cached.until > Date.now()) return cached;
    if (!inflight) {
        const port = (typeof process !== "undefined" && process.env?.PORT) || "5000";
        const p = probe([`http://127.0.0.1:${port}`, origin]).then((c) => {
            cached = c;
            return c;
        });
        inflight = p;
        p.finally(() => {
            if (inflight === p) inflight = null;
        });
    }
    return inflight;
}

/** Methods that change data. Reads stay available so the agency can still export. */
export function isWriteMethod(method: string): boolean {
    return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}
