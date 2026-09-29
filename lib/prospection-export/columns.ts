/**
 * Rebuilds the client's original columns for a list.
 *
 * A CSV import stores, on List.importConfig.mappings, one entry per column of
 * the client's file in its original order ({ csvColumn, targetField }). Reading
 * that mapping backwards gives the file's layout; the values come from the
 * current Company / Contact rows, so corrections made by SDRs (a fixed email,
 * a new phone) flow into the deliverable.
 *
 * Columns mapped to "Ignorer" at import time were never stored: they cannot be
 * given back, and are reported so the manager knows.
 *
 * Lists that did not come from a file (Apollo, manual…) fall back to the
 * standard CRM fields plus every custom field found on their rows.
 */

import type { ExportCompany, ExportContact, ImportMapping, RowSource } from "./types";

export interface SourceColumn {
    header: string;
    get: (row: RowSource) => string;
}

export interface ResolvedColumns {
    columns: SourceColumn[];
    /** True when the layout comes from the client's file (import mapping). */
    fromOriginalFile: boolean;
    /** Columns of the client's file that were ignored at import (values not stored). */
    ignoredColumns: string[];
}

const COMPANY_STANDARD = ["name", "industry", "country", "website", "size", "phone"] as const;
const CONTACT_STANDARD = ["firstName", "lastName", "email", "phone", "title", "linkedin"] as const;
type CompanyStandard = (typeof COMPANY_STANDARD)[number];
type ContactStandard = (typeof CONTACT_STANDARD)[number];

/** Reserved customData keys handled as phones, never shown as custom fields. */
const RESERVED_CUSTOM_KEYS = new Set(["additionalPhones", "additionalEmails"]);

// ============================================
// VALUE HELPERS
// ============================================

export function formatCustomValue(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) return value.map(formatCustomValue).filter(Boolean).join(", ");
    try {
        return JSON.stringify(value);
    } catch {
        return "";
    }
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

/** Phones stored as a JSON array, or as a comma-separated string by older imports. */
export function toStringList(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map((v) => (typeof v === "string" ? v : formatCustomValue(v)).trim()).filter(Boolean);
    }
    if (typeof value === "string") {
        return value.split(/[,;]/).map((v) => v.trim()).filter(Boolean);
    }
    return [];
}

export function companyExtraPhones(company: ExportCompany): string[] {
    return toStringList(asRecord(company.customData).additionalPhones);
}

export function contactExtraPhones(contact: ExportContact | null): string[] {
    return contact ? toStringList(contact.additionalPhones) : [];
}

export function contactExtraEmails(contact: ExportContact | null): string[] {
    return contact ? toStringList(contact.additionalEmails) : [];
}

/**
 * Spread `values` over `slotCount` columns, one each; when there are more
 * values than columns, the last column takes the rest.
 */
export function distributeOverSlots(values: string[], slotCount: number): string[] {
    if (slotCount <= 0) return [];
    const out = Array.from({ length: slotCount }, (_, i) => values[i] ?? "");
    if (values.length > slotCount) {
        out[slotCount - 1] = values.slice(slotCount - 1).join(", ");
    }
    return out;
}

function customKeyHeader(key: string): string {
    return key.replace(/_/g, " ");
}

// ============================================
// MAPPING PARSING
// ============================================

/** Reads importConfig.mappings defensively (it is untyped JSON). */
export function readImportMappings(importConfig: unknown): ImportMapping[] | null {
    const raw = asRecord(importConfig).mappings;
    if (!Array.isArray(raw)) return null;
    const mappings: ImportMapping[] = [];
    for (const entry of raw) {
        const m = asRecord(entry);
        if (typeof m.csvColumn !== "string") continue;
        mappings.push({
            csvColumn: m.csvColumn,
            targetField: typeof m.targetField === "string" ? m.targetField : "",
        });
    }
    return mappings.some((m) => m.targetField) ? mappings : null;
}

export function readImportedAt(importConfig: unknown): Date | null {
    const raw = asRecord(importConfig).importedAt;
    if (typeof raw !== "string") return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
}

// ============================================
// RESOLUTION
// ============================================

