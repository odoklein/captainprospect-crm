/**
 * create_xlsx / create_pptx — the assistant makes an Excel workbook or a
 * PowerPoint deck to download (ticket #116).
 *
 * Same contract as create_pdf: the model hands structured content (sheets of
 * rows; slides of bullets, a table or a visual of THIS turn), the server
 * builds a branded file (lib/assistant/office/build), stores it like the PDFs
 * (folder storage, else a File owned by the user — never on the client
 * portal) and returns the link the answer must give.
 *
 * safe_write: each adds one private file and leaves the CRM otherwise untouched.
 */

import { z } from "zod";
import { visualTable, type StoredVisual } from "@/lib/assistant/visuals/spec";
import { isoDay, kebab } from "@/lib/assistant/pdf/text";
import { defineSafeWriteTool, params } from "../helpers";
import { ToolValidationError, type AssistantContext, type WriteOutcome } from "../types";

const MAX_SHEETS = 10;
const MAX_ROWS = 5_000;
const MAX_COLUMNS = 40;
const MAX_SLIDES = 30;

// Repeated here rather than imported from lib/assistant/office/build, so the
// tool registry does not pull the builders (and pptxgenjs) in.
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const cell = z.union([z.string().max(5_000), z.number().finite(), z.null()]);
const TableArgs = z.object({
    columns: z.array(z.string().trim().max(120)).min(1).max(MAX_COLUMNS),
    rows: z.array(z.array(cell).max(MAX_COLUMNS)).max(MAX_ROWS),
});

export const CreateXlsxArgs = z.object({
    title: z.string().trim().min(3).max(120),
    sheets: z.array(TableArgs.extend({ name: z.string().trim().min(1).max(60) })).max(MAX_SHEETS).optional(),
    include_visuals: z.array(z.number().int().min(1).max(50)).max(12).optional(),
    file_name: z.string().trim().max(100).optional(),
});
export type CreateXlsxInput = z.infer<typeof CreateXlsxArgs>;

export const CreatePptxArgs = z.object({
    title: z.string().trim().min(3).max(120),
    subtitle: z.string().trim().max(200).optional(),
    slides: z.array(z.object({
        title: z.string().trim().min(1).max(120),
        bullets: z.array(z.string().trim().max(400)).max(12).optional(),
        table: TableArgs.optional(),
        visual: z.number().int().min(1).max(50).optional(),
        notes: z.string().trim().max(3_000).optional(),
    })).min(1).max(MAX_SLIDES),
    file_name: z.string().trim().max(100).optional(),
});
export type CreatePptxInput = z.infer<typeof CreatePptxArgs>;

export interface OfficeOutcome extends WriteOutcome {
    download_url: string;
    file_id: string;
    file_name: string;
    consigne: string;
}

type Store = (input: { buffer: Buffer; fileName: string; mimeType: string; userId: string; folderId: string | null }) => Promise<{ fileId: string; downloadUrl: string }>;

/** What execute needs from the outside; the tests swap them. */
export interface OfficeDeps {
    xlsx(input: { title: string; author: string; sheets: Array<{ name: string; columns: string[]; rows: (string | number | null)[][] }> }): Promise<Buffer>;
    pptx(input: {
        title: string;
        subtitle?: string;
        author: string;
        generatedAt: Date;
        slides: Array<{ title: string; bullets?: string[]; table?: { columns: string[]; rows: (string | number | null)[][] }; visual?: StoredVisual; notes?: string }>;
    }): Promise<{ buffer: Buffer; slides: number }>;
    tableOf(visual: StoredVisual): { columns: string[]; rows: (string | number | null)[][] };
    store: Store;
    now(): Date;
}

/** « bilan-acme-2026-11-02.xlsx »: same naming rule as the PDFs. */
export function officeFileName(base: string, date: Date, ext: "xlsx" | "pptx"): string {
    const slug = kebab(base.replace(/\.(xlsx|pptx|xls|ppt)$/i, "")) || "document";
    return /\d{4}-\d{2}-\d{2}$/.test(slug) ? `${slug}.${ext}` : `${slug}-${isoDay(date)}.${ext}`;
}

function turnVisual(ctx: AssistantContext, n: number): StoredVisual {
    const visuals = ctx.turnVisuals?.() ?? [];
    const visual = visuals[n - 1];
    if (!visual) {
        throw new ToolValidationError(
            visuals.length === 0
                ? "Aucun visuel n'a été dessiné dans ce tour : appelle show_visual d'abord, ou retire le numéro de visuel."
                : `Visuel ${n} introuvable : ce tour en compte ${visuals.length} (numéros 1 à ${visuals.length}).`,
        );
    }
    return visual;
}

function link(fileName: string, url: string) {
    return `Donne ce lien dans ta réponse : [${fileName}](${url})`;
}

