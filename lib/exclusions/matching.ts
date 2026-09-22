/**
 * How an exclusion rule recognises a prospect.
 *
 * Everything here is pure and has no database access, so the rules can be unit
 * tested (npm run test:exclusions) and reused identically by the SDR queue, the
 * CSV import and the manager console — the three places that must never
 * disagree on whether a company is excluded.
 *
 * The keys are deliberately fuzzier than the import dedup keys in
 * lib/import/dedup.ts. Dedup asks "is this the same row?", which must stay
 * strict or imports start merging distinct companies. An exclusion asks
 * "is this the company that told us to stop calling?", where a missed match is
 * a compliance problem and a false match only costs one prospect. The two
 * normalizers are therefore kept separate on purpose — do not collapse them.
 */

/**
 * Legal forms stripped from company names: "BRAND TO DESIGN SAS" and
 * "Brand To Design" must produce the same key, or a re-import under a slightly
 * different label walks straight past the rule.
 */
const LEGAL_SUFFIXES = [
    "sas",
    "sasu",
    "sarl",
    "eurl",
    "sa",
    "sci",
    "scop",
    "snc",
    "sagl",
    "gie",
    "asso",
    "association",
    "ltd",
    "limited",
    "llc",
    "inc",
    "corp",
    "gmbh",
    "bv",
    "nv",
    "srl",
    "spa",
    "plc",
    "ag",
];

/**
 * Mailbox providers whose domain says nothing about an employer. Excluding
 * "contact@gmail.com" by domain would blacklist every Gmail address in the
 * database, so a free-mail domain never becomes a domainKey.
 */
const FREE_MAIL_DOMAINS = new Set([
    "gmail.com",
    "googlemail.com",
    "yahoo.com",
    "yahoo.fr",
    "hotmail.com",
    "hotmail.fr",
    "outlook.com",
    "outlook.fr",
    "live.com",
    "live.fr",
    "msn.com",
    "aol.com",
    "icloud.com",
    "me.com",
    "free.fr",
    "orange.fr",
    "wanadoo.fr",
    "sfr.fr",
    "laposte.net",
    "bbox.fr",
    "numericable.fr",
    "protonmail.com",
    "proton.me",
    "gmx.com",
    "gmx.fr",
    "yandex.com",
    "mail.com",
]);

