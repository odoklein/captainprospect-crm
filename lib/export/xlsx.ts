/**
 * Minimal, dependency-free XLSX writer.
 *
 * Produces a real Office Open XML workbook (several sheets, a fixed style
 * palette, frozen panes, autofilters, merged cells, column widths) that opens
 * in Excel, LibreOffice and Google Sheets. Strings are written inline
 * (t="inlineStr"), so no shared-string table is needed, and the zip container
 * is built by hand on top of node:zlib.
 *
 * Dates are stored as Excel serial numbers in the wall-clock time of
 * `timeZone` (default Europe/Paris): Excel has no notion of time zones, and
 * the people opening these files read French times.
 */

import { deflateRawSync } from "node:zlib";
import { DateTime } from "luxon";

// ============================================
// PUBLIC TYPES
// ============================================

export type XlsxStyle =
    | "default"
    | "header"
    | "headerAccent"
    | "text"
    | "wrap"
    | "dateTime"
    | "date"
    | "integer"
    | "percent"
    | "title"
    | "subtitle"
    | "muted"
    | "bold"
    | "label"
    | "accentText"
    | "accentWrap"
    | "accentDateTime"
    | "accentInteger"
    | "totalLabel"
    | "totalInteger"
    | "totalPercent";

export type XlsxCellValue = string | number | boolean | Date | null | undefined;

export interface XlsxCell {
    value: XlsxCellValue;
    style?: XlsxStyle;
}

export type XlsxRow = (XlsxCellValue | XlsxCell)[];

export interface XlsxSheet {
    name: string;
    rows: XlsxRow[];
    /** Width (in Excel character units) per column, left to right. */
    columnWidths?: number[];
    /** Rows / columns kept visible while scrolling. */
    freeze?: { rows?: number; cols?: number };
    /** 0-based inclusive range of the filterable table (header row first). */
    autoFilter?: { headerRow: number; lastRow: number; lastCol: number };
    /** 0-based inclusive ranges. */
    merges?: { fromRow: number; fromCol: number; toRow: number; toCol: number }[];
    /** 0-based row index → height in points. */
    rowHeights?: Record<number, number>;
}

export interface XlsxOptions {
    timeZone?: string;
    /** Written to docProps/core.xml. */
    title?: string;
    creator?: string;
}

/** Excel caps a cell at 32 767 characters. */
export const XLSX_MAX_CELL_CHARS = 32_767;

// ============================================
// STYLE PALETTE
// ============================================
// One fixed stylesheet shared by every workbook. The index of each entry in
// CELL_XFS is the `s` attribute written on cells.

const STYLE_INDEX: Record<XlsxStyle, number> = {
    default: 0,
    header: 1,
    headerAccent: 2,
    text: 3,
    wrap: 4,
    dateTime: 5,
    date: 6,
    integer: 7,
    percent: 8,
    title: 9,
    subtitle: 10,
    muted: 11,
    bold: 12,
    label: 13,
    accentText: 14,
    accentWrap: 15,
    accentDateTime: 16,
    accentInteger: 17,
    totalLabel: 18,
    totalInteger: 19,
    totalPercent: 20,
};

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy hh:mm"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="7">
<font><sz val="10"/><color rgb="FF1E293B"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="FF0F172A"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="16"/><color rgb="FF0F172A"/><name val="Calibri"/><family val="2"/></font>
<font><i/><sz val="10"/><color rgb="FF64748B"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="12"/><color rgb="FF3730A3"/><name val="Calibri"/><family val="2"/></font>
<font><sz val="10"/><color rgb="FF64748B"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="7">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF334155"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF4F46E5"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEEF2FF"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFE2E8F0"/></left><right style="thin"><color rgb="FFE2E8F0"/></right><top style="thin"><color rgb="FFE2E8F0"/></top><bottom style="thin"><color rgb="FFE2E8F0"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="21">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>
<xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>
<xf numFmtId="9" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>
<xf numFmtId="1" fontId="0" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>
<xf numFmtId="0" fontId="2" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="1" fontId="2" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>
<xf numFmtId="9" fontId="2" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

// ============================================
// HELPERS
// ============================================

