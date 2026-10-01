/**
 * Pure core of the AI company enrichment (no network, no DB — unit-tested):
 * prompt building, reading the pages the web search really retrieved, tolerant
 * JSON parsing, and the validation that decides what an SDR is allowed to see.
 *
 * The rule that makes this safe: the model's answer is never trusted by itself.
 * A phone number or a LinkedIn / website URL is dropped unless it also appears in
 * a page the search actually returned, and confidence reflects how trustworthy
 * that page is (the company's own site beats a third-party directory).
 */

import { createHash } from "crypto";
import {
    formatPhone,
    normalizeText,
    tokenSimilarity,
    websiteHost,
} from "./phone-match";
import {
    MIN_SUGGESTION_CONFIDENCE,
    type EnrichableField,
    type EnrichmentSuggestion,
    type SuggestionTrust,
} from "./company-fields";

// ─── Retrieved pages ─────────────────────────────────────────────────────────

export interface RetrievedPage {
    url: string;
    title: string;
    text: string;
}

/**
 * Mistral's `tool.execution` entries carry the search hits as a JSON *string*:
 * `info.result = '{"<id>": {url, title, description, snippets[]}, ...}'`.
 * Malformed entries are skipped rather than failing the whole lookup.
 */
export function collectPages(outputs: unknown[]): RetrievedPage[] {
    const pages: RetrievedPage[] = [];
    const seen = new Set<string>();

    for (const entry of outputs) {
        const e = entry as { type?: string; info?: { result?: unknown } };
        if (e?.type !== "tool.execution" || typeof e.info?.result !== "string") continue;
        let hits: Record<string, { url?: string; title?: string; description?: string | null; snippets?: unknown }>;
        try {
            hits = JSON.parse(e.info.result);
        } catch {
            continue;
        }
        for (const hit of Object.values(hits ?? {})) {
            if (!hit?.url || seen.has(hit.url)) continue;
            seen.add(hit.url);
            const snippets = Array.isArray(hit.snippets) ? hit.snippets.filter((s): s is string => typeof s === "string") : [];
            const text = [hit.title, hit.description, ...snippets]
                .filter(Boolean)
                .join(" ")
                .replace(/<[^>]+>/g, " ")
                .replace(/\s+/g, " ")
                .trim();
            pages.push({ url: hit.url, title: (hit.title ?? "").replace(/<[^>]+>/g, "").trim(), text });
        }
    }
    return pages;
}

// ─── Model output ────────────────────────────────────────────────────────────

export type RawAiAnswer = Partial<Record<EnrichableField, string | null>>;

/**
 * The model wraps its JSON in a ```json fence (observed on the real API) and may
 * add prose around it. Take the first balanced {...} and parse that.
 */
