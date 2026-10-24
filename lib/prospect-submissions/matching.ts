/**
 * Duplicate and blacklist checks for a company/contact an SDR wants to add.
 *
 * Pure, no database access (npm run test:prospect-submissions). The keys come
 * from lib/exclusions/matching.ts on purpose: the question here is the same
 * fuzzy one an exclusion asks ("is this the company we already have?"), and a
 * missed match means the same company gets called twice — exactly what JF
 * wanted to prevent when SDRs are allowed to add rows.
 */

import {
    companyKeys,
    companyNameKey,
    contactKeys,
    domainKey,
    emailKey,
    isRuleActive,
    phoneKey,
    ruleMatches,
    scopeCovers,
    type ExclusionKeys,
    type ProspectContext,
    type RuleLike,
} from "@/lib/exclusions/matching";
import type { ProspectCompanyInput, ProspectContactInput, ProspectCreationMode } from "./types";

// ============================================
// INPUT ROWS (what the service loads from the mission)
// ============================================

export interface MissionCompanyRow {
    id: string;
    name: string;
    website: string | null;
    phone: string | null;
    additionalPhones?: string[] | null;
    listId: string;
    listName: string;
}

export interface MissionContactRow {
    id: string;
    companyId: string;
    companyName: string;
    listName: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
}

export interface PendingRowLike {
    id: string;
    sdrName: string;
    createdAt: string;
    company: ProspectCompanyInput;
    contact: ProspectContactInput | null;
    existingCompanyId: string | null;
}

export interface ProspectCandidate {
    company: ProspectCompanyInput;
    contact: ProspectContactInput | null;
    /** Adding a contact to a company already in the base: company checks are skipped. */
    existingCompanyId?: string | null;
}

export type DuplicateReason = "PHONE" | "DOMAIN" | "NAME" | "EMAIL" | "CONTACT_PHONE";

export const DUPLICATE_REASON_LABELS: Record<DuplicateReason, string> = {
    PHONE: "même téléphone",
    DOMAIN: "même site web",
    NAME: "même nom",
    EMAIL: "même e-mail",
    CONTACT_PHONE: "même numéro de contact",
};

export interface DuplicateMatch {
    kind: "COMPANY" | "CONTACT" | "PENDING";
    reason: DuplicateReason;
    /** Company id for COMPANY / CONTACT, submission id for PENDING. */
    id: string;
    companyId: string | null;
    contactId: string | null;
    label: string;
    listName: string | null;
    /** PENDING only: who proposed it and when. */
    sdrName?: string;
    createdAt?: string;
}

// ============================================
// KEYS
// ============================================

interface CandidateKeys {
    name: string | null;
    domains: Set<string>;
    companyPhone: string | null;
    contactPhone: string | null;
    email: string | null;
}

function candidateKeys(candidate: ProspectCandidate): CandidateKeys {
    const domains = new Set<string>();
    const fromSite = domainKey(candidate.company.website);
    if (fromSite) domains.add(fromSite);
    // A work email names the employer: "j.martin@cabinet-martin.fr" is
    // cabinet-martin.fr even when the SDR left the website empty.
    const fromEmail = domainKey(candidate.contact?.email);
    if (fromEmail) domains.add(fromEmail);

    return {
        name: companyNameKey(candidate.company.name),
        domains,
        companyPhone: phoneKey(candidate.company.phone),
        contactPhone: phoneKey(candidate.contact?.phone),
        email: emailKey(candidate.contact?.email),
    };
}

function companyPhoneKeys(row: { phone: string | null; additionalPhones?: string[] | null }): Set<string> {
    const keys = new Set<string>();
    for (const value of [row.phone, ...(row.additionalPhones ?? [])]) {
        const key = phoneKey(value);
        if (key) keys.add(key);
    }
    return keys;
}

/** The strongest reason a company row is the candidate company, or null. */
function companyMatchReason(keys: CandidateKeys, row: MissionCompanyRow): DuplicateReason | null {
    const phones = companyPhoneKeys(row);
    // A contact's direct line sitting on a company switchboard is the same firm too.
    if ((keys.companyPhone && phones.has(keys.companyPhone)) || (keys.contactPhone && phones.has(keys.contactPhone))) {
        return "PHONE";
    }
    const rowDomain = domainKey(row.website);
    if (rowDomain && keys.domains.has(rowDomain)) return "DOMAIN";
    if (keys.name && companyNameKey(row.name) === keys.name) return "NAME";
    return null;
}

function contactMatchReason(keys: CandidateKeys, row: MissionContactRow): DuplicateReason | null {
    if (keys.email && emailKey(row.email) === keys.email) return "EMAIL";
    if (keys.contactPhone && phoneKey(row.phone) === keys.contactPhone) return "CONTACT_PHONE";
    return null;
}

const REASON_RANK: Record<DuplicateReason, number> = {
    EMAIL: 0,
    CONTACT_PHONE: 1,
    PHONE: 2,
    DOMAIN: 3,
    NAME: 4,
};

