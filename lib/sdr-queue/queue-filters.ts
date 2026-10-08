// Client-side filtering for the SDR action table (/sdr/action, vue tableau).
// The action-queue API returns the full eligible queue, so every filter here
// runs in memory — instant, no refetch per keystroke.

export type QueueRowType = "" | "contact" | "company";
export type PhoneScope = "any" | "contact" | "company";
export type PhoneAvailability = "" | "contact" | "company" | "companyOnly" | "both" | "none";
export type LineType = "" | "mobile" | "landline";

export interface QueueFilters {
    search: string;
    type: QueueRowType;
    priority: string;
    /** "" | ActionResult code | "NONE" (never contacted) */
    result: string;
    channel: string;
    /** Digits typed in the advanced "Numéro" field. */
    phone: string;
    /** Which number `phone` and `lineType` look at ("any" = for `lineType`, the number the table shows). */
    phoneScope: PhoneScope;
    phoneAvailability: PhoneAvailability;
    lineType: LineType;
}

export const DEFAULT_QUEUE_FILTERS: QueueFilters = {
    search: "",
    type: "contact",
    priority: "",
    result: "",
    channel: "",
    phone: "",
    phoneScope: "any",
    phoneAvailability: "",
    lineType: "",
};

/** The subset of a queue row the filters read. */
export interface QueueRowLike {
    contactId: string | null;
    contact?: {
        firstName?: string | null;
        lastName?: string | null;
        title?: string | null;
        email?: string | null;
        phone?: string | null;
    } | null;
    company: { name: string; industry?: string | null; phone?: string | null };
    priority: string;
    channel: string;
    missionName?: string;
    lastAction?: { result: string; note?: string | null } | null;
}

/**
 * National significant digits, so "06 12 34 56 78", "+33 6 12 34 56 78" and
 * "0033612345678" all become "612345678". Non-French numbers keep their digits.
 */
export function nationalDigits(raw: string | null | undefined): string {
    if (!raw) return "";
    let d = raw.replace(/\D/g, "");
    // An explicit +33 strips even on a partial number ("+33 6 19" → "619").
    if (d.startsWith("0033")) d = d.slice(4);
    else if (d.startsWith("33") && (d.length > 9 || /^\W*\+/.test(raw))) d = d.slice(2);
    return d.replace(/^0+/, "");
}

function isUsable(raw: string | null | undefined): boolean {
    const n = raw?.replace(/\D/g, "").length ?? 0;
    return n >= 7 && n <= 15;
}

/**
 * Team rule: only French mobiles (+33 6 / +33 7, i.e. 06 / 07) are "mobile";
 * every other usable number is "landline" (standards, 08, foreign numbers).
 * null = no usable number.
 */
export function lineKind(raw: string | null | undefined): "mobile" | "landline" | null {
    // Some fields hold two numbers ("04 84 35 05 06 / 06 40 64 17 66"): mobile if any part is.
    const parts = (raw ?? "").split(/[\/;,|]|\bou\b/i).filter(isUsable);
    if (parts.length === 0) return null;
    return parts.some(isFrenchMobile) ? "mobile" : "landline";
}

function isFrenchMobile(raw: string): boolean {
    // Drop Excel's leading apostrophe and similar junk before reading the prefix.
    const trimmed = raw.trim().replace(/^[^\d+]+/, "");
    if (/^(\+|00)(?!33)/.test(trimmed)) return false;
    const d = nationalDigits(trimmed);
    return d.length === 9 && (d[0] === "6" || d[0] === "7");
}

/** The number the table shows and the SDR dials: the contact's, else the company standard. */
export function displayedPhone(row: QueueRowLike): string | null {
    return row.contact?.phone || row.company.phone || null;
}

/** Needle for phone matching; null when the query has too few digits. */
export function phoneNeedle(query: string): string | null {
    const digits = query.replace(/\D/g, "");
    if (digits.length < 3) return null;
    return nationalDigits(query) || digits;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function phonesInScope(row: QueueRowLike, scope: PhoneScope): (string | null | undefined)[] {
    const contactPhone = row.contact?.phone;
    const companyPhone = row.company.phone;
    if (scope === "contact") return [contactPhone];
    if (scope === "company") return [companyPhone];
    return [contactPhone, companyPhone];
}

function phoneMatches(phones: (string | null | undefined)[], needle: string): boolean {
    return phones.some((p) => !!p && nationalDigits(p).includes(needle));
}

/** Pre-folded search query, built once per filter pass. */
export interface PreparedSearch {
    text: string;
    needle: string | null;
}

export function prepareSearch(query: string): PreparedSearch | null {
    const q = query.trim();
    if (!q) return null;
    return { text: fold(q), needle: phoneNeedle(q) };
}

function rowMatchesSearch(row: QueueRowLike, s: PreparedSearch): boolean {
    if (s.needle && phoneMatches([row.contact?.phone, row.company.phone], s.needle)) return true;
    const haystack = fold([
        row.contact?.firstName,
        row.contact?.lastName,
        row.contact?.title,
        row.contact?.email,
        row.company.name,
        row.company.industry,
        row.lastAction?.note,
        row.missionName,
    ].filter(Boolean).join(" "));
    return s.text.split(/\s+/).every((word) => haystack.includes(word));
}

/** Facets can skip one filter so each chip counts "what you'd get if you picked me". */
export type FacetKey = "type" | "priority";

export function matchesQueueFilters(
    row: QueueRowLike,
    f: QueueFilters,
    search: PreparedSearch | null,
    skip?: FacetKey,
): boolean {
    if (skip !== "type") {
        if (f.type === "contact" && !row.contactId) return false;
        if (f.type === "company" && row.contactId) return false;
    }
    if (skip !== "priority" && f.priority && row.priority !== f.priority) return false;
    if (f.result) {
        if (f.result === "NONE") {
            if (row.lastAction) return false;
        } else if (row.lastAction?.result !== f.result) return false;
    }
    if (f.channel && row.channel !== f.channel) return false;

    if (f.phoneAvailability) {
        const hasContact = lineKind(row.contact?.phone) !== null;
        const hasCompany = lineKind(row.company.phone) !== null;
        switch (f.phoneAvailability) {
            case "contact": if (!hasContact) return false; break;
            case "company": if (!hasCompany) return false; break;
            case "companyOnly": if (hasContact || !hasCompany) return false; break;
            case "both": if (!hasContact || !hasCompany) return false; break;
            case "none": if (hasContact || hasCompany) return false; break;
        }
    }

    const needle = phoneNeedle(f.phone);
    if (needle && !phoneMatches(phonesInScope(row, f.phoneScope), needle)) return false;
    if (f.lineType) {
        // Judge the number the SDR sees in the row, so a mobile standard behind a
        // fixed contact line (or vice versa) never surfaces under the wrong type.
        const phone = f.phoneScope === "any" ? displayedPhone(row)
            : f.phoneScope === "contact" ? row.contact?.phone : row.company.phone;
        if (lineKind(phone) !== f.lineType) return false;
    }

    if (search && !rowMatchesSearch(row, search)) return false;
    return true;
}

/** Filters counted in the "Filtres (n)" badge — type and search have their own controls. */
export function countAdvancedFilters(f: QueueFilters): number {
    return [
        f.result,
        f.channel,
        phoneNeedle(f.phone) ? "phone" : "",
        f.phoneAvailability,
        f.lineType,
    ].filter(Boolean).length;
}

export function hasAnyQueueFilter(f: QueueFilters): boolean {
    return !!(f.search.trim() || f.priority || countAdvancedFilters(f) > 0);
}
