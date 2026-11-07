/**
 * Every assistant visual drawn as vectors with pdfkit primitives — no raster,
 * no browser. Mirrors components/assistant-ui/visuals/VisualView.tsx: same
 * kinds, same value formatting (lib/assistant/visuals/spec.ts formatValue),
 * the brand colour as the first series, values at the tip where there is room,
 * a legend for two series or more, text in ink colours (never the series one).
 *
 * Fixed-size visuals (kpi_row, vertical bar, line, area, donut, funnel) are
 * kept on one page; row-based ones (table, leaderboard, horizontal bar,
 * heatmap) flow row by row across pages.
 */

import { formatValue, parseVisualSpec, type StoredVisual, type ValueFormat, type VisualRow, type VisualSpec } from "@/lib/assistant/visuals/spec";
import { drawText, hairline, textWidth, truncate, type Doc, type Writer } from "./inline";
import { renderTable, type TableModel } from "./table";
import { FONTS, isDark, mix, seriesColor, type Theme } from "./theme";

// ============================================
// Shared helpers
// ============================================

/** "2026-10-01" → "1 oct." ; anything else as written (VisualView formatX). */
export function formatX(value: unknown): string {
    if (typeof value !== "string") return value === null || value === undefined ? "" : String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return new Date(`${value}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
    }
    return value;
}

export interface Scale {
    lo: number;
    hi: number;
    ticks: number[];
}

/** Round axis bounds and 3–5 ticks, always including zero. */
export function niceScale(minValue: number, maxValue: number, count = 4): Scale {
    let lo = Math.min(0, Number.isFinite(minValue) ? minValue : 0);
    let hi = Math.max(0, Number.isFinite(maxValue) ? maxValue : 0);
    if (hi === lo) hi = lo + 1;
    const raw = (hi - lo) / count;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const norm = raw / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
    lo = Math.floor(lo / step + 1e-9) * step;
    hi = Math.ceil(hi / step - 1e-9) * step;
    const ticks: number[] = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
    return { lo, hi, ticks };
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** A bar with its data end rounded (r ≤ 2.5) and its base square. */
function bar(doc: Doc, x: number, y: number, w: number, h: number, color: string, end: "top" | "bottom" | "right" | "left" | null): void {
    if (w <= 0 || h <= 0) return;
    const r = end ? Math.min(2.5, w / 2, h / 2) : 0;
    doc.save();
    if (r <= 0.2) {
        doc.rect(x, y, w, h).fill(color);
    } else {
        doc.roundedRect(x, y, w, h, r).fill(color);
        // Square the base side.
        if (end === "top") doc.rect(x, y + h - r, w, r).fill(color);
        if (end === "bottom") doc.rect(x, y, w, r).fill(color);
        if (end === "right") doc.rect(x, y, r, h).fill(color);
        if (end === "left") doc.rect(x + w - r, y, r, h).fill(color);
    }
    doc.restore();
}

function legendHeight(doc: Doc, items: Array<{ label: string }>, width: number): number {
    if (items.length < 2) return 0;
    let x = 0;
    let rows = 1;
    for (const item of items) {
        const w = 12 + textWidth(doc, item.label, FONTS.regular, 7.5) + 12;
        if (x > 0 && x + w > width) {
            rows += 1;
            x = 0;
        }
        x += w;
    }
    return rows * 12 + 4;
}

function drawLegend(w: Writer, items: Array<{ label: string; color: string }>, x: number, y: number, width: number): void {
    if (items.length < 2) return;
    const { doc, theme } = w;
    let cx = 0;
    let cy = y;
    for (const item of items) {
        const iw = 12 + textWidth(doc, item.label, FONTS.regular, 7.5) + 12;
        if (cx > 0 && cx + iw > width) {
            cy += 12;
            cx = 0;
        }
        doc.save().circle(x + cx + 3, cy + 4.5, 2.6).fill(item.color).restore();
        drawText(doc, item.label, x + cx + 9, cy + 0.5, { size: 7.5, color: theme.ink2 });
        cx += iw;
    }
}

/** Which x labels to print so they never overlap: every k-th, last one always. */
function labelStep(doc: Doc, labels: string[], slot: number): number {
    const widest = Math.max(1, ...labels.map((l) => textWidth(doc, l, FONTS.regular, 7)));
    return Math.max(1, Math.ceil((widest + 4) / Math.max(1, slot)));
}

function seriesFormat(spec: VisualSpec): ValueFormat {
    return spec.series?.[0]?.format ?? spec.format ?? "number";
}

// ============================================
// kpi_row
// ============================================

function deltaArrow(doc: Doc, x: number, y: number, dir: "up" | "down" | "flat", color: string): void {
    doc.save();
    if (dir === "up") doc.polygon([x, y + 5], [x + 3, y + 0.5], [x + 6, y + 5]).fill(color);
    else if (dir === "down") doc.polygon([x, y + 0.5], [x + 3, y + 5], [x + 6, y + 0.5]).fill(color);
    else doc.rect(x, y + 2.3, 6, 1.2).fill(color);
    doc.restore();
}

function kpiRow(w: Writer, spec: VisualSpec, x: number, width: number): void {
    const { doc, theme } = w;
    const tiles = spec.tiles ?? [];
    const perRow = tiles.length > 4 ? 3 : Math.max(1, tiles.length);
    const gap = 10;
    const tileW = (width - gap * (perRow - 1)) / perRow;
    const hasHint = tiles.some((t) => t.hint);
    const tileH = 60 + (hasHint ? 11 : 0);
    const rows = Math.ceil(tiles.length / perRow);
    w.ensure(rows * (tileH + gap));
    tiles.forEach((tile, i) => {
        const col = i % perRow;
        const row = Math.floor(i / perRow);
        const tx = x + col * (tileW + gap);
        const ty = w.y + row * (tileH + gap);
        doc.save().roundedRect(tx, ty, tileW, tileH, 6).lineWidth(0.7).fillAndStroke(theme.white, theme.line).restore();
        const inner = tileW - 20;
        drawText(doc, truncate(doc, tile.label, inner, FONTS.regular, 7.5), tx + 10, ty + 9, { size: 7.5, color: theme.ink3 });
        const value = formatValue(tile.value, tile.format ?? spec.format ?? "number", true);
        const valueSize = tileW < 110 ? 14 : 17;
        drawText(doc, truncate(doc, value, inner, FONTS.bold, valueSize), tx + 10, ty + 21, { font: FONTS.bold, size: valueSize, color: theme.ink });
        const delta = tile.delta_pct;
        if (typeof delta === "number") {
            const up = delta > 0.05;
            const down = delta < -0.05;
            const color = up ? theme.up : down ? theme.down : theme.ink3;
            deltaArrow(doc, tx + 10, ty + 44, up ? "up" : down ? "down" : "flat", color);
            const label = `${delta > 0 ? "+" : ""}${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(delta)} %`;
            drawText(doc, label, tx + 19, ty + 42.5, { font: FONTS.bold, size: 7.5, color });
        }
        if (tile.hint) drawText(doc, truncate(doc, tile.hint, inner, FONTS.regular, 7), tx + 10, ty + tileH - 15, { size: 7, color: theme.ink3 });
    });
    w.y += rows * (tileH + gap) - gap;
}

// ============================================
// bar / line / area (cartesian)
// ============================================

const PLOT_H = 150;
const AXIS_W = 42;

interface Cartesian {
    rows: VisualRow[];
    xKey: string;
    series: Array<{ key: string; label: string; format?: ValueFormat }>;
    labels: string[];
    format: ValueFormat;
}

function cartesian(spec: VisualSpec): Cartesian {
    const rows = spec.rows ?? [];
    const xKey = spec.x_key ?? "x";
    return { rows, xKey, series: spec.series ?? [], labels: rows.map((r) => formatX(r[xKey])), format: seriesFormat(spec) };
}

/** [min, max] of what is drawn: stacked → sums of the positive / negative parts. */
function extent(c: Cartesian, stacked: boolean): [number, number] {
    let min = 0;
    let max = 0;
    for (const row of c.rows) {
        if (stacked) {
            let pos = 0;
            let neg = 0;
            for (const s of c.series) {
                const v = num(row[s.key]) ?? 0;
                if (v >= 0) pos += v;
                else neg += v;
            }
            max = Math.max(max, pos);
            min = Math.min(min, neg);
        } else {
            for (const s of c.series) {
                const v = num(row[s.key]);
                if (v === null) continue;
                max = Math.max(max, v);
                min = Math.min(min, v);
            }
        }
    }
    return [min, max];
}

function drawYAxis(w: Writer, scale: Scale, format: ValueFormat, x: number, top: number, width: number): (v: number) => number {
    const { doc, theme } = w;
    const plotX = x + AXIS_W;
    const plotW = width - AXIS_W;
    const yOf = (v: number) => top + PLOT_H - ((v - scale.lo) / (scale.hi - scale.lo)) * PLOT_H;
    for (const tick of scale.ticks) {
        const ty = yOf(tick);
        hairline(doc, plotX, ty, plotW, tick === 0 ? theme.lineStrong : theme.line, tick === 0 ? 0.8 : 0.45);
        drawText(doc, formatValue(tick, format, true), x, ty - 3.6, { size: 7, color: theme.ink3, width: AXIS_W - 6, align: "right" });
    }
    return yOf;
}

function drawXLabels(w: Writer, labels: string[], centers: number[], slot: number, y: number): void {
    const { doc, theme } = w;
    const step = labelStep(doc, labels, slot);
    // Every step-th label, and always the last one (dropping the printed one just before it when too close).
    const printed = new Set(labels.map((_, i) => i).filter((i) => i % step === 0));
    const last = labels.length - 1;
    if (last > 0 && !printed.has(last)) {
        printed.delete(last - (last % step));
        printed.add(last);
    }
    labels.forEach((label, i) => {
        if (!printed.has(i)) return;
        const maxW = Math.max(slot * step - 4, 20);
        const text = truncate(doc, label, maxW, FONTS.regular, 7);
        drawText(doc, text, centers[i] - maxW / 2, y, { size: 7, color: theme.ink3, width: maxW, align: "center" });
    });
}

function verticalBars(w: Writer, spec: VisualSpec, x: number, width: number): void {
    const { doc, theme } = w;
    const c = cartesian(spec);
    const stacked = !!spec.stacked;
    const legend = c.series.map((s, i) => ({ label: s.label, color: seriesColor(theme, i) }));
    const lh = legendHeight(doc, legend, width);
    w.ensure(lh + PLOT_H + 24);
    drawLegend(w, legend, x, w.y, width);
    const top = w.y + lh + 6;
    const [min, max] = extent(c, stacked);
    const scale = niceScale(min, max);
    const yOf = drawYAxis(w, scale, c.format, x, top, width);
    const plotX = x + AXIS_W;
    const plotW = width - AXIS_W;
    const n = Math.max(1, c.rows.length);
    const slot = plotW / n;
    const group = slot * (n > 12 ? 0.8 : 0.66);
    const per = stacked ? 1 : Math.max(1, c.series.length);
    const barW = Math.max(0.6, Math.min(18, group / per));
    const labelled = c.series.length === 1 && n <= 12;
    const zero = yOf(0);
    const centers: number[] = [];

    c.rows.forEach((row, i) => {
        const cx = plotX + slot * i + slot / 2;
        centers.push(cx);
        if (stacked) {
            let pos = 0;
            let neg = 0;
            c.series.forEach((s, si) => {
                const v = num(row[s.key]) ?? 0;
                if (v === 0) return;
                const lastPos = c.series.slice(si + 1).every((t) => (num(row[t.key]) ?? 0) <= 0);
                const lastNeg = c.series.slice(si + 1).every((t) => (num(row[t.key]) ?? 0) >= 0);
                const from = v >= 0 ? pos : neg;
                const to = from + v;
                const y1 = yOf(Math.max(from, to));
                const y2 = yOf(Math.min(from, to));
                bar(doc, cx - barW / 2, y1, barW, y2 - y1, seriesColor(theme, si), v >= 0 ? (lastPos ? "top" : null) : lastNeg ? "bottom" : null);
                // A 1pt surface gap between stacked parts.
                if (v >= 0 ? !lastPos : !lastNeg) hairline(doc, cx - barW / 2, v >= 0 ? y1 : y2, barW, theme.white, 1);
                if (v >= 0) pos = to;
                else neg = to;
            });
        } else {
            const start = cx - (barW * per) / 2;
            c.series.forEach((s, si) => {
                const v = num(row[s.key]);
                if (v === null) return;
                const bx = start + si * barW;
                const y = yOf(v);
                bar(doc, bx + (per > 1 ? 0.4 : 0), Math.min(y, zero), barW - (per > 1 ? 0.8 : 0), Math.abs(zero - y), seriesColor(theme, si), v >= 0 ? "top" : "bottom");
                if (labelled) {
                    const label = formatValue(v, s.format ?? c.format, true);
                    drawText(doc, label, cx - slot / 2, v >= 0 ? y - 10 : y + 2, { size: 7, color: theme.ink2, width: slot, align: "center" });
                }
            });
        }
    });
    drawXLabels(w, c.labels, centers, slot, top + PLOT_H + 5);
    w.y = top + PLOT_H + 18;
}

function horizontalBars(w: Writer, spec: VisualSpec, x: number, width: number): void {
    const { doc, theme } = w;
    const c = cartesian(spec);
    const stacked = !!spec.stacked;
    const legend = c.series.map((s, i) => ({ label: s.label, color: seriesColor(theme, i) }));
    const lh = legendHeight(doc, legend, width);
    const labelW = Math.min(130, width * 0.3);
    const valueW = 52;
    const plotX = x + labelW + 6;
    const plotW = width - labelW - 6 - valueW;
    const per = stacked ? 1 : Math.max(1, c.series.length);
    const barH = per > 1 ? 7 : 11;
    const rowH = Math.max(18, per * barH + 7);
    const [min, max] = extent(c, stacked);
    const scale = niceScale(min, max);
    const xOf = (v: number) => plotX + ((v - scale.lo) / (scale.hi - scale.lo)) * plotW;
    const zero = xOf(0);

    w.ensure(lh + Math.min(c.rows.length, 4) * rowH + 16);
    drawLegend(w, legend, x, w.y, width);
    w.y += lh;

    c.rows.forEach((row, i) => {
        w.ensure(rowH);
        const y = w.y;
        for (const tick of scale.ticks) {
            const tx = xOf(tick);
            doc.save().moveTo(tx, y).lineTo(tx, y + rowH).lineWidth(tick === 0 ? 0.8 : 0.45).strokeColor(tick === 0 ? theme.lineStrong : theme.line).stroke().restore();
        }
        drawText(doc, truncate(doc, c.labels[i], labelW, FONTS.regular, 7.5), x, y + rowH / 2 - 4.5, { size: 7.5, color: theme.ink2, width: labelW, align: "right" });
        const top = y + (rowH - per * barH) / 2;
        let total = 0;
        let tipX = zero;
        if (stacked) {
            let pos = 0;
            let neg = 0;
            c.series.forEach((s, si) => {
                const v = num(row[s.key]) ?? 0;
                if (v === 0) return;
                const lastPos = c.series.slice(si + 1).every((t) => (num(row[t.key]) ?? 0) <= 0);
                const from = v >= 0 ? pos : neg;
                const to = from + v;
                const x1 = xOf(Math.min(from, to));
                const x2 = xOf(Math.max(from, to));
                bar(doc, x1, top, x2 - x1, barH, seriesColor(theme, si), v >= 0 && lastPos ? "right" : v < 0 ? "left" : null);
                if (v >= 0) pos = to;
                else neg = to;
                total += v;
            });
            tipX = xOf(Math.max(pos, 0));
        } else {
            c.series.forEach((s, si) => {
                const v = num(row[s.key]);
                if (v === null) return;
                const bx = xOf(v);
                bar(doc, Math.min(bx, zero), top + si * barH + (per > 1 ? 0.5 : 0), Math.abs(bx - zero), barH - (per > 1 ? 1 : 0), seriesColor(theme, si), v >= 0 ? "right" : "left");
                total = v;
                tipX = Math.max(tipX, bx);
            });
        }
        if (c.series.length === 1 || stacked) {
            const label = formatValue(total, c.format, true);
            drawText(doc, label, tipX + 4, y + rowH / 2 - 4, { size: 7, color: theme.ink2 });
        }
        w.y += rowH;
    });
    // Tick labels under the last row.
    w.ensure(12);
    for (const tick of scale.ticks) {
        drawText(doc, formatValue(tick, c.format, true), xOf(tick) - 25, w.y + 3, { size: 6.5, color: theme.ink3, width: 50, align: "center" });
    }
    w.y += 14;
}

function lineOrArea(w: Writer, spec: VisualSpec, x: number, width: number): void {
    const { doc, theme } = w;
    const c = cartesian(spec);
    const area = spec.kind === "area";
    const stacked = area && !!spec.stacked;
    const legend = c.series.map((s, i) => ({ label: s.label, color: seriesColor(theme, i) }));
    const lh = legendHeight(doc, legend, width);
    w.ensure(lh + PLOT_H + 24);
    drawLegend(w, legend, x, w.y, width);
    const top = w.y + lh + 6;
    const [min, max] = extent(c, stacked);
    const scale = niceScale(min, max);
    const yOf = drawYAxis(w, scale, c.format, x, top, width);
    const plotX = x + AXIS_W + 8;
    const plotW = width - AXIS_W - 8 - 30; // room on the right for the last-value label
    const n = c.rows.length;
    const xOf = (i: number) => (n <= 1 ? plotX + plotW / 2 : plotX + (i * plotW) / (n - 1));
    const base = c.rows.map(() => 0);
    const ends: Array<{ x: number; y: number; label: string; color: string }> = [];

    c.series.forEach((s, si) => {
        const color = seriesColor(theme, si);
        const points: Array<[number, number]> = [];
        const lower: Array<[number, number]> = [];
        c.rows.forEach((row, i) => {
            const v = num(row[s.key]);
            if (v === null && !stacked) return;
            const value = (v ?? 0) + (stacked ? base[i] : 0);
            lower.push([xOf(i), yOf(stacked ? base[i] : Math.max(scale.lo, 0))]);
            points.push([xOf(i), yOf(value)]);
            if (stacked) base[i] = value;
        });
        if (points.length === 0) return;
        if (area && points.length > 1) {
            doc.save().fillOpacity(stacked ? 0.22 : 0.12);
            doc.moveTo(points[0][0], points[0][1]);
            for (const [px, py] of points.slice(1)) doc.lineTo(px, py);
            for (const [px, py] of [...lower].reverse()) doc.lineTo(px, py);
            doc.closePath().fill(color);
            doc.restore();
        }
        if (points.length > 1) {
            doc.save().lineWidth(1.6).lineJoin("round").lineCap("round").strokeColor(color);
            doc.moveTo(points[0][0], points[0][1]);
            for (const [px, py] of points.slice(1)) doc.lineTo(px, py);
            doc.stroke().restore();
        }
        if (!area && n <= 24) {
            for (const [px, py] of points.slice(0, -1)) doc.save().circle(px, py, 1.5).fill(color).restore();
        }
        const [ex, ey] = points[points.length - 1];
        doc.save().circle(ex, ey, 3).lineWidth(1.2).fillAndStroke(color, theme.white).restore();
        const lastRow = [...c.rows].reverse().find((r) => num(r[s.key]) !== null);
        ends.push({ x: ex, y: ey, label: formatValue(lastRow ? lastRow[s.key] : null, s.format ?? c.format, true), color });
    });

    // Last-value labels, nudged apart vertically.
    ends.sort((a, b) => a.y - b.y);
    let prev = -Infinity;
    for (const end of ends) {
        const ly = Math.max(end.y - 4, prev + 9);
        prev = ly;
        drawText(doc, end.label, end.x + 5, ly, { font: FONTS.bold, size: 7, color: theme.ink2 });
    }
    drawXLabels(w, c.labels, c.rows.map((_, i) => xOf(i)), n > 1 ? plotW / (n - 1) : plotW, top + PLOT_H + 5);
    w.y = top + PLOT_H + 18;
}

// ============================================
// donut
// ============================================

function sector(doc: Doc, cx: number, cy: number, r1: number, r0: number, a0: number, a1: number): void {
    const pt = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(3)} ${(cy + r * Math.sin(a)).toFixed(3)}`;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    doc.path(`M ${pt(r1, a0)} A ${r1} ${r1} 0 ${large} 1 ${pt(r1, a1)} L ${pt(r0, a1)} A ${r0} ${r0} 0 ${large} 0 ${pt(r0, a0)} Z`);
}

function donut(w: Writer, spec: VisualSpec, x: number, width: number): void {
    const { doc, theme } = w;
    const items = spec.items ?? [];
    const format = spec.format ?? "number";
    const total = items.reduce((sum, item) => sum + Math.max(0, item.value), 0);
    const size = 124;
    const height = Math.max(size, items.length * 15 + 8);
    w.ensure(height + 6);
    const cx = x + size / 2 + 4;
    const cy = w.y + height / 2;
    const r1 = size / 2;
    const r0 = r1 * 0.64;
    if (total <= 0) {
        doc.save();
        sector(doc, cx, cy, r1, r0, -Math.PI / 2, Math.PI / 2);
        doc.fill(theme.track);
        sector(doc, cx, cy, r1, r0, Math.PI / 2, (Math.PI * 3) / 2);
        doc.fill(theme.track);
        doc.restore();
    } else {
        let a = -Math.PI / 2;
        items.forEach((item, i) => {
            const share = Math.max(0, item.value) / total;
            if (share <= 0) return;
            const sweep = share * Math.PI * 2;
            doc.save();
            if (sweep >= Math.PI * 2 - 1e-6) {
                sector(doc, cx, cy, r1, r0, a, a + Math.PI);
                doc.fill(seriesColor(theme, i));
                sector(doc, cx, cy, r1, r0, a + Math.PI, a + Math.PI * 2);
                doc.fill(seriesColor(theme, i));
            } else {
                sector(doc, cx, cy, r1, r0, a, a + sweep);
                doc.fill(seriesColor(theme, i));
                // Surface gap between slices.
                doc.moveTo(cx + r0 * Math.cos(a), cy + r0 * Math.sin(a)).lineTo(cx + (r1 + 0.5) * Math.cos(a), cy + (r1 + 0.5) * Math.sin(a)).lineWidth(1.4).strokeColor(theme.white).stroke();
            }
            doc.restore();
            a += sweep;
        });
    }
    drawText(doc, formatValue(total, format, true), cx - r0, cy - 9, { font: FONTS.bold, size: 12.5, color: theme.ink, width: r0 * 2, align: "center" });
    drawText(doc, "Total", cx - r0, cy + 5, { size: 7, color: theme.ink3, width: r0 * 2, align: "center" });

    const lx = x + size + 28;
    const lw = width - size - 28;
    let ly = w.y + (height - items.length * 15) / 2;
    items.forEach((item, i) => {
        doc.save().roundedRect(lx, ly + 2.5, 7, 7, 1.5).fill(seriesColor(theme, i)).restore();
        const pct = total > 0 ? `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(Math.round((item.value / total) * 1000) / 10)} %` : "—";
        const value = formatValue(item.value, format);
        drawText(doc, pct, lx, ly + 1.5, { size: 7.5, color: theme.ink3, width: lw, align: "right" });
        const valueRight = lw - 44;
        drawText(doc, value, lx, ly + 1.5, { font: FONTS.bold, size: 8, color: theme.ink, width: valueRight, align: "right" });
        const labelW = valueRight - textWidth(doc, value, FONTS.bold, 8) - 22;
        drawText(doc, truncate(doc, item.label, labelW, FONTS.regular, 8), lx + 12, ly + 1.5, { size: 8, color: theme.ink2 });
        ly += 15;
    });
    w.y += height;
}

// ============================================
// funnel / leaderboard
// ============================================

function funnel(w: Writer, spec: VisualSpec, x: number, width: number): void {
    const { doc, theme } = w;
    const items = spec.items ?? [];
    const format = spec.format ?? "number";
    const top = Math.max(...items.map((i) => i.value), 1);
    const rowH = 22;
    const labelW = Math.min(130, width * 0.28);
    const valueW = 96;
    const trackX = x + labelW + 8;
    const trackW = width - labelW - 8 - valueW - 6;
    w.ensure(items.length * rowH);
    items.forEach((item, i) => {
        const y = w.y + i * rowH;
        drawText(doc, truncate(doc, item.label, labelW, FONTS.regular, 8), x, y + 6, { size: 8, color: theme.ink2 });
        doc.save().roundedRect(trackX, y + 3, trackW, 16, 3).fill(theme.track).restore();
        const bw = Math.max(trackW * 0.015, (item.value / top) * trackW);
        doc.save().roundedRect(trackX, y + 3, bw, 16, 3).fill(theme.ordinal[Math.min(theme.ordinal.length - 1, i)]).restore();
        const previous = i > 0 ? items[i - 1].value : null;
        const step = previous && previous > 0 ? `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(Math.round((item.value / previous) * 1000) / 10)} %` : "";
        drawText(doc, step, x + width - 40, y + 6.5, { size: 7, color: theme.ink3, width: 40, align: "right" });
        drawText(doc, formatValue(item.value, format), x + width - valueW, y + 6, { font: FONTS.bold, size: 8, color: theme.ink, width: valueW - 46, align: "right" });
    });
    w.y += items.length * rowH;
}

function leaderboard(w: Writer, spec: VisualSpec, x: number, width: number): void {
    const { doc, theme } = w;
    const items = spec.items ?? [];
    const format = spec.format ?? "number";
    const top = Math.max(...items.map((i) => i.value), 1);
    const labelW = Math.min(160, width * 0.34);
    const valueW = 64;
    const trackX = x + 22 + labelW + 8;
    const trackW = width - 22 - labelW - 8 - valueW - 6;
    w.ensure(Math.min(items.length, 4) * 24);
    items.forEach((item, i) => {
        const rowH = item.detail ? 26 : 19;
        w.ensure(rowH);
        const y = w.y;
        drawText(doc, String(i + 1), x, y + 4, { size: 7.5, color: theme.ink4, width: 14, align: "right" });
        drawText(doc, truncate(doc, item.label, labelW, FONTS.regular, 8.5), x + 22, y + 3, { size: 8.5, color: theme.ink });
        if (item.detail) drawText(doc, truncate(doc, item.detail, labelW, FONTS.regular, 7), x + 22, y + 14, { size: 7, color: theme.ink3 });
        const by = y + (item.detail ? 9 : 6);
        doc.save().roundedRect(trackX, by, trackW, 6, 3).fill(theme.track).restore();
        doc.save().roundedRect(trackX, by, Math.max(trackW * 0.015, (Math.max(0, item.value) / top) * trackW), 6, 3).fill(theme.primary).restore();
        drawText(doc, formatValue(item.value, format), x + width - valueW, y + 3, { font: FONTS.bold, size: 8.5, color: theme.ink, width: valueW, align: "right" });
        w.y += rowH;
    });
}

// ============================================
// heatmap
// ============================================

function heatmap(w: Writer, spec: VisualSpec, x: number, width: number): void {
    const { doc, theme } = w;
    const cells = spec.cells ?? [];
    const format = spec.format ?? "number";
    const rowLabels = [...new Set(cells.map((c) => c.row))];
    const colLabels = [...new Set(cells.map((c) => c.col))];
    const byKey = new Map(cells.map((c) => [`${c.row}\u0000${c.col}`, c.value]));
    const max = Math.max(...cells.map((c) => c.value), 1);
    const labelW = 52;
    const gap = 1.5;
    const cellW = (width - labelW) / Math.max(1, colLabels.length);
    const cellH = 16;
    const showValues = colLabels.length <= 14;
    const colStep = labelStep(doc, colLabels, cellW);

    const header = () => {
        colLabels.forEach((col, i) => {
            if (i % colStep !== 0) return;
            drawText(doc, truncate(doc, col, cellW * colStep - 2, FONTS.regular, 6.5), x + labelW + i * cellW, w.y, { size: 6.5, color: theme.ink3, width: cellW, align: "center" });
        });
        w.y += 11;
    };
    w.ensure(11 + Math.min(rowLabels.length, 7) * cellH + 16);
    header();
    const unlisten = w.onBreak(header);
    for (const row of rowLabels) {
        w.ensure(cellH);
        const y = w.y;
        drawText(doc, truncate(doc, row, labelW - 6, FONTS.regular, 7), x, y + 4, { size: 7, color: theme.ink3 });
        colLabels.forEach((col, i) => {
            const value = byKey.get(`${row}\u0000${col}`);
            const t = value === undefined ? 0 : Math.max(0, value) / max;
            const fill = value === undefined ? theme.track : mix(theme.seqLo, theme.seqHi, t);
            const cx = x + labelW + i * cellW;
            doc.save().roundedRect(cx + gap / 2, y + gap / 2, cellW - gap, cellH - gap, 1.5).fill(fill).restore();
            if (value !== undefined && showValues) {
                drawText(doc, formatValue(value, format, true), cx, y + 4.5, { size: 6.2, color: isDark(fill) ? theme.white : theme.ink2, width: cellW, align: "center" });
            }
        });
        w.y += cellH;
    }
    unlisten();
    // Colour scale: « moins » ▭▭▭ « plus ».
    w.ensure(14);
    const scaleW = 90;
    const sx = x + width - scaleW - 24;
    drawText(doc, "moins", sx - 28, w.y + 4, { size: 6.5, color: theme.ink3, width: 24, align: "right" });
    for (let i = 0; i < 10; i++) doc.save().rect(sx + (i * scaleW) / 10, w.y + 5, scaleW / 10 + 0.3, 5).fill(mix(theme.seqLo, theme.seqHi, i / 9)).restore();
    drawText(doc, "plus", sx + scaleW + 4, w.y + 4, { size: 6.5, color: theme.ink3 });
    w.y += 16;
}

// ============================================
// table
// ============================================

export function visualTableModel(spec: VisualSpec): TableModel {
    const columns = spec.columns ?? [];
    const rows = spec.rows ?? [];
    const numeric = columns.map((c) => rows.every((r) => r[c.key] === null || r[c.key] === undefined || typeof r[c.key] === "number"));
    return {
        header: columns.map((c) => [{ text: c.label }]),
        rows: rows.map((r) => columns.map((c) => [{ text: formatValue(r[c.key], c.format ?? (typeof r[c.key] === "number" ? "number" : "text")) }])),
        align: columns.map(() => null),
        numeric,
    };
}

// ============================================
// Entry
// ============================================

/** Draws a visual (title, body, unverified note) at the cursor. Never throws. */
export function renderVisual(w: Writer, visual: StoredVisual | { spec: unknown; unverified?: number[] }, x: number, width: number): void {
    const { doc, theme } = w;
    const parsed = parseVisualSpec(visual?.spec);
    const startPage = w.page;
    const startY = w.y;
    if (!parsed.ok) {
        w.ensure(16);
        drawText(doc, "Visuel non reproductible dans le PDF.", x, w.y, { font: FONTS.italic, size: 8.5, color: theme.ink3 });
        w.y += 18;
        return;
    }
    const spec = parsed.spec;
    const headerH = 15 + (spec.subtitle ? 11 : 0) + 6;
    // Keep the title with the start of the body.
    w.ensure(headerH + (spec.kind === "table" || spec.kind === "leaderboard" || spec.kind === "heatmap" || (spec.kind === "bar" && spec.horizontal) ? 70 : estimateHeight(spec)));
    drawText(doc, truncate(doc, spec.title, width, FONTS.bold, 10), x, w.y, { font: FONTS.bold, size: 10, color: theme.ink });
    if (spec.subtitle) drawText(doc, truncate(doc, spec.subtitle, width, FONTS.regular, 8), x, w.y + 14, { size: 8, color: theme.ink3 });
    w.y += headerH;
    try {
        switch (spec.kind) {
            case "kpi_row":
                kpiRow(w, spec, x, width);
                break;
            case "bar":
                if (spec.horizontal) horizontalBars(w, spec, x, width);
                else verticalBars(w, spec, x, width);
                break;
            case "line":
            case "area":
                lineOrArea(w, spec, x, width);
                break;
            case "donut":
                donut(w, spec, x, width);
                break;
            case "funnel":
                funnel(w, spec, x, width);
                break;
            case "leaderboard":
                leaderboard(w, spec, x, width);
                break;
            case "heatmap":
                heatmap(w, spec, x, width);
                break;
            case "table":
                renderTable(w, visualTableModel(spec), x, width);
                w.y -= 10;
                break;
        }
    } catch (error) {
        console.warn("[assistant.pdf] visual failed", spec.kind, error);
        if (w.page === startPage) w.y = Math.max(w.y, startY + headerH);
        drawText(doc, "Visuel non reproductible dans le PDF.", x, w.y, { font: FONTS.italic, size: 8.5, color: theme.ink3 });
        w.y += 14;
    }
    const unverified = (visual as StoredVisual).unverified ?? [];
    if (unverified.length > 0) {
        w.ensure(14);
        const list = unverified.slice(0, 8).map((v) => formatValue(v, "number")).join(", ");
        drawText(doc, truncate(doc, `Chiffres non retrouvés dans les sources : ${list}`, width, FONTS.italic, 7.5), x, w.y + 4, { font: FONTS.italic, size: 7.5, color: theme.warn });
        w.y += 14;
    }
    w.y += 14;
}

/** Height of the fixed-size body, to keep a visual on one page. */
function estimateHeight(spec: VisualSpec): number {
    switch (spec.kind) {
        case "kpi_row": {
            const n = spec.tiles?.length ?? 0;
            const rows = Math.ceil(n / (n > 4 ? 3 : Math.max(1, n)));
            return rows * 82;
        }
        case "donut":
            return Math.max(124, (spec.items?.length ?? 0) * 15 + 8) + 6;
        case "funnel":
            return (spec.items?.length ?? 0) * 22;
        default:
            return PLOT_H + 24 + ((spec.series?.length ?? 0) > 1 ? 16 : 0);
    }
}
