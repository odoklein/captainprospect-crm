/**
 * Rolling conversation summary and AI thread title (Captain AI v4, B3).
 *
 * Both run after a turn, inside the chat route's after(): they must never
 * slow down or fail an answer, so every entry point swallows its errors and
 * reports { updated, reason } instead. The summary folds the messages that
 * fell out of the raw history window into a short French brief the next turn
 * reads instead of the full transcript; the title replaces the default one
 * ("Vue agence", "Client — Mission", the first question cut short) once a
 * first exchange exists and the manager has not renamed the thread.
 *
 * The summary write is a compare-and-set on `summaryUpToMessageId`: two
 * concurrent after() hooks summarising the same thread cannot both land, so
 * one summary never silently overwrites a newer one.
 */

import { prisma } from "@/lib/prisma";
import { providerChatFn } from "@/lib/ai/providers";
import { EMPTY_USAGE, type ChatCallResponse, type ChatFn } from "@/lib/ai/providers/types";
import { recordAiUsage, type AiUsageEntry } from "@/lib/ai/ledger";
import { splitFollowUps } from "@/lib/assistant/answer";
import { optional } from "../store/missing";

/** Messages kept raw in the history once a summary exists. */
export const RAW_WINDOW = 12;
/** Summarise once this many messages sit beyond the raw window and the last summary. */
export const SUMMARY_TRIGGER = 8;

const DEFAULT_MODEL = "gpt-4.1-mini";
const SUMMARY_MAX_OUTPUT_TOKENS = 700;
const TITLE_MAX_OUTPUT_TOKENS = 40;
const CALL_TIMEOUT_MS = 60_000;
/** Same estimate as the context pack: tokens ≈ chars / 3.3 for French prose. */
const CHARS_PER_TOKEN = 3.3;

const ASSISTANT_CUT = 1200;
const USER_CUT = 600;
const TITLE_MAX_CHARS = 80;
const DEFAULT_TITLE_CUT = 60;

export type SummaryRole = "USER" | "ASSISTANT";

export interface SummaryMessage {
    id: string;
    role: SummaryRole;
    content: string;
    createdAt: Date;
}

export interface SummaryConversation {
    id: string;
    summary: string | null;
    summaryUpToMessageId: string | null;
    messageCount: number;
    title: string;
    titleEditedAt: Date | null;
    createdById: string;
    clientId: string | null;
    missionId: string | null;
}

export interface SaveSummaryInput {
    summary: string;
    summaryUpToMessageId: string;
    summaryTokens: number;
    /** The cutoff the summary was built on; the write is refused when it moved. */
    previousUpTo: string | null;
}

export interface SummaryDb {
    findConversation(id: string): Promise<SummaryConversation | null>;
    /** Ascending, superseded messages excluded. */
    listMessages(conversationId: string): Promise<SummaryMessage[]>;
    /** False when another writer moved the cutoff first. */
    saveSummary(id: string, input: SaveSummaryInput): Promise<boolean>;
    /** False when the manager renamed the thread meanwhile. */
    saveTitle(id: string, title: string): Promise<boolean>;
}

export interface SummaryDeps {
    chat?: ChatFn;
    model?: string;
    now?: () => Date;
    ledger?: (entry: AiUsageEntry) => void;
    db?: SummaryDb;
}

export interface SummaryOutcome {
    updated: boolean;
    reason: string;
}

// ---------------------------------------------------------------------------
// Prisma-backed store
// ---------------------------------------------------------------------------

export const prismaSummaryDb: SummaryDb = {
    findConversation: (id) =>
        optional(
            "summary.findConversation",
            () =>
                prisma.assistantConversation.findUnique({
                    where: { id },
                    select: {
                        id: true,
                        summary: true,
                        summaryUpToMessageId: true,
                        messageCount: true,
                        title: true,
                        titleEditedAt: true,
                        createdById: true,
                        clientId: true,
                        missionId: true,
                    },
                }),
            null,
        ),
    listMessages: (conversationId) =>
        optional(
            "summary.listMessages",
            () =>
                prisma.assistantMessage.findMany({
                    where: { conversationId, supersededAt: null },
                    orderBy: { createdAt: "asc" },
                    select: { id: true, role: true, content: true, createdAt: true },
                }),
            [],
        ),
    saveSummary: (id, input) =>
        optional(
            "summary.saveSummary",
            async () => {
                const result = await prisma.assistantConversation.updateMany({
                    where: { id, summaryUpToMessageId: input.previousUpTo },
                    data: {
                        summary: input.summary,
                        summaryUpToMessageId: input.summaryUpToMessageId,
                        summaryTokens: input.summaryTokens,
                    },
                });
                return result.count === 1;
            },
            false,
        ),
    saveTitle: (id, title) =>
        optional(
            "summary.saveTitle",
            async () => {
                const result = await prisma.assistantConversation.updateMany({
                    where: { id, titleEditedAt: null },
                    data: { title },
                });
                return result.count === 1;
            },
            false,
        ),
};

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Which messages the next summary folds in: everything after the previous
 * cutoff, up to and excluding the last RAW_WINDOW messages, and only when at
 * least SUMMARY_TRIGGER messages qualify. A cutoff id no longer in the list
 * (its message was superseded) restarts from the top; the previous summary
 * still travels in the prompt, so nothing is lost.
 */
