// Company facets for the SDR action table (#118): sector, headcount, revenue.
//
// Headcount and revenue arrive as free text from imports, in every format seen
// in the base: INSEE tranche codes ("01", "02", "03"), plain counts ("55"),
// ranges ("150-499", "51-100"), sentences ("1 ou 2 salariés"); revenue as
// "12 M€", "1 200 000", "5,4M", "850 k€". Each is read into one bucket.

export type SizeBucket = "1-9" | "10-49" | "50-249" | "250-999" | "1000+";
export type RevenueBucket = "<1M" | "1-5M" | "5-20M" | "20-100M" | "100M+";

export const SIZE_BUCKETS: { value: SizeBucket; label: string }[] = [
    { value: "1-9", label: "1 à 9" },
    { value: "10-49", label: "10 à 49" },
    { value: "50-249", label: "50 à 249" },
    { value: "250-999", label: "250 à 999" },
    { value: "1000+", label: "1 000 et +" },
];

export const REVENUE_BUCKETS: { value: RevenueBucket; label: string }[] = [
    { value: "<1M", label: "< 1 M€" },
    { value: "1-5M", label: "1 à 5 M€" },
    { value: "5-20M", label: "5 à 20 M€" },
    { value: "20-100M", label: "20 à 100 M€" },
    { value: "100M+", label: "100 M€ et +" },
];

/** INSEE "tranche d'effectif" codes written with their leading zero, and the bigger ones by lower bound. */
const INSEE_TRANCHE: Record<string, number> = {
    "00": 0, "01": 1, "02": 3, "03": 6,
};

/** Lower bound of the headcount written in `raw`, or null when there is none. */
export function headcountOf(raw: string | null | undefined): number | null {
    const text = (raw ?? "").trim();
    if (!text) return null;
    if (text in INSEE_TRANCHE) return INSEE_TRANCHE[text];
    const first = text.replace(/[\s  ](?=\d{3}\b)/g, "").match(/\d+/);
    if (!first) return null;
    const n = Number(first[0]);
    return Number.isFinite(n) ? n : null;
}

export function sizeBucketOf(raw: string | null | undefined): SizeBucket | null {
    const n = headcountOf(raw);
    if (n === null) return null;
    if (n < 10) return "1-9";
    if (n < 50) return "10-49";
    if (n < 250) return "50-249";
    if (n < 1000) return "250-999";
    return "1000+";
}

/** Revenue in euros written in `raw` ("12 M€", "5,4M", "850 k€", "1 200 000 €"), or null. */
export function revenueOf(raw: string | null | undefined): number | null {
    const text = (raw ?? "").toLowerCase().replace(/[  ]/g, " ").trim();
    if (!text) return null;
    const m = text.match(/(\d[\d\s.]*(?:,\d+)?|\d+(?:\.\d+)?)\s*(md|mds|milliards?|b|bn|m|m€|millions?|k|k€|keur|meur)?/);
    if (!m) return null;
    let digits = m[1].trim();
    // "1 200 000" / "1.200.000" are thousands separators; "5,4" / "5.4" a decimal.
    if (/^\d{1,3}([\s.]\d{3})+$/.test(digits)) digits = digits.replace(/[\s.]/g, "");
    else digits = digits.replace(/\s/g, "").replace(",", ".");
    const value = Number(digits);
    if (!Number.isFinite(value)) return null;
    const unit = m[2] ?? "";
    if (/^(md|mds|milliard|b)/.test(unit)) return value * 1e9;
    if (/^m/.test(unit)) return value * 1e6;
    if (/^k/.test(unit)) return value * 1e3;
    return value;
}

export function revenueBucketOf(raw: string | null | undefined): RevenueBucket | null {
    const v = revenueOf(raw);
    if (v === null) return null;
    if (v < 1e6) return "<1M";
    if (v < 5e6) return "1-5M";
    if (v < 20e6) return "5-20M";
    if (v < 100e6) return "20-100M";
    return "100M+";
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Same sector whatever the case or accents ("Industrie" = "industrie "). */
export function sectorKey(raw: string | null | undefined): string {
    return fold(raw ?? "");
}

/** Distinct sectors of the rows, most frequent first, with their display label and count. */
export function sectorOptions(rows: { company: { industry?: string | null } }[]): { value: string; label: string; count: number }[] {
    const byKey = new Map<string, { label: string; count: number }>();
    for (const r of rows) {
        const label = r.company.industry?.trim();
        if (!label) continue;
        const key = sectorKey(label);
        const entry = byKey.get(key);
        if (entry) entry.count++;
        else byKey.set(key, { label, count: 1 });
    }
    return [...byKey.entries()]
        .map(([value, e]) => ({ value, label: e.label, count: e.count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "fr"));
}

// Same key rules as the action-queue SQL (app/api/sdr/action-queue/route.ts),
// for screens that hold the raw customData (the company record in the drawer).
const SIZE_KEY = /^(effectif|taille|tranche|headcount|employees|nb_?salari)/i;
const REVENUE_KEY = /(chiffre|^ca([ _]|$)|revenu|turnover)/i;

function firstCustomValue(customData: unknown, key: RegExp): string | null {
    if (!customData || typeof customData !== "object" || Array.isArray(customData)) return null;
    const hit = Object.entries(customData as Record<string, unknown>)
        .filter(([k, v]) => key.test(k) && v != null && String(v).trim() !== "")
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))[0];
    return hit ? String(hit[1]).trim() : null;
}

/** The headcount to show: the typed column, else an imported Taille/Effectif column. */
export function companyHeadcountText(size: string | null | undefined, customData: unknown): string | null {
    return size?.trim() || firstCustomValue(customData, SIZE_KEY);
}

/** The revenue to show, from an imported CA / Chiffre d'affaires column. */
export function companyRevenueText(customData: unknown): string | null {
    return firstCustomValue(customData, REVENUE_KEY);
}