// XML 1.0 forbids most C0 control characters, even escaped. Pasted CRM notes
// do contain them (vertical tabs, form feeds), and one of them corrupts the
// whole workbook, so they are stripped before escaping.
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function escapeXml(value: string): string {
    return value
        .replace(INVALID_XML_CHARS, "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/** 0 → "A", 25 → "Z", 26 → "AA". */
export function columnLetter(index: number): string {
    let n = index + 1;
    let out = "";
    while (n > 0) {
        const rem = (n - 1) % 26;
        out = String.fromCharCode(65 + rem) + out;
        n = Math.floor((n - 1) / 26);
    }
    return out;
}

function cellRef(row: number, col: number): string {
    return `${columnLetter(col)}${row + 1}`;
}

/** Excel serial date (days since 1899-12-30) of the wall-clock time in `timeZone`. */
export function toExcelSerial(date: Date, timeZone: string): number {
    const local = DateTime.fromJSDate(date).setZone(timeZone);
    const wallClockUtcMs = Date.UTC(
        local.year,
        local.month - 1,
        local.day,
        local.hour,
        local.minute,
        local.second,
        local.millisecond
    );
    return wallClockUtcMs / 86_400_000 + 25_569;
}

/**
 * Sheet names: max 31 chars, none of : \ / ? * [ ], not blank, and unique
 * case-insensitively within the workbook.
 */
export function makeSheetNames(names: string[]): string[] {
    const used = new Set<string>();
    return names.map((raw) => {
        const base = (raw.replace(/[:\\/?*[\]]/g, " ").replace(/\s+/g, " ").trim() || "Feuille")
            .replace(/^'+|'+$/g, "")
            .slice(0, 31) || "Feuille";
        let candidate = base;
        let n = 2;
        while (used.has(candidate.toLowerCase())) {
            const suffix = ` (${n++})`;
            candidate = base.slice(0, 31 - suffix.length) + suffix;
        }
        used.add(candidate.toLowerCase());
        return candidate;
    });
}

function isCellObject(v: XlsxCellValue | XlsxCell): v is XlsxCell {
    return typeof v === "object" && v !== null && !(v instanceof Date);
}

function defaultStyleFor(value: XlsxCellValue): XlsxStyle {
    if (value instanceof Date) return "dateTime";
    if (typeof value === "number") return "integer";
    return "text";
}

function renderCell(row: number, col: number, input: XlsxCellValue | XlsxCell, timeZone: string): string {
    const cell = isCellObject(input) ? input : { value: input };
    const value = cell.value;
    const ref = cellRef(row, col);
    const s = STYLE_INDEX[cell.style ?? defaultStyleFor(value)];

    if (value === null || value === undefined || value === "") {
        // Styled empty cell keeps borders/fills continuous across the table.
        return s ? `<c r="${ref}" s="${s}"/>` : "";
    }
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return `<c r="${ref}" s="${s}"/>`;
        return `<c r="${ref}" s="${s}"><v>${toExcelSerial(value, timeZone)}</v></c>`;
    }
    if (typeof value === "number") {
        if (!Number.isFinite(value)) return `<c r="${ref}" s="${s}"/>`;
        return `<c r="${ref}" s="${s}"><v>${value}</v></c>`;
    }
    if (typeof value === "boolean") {
        return `<c r="${ref}" s="${s}" t="b"><v>${value ? 1 : 0}</v></c>`;
    }
    let text = String(value);
    if (text.length > XLSX_MAX_CELL_CHARS) text = text.slice(0, XLSX_MAX_CELL_CHARS - 1) + "…";
    return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
}

function renderSheet(sheet: XlsxSheet, timeZone: string, isFirst: boolean): string {
    const parts: string[] = [];
    parts.push(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
        `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
    );

    const frozenRows = sheet.freeze?.rows ?? 0;
    const frozenCols = sheet.freeze?.cols ?? 0;
    const tabSelected = isFirst ? ` tabSelected="1"` : "";
    if (frozenRows > 0 || frozenCols > 0) {
        const topLeft = cellRef(frozenRows, frozenCols);
        const activePane = frozenRows > 0 && frozenCols > 0 ? "bottomRight" : frozenRows > 0 ? "bottomLeft" : "topRight";
        const xSplit = frozenCols > 0 ? ` xSplit="${frozenCols}"` : "";
        const ySplit = frozenRows > 0 ? ` ySplit="${frozenRows}"` : "";
        parts.push(
            `<sheetViews><sheetView workbookViewId="0"${tabSelected}>` +
            `<pane${xSplit}${ySplit} topLeftCell="${topLeft}" activePane="${activePane}" state="frozen"/>` +
            `<selection pane="${activePane}" activeCell="${topLeft}" sqref="${topLeft}"/>` +
            `</sheetView></sheetViews>`
        );
    } else {
        parts.push(`<sheetViews><sheetView workbookViewId="0"${tabSelected}/></sheetViews>`);
    }

    parts.push(`<sheetFormatPr defaultRowHeight="15"/>`);

    if (sheet.columnWidths?.length) {
        parts.push("<cols>");
        sheet.columnWidths.forEach((w, i) => {
            parts.push(`<col min="${i + 1}" max="${i + 1}" width="${Math.max(2, Math.min(255, w))}" customWidth="1"/>`);
        });
        parts.push("</cols>");
    }

    parts.push("<sheetData>");
    sheet.rows.forEach((row, r) => {
        const height = sheet.rowHeights?.[r];
        const ht = height ? ` ht="${height}" customHeight="1"` : "";
        let cells = "";
        for (let c = 0; c < row.length; c++) cells += renderCell(r, c, row[c], timeZone);
        parts.push(`<row r="${r + 1}"${ht}>${cells}</row>`);
    });
    parts.push("</sheetData>");

    if (sheet.autoFilter && sheet.autoFilter.lastCol >= 0) {
        const { headerRow, lastRow, lastCol } = sheet.autoFilter;
        parts.push(`<autoFilter ref="${cellRef(headerRow, 0)}:${cellRef(Math.max(lastRow, headerRow), lastCol)}"/>`);
    }

    if (sheet.merges?.length) {
        parts.push(`<mergeCells count="${sheet.merges.length}">`);
        for (const m of sheet.merges) {
            parts.push(`<mergeCell ref="${cellRef(m.fromRow, m.fromCol)}:${cellRef(m.toRow, m.toCol)}"/>`);
        }
        parts.push("</mergeCells>");
    }

    parts.push(`<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>`);
    parts.push("</worksheet>");
    return parts.join("");
}

// ============================================
// ZIP CONTAINER
// ============================================

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

export function crc32(buf: Buffer): number {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(d: Date): { time: number; date: number } {
    return {
        time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
        date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    };
}

/** Deflate-compressed zip archive (no zip64: fine below 4 GB). */
export function buildZip(files: { name: string; data: Buffer }[]): Buffer {
    const now = dosDateTime(new Date());
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let offset = 0;

    for (const file of files) {
        const name = Buffer.from(file.name, "utf8");
        const compressed = deflateRawSync(file.data, { level: 6 });
        const crc = crc32(file.data);

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4); // version needed
        local.writeUInt16LE(0x0800, 6); // UTF-8 names
        local.writeUInt16LE(8, 8); // deflate
        local.writeUInt16LE(now.time, 10);
        local.writeUInt16LE(now.date, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(compressed.length, 18);
        local.writeUInt32LE(file.data.length, 22);
        local.writeUInt16LE(name.length, 26);
        local.writeUInt16LE(0, 28);
        localParts.push(local, name, compressed);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4); // version made by
        central.writeUInt16LE(20, 6); // version needed
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(8, 10);
        central.writeUInt16LE(now.time, 12);
        central.writeUInt16LE(now.date, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(compressed.length, 20);
        central.writeUInt32LE(file.data.length, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt16LE(0, 30); // extra
        central.writeUInt16LE(0, 32); // comment
        central.writeUInt16LE(0, 34); // disk
        central.writeUInt16LE(0, 36); // internal attrs
        central.writeUInt32LE(0, 38); // external attrs
        central.writeUInt32LE(offset, 42);
        centralParts.push(central, name);

        offset += local.length + name.length + compressed.length;
    }

    const centralSize = centralParts.reduce((n, b) => n + b.length, 0);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(files.length, 8);
    end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(offset, 16);
    end.writeUInt16LE(0, 20);

    return Buffer.concat([...localParts, ...centralParts, end]);
}

// ============================================
// WORKBOOK
// ============================================

export function buildXlsx(sheets: XlsxSheet[], options: XlsxOptions = {}): Buffer {
    if (sheets.length === 0) throw new Error("buildXlsx: au moins une feuille est requise");
    const timeZone = options.timeZone ?? "Europe/Paris";
    const names = makeSheetNames(sheets.map((s) => s.name));

    const contentTypes =
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        sheets.map((_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
        ).join("") +
        `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
        `</Types>`;

    const rootRels =
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
        `</Relationships>`;

    const definedNames = sheets
        .map((s, i) => {
            if (!s.autoFilter || s.autoFilter.lastCol < 0) return "";
            const { headerRow, lastRow, lastCol } = s.autoFilter;
            const quoted = `'${names[i].replace(/'/g, "''")}'`;
            const ref = `${quoted}!$A$${headerRow + 1}:$${columnLetter(lastCol)}$${Math.max(lastRow, headerRow) + 1}`;
            return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${escapeXml(ref)}</definedName>`;
        })
        .join("");

    const workbook =
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<bookViews><workbookView activeTab="0"/></bookViews>` +
        `<sheets>` +
        names.map((n, i) => `<sheet name="${escapeXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
        `</sheets>` +
        (definedNames ? `<definedNames>${definedNames}</definedNames>` : "") +
        `</workbook>`;

    const workbookRels =
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        sheets.map((_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
        ).join("") +
        `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `</Relationships>`;

    const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const core =
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
        `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
        (options.title ? `<dc:title>${escapeXml(options.title)}</dc:title>` : "") +
        (options.creator ? `<dc:creator>${escapeXml(options.creator)}</dc:creator>` : "") +
        `<dcterms:created xsi:type="dcterms:W3CDTF">${nowIso}</dcterms:created>` +
        `</cp:coreProperties>`;

    const files = [
        { name: "[Content_Types].xml", data: Buffer.from(contentTypes, "utf8") },
        { name: "_rels/.rels", data: Buffer.from(rootRels, "utf8") },
        { name: "docProps/core.xml", data: Buffer.from(core, "utf8") },
        { name: "xl/workbook.xml", data: Buffer.from(workbook, "utf8") },
        { name: "xl/_rels/workbook.xml.rels", data: Buffer.from(workbookRels, "utf8") },
        { name: "xl/styles.xml", data: Buffer.from(STYLES_XML, "utf8") },
        ...sheets.map((s, i) => ({
            name: `xl/worksheets/sheet${i + 1}.xml`,
            data: Buffer.from(renderSheet(s, timeZone, i === 0), "utf8"),
        })),
    ];

    return buildZip(files);
}
