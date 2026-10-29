/**
 * The context pack (Captain AI v4): what a turn gets besides the raw history,
 * inside token budgets. Pure assembly over injected readers, so the choice is
 * testable without a database; the Prisma readers live in ./prisma.ts.
 *
 * Two destinations, because of prompt caching: stable sections (folder
 * instructions, memory) belong in the system prompt and change rarely; the
 * volatile part (rolling summary, prior sources, file hits) is one
 * "[Contexte de travail]" user message placed right before the question.
 */

import type { AssistantContext } from "@/lib/ai/tools/types";
import {
    memoryBlockChrome,
    renderContextMessage,
    renderFileHitsBlock,
    renderFileIndexLine,
    renderFolderInstructionsBlock,
    renderMemoryBlock,
    renderMemoryLine,
    renderPriorEvidenceBlock,
    renderSummaryBlock,
} from "./format";
import { selectMemories, type MemoryCandidate } from "./rank";
import { estimateTokens, truncateToTokens } from "./tokens";

export interface ContextBudgets {
    instructions: number;
    memories: number;
    summary: number;
    fileHits: number;
    fileIndex: number;
    priorEvidence: number;
}

export const DEFAULT_BUDGETS: ContextBudgets = {
    instructions: 600,
    memories: 800,
    summary: 500,
    fileHits: 1500,
    fileIndex: 150,
    priorEvidence: 400,
};

/** Hits asked from the files reader; the budget then trims by tokens. */
export const FILE_HITS_LIMIT = 6;
/** Raw messages kept after the summary (12) or without one (20). */
export const HISTORY_WINDOW_WITH_SUMMARY = 12;
export const HISTORY_WINDOW_DEFAULT = 20;

export interface FileHit {
    fileId: string;
    fileName: string;
    chunkId: string;
    index: number;
    page: number | null;
    heading: string | null;
    excerpt: string;
    score: number;
    tokens: number;
    attached: boolean;
}

export interface ContextDeps {
    memories: (q: { folderId: string | null; userId: string }) => Promise<MemoryCandidate[]>;
    /** Optional: the folder files reader (lib/assistant/files/search.ts via ./prisma.ts). */
    files?: (q: { folderId: string; question: string; limit: number; attachedFileIds?: string[] }) => Promise<FileHit[]>;
}

export interface ContextPackInput {
    ctx: AssistantContext;
    conversation: {
        id: string;
        kind?: "CHAT" | "AGENT";
        summary: string | null;
        summaryUpToMessageId: string | null;
        missionId: string | null;
    };
    question: string;
    folder?: { instructions: string | null; name: string } | null;
    priorEvidenceIndex?: string | null;
    /** Files attached to the message: their opening chunks are offered first. */
    attachmentFileIds?: string[];
    budgets?: Partial<ContextBudgets>;
    now?: Date;
    deps?: ContextDeps;
}

export type ContextSectionId = "folder_instructions" | "memory" | "user_prefs" | "summary" | "files" | "prior_evidence";

export interface ContextSection {
    id: ContextSectionId;
    title: string;
    text: string;
    tokens: number;
    /** Stable sections go in the system prompt; volatile ones are already in `contextMessage`. */
    stable: boolean;
}

export interface ContextPack {
    /** Stable sections only, in injection order. */
    systemSections: ContextSection[];
    /** The volatile sections `contextMessage` was rendered from (debug, UI). */
    volatileSections: ContextSection[];
    contextMessage: string | null;
    memoryBlock: { text: string; tokens: number; used: Array<{ id: string; scope: string }> };
    folderInstructions: { text: string; tokens: number } | null;
    summary: { text: string; tokens: number; upToMessageId: string | null } | null;
    fileHits: FileHit[];
    historyWindow: number;
    debug: { tokens: Record<string, number>; dropped: Record<string, number>; degraded: string[] };
}

const EMPTY_DEPS: ContextDeps = { memories: async () => [] };

function section(id: ContextSectionId, title: string, text: string, stable: boolean): ContextSection {
    return { id, title, text, tokens: estimateTokens(text), stable };
}

/** A reader must never fail a turn: an error degrades to the fallback and is named in debug. */
async function guarded<T>(name: string, degraded: string[], read: () => Promise<T>, fallback: T): Promise<T> {
    try {
        return await read();
    } catch (error) {
        degraded.push(name);
        console.warn(`[assistant] context.${name}: lecteur en échec, section ignorée —`, error instanceof Error ? error.message : error);
        return fallback;
    }
}

function firstName(fullName: string): string | null {
    const first = fullName.trim().split(/\s+/)[0];
    return first ? first : null;
}

/** Attached files first, then by score; keeps whole hits while they fit. */
function trimFileHits(hits: FileHit[], budget: number): { kept: FileHit[]; dropped: number } {
    const ordered = [...hits].sort((a, b) => {
        if (a.attached !== b.attached) return a.attached ? -1 : 1;
        if (b.score !== a.score) return b.score - a.score;
        return a.chunkId < b.chunkId ? -1 : a.chunkId > b.chunkId ? 1 : 0;
    });
    const kept: FileHit[] = [];
    let used = 0;
    for (const hit of ordered) {
        const cost = hit.tokens > 0 ? hit.tokens : estimateTokens(hit.excerpt);
        if (used + cost > budget) continue;
        used += cost;
        kept.push(hit);
    }
    return { kept, dropped: hits.length - kept.length };
}

