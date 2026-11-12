/**
 * What the assistant can draw: one small, validated vocabulary of visuals.
 *
 * The model fills a `VisualSpec` (via the `show_visual` tool); the server
 * validates it here and the browser renders it (components/assistant-ui/visuals).
 * Pure and dependency-free apart from zod, so both sides share it.
 *
 *   kpi_row      2–6 headline figures, each with an optional change vs previous
 *   line / area  one or several series over an ordered x axis (days, weeks…)
 *   bar          categories compared; `stacked`, or `horizontal` for long labels
 *   donut        how a total splits (≤ 8 slices)
 *   funnel       ordered stages, each a part of the previous one
 *   table        a sortable grid, when the reader needs the exact figures
 *   heatmap      day × hour style grids (row × col → value)
 *   leaderboard  a ranking with a bar per entry
 */

import { z } from "zod";

export const VISUAL_KINDS = ["kpi_row", "line", "area", "bar", "donut", "funnel", "table", "heatmap", "leaderboard"] as const;
export type VisualKind = (typeof VISUAL_KINDS)[number];

/** number: 1 240 · percent: the value is already a percentage (12,6 %) · duration: seconds · text: as written */
export const VALUE_FORMATS = ["number", "percent", "duration", "text"] as const;
export type ValueFormat = (typeof VALUE_FORMATS)[number];

const MAX_SPEC_BYTES = 80_000;

const label = (max: number) => z.string().trim().min(1).max(max);
const cell = z.union([z.string().max(300), z.number().finite(), z.null()]);

const SeriesSchema = z.object({ key: label(60), label: label(60), format: z.enum(VALUE_FORMATS).optional() });
const ColumnSchema = z.object({ key: label(60), label: label(60), format: z.enum(VALUE_FORMATS).optional() });
const TileSchema = z.object({
    label: label(60),
    value: z.union([z.number().finite(), z.string().trim().min(1).max(40)]),
    format: z.enum(VALUE_FORMATS).optional(),
    /** Change vs the previous period, in %. Null = no comparison available. */
    delta_pct: z.number().finite().nullable().optional(),
    hint: z.string().trim().max(120).optional(),
});
const ItemSchema = z.object({ label: label(80), value: z.number().finite(), detail: z.string().trim().max(80).optional() });
const HeatCellSchema = z.object({ row: label(30), col: label(30), value: z.number().finite() });

export type VisualRow = Record<string, string | number | null>;

const BaseSchema = z.object({
    kind: z.enum(VISUAL_KINDS),
    title: label(120),
    subtitle: z.string().trim().max(200).optional(),
    /** Default format of the values (donut, funnel, leaderboard, heatmap). */
    format: z.enum(VALUE_FORMATS).optional(),
    /** Key of `rows` holding the x / category label. Defaults to the first non-series key. */
    x_key: z.string().max(60).optional(),
    series: z.array(SeriesSchema).max(8).optional(),
    columns: z.array(ColumnSchema).max(12).optional(),
    rows: z.array(z.record(z.string().max(60), cell)).max(400).optional(),
    stacked: z.boolean().optional(),
    horizontal: z.boolean().optional(),
    tiles: z.array(TileSchema).max(6).optional(),
    items: z.array(ItemSchema).max(40).optional(),
    cells: z.array(HeatCellSchema).max(400).optional(),
});

const LIMITS: Partial<Record<VisualKind, { items?: [number, number] }>> = {
    donut: { items: [2, 8] },
    funnel: { items: [2, 8] },
    leaderboard: { items: [1, 25] },
};

