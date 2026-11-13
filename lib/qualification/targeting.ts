// Mission targeting criteria. Pure helpers + the storage convention.
//
// Campaign.icp is free text and cannot be evaluated by a machine, so « fit » is
// only scored when a manager defined STRUCTURED criteria for the mission. They
// live in SystemConfig under "mission.targeting:<missionId>" as JSON (same
// convention as the list cooldown: no migration, a missing row = not defined).

import { sizeBucketOf } from "@/lib/sdr-queue/company-facets";
import type { Reason, Targeting } from "./types";

export const TARGETING_KEY_PREFIX = "mission.targeting:";
export const targetingKey = (missionId: string) => `${TARGETING_KEY_PREFIX}${missionId}`;

const MAX_ITEMS = 30;

function norm(s: string): string {
    return s
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

const COUNTRY_ALIASES: Record<string, string> = {
    fr: "france", fra: "france", be: "belgique", belgium: "belgique", ch: "suisse", switzerland: "suisse",
    lu: "luxembourg", mc: "monaco",
};
function country(s: string): string {
    const n = norm(s);
    return COUNTRY_ALIASES[n] ?? n;
}

function list(v: unknown): string[] {
    if (!Array.isArray(v)) return [];
    return v
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((x) => x.trim().slice(0, 80))
        .slice(0, MAX_ITEMS);
}

/** Parses the stored JSON; null when absent, unreadable or empty (= not defined). */
export function parseTargeting(raw: string | null | undefined): Targeting | null {
    if (!raw) return null;
    try {
        const o = JSON.parse(raw) as Record<string, unknown>;
        const t: Targeting = { industries: list(o.industries), countries: list(o.countries), sizeBuckets: list(o.sizeBuckets) };
        return t.industries.length || t.countries.length || t.sizeBuckets.length ? t : null;
    } catch {
        return null;
    }
}

export interface FitResult {
    reasons: Reason[];
    /** Criteria defined by the manager for which this company has no data. */
    unknown: string[];
    /** Every defined criterion that has data matches. */
    allMatch: boolean;
    anyMismatch: boolean;
}

const POINTS = { industries: 8, sizeBuckets: 6, countries: 4 } as const;

export function evaluateFit(
    company: { industry: string | null; size: string | null; country: string | null },
    targeting: Targeting | null,
): FitResult {
    const out: FitResult = { reasons: [], unknown: [], allMatch: false, anyMismatch: false };
    if (!targeting) return out;

    let defined = 0;
    let matched = 0;

    if (targeting.industries.length) {
        defined++;
        const industry = norm(company.industry ?? "");
        if (!industry) out.unknown.push("Secteur inconnu");
        else if (targeting.industries.some((i) => industry.includes(norm(i)) || norm(i).includes(industry))) {
            matched++;
            out.reasons.push({ code: "fit_industry", label: `Secteur ciblé : ${company.industry}`, points: POINTS.industries, source: "targeting" });
        } else {
            out.anyMismatch = true;
            out.reasons.push({ code: "fit_industry_miss", label: `Hors ciblage : secteur ${company.industry}`, points: -12, source: "targeting" });
        }
    }
    if (targeting.sizeBuckets.length) {
        defined++;
        const bucket = sizeBucketOf(company.size);
        if (!bucket) out.unknown.push("Effectif inconnu");
        else if (targeting.sizeBuckets.includes(bucket)) {
            matched++;
            out.reasons.push({ code: "fit_size", label: `Taille ciblée : ${bucket} salariés`, points: POINTS.sizeBuckets, source: "targeting" });
        } else {
            out.anyMismatch = true;
            out.reasons.push({ code: "fit_size_miss", label: `Hors ciblage : ${bucket} salariés`, points: -12, source: "targeting" });
        }
    }
    if (targeting.countries.length) {
        defined++;
        const c = country(company.country ?? "");
        if (!c) out.unknown.push("Pays inconnu");
        else if (targeting.countries.some((x) => country(x) === c)) {
            matched++;
            out.reasons.push({ code: "fit_country", label: `Zone ciblée : ${company.country}`, points: POINTS.countries, source: "targeting" });
        } else {
            out.anyMismatch = true;
            out.reasons.push({ code: "fit_country_miss", label: `Hors ciblage : ${company.country}`, points: -12, source: "targeting" });
        }
    }

    out.allMatch = defined > 0 && matched === defined && out.unknown.length === 0;
    return out;
}
