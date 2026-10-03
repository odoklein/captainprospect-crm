/**
 * Turns loaded export data into the deliverable: an Excel workbook
 * (Synthèse · one sheet per list in the client's own layout · Historique) or a
 * flat CSV, plus the counts shown by the export dialog before downloading.
 */

import type { XlsxCell, XlsxCellValue, XlsxRow, XlsxSheet, XlsxStyle } from "@/lib/export/xlsx";
import { resolveSourceColumns, type ResolvedColumns } from "./columns";
import type { ProspectionExportData } from "./load";
import {
    buildRows,
    CHANNEL_LABELS,
    formatDateFr,
    formatDateTimeFr,
    formatDuration,
    indexActions,
    MEETING_TYPE_LABELS,
    rowIsExported,
} from "./rows";
import type { ExportAction, ExportList, ExportRow, TreatmentFilter } from "./types";
import { UNTREATED_LABEL } from "./types";
import { brand } from "@/lib/brand";

// ============================================
// ROW SETS PER LIST
// ============================================

export interface ListRowSet {
    list: ExportList;
    columns: ResolvedColumns;
    /** Every line of the list, with counted actions (no treatment/status filter). */
    allRows: ExportRow[];
    /** Lines that go into the export. */
    rows: ExportRow[];
    companyCount: number;
    contactCount: number;
}

export function buildListRowSets(data: ProspectionExportData, listIds: string[] = data.selectedListIds): ListRowSet[] {
    const index = indexActions(data.actions);
    const listById = new Map(data.lists.map((l) => [l.id, l]));
    return listIds.filter((id) => listById.has(id) && data.companiesByList.has(id)).map((listId) => {
        const list = listById.get(listId)!;
        const companies = data.companiesByList.get(listId) ?? [];
        const allRows = buildRows(companies, index, data.filters, data.vocabulary, { applyRowFilters: false });
        return {
            list,
            columns: resolveSourceColumns(list.mappings, companies),
            allRows,
            rows: allRows.filter((r) => rowIsExported(r.treatment, data.filters)),
            companyCount: companies.length,
            contactCount: companies.reduce((n, c) => n + c.contacts.length, 0),
        };
    });
}

/** Distinct actions across rows (company-level actions are shared by every line of the company). */
export function distinctActions(rows: ExportRow[]): ExportAction[] {
    const seen = new Map<string, ExportAction>();
    for (const r of rows) for (const a of r.actions) if (!seen.has(a.id)) seen.set(a.id, a);
    return [...seen.values()];
}

// ============================================
// TRACKING COLUMNS ("Suivi <brand.name>")
// ============================================

interface TrackingColumn {
    header: string;
    width: number;
    kind: "text" | "integer" | "date";
    get: (row: ExportRow) => XlsxCellValue;
}

function contactName(row: ExportRow): string {
    return [row.contact?.firstName, row.contact?.lastName].filter(Boolean).join(" ").trim();
}

function exclusionText(row: ExportRow, reasons: Map<string, string>): string {
    const source = row.contact?.excludedAt ? row.contact : row.company.excludedAt ? row.company : null;
    if (!source?.excludedAt) return "";
    const reason = source.exclusionId ? reasons.get(source.exclusionId) : undefined;
    const scope = source === row.company && row.contact ? " (société)" : "";
    return `Oui${scope} — depuis le ${formatDateFr(source.excludedAt)}${reason ? ` — ${reason}` : ""}`;
}