export function selectSummaryCutoff(
    messages: ReadonlyArray<Pick<SummaryMessage, "id">>,
    summaryUpToMessageId: string | null,
): { from: number; to: number } | null {
    const previous = summaryUpToMessageId ? messages.findIndex((m) => m.id === summaryUpToMessageId) : -1;
    const from = previous + 1;
    const to = messages.length - RAW_WINDOW;
    if (to - from < SUMMARY_TRIGGER) return null;
    return { from, to };
}

function cut(text: string, max: number): string {
    const clean = text.trim();
    return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** A transcript the summariser reads: role prefix, follow-up blocks dropped, long turns cut. */
export function compactForSummary(messages: ReadonlyArray<Pick<SummaryMessage, "role" | "content">>): string {
    return messages
        .map((m) =>
            m.role === "USER"
                ? `Manager : ${cut(m.content, USER_CUT)}`
                : `Assistant : ${cut(splitFollowUps(m.content).body, ASSISTANT_CUT)}`,
        )
        .join("\n\n");
}

export function buildSummaryPrompt(previousSummary: string | null, transcript: string): { system: string; user: string } {
    const system = [
        "Tu rédiges la mémoire de travail d'une conversation entre un manager d'agence de prospection et son assistant CRM.",
        "Produis un résumé en français, en texte brut (pas de markdown, pas de titre), de 350 mots maximum.",
        "Conserve : les décisions prises, les entités nommées (clients, missions, SDR, prospects), les identifiants renvoyés par les outils, les chiffres avec leur période, les questions restées ouvertes et les préférences exprimées par le manager.",
        "Supprime les politesses, les reformulations et les détails sans suite.",
        "Quand un résumé précédent existe, fusionne-le avec les nouveaux échanges : garde ce qui reste vrai, remplace ce qui a changé.",
        "N'invente rien : si une information manque, ne la mentionne pas.",
    ].join("\n");
    const user = [
        "Résumé précédent :",
        previousSummary?.trim() || "(aucun)",
        "",
        "Nouveaux échanges à intégrer :",
        transcript,
    ].join("\n");
    return { system, user };
}

export function buildTitlePrompt(firstExchange: string): { system: string; user: string } {
    const system = [
        "Donne un titre en français à cette conversation entre un manager et son assistant CRM.",
        "Entre 3 et 8 mots, précis, sans guillemets, sans point final, sans préfixe du type « Titre : ».",
        "Réponds uniquement par le titre.",
    ].join("\n");
    return { system, user: firstExchange };
}

/** The model's raw title made storable: one line, no quotes or markdown, no trailing period, 80 chars max. */
export function cleanTitle(raw: string): string {
    let title = raw.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
    // Small models wrap the title in **bold**, backticks or a "# " heading despite the prompt.
    title = title.replace(/[*`]+/g, "").replace(/^#+\s*/, "");
    const quotes = /^[«"'“”‘’_\s]+|[»"'“”‘’_\s]+$/g;
    title = title.replace(quotes, "").replace(/^titre\s*:\s*/i, "").replace(quotes, "");
    title = title.replace(/[.\s]+$/, "").replace(/\s+/g, " ");
    // An AI title must not read as a "Client — Mission" default, or it would be regenerated.
    title = title.replace(/\s—\s/g, " – ");
    if (title.length > TITLE_MAX_CHARS) title = `${title.slice(0, TITLE_MAX_CHARS - 1).trimEnd()}…`;
    return title;
}

/** Mirrors titleFrom() in the chat route: the first question cut at 60 chars. */
function defaultTitleFrom(message: string): string {
    const clean = message.trim().replace(/\s+/g, " ");
    return clean.length > DEFAULT_TITLE_CUT ? `${clean.slice(0, DEFAULT_TITLE_CUT - 3)}…` : clean;
}

/** True for the titles the app sets itself; those are the only ones the AI may replace. */
export function looksLikeDefaultTitle(title: string, firstUserMessage: string): boolean {
    const clean = title.trim();
    if (!clean || clean === "Vue agence") return true;
    if (clean.includes(" — ")) return true;
    return firstUserMessage.trim().length > 0 && clean === defaultTitleFrom(firstUserMessage);
}

export function estimateSummaryTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/** A blank ASSISTANT_SUMMARY_MODEL (the .env template state) must mean "default", not model "". */
function envModel(): string | undefined {
    const value = process.env.ASSISTANT_SUMMARY_MODEL?.trim();
    return value ? value : undefined;
}

function resolveDeps(deps: SummaryDeps) {
    return {
        chat: deps.chat ?? providerChatFn({ dataClass: "raw_crm" }),
        model: deps.model ?? envModel() ?? DEFAULT_MODEL,
        now: deps.now ?? (() => new Date()),
        ledger: deps.ledger ?? recordAiUsage,
        db: deps.db ?? prismaSummaryDb,
    };
}

function errorReason(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return `error: ${message.split("\n")[0].slice(0, 200)}`;
}

async function callAndRecord(
    resolved: ReturnType<typeof resolveDeps>,
    conversation: SummaryConversation,
    surface: "assistant.summary" | "assistant.title",
    prompt: { system: string; user: string },
    maxOutputTokens: number,
): Promise<ChatCallResponse> {
    const started = resolved.now().getTime();
    const response = await resolved.chat({
        model: resolved.model,
        messages: [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user },
        ],
        maxOutputTokens,
        temperature: 0.2,
        reasoningEffort: "none",
        timeoutMs: CALL_TIMEOUT_MS,
    });
    resolved.ledger({
        surface,
        model: resolved.model,
        usage: response.usage ?? EMPTY_USAGE,
        latencyMs: Math.max(0, resolved.now().getTime() - started),
        dataClass: "raw_crm",
        userId: conversation.createdById,
        clientId: conversation.clientId,
        missionId: conversation.missionId,
        conversationId: conversation.id,
    });
    return response;
}

/** Folds the messages that left the raw window into the conversation summary. Never throws. */
export async function maybeSummarize(conversationId: string, deps: SummaryDeps = {}): Promise<SummaryOutcome> {
    try {
        const resolved = resolveDeps(deps);
        const conversation = await resolved.db.findConversation(conversationId);
        if (!conversation) return { updated: false, reason: "conversation_unavailable" };

        const messages = await resolved.db.listMessages(conversationId);
        const cutoff = selectSummaryCutoff(messages, conversation.summaryUpToMessageId);
        if (!cutoff) return { updated: false, reason: "below_trigger" };

        const slice = messages.slice(cutoff.from, cutoff.to);
        const prompt = buildSummaryPrompt(conversation.summary, compactForSummary(slice));
        const response = await callAndRecord(resolved, conversation, "assistant.summary", prompt, SUMMARY_MAX_OUTPUT_TOKENS);
        const summary = response.text?.trim() ?? "";
        if (!summary) return { updated: false, reason: "empty_summary" };

        const saved = await resolved.db.saveSummary(conversationId, {
            summary,
            summaryUpToMessageId: slice[slice.length - 1].id,
            summaryTokens: estimateSummaryTokens(summary),
            previousUpTo: conversation.summaryUpToMessageId,
        });
        return saved ? { updated: true, reason: "summarised" } : { updated: false, reason: "race_lost" };
    } catch (error) {
        console.warn("[assistant.summary] résumé non mis à jour", error);
        return { updated: false, reason: errorReason(error) };
    }
}

/** Replaces a default thread title with an AI one after the first exchange. Never throws. */
export async function maybeTitle(conversationId: string, deps: SummaryDeps = {}): Promise<SummaryOutcome> {
    try {
        const resolved = resolveDeps(deps);
        const conversation = await resolved.db.findConversation(conversationId);
        if (!conversation) return { updated: false, reason: "conversation_unavailable" };
        if (conversation.messageCount < 2) return { updated: false, reason: "too_few_messages" };
        if (conversation.titleEditedAt) return { updated: false, reason: "title_edited" };

        const messages = await resolved.db.listMessages(conversationId);
        const firstUserIndex = messages.findIndex((m) => m.role === "USER");
        if (firstUserIndex < 0) return { updated: false, reason: "no_user_message" };
        if (!looksLikeDefaultTitle(conversation.title, messages[firstUserIndex].content)) {
            return { updated: false, reason: "title_custom" };
        }
        const firstAnswer = messages.slice(firstUserIndex + 1).find((m) => m.role === "ASSISTANT");
        const exchange = compactForSummary(firstAnswer ? [messages[firstUserIndex], firstAnswer] : [messages[firstUserIndex]]);

        const response = await callAndRecord(resolved, conversation, "assistant.title", buildTitlePrompt(exchange), TITLE_MAX_OUTPUT_TOKENS);
        const title = cleanTitle(response.text ?? "");
        if (!title) return { updated: false, reason: "empty_title" };

        const saved = await resolved.db.saveTitle(conversationId, title);
        return saved ? { updated: true, reason: "titled" } : { updated: false, reason: "title_edited" };
    } catch (error) {
        console.warn("[assistant.title] titre non mis à jour", error);
        return { updated: false, reason: errorReason(error) };
    }
}
