// ============================================
// MARKET CLASSIFY — reads the agency's free-text company and contact fields
// (industry, size, job title, NAF code) into the brief's criteria: NAF sections
// (SECTORS), headcount groups (SIZES) and role families.
//
// One table per criterion drives both sides: the TypeScript functions below
// (tested) and the SQL CASE expressions built from the same patterns in
// market-counts.ts, so the counter and these tests cannot drift apart.
// Patterns run on folded text (no accents, lower case) and stay inside the
// regex subset JavaScript and PostgreSQL share; `\b` becomes `\y` in SQL.
//
//   npx tsx --test lib/onboarding/market-classify.test.ts
// ============================================

import { SIZES } from "@/lib/client-onboarding/questionnaire";

/** Accented capitals and ligatures folded one character each (same strings feed SQL translate()). */
export const FOLD_FROM = "ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñŒœÆæ’";
export const FOLD_TO = "AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnOoAa'";

export function foldText(value: string | null | undefined): string {
    if (!value) return "";
    let out = "";
    for (const ch of value) {
        const i = FOLD_FROM.indexOf(ch);
        out += i >= 0 ? FOLD_TO[i] : ch;
    }
    return out.toLowerCase();
}

// ── Roles ─────────────────────────────────────────────────────────────────────

export const ROLE_FAMILIES = [
    { key: "commercial", label: "Commercial", pattern: "commercia|\\bsales\\b|\\bventes?\\b|business develop|\\bbiz ?dev|account (executive|manager)|key account|\\bkam\\b|grands? comptes|chief revenue|\\bcro\\b|revenue" },
    { key: "marketing", label: "Marketing & communication", pattern: "marketing|\\bcmo\\b|communication|\\bbrand|growth" },
    { key: "achats", label: "Achats", pattern: "achat|acheteu|purchas|procurement|approvisionn|\\bbuyer" },
    { key: "finance", label: "Finance", pattern: "\\bdaf\\b|\\braf\\b|\\bcfo\\b|financ|comptab|tresor|controle(ur)? de gestion|accounting|\\baccountant" },
    { key: "rh", label: "Ressources humaines", pattern: "\\bdrh\\b|\\brh\\b|ressources humaines|human resources|\\bhr\\b|\\bpeople\\b|talent|recrut|\\bpaie\\b|payroll" },
    { key: "it", label: "Informatique & digital", pattern: "\\bdsi\\b|\\bcto\\b|\\bcio\\b|informati|systemes? d.information|\\bit\\b|infrastructure|devops|developpe|software|\\bdata\\b|digital|numerique" },
    { key: "projet", label: "Gestion de projet", pattern: "chef de projet|project manager|\\bpmo\\b|program(me)? manager" },
    { key: "admin", label: "Administration & services généraux", pattern: "office manager|services? generaux|assistant|administrati|secretaire|facility" },
    { key: "operations", label: "Opérations & production", pattern: "operation|\\bcoo\\b|production|usine|\\bsite\\b|industriel|supply|logisti|maintenance|qualite|\\bqhse\\b|\\bhse\\b|\\brse\\b|technique|technical|travaux|exploitation|methodes" },
    { key: "direction", label: "Direction générale", pattern: "\\bceo\\b|\\bpdg\\b|p-dg|president|fondat|founder|gerant|dirigeant|directeur general|directrice generale|\\bdg\\b|managing director|general manager|\\bowner\\b|\\bassocie|directeur d.agence|directrice d.agence" },
] as const;
export type RoleKey = (typeof ROLE_FAMILIES)[number]["key"];
export const ROLE_KEYS = ROLE_FAMILIES.map((r) => r.key) as RoleKey[];
/** Juniors are contacts, not decision-makers. */
export const NOT_DECIDER = "stagiaire|alternan|apprenti|\\bintern\\b|internship|trainee";

const jsRe = (pattern: string) => new RegExp(pattern, "i");
const ROLE_RE = ROLE_FAMILIES.map((r) => ({ key: r.key, re: jsRe(r.pattern) }));
const NOT_DECIDER_RE = jsRe(NOT_DECIDER);

/** Job title → role family, or null when it is not a decision-maker title we recognise. */
export function roleFamilyOf(title: string | null | undefined): RoleKey | null {
    const t = foldText(title);
    if (!t.trim() || NOT_DECIDER_RE.test(t)) return null;
    return ROLE_RE.find((r) => r.re.test(t))?.key ?? null;
}