function collectCustomKeys(companies: ExportCompany[]): { company: string[]; contact: string[] } {
    const company = new Set<string>();
    const contact = new Set<string>();
    for (const c of companies) {
        for (const k of Object.keys(asRecord(c.customData))) if (!RESERVED_CUSTOM_KEYS.has(k)) company.add(k);
        for (const ct of c.contacts) {
            for (const k of Object.keys(asRecord(ct.customData))) if (!RESERVED_CUSTOM_KEYS.has(k)) contact.add(k);
        }
    }
    return { company: [...company], contact: [...contact] };
}

function anyRow(companies: ExportCompany[], test: (company: ExportCompany, contact: ExportContact | null) => boolean): boolean {
    for (const c of companies) {
        if (c.contacts.length === 0) {
            if (test(c, null)) return true;
        } else {
            for (const ct of c.contacts) if (test(c, ct)) return true;
        }
    }
    return false;
}

export function resolveSourceColumns(mappings: ImportMapping[] | null, companies: ExportCompany[]): ResolvedColumns {
    const customKeys = collectCustomKeys(companies);

    if (!mappings) {
        return {
            columns: fallbackColumns(companies, customKeys),
            fromOriginalFile: false,
            ignoredColumns: [],
        };
    }

    const ignoredColumns: string[] = [];
    const columns: SourceColumn[] = [];
    const coveredCompanyKeys = new Set<string>();
    const coveredContactKeys = new Set<string>();

    // Phone columns. The import stores the first "contact.phone" column as the
    // contact's phone, then pushes additionalPhones columns followed by any
    // further phone columns into contact.additionalPhones — slots are filled
    // back in that same order.
    let seenContactPhone = false;
    let seenCompanyPhone = false;
    const contactExtraSlots: { order: number }[] = [];
    const companyExtraSlots: { order: number }[] = [];
    let contactAdditionalColumns = 0;
    let companyAdditionalColumns = 0;
    for (const m of mappings) {
        if (m.targetField === "contact.additionalPhones") contactAdditionalColumns++;
        if (m.targetField === "company.additionalPhones") companyAdditionalColumns++;
    }
    let contactAdditionalSeen = 0;
    let contactExtraPhoneSeen = 0;
    let companyAdditionalSeen = 0;
    let companyExtraPhoneSeen = 0;

    for (const m of mappings) {
        const target = m.targetField;
        const header = m.csvColumn;
        if (!target || target.startsWith("__")) {
            if (header.trim()) ignoredColumns.push(header);
            continue;
        }
        const dot = target.indexOf(".");
        const entity = target.slice(0, dot);
        const field = target.slice(dot + 1);

        if (entity === "company") {
            if (field === "phone" && !seenCompanyPhone) {
                seenCompanyPhone = true;
                columns.push({ header, get: (r) => r.company.phone ?? "" });
            } else if (field === "additionalPhones" || field === "phone") {
                const order = field === "additionalPhones"
                    ? companyAdditionalSeen++
                    : companyAdditionalColumns + companyExtraPhoneSeen++;
                const slot = { order };
                companyExtraSlots.push(slot);
                columns.push({
                    header,
                    get: (r) => distributeOverSlots(companyExtraPhones(r.company), companyExtraSlots.length)[slot.order] ?? "",
                });
            } else if ((COMPANY_STANDARD as readonly string[]).includes(field)) {
                const key = field as CompanyStandard;
                columns.push({ header, get: (r) => r.company[key] ?? "" });
            } else {
                coveredCompanyKeys.add(field);
                columns.push({ header, get: (r) => formatCustomValue(asRecord(r.company.customData)[field]) });
            }
            continue;
        }

        if (entity === "contact") {
            if (field === "phone" && !seenContactPhone) {
                seenContactPhone = true;
                columns.push({ header, get: (r) => r.contact?.phone ?? "" });
            } else if (field === "additionalPhones" || field === "phone") {
                const order = field === "additionalPhones"
                    ? contactAdditionalSeen++
                    : contactAdditionalColumns + contactExtraPhoneSeen++;
                const slot = { order };
                contactExtraSlots.push(slot);
                columns.push({
                    header,
                    get: (r) => distributeOverSlots(contactExtraPhones(r.contact), contactExtraSlots.length)[slot.order] ?? "",
                });
            } else if ((CONTACT_STANDARD as readonly string[]).includes(field)) {
                const key = field as ContactStandard;
                columns.push({ header, get: (r) => (r.contact ? r.contact[key] ?? "" : "") });
            } else {
                coveredContactKeys.add(field);
                columns.push({ header, get: (r) => formatCustomValue(asRecord(r.contact?.customData)[field]) });
            }
            continue;
        }

        // Unknown entity prefix: keep the column so the layout stays intact.
        columns.push({ header, get: () => "" });
    }

    // Data that exists on the rows but not in the original file: fields added
    // by a later import into the same list, or numbers found by the SDRs.
    for (const key of customKeys.company) {
        if (coveredCompanyKeys.has(key)) continue;
        columns.push({ header: customKeyHeader(key), get: (r) => formatCustomValue(asRecord(r.company.customData)[key]) });
    }
    for (const key of customKeys.contact) {
        if (coveredContactKeys.has(key)) continue;
        columns.push({ header: customKeyHeader(key), get: (r) => formatCustomValue(asRecord(r.contact?.customData)[key]) });
    }
    if (companyExtraSlots.length === 0 && anyRow(companies, (c) => companyExtraPhones(c).length > 0)) {
        columns.push({ header: "Autres téléphones société", get: (r) => companyExtraPhones(r.company).join(", ") });
    }
    if (contactExtraSlots.length === 0 && anyRow(companies, (_c, ct) => contactExtraPhones(ct).length > 0)) {
        columns.push({ header: "Autres téléphones contact", get: (r) => contactExtraPhones(r.contact).join(", ") });
    }
    if (anyRow(companies, (_c, ct) => contactExtraEmails(ct).length > 0)) {
        columns.push({ header: "Autres emails contact", get: (r) => contactExtraEmails(r.contact).join(", ") });
    }

    return { columns, fromOriginalFile: true, ignoredColumns };
}

