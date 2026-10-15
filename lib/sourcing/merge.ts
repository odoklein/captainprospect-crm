import type { SourcedContact, SourcedLead, SourceId } from "./types";

// ============================================
// SOURCING — normalization + cross-source merge (isomorphic, no deps).
//
// The same plumber shows up on Google Maps as "Plomberie Martin" with a phone,
// and in the registry as "MARTIN PLOMBERIE SARL" with a SIREN and its manager.
// We fold them into one lead when phone, domain or name+postcode agree.
// ============================================

const LEGAL_FORMS =
    /\b(sarl|sas|sasu|eurl|sa|sci|snc|selarl|selas|scp|scop|ei|eirl|ets|etablissements?|societe|ste|groupe|france|cie|et fils)\b/g;

/** "MARTIN Plomberie S.A.R.L." → "martin plomberie" (order-insensitive key below). */
export function normalizeCompanyName(name: string): string {
    return name
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/\./g, "")
        .replace(/&/g, " et ")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(LEGAL_FORMS, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function nameKey(name: string): string {
    return normalizeCompanyName(name).split(" ").filter(Boolean).sort().join(" ");
}

/** "https://www.Foo.fr/contact" → "foo.fr". */
export function cleanDomain(url?: string | null): string | undefined {
    if (!url) return undefined;
    const host = url
        .trim()
        .replace(/^[a-z]+:\/\//i, "")
        .replace(/^www\./i, "")
        .split(/[/?#]/)[0]
        .toLowerCase();
    // Social pages are not the company's own site.
    if (!host || !host.includes(".") || /(facebook|instagram|linkedin|google|pagesjaunes|tripadvisor)\./.test(host)) {
        return undefined;
    }
    return host;
}

/** Last 9 national digits: "+33 6 12 34 56 78" and "06.12.34.56.78" agree. */
export function phoneKey(phone?: string | null): string | undefined {
    const digits = (phone ?? "").replace(/\D/g, "");
    return digits.length >= 9 ? digits.slice(-9) : undefined;
}

function mergeContacts(a: SourcedContact[], b: SourcedContact[]): SourcedContact[] {
    const out = [...a];
    const seen = new Set(a.map((c) => `${c.firstName ?? ""} ${c.lastName ?? ""}`.toLowerCase().trim()));
    for (const c of b) {
        const k = `${c.firstName ?? ""} ${c.lastName ?? ""}`.toLowerCase().trim();
        if (k && seen.has(k)) {
            const i = out.findIndex((o) => `${o.firstName ?? ""} ${o.lastName ?? ""}`.toLowerCase().trim() === k);
            out[i] = { ...c, ...Object.fromEntries(Object.entries(out[i]).filter(([, v]) => v)) };
            continue;
        }
        seen.add(k);
        out.push(c);
    }
    return out;
}

function mergeTwo(base: SourcedLead, extra: SourcedLead): SourcedLead {
    const pick = <K extends keyof SourcedLead>(k: K) => (base[k] ?? extra[k]) as SourcedLead[K];
    const sources = Array.from(new Set<SourceId>([...base.sources, ...extra.sources]));
    return {
        id: base.id,
        sources,
        // Maps names are the shop-front names SDRs will hear on the phone.
        name: base.sources.includes("gmaps") ? base.name : extra.sources.includes("gmaps") ? extra.name : base.name,
        industry: pick("industry"),
        naf: pick("naf"),
        website: pick("website"),
        phone: pick("phone"),
        address: pick("address"),
        postalCode: pick("postalCode"),
        city: pick("city"),
        country: pick("country"),
        siren: pick("siren"),
        headcount: pick("headcount"),
        rating: pick("rating"),
        reviews: pick("reviews"),
        mapsUrl: pick("mapsUrl"),
        linkedin: pick("linkedin"),
        closed: base.closed || extra.closed || undefined,
        contacts: mergeContacts(base.contacts, extra.contacts),
    };
}

/**
 * Fold `incoming` into `current`. Matching order: phone, domain, SIREN,
 * then name + department (2 first postcode digits) so two "Boulangerie
 * du Centre" in different towns stay apart.
 */
export function mergeLeads(current: SourcedLead[], incoming: SourcedLead[]): SourcedLead[] {
    const out = [...current];
    const byPhone = new Map<string, number>();
    const byDomain = new Map<string, number>();
    const bySiren = new Map<string, number>();
    const byName = new Map<string, number>();

    const index = (lead: SourcedLead, i: number) => {
        const p = phoneKey(lead.phone);
        if (p) byPhone.set(p, i);
        if (lead.website) byDomain.set(lead.website, i);
        if (lead.siren) bySiren.set(lead.siren, i);
        const n = nameKey(lead.name);
        if (n) byName.set(`${n}|${(lead.postalCode ?? "").slice(0, 2)}`, i);
    };
    out.forEach(index);

    for (const lead of incoming) {
        const p = phoneKey(lead.phone);
        const n = nameKey(lead.name);
        const hit =
            (p !== undefined ? byPhone.get(p) : undefined) ??
            (lead.website ? byDomain.get(lead.website) : undefined) ??
            (lead.siren ? bySiren.get(lead.siren) : undefined) ??
            (n ? byName.get(`${n}|${(lead.postalCode ?? "").slice(0, 2)}`) : undefined);

        if (hit !== undefined) {
            out[hit] = mergeTwo(out[hit], lead);
            index(out[hit], hit);
        } else {
            out.push(lead);
            index(lead, out.length - 1);
        }
    }
    return out;
}

/** Proposed list name: "Plombier · Lyon — oct. 2026". */
export function suggestListName(activities: string[], locations: string[]): string {
    const what = activities.slice(0, 2).join(", ") + (activities.length > 2 ? "…" : "");
    const where = locations.slice(0, 2).join(", ") + (locations.length > 2 ? "…" : "");
    const when = new Date().toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
    return [what, where].filter(Boolean).join(" · ") + ` — ${when}`;
}