function stripAccents(value: string): string {
    return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Normalized company name. Accents, case, punctuation and legal form are all
 * noise here: "Brand To Design", "BRAND TO DESIGN SAS" and "brand-to-design"
 * all collapse to "brand to design".
 */
export function companyNameKey(value: string | null | undefined): string | null {
    if (!value) return null;

    let normalized = stripAccents(value)
        .toLowerCase()
        // Glue dotted acronyms back together first: "s.a.s." would otherwise
        // shatter into "s a s" and stop looking like a legal form at all.
        .replace(/(?:\b[a-z]\.){2,}/g, (match) => match.replace(/\./g, ""))
        // Keep intra-word marks out: "brand-to-design" -> "brand to design"
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");

    if (!normalized) return null;

    // Strip trailing legal forms, repeatedly: "foo sarl" and even "foo sa sarl".
    let changed = true;
    while (changed) {
        changed = false;
        for (const suffix of LEGAL_SUFFIXES) {
            if (normalized.endsWith(` ${suffix}`)) {
                normalized = normalized.slice(0, -(suffix.length + 1)).trim();
                changed = true;
            }
        }
    }

    // A name made only of a legal form ("SAS") is not identifying — refuse it
    // rather than return a key that would match half the database. The loop
    // above only strips a *trailing* form, so a bare one is caught here.
    if (LEGAL_SUFFIXES.includes(normalized)) return null;

    return normalized.length >= 2 ? normalized : null;
}

/**
 * Registrable domain from a website URL or an email address. Returns null for
 * free mailbox providers and for anything that is not a plausible host.
 */
export function domainKey(value: string | null | undefined): string | null {
    if (!value) return null;

    let raw = value.trim().toLowerCase();
    if (!raw) return null;

    // Email address -> its domain part
    if (raw.includes("@")) {
        raw = raw.slice(raw.lastIndexOf("@") + 1);
    } else {
        raw = raw
            .replace(/^[a-z][a-z0-9+.-]*:\/\//, "") // scheme
            .split("/")[0]
            .split("?")[0];
    }

    raw = raw.split(":")[0].replace(/^www\./, "").replace(/\.$/, "").trim();

    // Must look like host.tld with a sane TLD; rejects "localhost", "1", "n/a".
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(raw)) return null;
    if (FREE_MAIL_DOMAINS.has(raw)) return null;

    return raw;
}

/**
 * Country-agnostic phone key: the last 9 significant digits.
 *
 * "+33 6 12 34 56 78", "06 12 34 56 78" and "0033612345678" all reduce to
 * "612345678", so a rule created from one formatting still catches the others.
 * Shorter numbers (internal extensions, truncated data) keep their full digit
 * string, and anything under 6 digits is refused as non-identifying.
 */
export function phoneKey(value: string | null | undefined): string | null {
    if (!value) return null;

    const digits = value.replace(/\D/g, "");
    if (digits.length < 6) return null;

    return digits.length > 9 ? digits.slice(-9) : digits;
}

/** Full lowercased email; only a syntactically plausible one becomes a key. */
export function emailKey(value: string | null | undefined): string | null {
    if (!value) return null;

    const normalized = value.trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}

/** "Jean-Pierre Dupont" -> "jean pierre dupont". Only used alongside a company. */
export function contactNameKey(
    firstName: string | null | undefined,
    lastName: string | null | undefined
): string | null {
    const joined = `${firstName ?? ""} ${lastName ?? ""}`;
    const normalized = stripAccents(joined)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");

    return normalized.length >= 2 ? normalized : null;
}

// ============================================
// RULE KEYS
// ============================================

export interface ExclusionKeys {
    companyNameKey: string | null;
    domainKey: string | null;
    phoneKey: string | null;
    emailKey: string | null;
    contactNameKey: string | null;
}

export const EMPTY_KEYS: ExclusionKeys = {
    companyNameKey: null,
    domainKey: null,
    phoneKey: null,
    emailKey: null,
    contactNameKey: null,
};

export interface CompanyLike {
    name: string | null;
    website?: string | null;
    phone?: string | null;
}

export interface ContactLike {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    additionalEmails?: unknown;
    additionalPhones?: unknown;
}

/**
 * Keys for a COMPANY-target rule: identity of the company itself. The phone is
 * the company switchboard, never a contact's mobile — a personal number must
 * not become a company-wide match key.
 */
export function companyKeys(company: CompanyLike): ExclusionKeys {
    return {
        ...EMPTY_KEYS,
        companyNameKey: companyNameKey(company.name),
        domainKey: domainKey(company.website),
        phoneKey: phoneKey(company.phone),
    };
}

/**
 * Keys for a CONTACT-target rule. The company name is carried along so the
 * person is still recognised after a re-import gives them a new row id, and so
 * a namesake at another company is not caught by mistake.
 */
export function contactKeys(contact: ContactLike, company: CompanyLike | null): ExclusionKeys {
    return {
        companyNameKey: company ? companyNameKey(company.name) : null,
        domainKey: null,
        phoneKey: phoneKey(contact.phone),
        emailKey: emailKey(contact.email),
        contactNameKey: contactNameKey(contact.firstName, contact.lastName),
    };
}

/** True when a rule has at least one usable key; a rule without one is refused. */
export function hasAnyKey(keys: ExclusionKeys): boolean {
    return Boolean(
        keys.companyNameKey || keys.domainKey || keys.phoneKey || keys.emailKey || keys.contactNameKey
    );
}

// ============================================
// SCOPE AND LIFECYCLE
// ============================================

export interface RuleLike {
    scope: "GLOBAL" | "CLIENT" | "MISSION";
    scopeId: string | null;
    liftedAt?: Date | null;
    expiresAt?: Date | null;
}

export interface ProspectContext {
    clientId: string | null;
    missionId: string | null;
}

/** Does this rule apply to work being done for this client / mission? */
export function scopeCovers(rule: RuleLike, context: ProspectContext): boolean {
    switch (rule.scope) {
        case "GLOBAL":
            return true;
        case "CLIENT":
            return !!context.clientId && rule.scopeId === context.clientId;
        case "MISSION":
            return !!context.missionId && rule.scopeId === context.missionId;
        default:
            return false;
    }
}

/** Lifted rules and expired rules stop being enforced but are kept for audit. */
export function isRuleActive(rule: RuleLike, now: Date = new Date()): boolean {
    if (rule.liftedAt) return false;
    if (rule.expiresAt && rule.expiresAt.getTime() <= now.getTime()) return false;
    return true;
}

/**
 * Does an active rule recognise this prospect?
 *
 * ANY matching key is enough — that is what makes the rule survive a re-import
 * where, say, the website was dropped from the CSV but the name is intact.
 * A CONTACT rule additionally requires the company to line up when both sides
 * know it, so "Jean Dupont" at another company keeps being callable.
 */
export function ruleMatches(
    rule: RuleLike & ExclusionKeys & { target: "COMPANY" | "CONTACT" },
    candidate: ExclusionKeys
): boolean {
    if (rule.target === "CONTACT") {
        const sameCompany =
            !rule.companyNameKey ||
            !candidate.companyNameKey ||
            rule.companyNameKey === candidate.companyNameKey;
        if (!sameCompany) return false;

        return Boolean(
            (rule.emailKey && rule.emailKey === candidate.emailKey) ||
                (rule.phoneKey && rule.phoneKey === candidate.phoneKey) ||
                (rule.contactNameKey && rule.contactNameKey === candidate.contactNameKey)
        );
    }

    return Boolean(
        (rule.companyNameKey && rule.companyNameKey === candidate.companyNameKey) ||
            (rule.domainKey && rule.domainKey === candidate.domainKey) ||
            (rule.phoneKey && rule.phoneKey === candidate.phoneKey)
    );
}