function fallbackColumns(companies: ExportCompany[], customKeys: { company: string[]; contact: string[] }): SourceColumn[] {
    const columns: SourceColumn[] = [
        { header: "Société", get: (r) => r.company.name },
        { header: "Secteur", get: (r) => r.company.industry ?? "" },
        { header: "Pays", get: (r) => r.company.country ?? "" },
        { header: "Site web", get: (r) => r.company.website ?? "" },
        { header: "Taille", get: (r) => r.company.size ?? "" },
        { header: "Téléphone société", get: (r) => r.company.phone ?? "" },
    ];
    if (anyRow(companies, (c) => companyExtraPhones(c).length > 0)) {
        columns.push({ header: "Autres téléphones société", get: (r) => companyExtraPhones(r.company).join(", ") });
    }
    for (const key of customKeys.company) {
        columns.push({ header: customKeyHeader(key), get: (r) => formatCustomValue(asRecord(r.company.customData)[key]) });
    }
    columns.push(
        { header: "Prénom", get: (r) => r.contact?.firstName ?? "" },
        { header: "Nom", get: (r) => r.contact?.lastName ?? "" },
        { header: "Fonction", get: (r) => r.contact?.title ?? "" },
        { header: "Email", get: (r) => r.contact?.email ?? "" },
        { header: "Téléphone", get: (r) => r.contact?.phone ?? "" },
        { header: "LinkedIn", get: (r) => r.contact?.linkedin ?? "" },
    );
    if (anyRow(companies, (_c, ct) => contactExtraPhones(ct).length > 0)) {
        columns.push({ header: "Autres téléphones contact", get: (r) => contactExtraPhones(r.contact).join(", ") });
    }
    if (anyRow(companies, (_c, ct) => contactExtraEmails(ct).length > 0)) {
        columns.push({ header: "Autres emails contact", get: (r) => contactExtraEmails(r.contact).join(", ") });
    }
    for (const key of customKeys.contact) {
        columns.push({ header: customKeyHeader(key), get: (r) => formatCustomValue(asRecord(r.contact?.customData)[key]) });
    }
    return columns;
}