export function trackingColumns(rows: ExportRow[], reasons: Map<string, string>): TrackingColumn[] {
    const any = (test: (r: ExportRow) => boolean) => rows.some(test);
    const cols: TrackingColumn[] = [
        { header: "Traité", width: 9, kind: "text", get: (r) => (r.treatment.treated ? "Oui" : "Non") },
        { header: "Statut actuel", width: 24, kind: "text", get: (r) => r.treatment.lastResultLabel },
        { header: "Date dernière action", width: 17, kind: "date", get: (r) => r.treatment.lastActionAt },
        { header: "Tentatives d'appel", width: 11, kind: "integer", get: (r) => r.treatment.callCount },
    ];
    if (any((r) => r.treatment.emailCount > 0)) {
        cols.push({ header: "Actions email", width: 10, kind: "integer", get: (r) => r.treatment.emailCount });
    }
    if (any((r) => r.treatment.linkedinCount > 0)) {
        cols.push({ header: "Actions LinkedIn", width: 10, kind: "integer", get: (r) => r.treatment.linkedinCount });
    }
    cols.push({ header: "Actions (total)", width: 10, kind: "integer", get: (r) => r.treatment.actionCount });
    if (any((r) => r.treatment.totalCallSeconds > 0)) {
        cols.push({ header: "Temps d'appel", width: 10, kind: "text", get: (r) => formatDuration(r.treatment.totalCallSeconds) });
    }
    cols.push(
        { header: "Première action", width: 17, kind: "date", get: (r) => r.treatment.firstActionAt },
        { header: "Dernier SDR", width: 18, kind: "text", get: (r) => r.treatment.lastSdrName ?? "" },
    );
    if (any((r) => r.treatment.nextCallbackAt !== null)) {
        cols.push({ header: "Prochain rappel", width: 17, kind: "date", get: (r) => r.treatment.nextCallbackAt });
    }
    if (any((r) => r.treatment.meetingBookedAt !== null)) {
        cols.push(
            { header: "RDV pris le", width: 17, kind: "date", get: (r) => r.treatment.meetingBookedAt },
            { header: "Date du RDV", width: 17, kind: "date", get: (r) => r.treatment.meetingAt },
            {
                header: "Type de RDV",
                width: 13,
                kind: "text",
                get: (r) => (r.treatment.meetingType ? MEETING_TYPE_LABELS[r.treatment.meetingType] ?? r.treatment.meetingType : ""),
            },
        );
    }
    cols.push({ header: "Dernier commentaire", width: 50, kind: "text", get: (r) => r.treatment.lastNote ?? "" });
    if (any((r) => !!r.treatment.lastCallSummary)) {
        cols.push({ header: "Résumé du dernier appel", width: 50, kind: "text", get: (r) => r.treatment.lastCallSummary ?? "" });
    }
    cols.push({
        header: "Historique des actions (récent → ancien)",
        width: 80,
        kind: "text",
        get: (r) => r.treatment.historyLines.join("\n"),
    });
    if (any((r) => !!(r.contact?.excludedAt || r.company.excludedAt))) {
        cols.push({ header: "Exclu (ne plus contacter)", width: 30, kind: "text", get: (r) => exclusionText(r, reasons) });
    }
    return cols;
}

// ============================================
// FILTER DESCRIPTION
// ============================================

const TREATMENT_LABELS: Record<TreatmentFilter, string> = {
    all: "Toute la base",
    treated: "Prospects traités uniquement",
    untreated: "Prospects non traités uniquement",
};

export function describeFilters(data: ProspectionExportData): string[] {
    const f = data.filters;
    const listNames = data.lists.filter((l) => data.selectedListIds.includes(l.id)).map((l) => l.name);
    const lines = [
        `Listes : ${listNames.length ? listNames.join(", ") : "aucune"}`,
        `Lignes : ${TREATMENT_LABELS[f.treatment]}`,
        `Statut actuel : ${f.statuses.length ? f.statuses.map((c) => data.vocabulary.labelFor(c)).join(", ") : "tous"}`,
    ];
    const counted: string[] = [];
    if (f.sdrIds.length) counted.push(`SDR ${f.sdrIds.map((id) => data.sdrNames.get(id) || id).join(", ")}`);
    if (f.channels.length) counted.push(`canal ${f.channels.map((c) => CHANNEL_LABELS[c] ?? c).join(", ")}`);
    if (f.from || f.to) {
        counted.push(`période ${f.from ? `du ${formatDateFr(f.from)}` : "depuis le début"} ${f.to ? `au ${formatDateFr(f.to)}` : "à aujourd'hui"}`);
    }
    lines.push(`Actions prises en compte : ${counted.length ? counted.join(" · ") : "toutes"}`);
    return lines;
}