export const VisualSpecSchema = BaseSchema.superRefine((spec, ctx) => {
    const fail = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
    const rows = spec.rows ?? [];

    switch (spec.kind) {
        case "kpi_row":
            if (!spec.tiles || spec.tiles.length < 1) fail(["tiles"], "kpi_row demande `tiles` (1 à 6 chiffres clés).");
            break;
        case "line":
        case "area":
        case "bar": {
            if (rows.length < 1) fail(["rows"], "`rows` est vide : une ligne par point (jour, SDR, client…).");
            if (!spec.series || spec.series.length < 1) fail(["series"], "`series` est vide : liste les clés numériques de `rows` à tracer, avec leur libellé.");
            for (const [i, s] of (spec.series ?? []).entries()) {
                if (!rows.some((r) => typeof r[s.key] === "number")) fail(["series", i, "key"], `aucune ligne de \`rows\` n'a de valeur numérique pour la clé « ${s.key} ».`);
            }
            if ((spec.kind === "line" || spec.kind === "area") && rows.length < 2) fail(["rows"], "une courbe demande au moins 2 points ; utilise kpi_row pour un seul chiffre.");
            break;
        }
        case "table":
            if (rows.length < 1) fail(["rows"], "`rows` est vide.");
            if (rows.length > 200) fail(["rows"], "200 lignes au maximum dans un tableau : filtre ou agrège.");
            break;
        case "heatmap":
            if (!spec.cells || spec.cells.length < 1) fail(["cells"], "heatmap demande `cells` : [{ row, col, value }].");
            break;
        case "donut":
        case "funnel":
        case "leaderboard": {
            const [min, max] = LIMITS[spec.kind]!.items!;
            const n = spec.items?.length ?? 0;
            if (n < min) fail(["items"], `${spec.kind} demande au moins ${min} élément(s) dans \`items\` : [{ label, value }].`);
            if (n > max) fail(["items"], `${spec.kind} accepte ${max} éléments au plus (regroupe le reste dans « Autres »).`);
            if (spec.kind !== "leaderboard" && (spec.items ?? []).some((item) => item.value < 0)) fail(["items"], "les valeurs doivent être positives.");
            break;
        }
    }
});

export type VisualSpec = z.infer<typeof BaseSchema> & { kind: VisualKind };

export type ParseVisualResult = { ok: true; spec: VisualSpec } | { ok: false; error: string };

/** Validates and normalises (x_key, table columns). The error is written for the model to act on. */
export function parseVisualSpec(input: unknown): ParseVisualResult {
    let size = 0;
    try {
        size = JSON.stringify(input)?.length ?? 0;
    } catch {
        return { ok: false, error: "Le visuel n'est pas du JSON valide." };
    }
    if (size > MAX_SPEC_BYTES) return { ok: false, error: "Visuel trop volumineux : agrège les données (moins de lignes)." };

    const parsed = VisualSpecSchema.safeParse(input);
    if (!parsed.success) {
        const issues = parsed.error.issues.slice(0, 5).map((i) => `${i.path.length ? i.path.join(".") + " : " : ""}${i.message}`);
        return { ok: false, error: `Visuel invalide — ${issues.join(" ; ")}` };
    }
    const spec: VisualSpec = { ...parsed.data };
    const rows = spec.rows ?? [];

    if (spec.kind === "line" || spec.kind === "area" || spec.kind === "bar") {
        const seriesKeys = new Set((spec.series ?? []).map((s) => s.key));
        const xKey = spec.x_key && rows.some((r) => spec.x_key! in r)
            ? spec.x_key
            : Object.keys(rows[0] ?? {}).find((k) => !seriesKeys.has(k));
        if (!xKey) return { ok: false, error: "Visuel invalide — rows : il faut une clé d'axe (ex. « x ») en plus des clés de `series`." };
        spec.x_key = xKey;
    }
    if (spec.kind === "table" && (!spec.columns || spec.columns.length === 0)) {
        spec.columns = Object.keys(rows[0] ?? {}).slice(0, 12).map((key) => ({ key, label: key }));
    }
    return { ok: true, spec };
}

