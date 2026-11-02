/**
 * Excel and PowerPoint files written by the assistant (ticket #116).
 *
 * The model hands over structured content (sheets of rows, slides of bullets /
 * tables / visuals of this turn); these builders turn it into branded files.
 * Excel goes through the repo's own dependency-free writer (lib/export/xlsx),
 * PowerPoint through pptxgenjs. Server only.
 */

import type { Brand } from "@/lib/brand/types";
import { buildXlsx, makeSheetNames, XLSX_MAX_CELL_CHARS, type XlsxRow, type XlsxSheet } from "@/lib/export/xlsx";
import { visualTable, type StoredVisual, type VisualSpec } from "@/lib/assistant/visuals/spec";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export type OfficeCell = string | number | null;

export interface OfficeTable {
    columns: string[];
    rows: OfficeCell[][];
}

export interface SpreadsheetInput {
    title: string;
    author: string;
    brand: Brand;
    sheets: Array<{ name: string } & OfficeTable>;
}

export interface SlideInput {
    title: string;
    bullets?: string[];
    table?: OfficeTable;
    visual?: StoredVisual;
    notes?: string;
}

export interface PresentationInput {
    title: string;
    subtitle?: string;
    author: string;
    brand: Brand;
    generatedAt: Date;
    slides: SlideInput[];
}