// ============================================
// XLSX HELPERS
// ============================================

function cell(value: XlsxCellValue, style: XlsxStyle): XlsxCell {
    return { value, style };
}

function bodyStyle(kind: TrackingColumn["kind"], accent: boolean): XlsxStyle {
    if (kind === "date") return accent ? "accentDateTime" : "dateTime";
    if (kind === "integer") return accent ? "accentInteger" : "integer";
    return accent ? "accentText" : "text";
}

/** Width from the header and a sample of values, clamped to something readable. */
function estimateWidth(header: string, values: string[]): number {
    let max = Math.min(header.length, 30);
    for (let i = 0; i < values.length && i < 300; i++) {
        const firstLine = values[i].split("\n", 1)[0];
        if (firstLine.length > max) max = firstLine.length;
    }
    return Math.max(9, Math.min(45, max + 2));
}

// ============================================
// SHEETS
// ============================================

function listSheet(set: ListRowSet, reasons: Map<string, string>): XlsxSheet {
    const tracking = trackingColumns(set.rows, reasons);
    const header: XlsxRow = [
        ...set.columns.columns.map((c) => cell(c.header, "header")),
        ...tracking.map((c) => cell(c.header, "headerAccent")),
    ];

    const sourceValues = set.rows.map((r) => set.columns.columns.map((c) => c.get(r)));
    const rows: XlsxRow[] = [header];
    set.rows.forEach((r, i) => {
        rows.push([
            ...sourceValues[i].map((v) => cell(v, "text")),
            ...tracking.map((c) => cell(c.get(r), bodyStyle(c.kind, true))),
        ]);
    });

    const widths = [
        ...set.columns.columns.map((c, ci) => estimateWidth(c.header, sourceValues.map((v) => v[ci]))),
        ...tracking.map((c) => c.width),
    ];
    const lastCol = header.length - 1;
    return {
        name: set.list.name,
        rows,
        columnWidths: widths,
        freeze: { rows: 1 },
        autoFilter: { headerRow: 0, lastRow: rows.length - 1, lastCol },
        rowHeights: { 0: 32 },
    };
}

function historySheet(sets: ListRowSet[], data: ProspectionExportData): XlsxSheet {
    const headers = [
        "Date", "Liste", "Société", "Contact", "Fonction", "Téléphone", "Email", "Canal",
        "Résultat", "SDR", "Durée", "Commentaire", "Résumé de l'appel", "Rappel / RDV prévu", "Type de RDV",
    ];
    const widths = [17, 22, 28, 22, 22, 16, 26, 9, 22, 18, 8, 60, 60, 17, 12];

    type Entry = { action: ExportAction; row: ExportRow; listName: string; companyLevel: boolean };
    const entries: Entry[] = [];
    const seen = new Set<string>();
    for (const set of sets) {
        for (const row of set.rows) {
            for (const a of row.actions) {
                if (seen.has(a.id)) continue;
                seen.add(a.id);
                entries.push({ action: a, row, listName: set.list.name, companyLevel: !a.contactId });
            }
        }
    }
    entries.sort((x, y) => y.action.createdAt.getTime() - x.action.createdAt.getTime());

    const rows: XlsxRow[] = [headers.map((h) => cell(h, "header"))];
    for (const { action: a, row, listName, companyLevel } of entries) {
        const plannedAt = a.callbackDate && (a.result === "MEETING_BOOKED" || data.vocabulary.isCallback(a.result)) ? a.callbackDate : null;
        rows.push([
            cell(a.createdAt, "dateTime"),
            cell(listName, "text"),
            cell(row.company.name, "text"),
            cell(companyLevel ? "(société)" : contactName(row), "text"),
            cell(companyLevel ? "" : row.contact?.title ?? "", "text"),
            cell(companyLevel ? row.company.phone ?? "" : row.contact?.phone || row.company.phone || "", "text"),
            cell(companyLevel ? "" : row.contact?.email ?? "", "text"),
            cell(CHANNEL_LABELS[a.channel] ?? a.channel, "text"),
            cell(data.vocabulary.labelFor(a.result), "text"),
            cell(a.sdrName, "text"),
            cell(formatDuration(a.duration ?? 0), "text"),
            cell(a.note?.trim() ?? "", "text"),
            cell(a.callSummary?.trim() ?? "", "text"),
            cell(plannedAt, "dateTime"),
            cell(a.result === "MEETING_BOOKED" && a.meetingType ? MEETING_TYPE_LABELS[a.meetingType] ?? a.meetingType : "", "text"),
        ]);
    }
    return {
        name: "Historique",
        rows,
        columnWidths: widths,
        freeze: { rows: 1 },
        autoFilter: { headerRow: 0, lastRow: rows.length - 1, lastCol: headers.length - 1 },
        rowHeights: { 0: 24 },
    };
}

