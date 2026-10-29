/**
 * GFM-style tables: shaded header row, zebra rows, right-aligned numeric
 * columns, rows that never split across pages, and the header repeated at the
 * top of every continuation page. Used for markdown tables and for the `table`
 * visual.
 */

import type { Align, Run } from "./markdown";
import { hairline, layoutRuns, drawLine, type Paragraph, type Writer } from "./inline";

export interface TableModel {
    header: Run[][];
    rows: Run[][][];
    align: Align[];
    /** Per column; computed from the cells when absent. */
    numeric?: boolean[];
}

const PAD_X = 6;
const PAD_Y = 4.5;

/** A figure as French answers write them: « 1 240 », « -3,5 % », « 12 k€ », « +4 pts », « 2 h 05 ». */
const NUMERIC = /^[-+−–]?\s?[\d   ]+(?:[.,]\d+)?\s?(?:%|€|k€|M€|k|M|pts?|h(?:\s?\d{2})?|min|s|j)?$/i;

export function isNumericText(text: string): boolean {
    const t = text.trim();
    return t.length > 0 && t.length <= 24 && NUMERIC.test(t);
}

const cellText = (runs: Run[]) => runs.map((r) => r.text).join("").trim();

export function numericColumns(model: TableModel): boolean[] {
    const width = model.header.length;
    return Array.from({ length: width }, (_, i) => {
        const values = model.rows.map((row) => cellText(row[i] ?? [])).filter((t) => t && t !== "—" && t !== "-");
        return values.length > 0 && values.every(isNumericText);
    });
}

function columnWidths(w: Writer, model: TableModel, total: number, size: number, numeric: boolean[]): number[] {
    const n = Math.max(1, model.header.length);
    const big = 10_000;
    const natural: number[] = [];
    const minimum: number[] = [];
    for (let c = 0; c < n; c++) {
        let nat = 0;
        let min = 0;
        for (const row of [model.header, ...model.rows]) {
            const runs = row[c] ?? [];
            const para = layoutRuns(w.doc, runs, big, { size, color: "#000", bold: row === model.header }, w.theme);
            nat = Math.max(nat, ...para.lines.map((l) => l.width));
            for (const run of runs) {
                for (const word of run.text.split(/\s+/)) {
                    if (!word) continue;
                    const p = layoutRuns(w.doc, [{ ...run, text: word }], big, { size, color: "#000", bold: row === model.header }, w.theme);
                    min = Math.max(min, p.lines[0]?.width ?? 0);
                }
            }
        }
        natural.push(Math.min(nat + PAD_X * 2, total * 0.6));
        minimum.push(Math.min(min + PAD_X * 2, total * 0.35, natural[c]));
    }
    const sumNat = natural.reduce((a, b) => a + b, 0);
    if (sumNat <= total) {
        // Fill the width: the extra goes to the text columns (figures stay snug), else to all.
        const extra = total - sumNat;
        const textSum = natural.reduce((a, v, i) => a + (numeric[i] ? 0 : v), 0);
        if (textSum > 0) return natural.map((v, i) => (numeric[i] ? v + Math.min(extra * 0.1, 24) / n : v + (extra - Math.min(extra * 0.1, 24)) * (v / textSum)));
        return natural.map((v) => v + extra * (v / sumNat));
    }
    const sumMin = minimum.reduce((a, b) => a + b, 0);
    if (sumMin >= total) return minimum.map((v) => (v / sumMin) * total);
    const flex = natural.map((v, i) => v - minimum[i]);
    const sumFlex = flex.reduce((a, b) => a + b, 0) || 1;
    return minimum.map((v, i) => v + (total - sumMin) * (flex[i] / sumFlex));
}

interface LaidRow {
    cells: Paragraph[];
    height: number;
}

/** Draws the table at the cursor. Returns the number of page breaks it took. */
export function renderTable(w: Writer, model: TableModel, x: number, width: number, opts: { size?: number } = {}): number {
    const { doc, theme } = w;
    const n = model.header.length;
    if (n === 0) return 0;
    const size = opts.size ?? (n >= 8 ? 7.5 : 8.5);
    const numeric = model.numeric ?? numericColumns(model);
    const align = Array.from({ length: n }, (_, i): "left" | "right" | "center" => model.align[i] ?? (numeric[i] ? "right" : "left"));
    const widths = columnWidths(w, model, width, size, numeric);
    const lay = (row: Run[][], header: boolean): LaidRow => {
        const cells = widths.map((cw, i) => layoutRuns(doc, row[i] ?? [], cw - PAD_X * 2, { size, color: header ? theme.ink : theme.ink2, bold: header }, theme));
        return { cells, height: Math.max(...cells.map((c) => c.height)) + PAD_Y * 2 };
    };
    const header = lay(model.header, true);

    const drawRow = (row: LaidRow, kind: "header" | "even" | "odd") => {
        const y = w.y;
        if (kind === "header") doc.save().rect(x, y, width, row.height).fill(theme.primarySoft).restore();
        if (kind === "odd") doc.save().rect(x, y, width, row.height).fill(theme.zebra).restore();
        let cx = x;
        row.cells.forEach((cell, i) => {
            let ly = y + PAD_Y;
            for (const line of cell.lines) {
                drawLine(w, line, cx + PAD_X, ly, cell, align[i], widths[i] - PAD_X * 2);
                ly += cell.lineHeight;
            }
            cx += widths[i];
        });
        hairline(doc, x, y + row.height, width, kind === "header" ? theme.lineStrong : theme.line, kind === "header" ? 0.8 : 0.5);
        w.y = y + row.height;
    };

    const rows = model.rows.map((r) => lay(r, false));
    // The header never sits alone at the bottom of a page: it starts with up to 3 rows.
    w.ensure(header.height + rows.slice(0, 3).reduce((h, r) => h + r.height, 0) + 4);
    hairline(doc, x, w.y, width, theme.lineStrong, 0.8);
    drawRow(header, "header");

    let breaks = 0;
    rows.forEach((row, i) => {
        if (w.y + row.height > w.bottom) {
            w.newPage();
            breaks += 1;
            hairline(doc, x, w.y, width, theme.lineStrong, 0.8);
            drawRow(header, "header");
        }
        drawRow(row, i % 2 === 1 ? "odd" : "even");
    });
    w.y += 10;
    return breaks;
}