export async function executeCreateXlsx(args: CreateXlsxInput, ctx: AssistantContext, deps: OfficeDeps): Promise<OfficeOutcome> {
    const sheets = (args.sheets ?? []).map((s) => ({ name: s.name, columns: s.columns, rows: s.rows }));
    for (const n of [...new Set(args.include_visuals ?? [])]) {
        const visual = turnVisual(ctx, n);
        sheets.push({ name: visual.spec.title, ...deps.tableOf(visual) });
    }
    if (sheets.length === 0) throw new ToolValidationError("Donne au moins une feuille (sheets) ou un visuel de ce tour (include_visuals).");

    const generatedAt = deps.now();
    const fileName = officeFileName(args.file_name?.trim() || args.title, generatedAt, "xlsx");
    const buffer = await deps.xlsx({ title: args.title, author: ctx.userName?.trim() || "", sheets });
    const stored = await deps.store({ buffer, fileName, mimeType: XLSX_MIME, userId: ctx.userId, folderId: ctx.folder?.id ?? null });
    const rows = sheets.reduce((sum, s) => sum + s.rows.length, 0);
    return {
        message: `Excel prêt : ${args.title} (${sheets.length} feuille${sheets.length > 1 ? "s" : ""}, ${rows} ligne${rows > 1 ? "s" : ""})`,
        artifactId: null,
        download_url: stored.downloadUrl,
        file_id: stored.fileId,
        file_name: fileName,
        consigne: link(fileName, stored.downloadUrl),
    };
}

export async function executeCreatePptx(args: CreatePptxInput, ctx: AssistantContext, deps: OfficeDeps): Promise<OfficeOutcome> {
    const slides = args.slides.map((s) => ({
        title: s.title,
        ...(s.bullets?.length ? { bullets: s.bullets } : {}),
        ...(s.table ? { table: { columns: s.table.columns, rows: s.table.rows } } : {}),
        ...(s.visual ? { visual: turnVisual(ctx, s.visual) } : {}),
        ...(s.notes ? { notes: s.notes } : {}),
    }));
    const generatedAt = deps.now();
    const fileName = officeFileName(args.file_name?.trim() || args.title, generatedAt, "pptx");
    const { buffer, slides: count } = await deps.pptx({
        title: args.title,
        ...(args.subtitle ? { subtitle: args.subtitle } : {}),
        author: ctx.userName?.trim() || "",
        generatedAt,
        slides,
    });
    const stored = await deps.store({ buffer, fileName, mimeType: PPTX_MIME, userId: ctx.userId, folderId: ctx.folder?.id ?? null });
    return {
        message: `PowerPoint prêt : ${args.title} (${count} diapositive${count > 1 ? "s" : ""})`,
        artifactId: null,
        download_url: stored.downloadUrl,
        file_id: stored.fileId,
        file_name: fileName,
        consigne: link(fileName, stored.downloadUrl),
    };
}

/** The production wiring: instance brand, builders, folder/user storage. */
const defaultDeps: OfficeDeps = {
    async xlsx(input) {
        const [{ getBrand }, { buildSpreadsheet }] = await Promise.all([import("@/lib/brand/server"), import("@/lib/assistant/office/build")]);
        return buildSpreadsheet({ ...input, brand: await getBrand() });
    },
    async pptx(input) {
        const [{ getBrand }, { buildPresentation }] = await Promise.all([import("@/lib/brand/server"), import("@/lib/assistant/office/build")]);
        return buildPresentation({ ...input, brand: await getBrand() });
    },
    tableOf(visual) {
        const { header, rows } = visualTable(visual.spec);
        return { columns: header, rows };
    },
    async store(input) {
        const { storeGeneratedFile } = await import("@/lib/assistant/pdf/server");
        return storeGeneratedFile(input);
    },
    now: () => new Date(),
};

const tableParam = {
    type: "object",
    properties: {
        columns: { type: "array", items: { type: "string" } },
        rows: { type: "array", items: { type: "array", items: { type: ["string", "number", "null"] } } },
    },
    required: ["columns", "rows"],
} as const;

export const createXlsx = defineSafeWriteTool({
    name: "create_xlsx",
    label: "Créer un Excel",
    requiresProject: false,
    description: "Fichier Excel : feuilles de lignes (chiffres en nombres) et/ou visuels de ce tour. Donne download_url en lien.",
    parameters: params(
        {
            title: { type: "string" },
            sheets: { type: "array", items: { ...tableParam, properties: { name: { type: "string" }, ...tableParam.properties }, required: ["name", "columns", "rows"] } },
            include_visuals: { type: "array", items: { type: "integer" }, description: "numéros show_visual" },
            file_name: { type: "string" },
        },
        ["title"],
    ),
    schema: CreateXlsxArgs,
    execute: (args, ctx) => executeCreateXlsx(args, ctx, defaultDeps),
});

export const createPptx = defineSafeWriteTool({
    name: "create_pptx",
    label: "Créer un PowerPoint",
    requiresProject: false,
    description: "Présentation PowerPoint : une diapo par point (puces courtes, tableau ou visuel de ce tour). Donne download_url en lien.",
    parameters: params(
        {
            title: { type: "string" },
            subtitle: { type: "string" },
            slides: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        title: { type: "string" },
                        bullets: { type: "array", items: { type: "string" } },
                        table: tableParam,
                        visual: { type: "integer", description: "numéro show_visual" },
                        notes: { type: "string" },
                    },
                    required: ["title"],
                },
            },
            file_name: { type: "string" },
        },
        ["title", "slides"],
    ),
    schema: CreatePptxArgs,
    execute: (args, ctx) => executeCreatePptx(args, ctx, defaultDeps),
});