function ratio(part: number, total: number): number | null {
    return total > 0 ? part / total : null;
}

function summarySheet(sets: ListRowSet[], data: ProspectionExportData, exportedAt: Date): XlsxSheet {
    const rows: XlsxRow[] = [];
    const merges: XlsxSheet["merges"] = [];
    const heights: Record<number, number> = {};
    const WIDTH = 11; // columns used by the widest table

    const pushMergedLine = (value: string, style: XlsxStyle, height?: number) => {
        const r = rows.length;
        rows.push([cell(value, style)]);
        merges.push({ fromRow: r, fromCol: 0, toRow: r, toCol: WIDTH - 1 });
        if (height) heights[r] = height;
    };

    pushMergedLine(`Export prospection — ${data.mission.name}`, "title", 26);
    pushMergedLine(
        `Client : ${data.mission.clientName || "—"} · Exporté le ${formatDateTimeFr(exportedAt)}`,
        "muted"
    );
    for (const line of describeFilters(data)) pushMergedLine(line, "muted");
    rows.push([]);

    // ── Per list ────────────────────────────────────────────────────────────
    pushMergedLine("Avancement par liste", "subtitle", 20);
    rows.push([
        "Liste", "Format", "Sociétés", "Contacts", "Lignes (base)", "Lignes traitées", "% traité",
        "Lignes exportées", "Tentatives d'appel", "Actions (total)", "RDV pris",
    ].map((h) => cell(h, "header")));
    heights[rows.length - 1] = 30;

    const totals = { companies: 0, contacts: 0, base: 0, treated: 0, exported: 0, calls: 0, actions: 0, rdv: 0 };
    for (const set of sets) {
        const treated = set.allRows.filter((r) => r.treatment.treated).length;
        const actions = distinctActions(set.rows);
        const calls = actions.filter((a) => a.channel === "CALL").length;
        const rdv = set.rows.filter((r) => r.treatment.meetingBookedAt).length;
        totals.companies += set.companyCount;
        totals.contacts += set.contactCount;
        totals.base += set.allRows.length;
        totals.treated += treated;
        totals.exported += set.rows.length;
        totals.calls += calls;
        totals.actions += actions.length;
        totals.rdv += rdv;
        rows.push([
            cell(set.list.name, "bold"),
            cell(set.columns.fromOriginalFile ? "Format d'origine" : "Format standard", "text"),
            cell(set.companyCount, "integer"),
            cell(set.contactCount, "integer"),
            cell(set.allRows.length, "integer"),
            cell(treated, "integer"),
            cell(ratio(treated, set.allRows.length), "percent"),
            cell(set.rows.length, "integer"),
            cell(calls, "integer"),
            cell(actions.length, "integer"),
            cell(rdv, "integer"),
        ]);
    }
    if (sets.length > 1) {
        rows.push([
            cell("Total", "totalLabel"),
            cell("", "totalLabel"),
            cell(totals.companies, "totalInteger"),
            cell(totals.contacts, "totalInteger"),
            cell(totals.base, "totalInteger"),
            cell(totals.treated, "totalInteger"),
            cell(ratio(totals.treated, totals.base), "totalPercent"),
            cell(totals.exported, "totalInteger"),
            cell(totals.calls, "totalInteger"),
            cell(totals.actions, "totalInteger"),
            cell(totals.rdv, "totalInteger"),
        ]);
    }
    rows.push([]);

    // ── Per status (current status of the exported lines) ──────────────────
    pushMergedLine("Répartition par statut actuel (lignes exportées)", "subtitle", 20);
    const multi = sets.length > 1;
    rows.push([
        cell("Statut", "header"),
        ...(multi ? sets.map((s) => cell(s.list.name, "header")) : []),
        cell("Lignes", "header"),
        cell("% des lignes", "header"),
    ]);
    heights[rows.length - 1] = 30;

    const statusCounts = new Map<string, number[]>(); // code → per list
    const UNTREATED = "__untreated__";
    sets.forEach((set, i) => {
        for (const r of set.rows) {
            const code = r.treatment.lastResult ?? UNTREATED;
            const arr = statusCounts.get(code) ?? sets.map(() => 0);
            arr[i]++;
            statusCounts.set(code, arr);
        }
    });
    const order = data.vocabulary.orderedCodes;
    const codes = [...statusCounts.keys()].sort((a, b) => {
        if (a === UNTREATED) return 1;
        if (b === UNTREATED) return -1;
        const ia = order.indexOf(a);
        const ib = order.indexOf(b);
        if (ia !== ib) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
        return data.vocabulary.labelFor(a).localeCompare(data.vocabulary.labelFor(b), "fr");
    });
    for (const code of codes) {
        const perList = statusCounts.get(code)!;
        const total = perList.reduce((n, v) => n + v, 0);
        rows.push([
            cell(code === UNTREATED ? UNTREATED_LABEL : data.vocabulary.labelFor(code), "bold"),
            ...(multi ? perList.map((v) => cell(v, "integer")) : []),
            cell(total, "integer"),
            cell(ratio(total, totals.exported), "percent"),
        ]);
    }
    if (codes.length === 0) rows.push([cell("Aucune ligne exportée", "muted")]);
    rows.push([]);

    // ── Per SDR (counted actions on exported lines) ────────────────────────
    const allActions = distinctActions(sets.flatMap((s) => s.rows));
    if (allActions.length > 0) {
        pushMergedLine("Activité par SDR (lignes exportées)", "subtitle", 20);
        rows.push(["SDR", "Actions", "Appels", "Temps d'appel", "Lignes touchées", "RDV pris", "Première action", "Dernière action"]
            .map((h) => cell(h, "header")));
        heights[rows.length - 1] = 30;
        const bySdr = new Map<string, { name: string; actions: number; calls: number; seconds: number; rdv: number; first: Date; last: Date; lines: Set<string> }>();
        for (const set of sets) {
            for (const r of set.rows) {
                const lineKey = r.contact ? `ct:${r.contact.id}` : `co:${r.company.id}`;
                for (const a of r.actions) {
                    const s = bySdr.get(a.sdrId) ?? { name: a.sdrName || "—", actions: 0, calls: 0, seconds: 0, rdv: 0, first: a.createdAt, last: a.createdAt, lines: new Set<string>() };
                    s.lines.add(lineKey);
                    bySdr.set(a.sdrId, s);
                }
            }
        }
        for (const a of allActions) {
            const s = bySdr.get(a.sdrId);
            if (!s) continue;
            s.actions++;
            if (a.channel === "CALL") {
                s.calls++;
                s.seconds += a.duration ?? 0;
            }
            if (a.result === "MEETING_BOOKED") s.rdv++;
            if (a.createdAt < s.first) s.first = a.createdAt;
            if (a.createdAt > s.last) s.last = a.createdAt;
        }
        for (const s of [...bySdr.values()].sort((a, b) => b.actions - a.actions)) {
            rows.push([
                cell(s.name, "bold"),
                cell(s.actions, "integer"),
                cell(s.calls, "integer"),
                cell(formatDuration(s.seconds), "text"),
                cell(s.lines.size, "integer"),
                cell(s.rdv, "integer"),
                cell(s.first, "dateTime"),
                cell(s.last, "dateTime"),
            ]);
        }
        rows.push([]);
    }

    // ── Notes on the layout ─────────────────────────────────────────────────
    pushMergedLine("À propos du format", "subtitle", 20);
    pushMergedLine(
        "Chaque liste a sa feuille, avec les colonnes du fichier d'origine dans le même ordre (en-têtes gris), " +
        `suivies des colonnes de suivi ${brand.name} (en-têtes de couleur). Les valeurs sont les données à jour : ` +
        "les corrections faites pendant la prospection y figurent.",
        "muted",
        44
    );
    for (const set of sets) {
        if (!set.columns.fromOriginalFile) {
            pushMergedLine(`« ${set.list.name} » : liste non issue d'un fichier client — colonnes standard du CRM.`, "muted");
        } else if (set.columns.ignoredColumns.length) {
            pushMergedLine(
                `« ${set.list.name} » : colonnes ignorées lors de l'import, donc non conservées : ${set.columns.ignoredColumns.join(", ")}.`,
                "muted",
                30
            );
        }
    }

    return {
        name: "Synthèse",
        rows,
        columnWidths: [30, 18, 11, 11, 12, 12, 10, 12, 13, 12, 10],
        merges,
        rowHeights: heights,
    };
}