/** The families behind the titles a client picked ("DAF", "Directeur commercial"…). */
export function roleFamiliesFor(titles: readonly string[]): RoleKey[] {
    const keys = new Set<RoleKey>();
    for (const title of titles) {
        const key = roleFamilyOf(title);
        if (key) keys.add(key);
    }
    return ROLE_KEYS.filter((k) => keys.has(k));
}

// ── Sectors ───────────────────────────────────────────────────────────────────

/** NAF rév. 2 divisions → section (INSEE). */
export const NAF_SECTIONS: readonly [section: string, from: number, to: number][] = [
    ["A", 1, 3], ["B", 5, 9], ["C", 10, 33], ["D", 35, 35], ["E", 36, 39], ["F", 41, 43], ["G", 45, 47], ["H", 49, 53],
    ["I", 55, 56], ["J", 58, 63], ["K", 64, 66], ["L", 68, 68], ["M", 69, 75], ["N", 77, 82], ["O", 84, 84], ["P", 85, 85],
    ["Q", 86, 88], ["R", 90, 93], ["S", 94, 96], ["T", 97, 98], ["U", 99, 99],
];

/** "62.01Z", "6201Z", "62" → "J". */
export function sectionOfNaf(code: string | null | undefined): string | null {
    const m = code?.match(/^\s*(\d{2})/);
    if (!m) return null;
    const division = Number(m[1]);
    return NAF_SECTIONS.find(([, from, to]) => division >= from && division <= to)?.[0] ?? null;
}

/**
 * Industry text (CSV, Apollo, Google Maps categories; French or English) → section.
 * First match wins, so the specific domains (health-tech, fintech…) come before Tech.
 */
export const SECTOR_PATTERNS: readonly { key: string; pattern: string }[] = [
    { key: "Q", pattern: "sante|health|medic|hopital|hospital(s)?\\b|clinique|clinic|pharma|biotech|medtech|laboratoire|dentaire|dental|infirmi|ehpad|medico.social|\\bsoins\\b|veterinai|optique|optician|radiolog|kine" },
    { key: "K", pattern: "banque|\\bbank|assuran|insurance|courtier|mutuelle|\\bcredit|financial services|fintech|investiss|investment|capital|asset management|patrimoine|private equity|venture" },
    { key: "L", pattern: "immobili|real estate|proptech|promoteur|syndic de|property|fonciere" },
    { key: "P", pattern: "enseignement|education|\\bformation|training|\\becole|school|universit|edtech|e-?learning" },
    { key: "J", pattern: "logiciel|software|saas|informati|numerique|digital|internet|\\bweb|\\btech\\b|technolog|telecom|\\bmedia|\\bedition|publishing|jeux? video|video games?|audiovisuel|broadcast|cloud|cyber|\\bdata\\b|\\besn\\b|\\bssii\\b|computer|radio|television|presse|newspaper|cinema|\\bfilm|motion picture" },
    { key: "I", pattern: "hotel|restaura|hospitality|food service|traiteur|catering|\\bcafe\\b|brasserie|tourism|camping" },
    { key: "H", pattern: "transport|logisti|supply chain|freight|\\bfret\\b|messagerie|livraison|delivery|demenag|shipping|maritime|aerien|airline|aviation|trucking|entreposage|warehous|courier|expedition|\\bcolis\\b|\\btaxi\\b|\\bvtc\\b" },
    { key: "D", pattern: "energie|energy|electricite|electricity|photovolta|solaire|\\bsolar|eolien|\\bwind\\b|petrol|\\boil\\b|\\bgaz\\b|\\bgas\\b|nucleaire|nuclear|renouvelable|renewable|utilities" },
    { key: "E", pattern: "dechet|waste|recycl|assainissement|\\beau\\b|\\bwater\\b|environnement|environmental|depollution" },
    { key: "G", pattern: "commerce|retail|distribution|grossiste|wholesale|negoce|magasin|boutique|import|export|supermarche|concession|\\bvente\\b" },
    { key: "A", pattern: "agricult|\\bagri|agro|farming|elevage|viticult|\\bvins?\\b|\\bwine|vignoble|alimentaire|food (&|and) beverage|food production|dairy|laitier|\\bpeche\\b|fishery|horticult|forestry|sylvicult" },
    { key: "F", pattern: "\\bbtp\\b|construction|batiment|travaux|genie civil|civil engineering|gros oeuvre|maconnerie|charpente|couvreur|couverture|plomb|electricien|chauffage|menuiserie|peinture|renovation|terrassement|isolation" },
    { key: "M", pattern: "conseil|consult|ingenierie|engineering|bureau d.etudes|expert(ise)?.comptable|accounting|audit|avocat|juridique|\\blegal\\b|\\blaw\\b|architect|\\bdesign|marketing|advertising|publicite|agence de communication|etudes de marche|market research|research|recherche" },
    { key: "N", pattern: "nettoyage|proprete|cleaning|securite|security|gardiennage|interim|travail temporaire|recrutement|staffing|recruiting|human resources|location|rental|leasing|facility|evenementiel|\\bevents?\\b|centre d.appels|call cent|outsourcing|externalisation" },
    { key: "R", pattern: "\\bsport|fitness|culture|musee|museum|spectacle|entertainment|musique|\\bmusic|\\barts?\\b|loisirs|leisure|recreation|casino|gaming" },
    { key: "C", pattern: "industri|manufactur|fabrica|usine|mecanique|mechanical|metallurg|plasturg|plastic|chimi|chemical|automobile|automotive|aeronauti|aerospace|electroni|machinery|machine|textile|imprimerie|printing|emballage|packaging|papier|\\bpaper|\\bbois\\b|verre|\\bglass|semiconduct|equipement|equipment|outillage" },
    { key: "S", pattern: "coiffure|beaute|beauty|esthetique|pressing|association|non-?profit|religious|reparation|repair|cordonnerie|services a la personne|funerai" },
];
const SECTOR_RE = SECTOR_PATTERNS.map((s) => ({ key: s.key, re: jsRe(s.pattern) }));

