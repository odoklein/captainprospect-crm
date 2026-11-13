import {
    companyKeys,
    hasAnyKey,
    type CompanyLike,
    type ExclusionKeys,
} from "./matching";

/**
 * Bulk blacklist upload — the pure half.
 *
 * Turns the rows of an uploaded file into rules and decides, row by row, what
 * becomes of each one. No database access, so the decisions are unit tested
 * (npm run test:exclusions); service.ts does the writing.
 *
 * Only company-level rules come out of an import: a spreadsheet of "sociétés à
 * ne plus appeler" carries a name, a site and a switchboard, not the people.
 */

/** Hard cap per upload — keeps the request body and the history row bounded. */
export const MAX_IMPORT_ROWS = 5_000;

export interface ImportRowInput {
    companyName?: string | null;
    website?: string | null;
    phone?: string | null;
}

/**
 * What became of a row:
 *  - CREATED: a new rule was written.
 *  - DUPLICATE_IN_FILE: an earlier line of the same file already says the same thing.
 *  - ALREADY_EXCLUDED: an active rule of the same scope already carries these keys.
 *  - UNUSABLE: no usable name, website or phone ("SAS", "n/a", empty line).
 */
export type ImportRowStatus = "CREATED" | "DUPLICATE_IN_FILE" | "ALREADY_EXCLUDED" | "UNUSABLE";

export interface PreparedImportRow {
    /** 1-based position in the data rows, so a manager can find the line in their file. */
    line: number;
    input: ImportRowInput;
    keys: ExclusionKeys;
    /** What humans see in the journal. */
    label: string;
    status: ImportRowStatus;
}

function clean(value: string | null | undefined): string {
    return (value ?? "").trim();
}

/** Two rules say the same thing when they carry the same three keys. */
export function ruleSignature(keys: Pick<ExclusionKeys, "companyNameKey" | "domainKey" | "phoneKey">): string {
    return `${keys.companyNameKey ?? ""}|${keys.domainKey ?? ""}|${keys.phoneKey ?? ""}`;
}

/**
 * Classify every row. `existing` holds the keys of the active company rules
 * already in this scope; rows that repeat one are reported, not duplicated.
 */
export function prepareImportRows(
    rows: ImportRowInput[],
    existing: Array<Pick<ExclusionKeys, "companyNameKey" | "domainKey" | "phoneKey">> = []
): PreparedImportRow[] {
    const known = new Set(existing.map(ruleSignature));
    const seenInFile = new Set<string>();

    return rows.map((raw, index) => {
        const companyName = clean(raw.companyName) || null;
        const website = clean(raw.website) || null;
        const phone = clean(raw.phone) || null;
        const input: ImportRowInput = { companyName, website, phone };

        const company: CompanyLike = { name: companyName, website, phone };
        const keys = companyKeys(company);
        const label = input.companyName || input.website || input.phone || "(vide)";
        const base = { line: index + 1, input, keys, label };

        if (!hasAnyKey(keys)) return { ...base, status: "UNUSABLE" as const };

        const signature = ruleSignature(keys);
        if (seenInFile.has(signature)) return { ...base, status: "DUPLICATE_IN_FILE" as const };
        seenInFile.add(signature);

        if (known.has(signature)) return { ...base, status: "ALREADY_EXCLUDED" as const };
        return { ...base, status: "CREATED" as const };
    });
}

export function summarizeImport(prepared: PreparedImportRow[]) {
    const count = (status: ImportRowStatus) => prepared.filter((row) => row.status === status).length;
    return {
        total: prepared.length,
        created: count("CREATED"),
        duplicates: count("DUPLICATE_IN_FILE") + count("ALREADY_EXCLUDED"),
        rejected: count("UNUSABLE"),
    };
}

// ============================================
// INDEXED MATCHING
// ============================================

/**
 * Rules looked up by key. Matching a company against thousands of imported
 * rules one `find` at a time is rules x companies; an index makes it three map
 * lookups per company, with the same "any key is enough" meaning as
 * ruleMatches() for COMPANY rules.
 */
export interface CompanyRuleIndex {
    byName: Map<string, string>;
    byDomain: Map<string, string>;
    byPhone: Map<string, string>;
}

export function buildCompanyRuleIndex(
    rules: Array<{ id: string } & Pick<ExclusionKeys, "companyNameKey" | "domainKey" | "phoneKey">>
): CompanyRuleIndex {
    const index: CompanyRuleIndex = { byName: new Map(), byDomain: new Map(), byPhone: new Map() };

    for (const rule of rules) {
        // First rule wins, like the stamping elsewhere: the earliest rule that
        // caught a company stays the one shown on it.
        if (rule.companyNameKey && !index.byName.has(rule.companyNameKey)) {
            index.byName.set(rule.companyNameKey, rule.id);
        }
        if (rule.domainKey && !index.byDomain.has(rule.domainKey)) {
            index.byDomain.set(rule.domainKey, rule.id);
        }
        if (rule.phoneKey && !index.byPhone.has(rule.phoneKey)) {
            index.byPhone.set(rule.phoneKey, rule.id);
        }
    }

    return index;
}

/** The id of the rule that recognises this company, if any. */
export function findRuleIdForCompany(index: CompanyRuleIndex, company: CompanyLike): string | null {
    const keys = companyKeys(company);
    return (
        (keys.companyNameKey && index.byName.get(keys.companyNameKey)) ||
        (keys.domainKey && index.byDomain.get(keys.domainKey)) ||
        (keys.phoneKey && index.byPhone.get(keys.phoneKey)) ||
        null
    );
}

// ============================================
// FILE COLUMNS
// ============================================

export type ImportField = keyof ImportRowInput;

/**
 * Which column of the uploaded file holds what, guessed from the header. French
 * and English headers both appear in the files clients send; the user can
 * always correct the guess in the dialog.
 */
const HEADER_HINTS: Record<ImportField, RegExp> = {
    companyName: /^(soci[eé]t[eé]s?|entreprises?|raison\s*sociale|nom(\s*(de\s*(la\s*)?)?(soci[eé]t[eé]|entreprise))?|company(\s*name)?|name|organi[sz]ation)$/i,
    website: /^(site(\s*web)?|web(site)?|url|domaine?|domain|site\s*internet)$/i,
    phone: /^(t[eé]l([eé]phone)?(\s*(fixe|standard|soci[eé]t[eé]))?|standard|phone(\s*number)?|mobile|num[eé]ro)$/i,
};

function normalizeHeader(value: string): string {
    return value.replace(/^﻿/, "").replace(/[._-]+/g, " ").trim();
}

export function guessColumns(headers: string[]): Partial<Record<ImportField, string>> {
    const guess: Partial<Record<ImportField, string>> = {};
    const taken = new Set<string>();

    for (const field of Object.keys(HEADER_HINTS) as ImportField[]) {
        const match = headers.find((header) => !taken.has(header) && HEADER_HINTS[field].test(normalizeHeader(header)));
        if (match) {
            guess[field] = match;
            taken.add(match);
        }
    }

    return guess;
}