export async function buildContextPack(input: ContextPackInput): Promise<ContextPack> {
    const budgets: ContextBudgets = { ...DEFAULT_BUDGETS, ...(input.budgets ?? {}) };
    const deps = input.deps ?? EMPTY_DEPS;
    const now = input.now ?? new Date();
    const degraded: string[] = [];
    const tokens: Record<string, number> = {};
    const dropped: Record<string, number> = {};
    const systemSections: ContextSection[] = [];
    const volatileSections: ContextSection[] = [];

    const folderId = input.ctx.folder?.id ?? null;
    const folderName = input.folder?.name ?? input.ctx.folder?.name ?? null;
    const memoryOpts = { folderName, userFirstName: firstName(input.ctx.userName) };

    // Folder instructions: stable, truncated to budget.
    let folderInstructions: ContextPack["folderInstructions"] = null;
    const rawInstructions = input.folder?.instructions?.trim() ?? "";
    if (rawInstructions && folderName) {
        const text = truncateToTokens(rawInstructions, budgets.instructions);
        dropped.instructions = text === rawInstructions ? 0 : 1;
        folderInstructions = { text, tokens: estimateTokens(text) };
        const s = section("folder_instructions", `Consignes du dossier « ${folderName} »`, renderFolderInstructionsBlock(folderName, text), true);
        systemSections.push(s);
        tokens.folder_instructions = s.tokens;
    }

    // Memory: one stable block for the three layers, selected within budget
    // (headers priced upfront so the rendered block never exceeds it).
    const candidates = await guarded("memories", degraded, () => deps.memories({ folderId, userId: input.ctx.userId }), []);
    const selection = selectMemories(
        candidates,
        { question: input.question, missionId: input.conversation.missionId, now },
        Math.max(0, budgets.memories - estimateTokens(memoryBlockChrome(memoryOpts))),
        (m) => estimateTokens(renderMemoryLine(m)) + 1,
    );
    dropped.memories = selection.dropped;
    const memoryText = renderMemoryBlock(selection.chosen, memoryOpts);
    const memoryBlock: ContextPack["memoryBlock"] = {
        text: memoryText,
        tokens: estimateTokens(memoryText),
        used: selection.chosen.map((m) => ({ id: m.id, scope: m.scope })),
    };
    if (memoryText) {
        const s = section("memory", "Mémoire", memoryText, true);
        systemSections.push(s);
        tokens.memory = s.tokens;
    }

    // Rolling summary: volatile.
    let summary: ContextPack["summary"] = null;
    const rawSummary = input.conversation.summary?.trim() ?? "";
    if (rawSummary) {
        const text = truncateToTokens(rawSummary, budgets.summary);
        dropped.summary = text === rawSummary ? 0 : 1;
        summary = { text, tokens: estimateTokens(text), upToMessageId: input.conversation.summaryUpToMessageId };
        const s = section("summary", "Résumé des échanges précédents", renderSummaryBlock(text), false);
        volatileSections.push(s);
        tokens.summary = s.tokens;
    }

    // Prior evidence index: volatile.
    const rawPrior = input.priorEvidenceIndex?.trim() ?? "";
    if (rawPrior) {
        const text = truncateToTokens(rawPrior, budgets.priorEvidence);
        dropped.prior_evidence = text === rawPrior ? 0 : 1;
        const s = section("prior_evidence", "Sources déjà consultées", renderPriorEvidenceBlock(text), false);
        volatileSections.push(s);
        tokens.prior_evidence = s.tokens;
    }

    // Files: only with a reader and a folder; volatile.
    let fileHits: FileHit[] = [];
    if (deps.files && folderId) {
        const reader = deps.files;
        const attachedFileIds = input.attachmentFileIds?.filter((id) => typeof id === "string" && id.length > 0) ?? [];
        const hits = await guarded(
            "files",
            degraded,
            () =>
                reader({
                    folderId,
                    question: input.question,
                    limit: FILE_HITS_LIMIT,
                    ...(attachedFileIds.length > 0 ? { attachedFileIds } : {}),
                }),
            [],
        );
        const trimmed = trimFileHits(hits, budgets.fileHits);
        fileHits = trimmed.kept;
        dropped.files = trimmed.dropped;
        if (fileHits.length > 0) {
            const names = [...new Set(fileHits.map((h) => h.fileName))];
            const indexLine = truncateToTokens(renderFileIndexLine(names), budgets.fileIndex);
            const s = section("files", "Extraits de fichiers du dossier", renderFileHitsBlock(fileHits, indexLine), false);
            volatileSections.push(s);
            tokens.files = s.tokens;
        }
    }

    const contextMessage = renderContextMessage(volatileSections.map((s) => s.text));
    if (contextMessage) tokens.context_message = estimateTokens(contextMessage);

    return {
        systemSections,
        volatileSections,
        contextMessage,
        memoryBlock,
        folderInstructions,
        summary,
        fileHits,
        historyWindow: summary ? HISTORY_WINDOW_WITH_SUMMARY : HISTORY_WINDOW_DEFAULT,
        debug: { tokens, dropped, degraded },
    };
}