function contactLabel(row: { firstName: string | null; lastName: string | null }): string {
    return [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || "Contact sans nom";
}

// ============================================
// DUPLICATES
// ============================================

/**
 * Every row of the mission that is already this prospect, strongest first.
 * Any match blocks the creation: the SDR is shown the existing row instead.
 */
export function findDuplicates(
    candidate: ProspectCandidate,
    companies: MissionCompanyRow[],
    contacts: MissionContactRow[],
    pending: PendingRowLike[] = [],
): DuplicateMatch[] {
    const keys = candidateKeys(candidate);
    const matches: DuplicateMatch[] = [];
    const addingToExisting = !!candidate.existingCompanyId;

    // The person is already in the base, whatever company they were filed under.
    if (candidate.contact) {
        for (const row of contacts) {
            const reason = contactMatchReason(keys, row);
            if (!reason) continue;
            matches.push({
                kind: "CONTACT",
                reason,
                id: row.companyId,
                companyId: row.companyId,
                contactId: row.id,
                label: `${contactLabel(row)} — ${row.companyName}`,
                listName: row.listName,
            });
        }
    }

    if (!addingToExisting) {
        for (const row of companies) {
            const reason = companyMatchReason(keys, row);
            if (!reason) continue;
            matches.push({
                kind: "COMPANY",
                reason,
                id: row.id,
                companyId: row.id,
                contactId: null,
                label: row.name,
                listName: row.listName,
            });
        }
    }

    for (const row of pending) {
        const rowKeys = candidateKeys({ company: row.company, contact: row.contact });
        let reason: DuplicateReason | null = null;
        if (keys.email && rowKeys.email === keys.email) reason = "EMAIL";
        else if (keys.contactPhone && rowKeys.contactPhone === keys.contactPhone) reason = "CONTACT_PHONE";
        else if (!addingToExisting && !row.existingCompanyId) {
            if (keys.companyPhone && rowKeys.companyPhone === keys.companyPhone) reason = "PHONE";
            else if ([...keys.domains].some((d) => rowKeys.domains.has(d))) reason = "DOMAIN";
            else if (keys.name && rowKeys.name === keys.name) reason = "NAME";
        }
        if (!reason) continue;
        matches.push({
            kind: "PENDING",
            reason,
            id: row.id,
            companyId: row.existingCompanyId,
            contactId: null,
            label: row.company.name,
            listName: null,
            sdrName: row.sdrName,
            createdAt: row.createdAt,
        });
    }

    // One entry per row, strongest reason first.
    const seen = new Set<string>();
    return matches
        .sort((a, b) => REASON_RANK[a.reason] - REASON_RANK[b.reason])
        .filter((m) => {
            const key = `${m.kind}:${m.contactId ?? m.id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

// ============================================
// BLACKLIST
// ============================================

export type ExclusionRuleRow = RuleLike &
    ExclusionKeys & { id: string; target: "COMPANY" | "CONTACT" };

/**
 * The active exclusion rule that refuses this prospect, or null. Same matching
 * as the SDR queue and the import (lib/exclusions/service.ts): a company rule
 * blocks the company and every contact in it; a contact rule only that person.
 */
export function findBlacklistHit(
    rules: ExclusionRuleRow[],
    candidate: ProspectCandidate,
    context: ProspectContext,
    now: Date = new Date(),
): ExclusionRuleRow | null {
    const live = rules.filter((rule) => isRuleActive(rule, now) && scopeCovers(rule, context));
    const company = { name: candidate.company.name, website: candidate.company.website, phone: candidate.company.phone };

    const companyCandidate = companyKeys(company);
    const companyHit = live.find(
        (rule) => rule.target === "COMPANY" && ruleMatches({ ...rule, target: "COMPANY" }, companyCandidate),
    );
    if (companyHit) return companyHit;

    if (!candidate.contact) return null;
    const contactCandidate = contactKeys(candidate.contact, company);
    return (
        live.find(
            (rule) => rule.target === "CONTACT" && ruleMatches({ ...rule, target: "CONTACT" }, contactCandidate),
        ) ?? null
    );
}

// ============================================
// DECISION
// ============================================

export type ProspectOutcome = "DISABLED" | "BLACKLISTED" | "DUPLICATE" | "CREATE" | "QUEUE";

/** What happens to a submission. Blacklist and duplicates win over every mode. */
export function decideOutcome(
    mode: ProspectCreationMode,
    duplicates: DuplicateMatch[],
    blacklistHit: unknown,
): ProspectOutcome {
    if (mode === "OFF") return "DISABLED";
    if (blacklistHit) return "BLACKLISTED";
    if (duplicates.length > 0) return "DUPLICATE";
    return mode === "DIRECT" ? "CREATE" : "QUEUE";
}

// ============================================
// COMPLETENESS (same rule as POST /api/contacts)
// ============================================

export type Completeness = "INCOMPLETE" | "PARTIAL" | "ACTIONABLE";

export function contactCompleteness(contact: ProspectContactInput): Completeness {
    const hasChannel = !!(contact.phone || contact.email);
    const hasName = !!(contact.firstName || contact.lastName);
    if (hasChannel && hasName) return "ACTIONABLE";
    if (hasChannel || hasName) return "PARTIAL";
    return "INCOMPLETE";
}

/**
 * A company with no contact is still callable on its switchboard (the SDR
 * queue lists companies without contacts), so a phone alone makes it ACTIONABLE.
 */
export function companyCompleteness(
    company: ProspectCompanyInput,
    contactStatuses: Completeness[],
): Completeness {
    if (contactStatuses.includes("ACTIONABLE")) return "ACTIONABLE";
    if (company.phone && phoneKey(company.phone)) return "ACTIONABLE";
    if (contactStatuses.includes("PARTIAL")) return "PARTIAL";
    return "INCOMPLETE";
}
