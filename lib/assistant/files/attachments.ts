/**
 * Attachments of a chat message, made readable before the turn starts
 * (Captain AI v4).
 *
 * A file attached in the composer was uploaded seconds ago: its extraction
 * runs in after() and is usually still PENDING when the message is sent, so
 * the context pack (READY chunks only) showed nothing and the model answered
 * « indexation en cours ». The chat route now awaits the extraction of the
 * attached files that are not READY — 25 s in total, 3 at a time — and passes
 * the resulting states to the pack's « Pièces jointes » block. Never throws:
 * a file that cannot be prepared keeps its last known state.
 */

import type { AttachmentView } from "@/lib/assistant/context/pack";
import { ensureFileTextsReady, ON_DEMAND_BUDGET_MS, type EnsureResult } from "./pipeline";
import type { OcrOptions } from "./ocr";

export interface AttachmentInput {
    fileId: string;
    name: string;
    status: string;
    pages?: number | null;
    chunkCount?: number | null;
    error?: string | null;
}

export interface PrepareOptions {
    folderId: string;
    budgetMs?: number;
    ledgerContext?: OcrOptions["ledgerContext"];
    /** Test seam; defaults to ensureFileTextsReady. */
    ensureMany?: typeof ensureFileTextsReady;
}

function view(input: AttachmentInput): AttachmentView {
    return {
        fileId: input.fileId,
        name: input.name,
        status: input.status,
        pages: input.pages ?? null,
        chunkCount: input.chunkCount ?? 0,
        error: input.error ?? null,
    };
}

export async function prepareAttachments(inputs: AttachmentInput[], options: PrepareOptions): Promise<AttachmentView[]> {
    const views = inputs.map(view);
    const waiting = inputs.filter((a) => a.status !== "READY");
    if (waiting.length === 0) return views;

    let results: Map<string, EnsureResult>;
    try {
        const ensureMany = options.ensureMany ?? ensureFileTextsReady;
        results = await ensureMany(
            waiting.map((a) => ({ fileId: a.fileId, folderId: options.folderId })),
            {
                budgetMs: options.budgetMs ?? ON_DEMAND_BUDGET_MS,
                ...(options.ledgerContext ? { ledgerContext: options.ledgerContext } : {}),
            },
        );
    } catch (error) {
        console.warn("[assistant.files] attachments not prepared", error instanceof Error ? error.message : error);
        return views;
    }

    return views.map((v) => {
        const r = results.get(v.fileId);
        if (!r || r.status === "MISSING") return v;
        return {
            ...v,
            status: r.status,
            pages: r.pages ?? v.pages,
            chunkCount: r.chunkCount,
            error: r.error,
            ...(r.timedOut ? { timedOut: true } : {}),
        };
    });
}