/** Every number the visual shows, for checking against the sources. */
export function visualNumbers(spec: VisualSpec): number[] {
    const out: number[] = [];
    const push = (v: unknown) => {
        if (typeof v === "number" && Number.isFinite(v)) out.push(v);
    };
    for (const tile of spec.tiles ?? []) {
        push(tile.value);
        // delta_pct is a derived figure: checked as a value only when the source states it.
        push(tile.delta_pct);
    }
    for (const item of spec.items ?? []) push(item.value);
    for (const c of spec.cells ?? []) push(c.value);
    const numericKeys =
        spec.kind === "table"
            ? (spec.columns ?? []).map((c) => c.key)
            : (spec.series ?? []).map((s) => s.key);
    for (const row of spec.rows ?? []) for (const key of numericKeys) push(row[key]);
    return out;
}

// -- Formatting ---------------------------------------------------------------

const NBSP = " ";

function compact(value: number): string {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${trim(value / 1_000_000)}${NBSP}M`;
    if (abs >= 10_000) return `${trim(value / 1_000)}${NBSP}k`;
    return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: abs < 100 ? 1 : 0 }).format(value);
}

function trim(value: number): string {
    return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(value);
}

export function formatDuration(seconds: number): string {
    const s = Math.round(seconds);
    if (s < 60) return `${s}${NBSP}s`;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}${NBSP}h${NBSP}${String(m).padStart(2, "0")}` : `${m}${NBSP}min`;
}

/** One value as the reader sees it. `short` is for axes and dense labels. */
export function formatValue(value: unknown, format: ValueFormat = "number", short = false): string {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "string") return value;
    if (typeof value !== "number" || !Number.isFinite(value)) return "—";
    switch (format) {
        case "percent":
            return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(value)}${NBSP}%`;
        case "duration":
            return formatDuration(value);
        case "text":
            return String(value);
        default:
            return short ? compact(value) : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value);
    }
}

// -- Data view & export ---------------------------------------------------------

export interface VisualTable {
    header: string[];
    rows: Array<Array<string | number | null>>;
}

/** The visual as a plain table: the « Données » view and the CSV export. */
export function visualTable(spec: VisualSpec): VisualTable {
    switch (spec.kind) {
        case "kpi_row":
            return {
                header: ["Indicateur", "Valeur", "Évolution (%)"],
                rows: (spec.tiles ?? []).map((t) => [t.label, t.value, t.delta_pct ?? null]),
            };
        case "line":
        case "area":
        case "bar": {
            const series = spec.series ?? [];
            return {
                header: [spec.x_key ?? "x", ...series.map((s) => s.label)],
                rows: (spec.rows ?? []).map((r) => [r[spec.x_key ?? "x"] ?? null, ...series.map((s) => r[s.key] ?? null)]),
            };
        }
        case "table": {
            const columns = spec.columns ?? [];
            return { header: columns.map((c) => c.label), rows: (spec.rows ?? []).map((r) => columns.map((c) => r[c.key] ?? null)) };
        }
        case "heatmap":
            return { header: ["Ligne", "Colonne", "Valeur"], rows: (spec.cells ?? []).map((c) => [c.row, c.col, c.value]) };
        default:
            return { header: ["Libellé", "Valeur", "Détail"], rows: (spec.items ?? []).map((i) => [i.label, i.value, i.detail ?? null]) };
    }
}

/** RFC 4180 CSV with a BOM and `;` separator, so French Excel opens it correctly. */
export function visualCsv(spec: VisualSpec): string {
    const { header, rows } = visualTable(spec);
    const esc = (v: string | number | null) => {
        const text = v === null ? "" : typeof v === "number" ? String(v).replace(".", ",") : v;
        return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    return `﻿${[header, ...rows].map((r) => r.map(esc).join(";")).join("\r\n")}\r\n`;
}

/** Stored with a message or a pin: the spec plus what the server added. */
export interface StoredVisual {
    id: string;
    spec: VisualSpec;
    /** Figures the checker could not find in the turn's sources. */
    unverified?: number[];
    /** The read that fed the visual — lets a pin be refreshed with the same query. */
    source?: { tool: string; args: Record<string, unknown>; label: string } | null;
    /** The question it answered, kept for a pin's "Actualiser". */
    question?: string | null;
}
