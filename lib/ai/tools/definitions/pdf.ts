/**
 * create_pdf — the assistant writes a document to download.
 *
 * The model writes the body in markdown (titles, lists, GFM tables, [E1]
 * citations, `[[visuel N]]` markers) and names the visuals of THIS turn to
 * include (the numbers show_visual returned). The server renders a branded A4
 * PDF (lib/assistant/pdf), stores it (folder storage when the conversation has
 * a folder, else a File owned by the user — never visible on the client
 * portal) and returns its download link, which the answer must give.
 *
 * safe_write: it adds one private file and leaves the CRM otherwise untouched.
 */

import { z } from "zod";
import type { StoredVisual } from "@/lib/assistant/visuals/spec";
import { pdfFileName } from "@/lib/assistant/pdf/text";
import { defineSafeWriteTool, params } from "../helpers";
import { ToolValidationError, type AssistantContext, type WriteOutcome } from "../types";

export const PDF_CONTENT_MAX = 60_000;
export const PDF_MAX_VISUALS = 12;

export const CreatePdfArgs = z.object({
    title: z.string().trim().min(3).max(120),
    subtitle: z.string().trim().max(200).optional(),
    content_markdown: z.string().trim().min(1).max(PDF_CONTENT_MAX),
    include_visuals: z.array(z.number().int().min(1).max(50)).max(PDF_MAX_VISUALS).optional(),
    file_name: z.string().trim().max(100).optional(),
});
export type CreatePdfInput = z.infer<typeof CreatePdfArgs>;

export interface PdfOutcome extends WriteOutcome {
    download_url: string;
    file_id: string;
    file_name: string;
    pages: number;
    consigne: string;
}

/** What execute needs from the outside; the tests swap them. */
export interface CreatePdfDeps {
    render(input: {
        title: string;
        subtitle?: string;
        author: string;
        generatedAt: Date;
        sections: Array<{ markdown: string; visuals: StoredVisual[] }>;
    }): Promise<{ buffer: Buffer; pages: number }>;
    store(input: { buffer: Buffer; fileName: string; userId: string; folderId: string | null }): Promise<{ fileId: string; downloadUrl: string }>;
    now(): Date;
}

/**
 * The included visuals in the order asked, and the markdown with its
 * `[[visuel N]]` markers renumbered to that order (markers of visuals not
 * included disappear).
 */
export function selectVisuals(markdown: string, turnVisuals: StoredVisual[], include: number[] | undefined): { markdown: string; visuals: StoredVisual[] } {
    const numbers = [...new Set(include ?? [])];
    const missing = numbers.filter((n) => n > turnVisuals.length);
    if (missing.length > 0) {
        throw new ToolValidationError(
            turnVisuals.length === 0
                ? "Aucun visuel n'a été dessiné dans ce tour : appelle show_visual d'abord, ou retire include_visuals."
                : `Visuel ${missing.join(", ")} introuvable : ce tour en compte ${turnVisuals.length} (numéros 1 à ${turnVisuals.length}).`,
        );
    }
    const position = new Map(numbers.map((n, i) => [n, i + 1]));
    const rewritten = markdown.replace(/^([ \t]*)\[\[visuel\s+(\d+)\]\]([ \t]*)$/gim, (_line, _a: string, n: string) => {
        const at = position.get(Number(n));
        return at ? `[[visuel ${at}]]` : "";
    });
    return { markdown: rewritten, visuals: numbers.map((n) => turnVisuals[n - 1]) };
}

export async function executeCreatePdf(args: CreatePdfInput, ctx: AssistantContext, deps: CreatePdfDeps): Promise<PdfOutcome> {
    const { markdown, visuals } = selectVisuals(args.content_markdown, ctx.turnVisuals?.() ?? [], args.include_visuals);
    const generatedAt = deps.now();
    const fileName = pdfFileName(args.file_name?.trim() || args.title, generatedAt);
    const { buffer, pages } = await deps.render({
        title: args.title,
        ...(args.subtitle ? { subtitle: args.subtitle } : {}),
        author: ctx.userName?.trim() || "",
        generatedAt,
        sections: [{ markdown, visuals }],
    });
    const stored = await deps.store({ buffer, fileName, userId: ctx.userId, folderId: ctx.folder?.id ?? null });
    return {
        message: `PDF prêt : ${args.title} (${pages} page${pages > 1 ? "s" : ""})`,
        artifactId: null,
        download_url: stored.downloadUrl,
        file_id: stored.fileId,
        file_name: fileName,
        pages,
        consigne: `Donne ce lien dans ta réponse : [${fileName}](${stored.downloadUrl})`,
    };
}

/** The production wiring: brand + logo, pdfkit renderer, folder/user storage. */
const defaultDeps: CreatePdfDeps = {
    async render(input) {
        const [{ getBrand }, { renderAssistantPdfDetailed }, { loadPdfLogo }] = await Promise.all([
            import("@/lib/brand/server"),
            import("@/lib/assistant/pdf/render"),
            import("@/lib/assistant/pdf/server"),
        ]);
        const brand = await getBrand();
        const logo = await loadPdfLogo(brand).catch(() => null);
        return renderAssistantPdfDetailed({ ...input, brand, logo });
    },
    async store(input) {
        const { storeGeneratedPdf } = await import("@/lib/assistant/pdf/server");
        return storeGeneratedPdf(input);
    },
    now: () => new Date(),
};

export const createPdf = defineSafeWriteTool({
    name: "create_pdf",
    label: "Créer un PDF",
    requiresProject: false,
    description: "PDF à la marque : markdown rédigé + visuels de ce tour. Donne download_url en lien.",
    parameters: params(
        {
            title: { type: "string" },
            subtitle: { type: "string" },
            content_markdown: { type: "string", description: "[[visuel N]] seul sur une ligne" },
            include_visuals: { type: "array", items: { type: "integer" }, description: "numéros show_visual" },
            file_name: { type: "string" },
        },
        ["title", "content_markdown"],
    ),
    schema: CreatePdfArgs,
    execute: (args, ctx) => executeCreatePdf(args, ctx, defaultDeps),
});