/** NAF code first (precise), then the industry text. */
export function sectorOf(company: { naf?: string | null; industry?: string | null }): string | null {
    const fromNaf = sectionOfNaf(company.naf);
    if (fromNaf) return fromNaf;
    const text = foldText(company.industry);
    return text.trim() ? SECTOR_RE.find((s) => s.re.test(text))?.key ?? null : null;
}

// ── Sizes ─────────────────────────────────────────────────────────────────────

export type SizeKey = (typeof SIZES)[number]["key"];

/** Headcount (geometric middle of a range) → SIZES group. */
export function sizeKeyOfHeadcount(n: number | null): SizeKey | null {
    if (n === null || !Number.isFinite(n) || n < 0) return null;
    if (n < 10) return "1-9";
    if (n < 50) return "10-49";
    if (n < 250) return "50-249";
    if (n < 1000) return "250-999";
    return "1000+";
}

/** Thousands separators inside a number ("1 001", "10.000") are dropped before reading. */
export const THOUSANDS_RE = "(\\d)[ ., ](\\d{3})";

/** "11-50" → 10-49, "51-200" → 50-249, "1 001-5 000" → 1000+, "20 à 49 salariés" → 10-49, "PME" → null. */
export function sizeKeyOf(raw: string | null | undefined): SizeKey | null {
    if (!raw) return null;
    const text = raw.toLowerCase().replace(new RegExp(THOUSANDS_RE, "g"), "$1$2");
    const numbers = text.match(/\d+/g)?.map(Number) ?? [];
    if (!numbers.length) return null;
    const [low, high] = numbers;
    return sizeKeyOfHeadcount(high !== undefined && high > low ? Math.sqrt(low * high) : low);
}

// ── Where a company is ────────────────────────────────────────────────────────

/** customData keys an import may use for the postcode, then for a full address. */
export const POSTCODE_KEY = "^(code[ _-]?postal|codepostal|cp|postal[ _-]?code|postcode|zip([ _-]?code)?)$";
export const ADDRESS_KEY = "^(adresse|address|adresse[ _-]?postale|adresse[ _-]?complete|full[ _-]?address)$";
export const NAF_KEY = "^(code[ _-]?naf|naf|code[ _-]?ape|ape|naf[ _-]?code)$";
export const SIZE_KEY = "^(effectifs?|headcount|employees|nb[ _-]?salaries|taille)$";
/** A company abroad stays off the map, even with a 4- or 5-digit postcode (Belgium, Switzerland…). */
export const FRANCE_NAMES = ["", "france", "fr", "fra", "france metropolitaine"];

export function isFranceOrUnknown(country: string | null | undefined): boolean {
    return FRANCE_NAMES.includes(foldText(country).trim());
}