export interface WorkbookOptions {
    includeSummary: boolean;
    includeHistory: boolean;
    exportedAt?: Date;
}

export function buildExportSheets(data: ProspectionExportData, options: WorkbookOptions): XlsxSheet[] {
    const sets = buildListRowSets(data);
    const exportedAt = options.exportedAt ?? new Date();
    const sheets: XlsxSheet[] = [];
    if (options.includeSummary) sheets.push(summarySheet(sets, data, exportedAt));
    for (const set of sets) sheets.push(listSheet(set, data.exclusionReasons));
    if (options.includeHistory) sheets.push(historySheet(sets, data));
    return sheets;
}

// ============================================
// CSV
// ============================================

function csvEscape(value: string, delimiter: string): string {
    if (value.includes('"') || value.includes(delimiter) || value.includes("\n") || value.includes("\r")) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

function csvValue(value: XlsxCellValue): string {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return formatDateTimeFr(value);
    return String(value);
}

/**
 * One flat table. With several lists, columns are the union of their layouts
 * (by header name, first-seen order) and a leading "Liste" column tells lines apart.
 * Semicolon-separated with a BOM, so French Excel opens it straight away.
 */
export function buildExportCsv(data: ProspectionExportData, delimiter = ";"): string {
    const sets = buildListRowSets(data);
    const multi = sets.length > 1;

    const unionKeys: string[] = [];
    const unionHeaders: string[] = [];
    const keyed = sets.map((set) => {
        const seen = new Map<string, number>();
        return set.columns.columns.map((c) => {
            const n = seen.get(c.header) ?? 0;
            seen.set(c.header, n + 1);
            const key = `${c.header}\u0000${n}`;
            if (!unionKeys.includes(key)) {
                unionKeys.push(key);
                unionHeaders.push(c.header);
            }
            return { key, column: c };
        });
    });

    const allRows = sets.flatMap((s) => s.rows);
    const tracking = trackingColumns(allRows, data.exclusionReasons);
    const lines: string[] = [];
    lines.push([...(multi ? ["Liste"] : []), ...unionHeaders, ...tracking.map((t) => t.header)]
        .map((h) => csvEscape(h, delimiter)).join(delimiter));

    sets.forEach((set, si) => {
        const columnsByKey = new Map(keyed[si].map((k) => [k.key, k.column]));
        for (const row of set.rows) {
            const values = [
                ...(multi ? [set.list.name] : []),
                ...unionKeys.map((k) => columnsByKey.get(k)?.get(row) ?? ""),
                // One record per line: multi-line comments break naive CSV readers.
                ...tracking.map((t) => csvValue(t.get(row)).replace(/\r?\n/g, t.header.startsWith("Historique") ? " | " : " ")),
            ];
            lines.push(values.map((v) => csvEscape(v, delimiter)).join(delimiter));
        }
    });

    return "﻿" + lines.join("\r\n") + "\r\n";
}

// ============================================
// PREVIEW (export dialog)
// ============================================

export interface ExportPreview {
    mission: { id: string; name: string; clientName: string; channels: string[] };
    lists: Array<{
        id: string;
        name: string;
        source: string | null;
        isActive: boolean;
        isArchived: boolean;
        importedAt: string | null;
        createdAt: string;
        selected: boolean;
        hasOriginalFormat: boolean;
        originalColumns: number;
        ignoredColumns: string[];
        companies: number;
        /** Null for archived lists that are not selected (not loaded). */
        contacts: number | null;
        rows: number | null;
        treatedRows: number | null;
        exportedRows: number | null;
    }>;
    totals: { rows: number; treatedRows: number; exportedRows: number; actions: number; calls: number };
    /** Current statuses among the counted lines of the selected lists, before the status filter. */
    statuses: Array<{ code: string; label: string; count: number }>;
    untreatedRows: number;
}

export function buildExportPreview(data: ProspectionExportData): ExportPreview {
    const loaded = buildListRowSets(data, [...data.companiesByList.keys()]);
    const setById = new Map(loaded.map((s) => [s.list.id, s]));
    const selected = new Set(data.selectedListIds);
    const sets = loaded.filter((s) => selected.has(s.list.id));

    const statusCounts = new Map<string, number>();
    let untreatedRows = 0;
    for (const set of sets) {
        for (const r of set.allRows) {
            // Status chips must reflect the treatment filter, not the status filter.
            if (data.filters.treatment === "treated" && !r.treatment.treated) continue;
            if (data.filters.treatment === "untreated" && r.treatment.treated) continue;
            if (r.treatment.lastResult) statusCounts.set(r.treatment.lastResult, (statusCounts.get(r.treatment.lastResult) ?? 0) + 1);
            else untreatedRows++;
        }
    }
    const order = data.vocabulary.orderedCodes;
    const statuses = [...statusCounts.entries()]
        .map(([code, count]) => ({ code, label: data.vocabulary.labelFor(code), count }))
        .sort((a, b) => {
            const ia = order.indexOf(a.code);
            const ib = order.indexOf(b.code);
            if (ia !== ib) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
            return b.count - a.count;
        });

    const exportedActions = distinctActions(sets.flatMap((s) => s.rows));

    return {
        mission: data.mission,
        lists: data.lists.map((l) => {
            const set = setById.get(l.id);
            return {
                id: l.id,
                name: l.name,
                source: l.source,
                isActive: l.isActive,
                isArchived: l.isArchived,
                importedAt: l.importedAt?.toISOString() ?? null,
                createdAt: l.createdAt.toISOString(),
                selected: selected.has(l.id),
                hasOriginalFormat: !!l.mappings,
                originalColumns: l.mappings ? l.mappings.filter((m) => m.targetField && !m.targetField.startsWith("__")).length : 0,
                ignoredColumns: l.mappings ? l.mappings.filter((m) => !m.targetField || m.targetField.startsWith("__")).map((m) => m.csvColumn).filter(Boolean) : [],
                companies: data.companyCountByList.get(l.id) ?? 0,
                contacts: set ? set.contactCount : null,
                rows: set ? set.allRows.length : null,
                treatedRows: set ? set.allRows.filter((r) => r.treatment.treated).length : null,
                exportedRows: set ? set.rows.length : null,
            };
        }),
        totals: {
            rows: sets.reduce((n, s) => n + s.allRows.length, 0),
            treatedRows: sets.reduce((n, s) => n + s.allRows.filter((r) => r.treatment.treated).length, 0),
            exportedRows: sets.reduce((n, s) => n + s.rows.length, 0),
            actions: exportedActions.length,
            calls: exportedActions.filter((a) => a.channel === "CALL").length,
        },
        statuses,
        untreatedRows,
    };
}