/** French figures the model may write as text (« 1 234,5 », « 12 % ») become numbers. */
export function toNumberish(value: OfficeCell): OfficeCell {
    if (typeof value !== "string") return value;
    const text = value.trim();
    if (!/^-?[\d\s  ]+([.,]\d+)?$/.test(text)) return value;
    const n = Number(text.replace(/[\s  ]/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : value;
}

function widths(table: OfficeTable): number[] {
    return table.columns.map((header, c) => {
        const longest = Math.max(header.length, ...table.rows.slice(0, 200).map((r) => String(r[c] ?? "").length));
        return Math.min(60, Math.max(10, longest + 2));
    });
}

export function buildSpreadsheet(input: SpreadsheetInput): Buffer {
    const names = makeSheetNames(input.sheets.map((s) => s.name));
    const sheets: XlsxSheet[] = input.sheets.map((sheet, i) => {
        const header: XlsxRow = sheet.columns.map((c) => ({ value: c, style: "header" as const }));
        const body: XlsxRow[] = sheet.rows.map((row) =>
            sheet.columns.map((_, c) => {
                const value = toNumberish(row[c] ?? null);
                if (typeof value === "number") return { value, style: Number.isInteger(value) ? ("integer" as const) : ("text" as const) };
                return { value: value === null ? null : value.slice(0, XLSX_MAX_CELL_CHARS), style: "wrap" as const };
            }),
        );
        return {
            name: names[i],
            rows: [header, ...body],
            columnWidths: widths(sheet),
            freeze: { rows: 1 },
            autoFilter: sheet.columns.length > 0 ? { headerRow: 0, lastRow: body.length, lastCol: sheet.columns.length - 1 } : undefined,
        };
    });
    return buildXlsx(sheets, { title: input.title, creator: input.author || input.brand.name, brand: input.brand });
}

/** A visual of this turn as plain rows (an extra sheet, or a slide table). */
export function visualAsTable(visual: StoredVisual): OfficeTable {
    const t = visualTable(visual.spec);
    return { columns: t.header, rows: t.rows };
}

// -- PowerPoint -----------------------------------------------------------------

const hex = (color: string) => color.replace("#", "").toUpperCase();

/** Slide 13.33 × 7.5 in (16:9). */
const W = 13.33;
const MARGIN = 0.6;
const MAX_TABLE_ROWS = 14;

type ChartData = { name: string; labels: string[]; values: number[] };

/** The chart pptxgenjs can draw natively for a visual, or null (drawn as a table instead). */
export function visualChart(spec: VisualSpec): { type: "bar" | "line" | "area" | "doughnut"; data: ChartData[]; horizontal?: boolean; stacked?: boolean } | null {
    if (spec.kind === "bar" || spec.kind === "line" || spec.kind === "area") {
        const series = spec.series ?? [];
        const rows = spec.rows ?? [];
        if (series.length === 0 || rows.length === 0) return null;
        const seriesKeys = new Set(series.map((s) => s.key));
        const xKey = spec.x_key ?? Object.keys(rows[0]).find((k) => !seriesKeys.has(k)) ?? "x";
        const labels = rows.map((r) => String(r[xKey] ?? ""));
        return {
            type: spec.kind,
            data: series.map((s) => ({ name: s.label, labels, values: rows.map((r) => Number(r[s.key] ?? 0) || 0) })),
            horizontal: spec.horizontal,
            stacked: spec.stacked,
        };
    }
    if (spec.kind === "donut" || spec.kind === "funnel" || spec.kind === "leaderboard") {
        const items = spec.items ?? [];
        if (items.length === 0) return null;
        return {
            type: spec.kind === "donut" ? "doughnut" : "bar",
            data: [{ name: spec.title, labels: items.map((i) => i.label), values: items.map((i) => i.value) }],
            horizontal: spec.kind !== "donut",
        };
    }
    return null;
}

export async function buildPresentation(input: PresentationInput): Promise<{ buffer: Buffer; slides: number }> {
    const { default: PptxGenJS } = await import("pptxgenjs");
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    pptx.title = input.title;
    pptx.author = input.author || input.brand.name;
    pptx.company = input.brand.name;

    const primary = hex(input.brand.palette.primary[700]);
    const accent = hex(input.brand.palette.accent[600]);
    const ink = "0F172A";
    const muted = "64748B";
    const font = "Calibri";
    const dateLabel = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }).format(input.generatedAt);

    // Cover
    const cover = pptx.addSlide();
    cover.background = { color: primary };
    cover.addText(input.title, { x: MARGIN, y: 2.4, w: W - 2 * MARGIN, h: 1.4, fontFace: font, fontSize: 36, bold: true, color: "FFFFFF" });
    if (input.subtitle) cover.addText(input.subtitle, { x: MARGIN, y: 3.8, w: W - 2 * MARGIN, h: 0.8, fontFace: font, fontSize: 18, color: "E2E8F0" });
    cover.addText(`${input.brand.name} · ${dateLabel}`, { x: MARGIN, y: 6.5, w: W - 2 * MARGIN, h: 0.4, fontFace: font, fontSize: 12, color: "CBD5E1" });

    input.slides.forEach((s, index) => {
        const slide = pptx.addSlide();
        slide.background = { color: "FFFFFF" };
        slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.12, h: 7.5, fill: { color: accent }, line: { color: accent } });
        slide.addText(s.title, { x: MARGIN, y: 0.35, w: W - 2 * MARGIN, h: 0.8, fontFace: font, fontSize: 26, bold: true, color: ink });
        slide.addText(`${index + 2}`, { x: W - 1.2, y: 6.95, w: 0.7, h: 0.35, fontFace: font, fontSize: 10, color: muted, align: "right" });

        let top = 1.35;
        const bullets = (s.bullets ?? []).filter((b) => b.trim());
        const hasBody = !!(s.table || s.visual);
        if (bullets.length > 0) {
            const h = hasBody ? Math.min(2.2, 0.42 * bullets.length + 0.2) : 5.4;
            slide.addText(
                bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })),
                { x: MARGIN, y: top, w: W - 2 * MARGIN, h, fontFace: font, fontSize: hasBody ? 15 : 20, color: ink, valign: "top", paraSpaceAfter: 6 },
            );
            top += h + 0.15;
        }

        const area = { x: MARGIN, y: top, w: W - 2 * MARGIN, h: 7.5 - top - 0.7 };
        const chart = s.visual ? visualChart(s.visual.spec) : null;
        if (s.visual && chart) {
            const ChartType = pptx.ChartType;
            const type = chart.type === "doughnut" ? ChartType.doughnut : chart.type === "line" ? ChartType.line : chart.type === "area" ? ChartType.area : ChartType.bar;
            slide.addChart(type, chart.data, {
                ...area,
                barDir: chart.horizontal ? "bar" : "col",
                barGrouping: chart.stacked ? "stacked" : "clustered",
                chartColors: [accent, primary, "94A3B8", "F59E0B", "10B981", "6366F1", "EC4899", "0EA5E9"],
                showLegend: chart.data.length > 1 || chart.type === "doughnut",
                legendPos: "b",
                showTitle: true,
                title: s.visual.spec.title,
                titleFontSize: 14,
                catAxisLabelFontSize: 11,
                valAxisLabelFontSize: 11,
                dataLabelFontSize: 10,
                showValue: chart.type === "doughnut" || chart.data.length === 1,
            });
        } else {
            const table = s.table ?? (s.visual ? visualAsTable(s.visual) : null);
            if (table && table.columns.length > 0) {
                const rows = table.rows.slice(0, MAX_TABLE_ROWS);
                const head = table.columns.map((c) => ({ text: c, options: { bold: true, color: "FFFFFF", fill: { color: primary } } }));
                const body = rows.map((r, i) =>
                    table.columns.map((_, c) => {
                        const v = r[c];
                        const text = v === null || v === undefined ? "" : typeof v === "number" ? new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(v) : v;
                        return { text, options: { color: ink, fill: { color: i % 2 ? "F8FAFC" : "FFFFFF" }, align: typeof v === "number" ? ("right" as const) : ("left" as const) } };
                    }),
                );
                slide.addTable([head, ...body], {
                    x: area.x, y: area.y, w: area.w, fontFace: font, fontSize: rows.length > 10 ? 10 : 12,
                    border: { type: "solid", pt: 0.5, color: "E2E8F0" }, autoPage: false,
                });
                if (table.rows.length > rows.length) {
                    slide.addText(`… ${table.rows.length - rows.length} ligne(s) de plus non affichées`, { x: MARGIN, y: 6.95, w: 6, h: 0.35, fontFace: font, fontSize: 10, italic: true, color: muted });
                }
            }
        }
        if (s.notes?.trim()) slide.addNotes(s.notes.trim());
    });

    const out = await pptx.write({ outputType: "nodebuffer" });
    return { buffer: Buffer.from(out as ArrayBuffer), slides: input.slides.length + 1 };
}
