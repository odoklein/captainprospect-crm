// ============================================
// N2F "Base d'appels" (Excel sent by Hichem Hammouche on 2026-11-09) →
// companies and contacts ready to insert. Pure apart from readSheetRows.
//
// Columns: Compte | Contact | Fonction | Ligne directe | Mobile | Statut
// - phones arrive as "'+33 4 78 78 12 60", "33 478 781 260", "251660858",
//   "33 (0)6 65 95 09 95", "04 76 60 46 14 LD"…: normalised to "+33 4 78 78 12 60";
//   a number that does not parse is kept as written (never dropped).
// - the same (company, person) can appear twice: merged, phones unioned.
// - one company per distinct name (case and spacing ignored), first spelling kept.
// ============================================

import ExcelJS from "exceljs";
// The core build with explicit metadata: the default entry fails to load its
// metadata JSON under tsx (CJS interop).
import { parsePhoneNumberFromString } from "libphonenumber-js/core";
import metadata from "libphonenumber-js/max/metadata";

export type N2fContact = {
    firstName: string | null;
    lastName: string | null;
    title: string | null;
    phone: string | null;
    additionalPhones: string[];
    /** "Statut" column of the client's file ("À appeler"). */
    fileStatus: string | null;
};

export type N2fCompany = { name: string; contacts: N2fContact[] };

export type N2fParseResult = {
    companies: N2fCompany[];
    rows: number;
    duplicateRowsMerged: number;
    unparsedPhones: string[];
};

const HEADERS = ["Compte", "Contact", "Fonction", "Ligne directe", "Mobile", "Statut"] as const;

function text(v: unknown): string {
    if (v === null || v === undefined) return "";
    if (typeof v === "object") {
        const o = v as { text?: unknown; richText?: Array<{ text?: string }>; result?: unknown };
        if (Array.isArray(o.richText)) return o.richText.map((r) => r.text ?? "").join("");
        if (o.text !== undefined) return text(o.text);
        if (o.result !== undefined) return text(o.result);
    }
    return String(v);
}

export function clean(v: unknown): string {
    return text(v).replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

/** Returns the formatted number, the raw cleaned value when it does not parse, or null when empty. */
export function normalizePhone(raw: unknown): { value: string; parsed: boolean } | null {
    let s = clean(raw).replace(/^'+|'+$/g, "").trim();
    s = s.replace(/\s*\bLD\b\.?$/i, "").replace(/\(0\)/g, "").replace(/\s+/g, " ").trim();
    if (!s) return null;
    const digits = s.replace(/\D/g, "");
    if (!digits) return null;
    let candidate = s;
    if (!s.startsWith("+")) {
        // Excel ate the "+" ("33 478 781 260") or the leading 0 ("251660858").
        if (digits.startsWith("33") && digits.length === 11) candidate = `+${digits}`;
        else if (digits.length === 9 && !digits.startsWith("0")) candidate = `0${digits}`;
    }
    const parsed = parsePhoneNumberFromString(candidate, "FR", metadata);
    if (parsed?.isValid()) return { value: parsed.formatInternational(), parsed: true };
    return { value: s, parsed: false };
}

const isFrenchMobile = (p: string) => /^\+33 [67] /.test(p);

export function splitName(full: string): { firstName: string | null; lastName: string | null } {
    const parts = clean(full).split(" ").filter(Boolean);
    if (parts.length === 0) return { firstName: null, lastName: null };
    if (parts.length === 1) return { firstName: null, lastName: parts[0] };
    return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

const key = (s: string) => clean(s).toLowerCase();

export function buildN2fCompanies(sheet: unknown[][]): N2fParseResult {
    const [header, ...body] = sheet;
    const cols = (header ?? []).map(clean);
    HEADERS.forEach((h, i) => {
        if (cols[i] !== h) throw new Error(`Colonne ${i + 1} inattendue : « ${cols[i] ?? ""} » (attendu « ${h} »)`);
    });

    const companies = new Map<string, { name: string; contacts: Map<string, N2fContact & { phones: string[] }> }>();
    const unparsed = new Set<string>();
    let rows = 0;
    let duplicateRowsMerged = 0;

    for (const r of body) {
        const name = clean(r[0]);
        const person = clean(r[1]);
        if (!name && !person) continue;
        rows++;
        if (!name) throw new Error(`Ligne sans « Compte » : ${person}`);

        const phones: string[] = [];
        for (const raw of [r[3], r[4]]) {
            const p = normalizePhone(raw);
            if (!p) continue;
            if (!p.parsed) unparsed.add(p.value);
            if (!phones.includes(p.value)) phones.push(p.value);
        }

        const company = companies.get(key(name)) ?? { name, contacts: new Map() };
        companies.set(key(name), company);

        const pk = key(person);
        const existing = company.contacts.get(pk);
        if (existing) {
            duplicateRowsMerged++;
            for (const p of phones) if (!existing.phones.includes(p)) existing.phones.push(p);
            if (!existing.title) existing.title = clean(r[2]) || null;
            continue;
        }
        company.contacts.set(pk, {
            ...splitName(person),
            title: clean(r[2]) || null,
            phone: null,
            additionalPhones: [],
            fileStatus: clean(r[5]) || null,
            phones,
        });
    }

    const out: N2fCompany[] = [...companies.values()].map((c) => ({
        name: c.name,
        contacts: [...c.contacts.values()].map(({ phones, ...contact }) => {
            // SDRs reach a CFO faster on a mobile: a French mobile goes first when there is one.
            const primary = phones.find(isFrenchMobile) ?? phones[0] ?? null;
            return { ...contact, phone: primary, additionalPhones: phones.filter((p) => p !== primary) };
        }),
    }));

    return { companies: out, rows, duplicateRowsMerged, unparsedPhones: [...unparsed] };
}

/** First worksheet as a 2D array of raw cell values (row 1 = headers). */
export async function readSheetRows(path: string): Promise<unknown[][]> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path);
    const ws = wb.worksheets[0];
    if (!ws) throw new Error(`Aucune feuille dans ${path}`);
    const rows: unknown[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
        const values: unknown[] = [];
        for (let c = 1; c <= HEADERS.length; c++) values.push(row.getCell(c).value);
        rows.push(values);
    });
    return rows;
}
