/**
 * What the PDF export routes render, and who may export it. Pure: the routes
 * inject the database reads, so the access matrix is tested with fakes.
 *
 *   conversation  owner, or SHARED and an active MANAGER (folders/rules.ts
 *                 canReadConversation). Anything else is a 404, like the thread.
 *                 No messageIds: the whole thread, one section per question
 *                 (eyebrow « Question N », the question as heading, the answers
 *                 as body with their visuals). With messageIds: those answers
 *                 only, each under the question it answered.
 *   agent run     its REPORT artifact (body + visuals), 404 when there is none.
 */

import type { AgentRunDetail } from "@/lib/assistant/api-contract";
import { VISUAL_KINDS, type StoredVisual } from "@/lib/assistant/visuals/spec";
import { canReadConversation, type Viewer, type Visibility } from "../folders/rules";
import type { AssistantPdfSection } from "./render";

export class PdfExportError extends Error {
    constructor(
        message: string,
        readonly status: 400 | 404,
    ) {
        super(message);
        this.name = "PdfExportError";
    }
}

export const EXPORT_MESSAGES = {
    conversationNotFound: "Conversation introuvable",
    messageNotFound: "Réponse introuvable dans cette conversation.",
    empty: "Cette conversation ne contient encore aucune réponse à exporter.",
    runNotFound: "Exécution introuvable",
    noReport: "Cette exécution n'a pas produit de rapport.",
} as const;

/** At most this many answers in one export (a thread page holds 200 messages). */
export const MAX_EXPORT_MESSAGES = 400;
const QUESTION_HEADING_MAX = 300;

export interface ExportConversation {
    id: string;
    title: string;
    createdById: string;
    visibility: Visibility;
    clientName?: string | null;
    missionName?: string | null;
}

export interface ExportMessage {
    id: string;
    role: "USER" | "ASSISTANT";
    content: string;
    trace: unknown;
}

export interface PdfContent {
    title: string;
    subtitle?: string;
    sections: AssistantPdfSection[];
    /** Base of the download name (pdfFileName adds the date). */
    fileBase: string;
}

/** The visuals stored in a message trace (or a report), dropping anything that is not one. */
export function storedVisualsOf(value: unknown): StoredVisual[] {
    const list = Array.isArray(value)
        ? value
        : value && typeof value === "object" && Array.isArray((value as { visuals?: unknown }).visuals)
          ? (value as { visuals: unknown[] }).visuals
          : [];
    return list.filter((v): v is StoredVisual => {
        if (!v || typeof v !== "object") return false;
        const spec = (v as { spec?: unknown }).spec;
        return !!spec && typeof spec === "object" && (VISUAL_KINDS as readonly string[]).includes((spec as { kind?: unknown }).kind as string);
    });
}

function questionHeading(content: string): string {
    const text = content.replace(/\s+/g, " ").trim();
    return text.length <= QUESTION_HEADING_MAX ? text : `${text.slice(0, QUESTION_HEADING_MAX - 1).trimEnd()}…`;
}

function subtitleOf(conv: ExportConversation, answers: number): string {
    const scope = [conv.clientName, conv.missionName].filter((s): s is string => !!s && !!s.trim());
    const count = `${answers} réponse${answers > 1 ? "s" : ""}`;
    return [...(scope.length ? [scope.join(" — ")] : ["Conversation avec l'assistant"]), count].join(" · ");
}

/**
 * Sections of a thread export. `messages` are the live messages oldest first.
 * Throws PdfExportError (404) for an id that is not an answer of this thread.
 */
export function conversationPdfContent(conv: ExportConversation, messages: ExportMessage[], messageIds?: string[] | null): PdfContent {
    const wanted = messageIds && messageIds.length > 0 ? new Set(messageIds) : null;
    if (wanted) {
        const answers = new Set(messages.filter((m) => m.role === "ASSISTANT").map((m) => m.id));
        for (const id of wanted) if (!answers.has(id)) throw new PdfExportError(EXPORT_MESSAGES.messageNotFound, 404);
    }

    const sections: AssistantPdfSection[] = [];
    let question: ExportMessage | null = null;
    let questionNumber = 0;
    let current: AssistantPdfSection | null = null;
    let answers = 0;

    for (const message of messages) {
        if (message.role === "USER") {
            question = message;
            questionNumber += 1;
            current = null;
            continue;
        }
        if (wanted && !wanted.has(message.id)) continue;
        answers += 1;
        const visuals = storedVisualsOf(message.trace);
        // Several live answers to one question (rare) follow each other under one heading.
        if (current && !wanted) {
            sections.push({ markdown: message.content, visuals });
            continue;
        }
        current = {
            ...(question ? { eyebrow: `Question ${questionNumber}`, heading: questionHeading(question.content) } : {}),
            markdown: message.content,
            visuals,
        };
        sections.push(current);
        if (wanted) current = null;
    }
    if (answers === 0) throw new PdfExportError(EXPORT_MESSAGES.empty, 404);

    const title = conv.title?.trim() || "Conversation";
    return { title, subtitle: subtitleOf(conv, answers), sections, fileBase: title };
}

export interface ConversationExportDeps {
    /** The row, whoever owns it (the access rule is applied here). Null when missing. */
    findConversation(id: string): Promise<ExportConversation | null>;
    /** Live messages, oldest first, at most MAX_EXPORT_MESSAGES. */
    listMessages(conversationId: string): Promise<ExportMessage[]>;
}

/** Access + content of a conversation export. Unreadable = missing (404), never 403. */
export async function conversationExport(
    deps: ConversationExportDeps,
    viewer: Viewer,
    conversationId: string,
    messageIds?: string[] | null,
): Promise<PdfContent> {
    const conv = await deps.findConversation(conversationId);
    if (!conv || !canReadConversation(viewer, conv).ok) throw new PdfExportError(EXPORT_MESSAGES.conversationNotFound, 404);
    const messages = await deps.listMessages(conv.id);
    return conversationPdfContent(conv, messages, messageIds);
}

type RunForPdf = Pick<AgentRunDetail, "report" | "clientName" | "jobName" | "playbook" | "goal">;

/** The run's report as a PDF content; PdfExportError 404 when the run produced none. */
export function runReportPdfContent(run: RunForPdf | null): PdfContent {
    if (!run) throw new PdfExportError(EXPORT_MESSAGES.runNotFound, 404);
    const report = run.report;
    if (!report || !report.body?.trim()) throw new PdfExportError(EXPORT_MESSAGES.noReport, 404);
    const title = report.title?.trim() || "Rapport";
    const subtitle = [run.clientName, run.jobName ?? run.goal].filter((s): s is string => !!s && !!s.trim()).join(" · ");
    return {
        title,
        ...(subtitle ? { subtitle } : {}),
        sections: [{ markdown: report.body, visuals: storedVisualsOf(report.visuals) }],
        fileBase: run.clientName && !title.toLowerCase().includes(run.clientName.toLowerCase()) ? `${title} ${run.clientName}` : title,
    };
}