export function parseModelJson(raw: string): RawAiAnswer | null {
    const text = raw.replace(/```(?:json)?/gi, "");
    const start = text.indexOf("{");
    if (start < 0) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (ch === "\\") escaped = true;
            else if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') inString = true;
        else if (ch === "{") depth++;
        else if (ch === "}" && --depth === 0) {
            try {
                const parsed = JSON.parse(text.slice(start, i + 1)) as Record<string, unknown>;
                const answer: RawAiAnswer = {};
                for (const key of ["phone", "industry", "country", "city", "linkedin", "website"] as const) {
                    const v = parsed[key];
                    answer[key] = typeof v === "string" && v.trim() && !/^(null|n\/a|inconnu|non trouvé)$/i.test(v.trim()) ? v.trim() : null;
                }
                return answer;
            } catch {
                return null;
            }
        }
    }
    return null;
}

// ─── Validation & scoring ────────────────────────────────────────────────────

export interface EnrichmentContext {
    name: string;
    website?: string | null;
    country?: string | null;
    requested: EnrichableField[];
    knownIndustries: string[];
}

const NOT_A_COMPANY_SITE = new Set([
    "linkedin.com", "facebook.com", "instagram.com", "twitter.com", "x.com", "youtube.com", "wikipedia.org",
    "societe.com", "pappers.fr", "infogreffe.fr", "verif.com", "manageo.fr", "pagesjaunes.fr", "kompass.com",
    "indeed.com", "glassdoor.fr", "glassdoor.com", "google.com", "maps.google.com", "boursier.com", "lefigaro.fr",
]);

function hostMatches(host: string, base: string): boolean {
    return Boolean(host && base && (host === base || host.endsWith(`.${base}`) || base.endsWith(`.${host}`)));
}

function isNotACompanySite(host: string): boolean {
    return [...NOT_A_COMPANY_SITE].some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

function snippetAround(text: string, index: number, length: number): string {
    const start = Math.max(0, index - 60);
    const end = Math.min(text.length, index + length + 60);
    return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

/** Last 9 digits: survives +33 / 0033 / (0) prefix differences between writings of one number. */
function phoneKey(phone: string): string {
    return phone.replace(/\D/g, "").slice(-9);
}

function findPhoneInPages(phone: string, pages: RetrievedPage[]) {
    const key = phoneKey(phone);
    if (key.length < 7) return null;
    const pattern = new RegExp(key.split("").join("[\\s.\\-()\\u00a0]*"));
    const hits: Array<{ page: RetrievedPage; evidence: string }> = [];
    for (const page of pages) {
        const match = pattern.exec(page.text);
        if (match) hits.push({ page, evidence: snippetAround(page.text, match.index, match[0].length) });
    }
    return hits;
}

export function canonicalLinkedinCompany(url: string): string | null {
    const match = /^https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/company\/([A-Za-z0-9%._-]+)/i.exec(url.trim());
    return match ? `https://www.linkedin.com/company/${match[1].replace(/\/+$/, "")}` : null;
}

function bestSourcePage(pages: RetrievedPage[], name: string, ownHost: string): RetrievedPage | null {
    let best: { page: RetrievedPage; score: number } | null = null;
    for (const page of pages) {
        const score = tokenSimilarity(name, page.title) + (hostMatches(websiteHost(page.url), ownHost) ? 1 : 0);
        if (!best || score > best.score) best = { page, score };
    }
    return best && best.score > 0 ? best.page : null;
}

function labelOf(page: { url: string }): string {
    return websiteHost(page.url) || page.url;
}

function draft(
    field: EnrichableField,
    value: string,
    confidence: number,
    trust: SuggestionTrust,
    page: { url: string; title?: string } | null,
    evidence: string | null,
): EnrichmentSuggestion {
    return {
        field,
        value,
        confidence: Math.min(99, Math.round(confidence)),
        trust,
        sourceUrl: page?.url ?? null,
        sourceLabel: page ? labelOf(page) : null,
        evidence,
        status: "PENDING",
    };
}

function canonicalIndustry(value: string, known: string[]): { value: string; known: boolean } {
    const wanted = normalizeText(value);
    const match = known.find((k) => normalizeText(k) === wanted);
    return match ? { value: match, known: true } : { value, known: false };
}

function frenchCountryName(value: string): string {
    const trimmed = value.trim();
    if (/^[A-Za-z]{2}$/.test(trimmed)) {
        try {
            const name = new Intl.DisplayNames(["fr"], { type: "region" }).of(trimmed.toUpperCase());
            if (name) return name;
        } catch {
            /* fall through */
        }
    }
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Turns the model's raw answer into the suggestions an SDR may see. Only fields
 * that were requested are considered; anything that cannot be backed by the
 * retrieved pages, or scores under MIN_SUGGESTION_CONFIDENCE, is dropped.
 */
export function buildSuggestions(
    raw: RawAiAnswer,
    ctx: EnrichmentContext,
    pages: RetrievedPage[],
    deps: { formatPhone: typeof formatPhone } = { formatPhone },
): EnrichmentSuggestion[] {
    const out: EnrichmentSuggestion[] = [];
    const ownHost = websiteHost(ctx.website);
    const wants = (field: EnrichableField) => ctx.requested.includes(field);

    if (wants("phone") && raw.phone) {
        const formatted = deps.formatPhone(raw.phone, ctx.country);
        const hits = formatted ? findPhoneInPages(formatted, pages) : null;
        if (formatted && hits && hits.length > 0) {
            const own = hits.find((h) => hostMatches(websiteHost(h.page.url), ownHost));
            const hit = own ?? hits[0];
            const multi = !own && new Set(hits.map((h) => websiteHost(h.page.url))).size >= 2;
            out.push(
                draft(
                    "phone",
                    formatted,
                    own ? 92 : multi ? 80 : 68,
                    own ? "own_site" : multi ? "multi_source" : "third_party",
                    hit.page,
                    hit.evidence,
                ),
            );
        }
    }

    if (wants("linkedin") && raw.linkedin) {
        const canonical = canonicalLinkedinCompany(raw.linkedin);
        const slug = canonical?.split("/company/")[1]?.toLowerCase();
        const page = slug
            ? pages.find((p) => canonicalLinkedinCompany(p.url)?.split("/company/")[1]?.toLowerCase() === slug)
            : undefined;
        if (canonical && page) {
            const label = page.title.replace(/\s*[|\-–]\s*LinkedIn.*$/i, "");
            const similarity = tokenSimilarity(ctx.name, label);
            const confidence = similarity >= 0.5 ? 90 : similarity >= 0.3 ? 72 : 50;
            if (confidence >= MIN_SUGGESTION_CONFIDENCE) {
                out.push(draft("linkedin", canonical, confidence, "third_party", page, page.title || null));
            }
        }
    }

    if (wants("website") && raw.website) {
        const host = websiteHost(raw.website);
        const page = host ? pages.find((p) => hostMatches(websiteHost(p.url), host)) : undefined;
        if (host && page && !isNotACompanySite(host)) {
            const label = host.split(".").slice(0, -1).join(" ");
            const tokens = normalizeText(ctx.name).split(" ").filter((t) => t.length > 2);
            const looksLikeName = tokens.some((t) => normalizeText(label).includes(t)) || tokenSimilarity(ctx.name, label) >= 0.4;
            const confidence = looksLikeName ? 82 : 58;
            out.push(draft("website", `https://${host}`, confidence, "inferred", page, page.title || null));
        }
    }

    if (wants("industry") && raw.industry && raw.industry.length >= 3 && raw.industry.length <= 80) {
        const { value, known } = canonicalIndustry(raw.industry, ctx.knownIndustries);
        const page = bestSourcePage(pages, ctx.name, ownHost);
        out.push(draft("industry", value, known ? 78 : 62, "inferred", page, null));
    }

    if (wants("country") && raw.country && raw.country.length <= 40) {
        const page = bestSourcePage(pages, ctx.name, ownHost);
        out.push(draft("country", frenchCountryName(raw.country), 75, "inferred", page, null));
    }

    if (wants("city") && raw.city && raw.city.length <= 60) {
        const wanted = normalizeText(raw.city);
        const page = pages.find((p) => normalizeText(p.text).includes(wanted));
        if (page) {
            const index = page.text.toLowerCase().indexOf(raw.city.toLowerCase());
            out.push(draft("city", raw.city, 72, "inferred", page, index >= 0 ? snippetAround(page.text, index, raw.city.length) : null));
        }
    }

    return out.filter((s) => s.confidence >= MIN_SUGGESTION_CONFIDENCE);
}

/**
 * One phone out of two independent sources (the AI web search and the Google
 * Places / Mapbox lookup). Agreement is the strongest signal we can get.
 */
export function reconcilePhone(
    ai: EnrichmentSuggestion | null,
    places: { phone: string; confidence: number; sourceUrl: string | null; sourceLabel: string } | null,
): EnrichmentSuggestion | null {
    const fromPlaces: EnrichmentSuggestion | null = places
        ? {
              field: "phone",
              value: places.phone,
              confidence: places.confidence,
              trust: "third_party",
              sourceUrl: places.sourceUrl,
              sourceLabel: places.sourceLabel,
              evidence: null,
              status: "PENDING",
          }
        : null;

    if (!ai) return fromPlaces;
    if (!fromPlaces) return ai;

    if (phoneKey(ai.value) === phoneKey(fromPlaces.value)) {
        return {
            ...ai,
            confidence: Math.min(99, Math.max(ai.confidence, fromPlaces.confidence) + 5),
            trust: "multi_source",
            evidence: `Confirmé par deux sources (${ai.sourceLabel ?? "web"} et ${fromPlaces.sourceLabel ?? "annuaire"})`,
        };
    }

    const winner = fromPlaces.confidence > ai.confidence ? fromPlaces : ai;
    const other = winner === ai ? fromPlaces : ai;
    return { ...winner, evidence: [winner.evidence, `Autre numéro trouvé : ${other.value}`].filter(Boolean).join(" · ") };
}

// ─── Prompt & cache key ──────────────────────────────────────────────────────

export const ENRICHMENT_INSTRUCTIONS = [
    "Tu complètes la fiche d'une entreprise B2B pour un commercial. Utilise la recherche web.",
    "Fais UNE recherche large (nom de l'entreprise + téléphone, site officiel, LinkedIn), puis une seconde seulement si une information clé manque. Jamais plus de 2 recherches.",
    "Privilégie le site officiel de l'entreprise et sa page contact.",
    "Ne devine JAMAIS : si une information n'est pas explicitement trouvée dans les sources, mets null.",
    "Réponds UNIQUEMENT avec un objet JSON, sans aucun texte autour.",
    "Règles par champ :",
    "- phone : standard ou numéro de contact principal de l'entreprise (jamais un numéro personnel), format international.",
    "- linkedin : URL de la page ENTREPRISE (linkedin.com/company/...), jamais un profil de personne.",
    "- website : site officiel de l'entreprise (pas un annuaire ni un réseau social).",
    "- industry : secteur d'activité en 1 à 4 mots, en français ; réutilise l'un des secteurs déjà utilisés s'il convient.",
    "- country : nom du pays en français. city : ville de l'établissement principal.",
].join("\n");

const FIELD_HINTS: Record<EnrichableField, string> = {
    phone: "téléphone du standard",
    industry: "secteur d'activité",
    country: "pays",
    city: "ville",
    linkedin: "page LinkedIn entreprise",
    website: "site web officiel",
};

export function buildEnrichmentInput(ctx: EnrichmentContext & { emailDomains: string[] }): string {
    const lines = [
        `Entreprise : ${ctx.name}`,
        ctx.website ? `Site web connu : ${ctx.website}` : "Site web : inconnu",
        ctx.country ? `Pays connu : ${ctx.country}` : null,
        ctx.emailDomains.length > 0 ? `Domaines email de ses contacts (indice pour trouver le site) : ${ctx.emailDomains.join(", ")}` : null,
        ctx.knownIndustries.length > 0 ? `Secteurs déjà utilisés dans cette liste : ${ctx.knownIndustries.join(" ; ")}` : null,
        `Informations à trouver : ${ctx.requested.map((f) => `${f} (${FIELD_HINTS[f]})`).join(", ")}`,
        `Format de réponse : {${ctx.requested.map((f) => `"${f}": ...`).join(", ")}}`,
    ];
    return lines.filter(Boolean).join("\n");
}

/** Cache key: the same company asked for the same fields is not searched twice. */
export function buildEnrichmentHash(ctx: Pick<EnrichmentContext, "name" | "website" | "country" | "requested">): string {
    return createHash("sha256")
        .update(
            JSON.stringify({
                name: normalizeText(ctx.name),
                website: websiteHost(ctx.website),
                country: normalizeText(ctx.country),
                requested: [...ctx.requested].sort(),
            }),
        )
        .digest("hex");
}
