/**
 * Row → wire mapping of conversations and messages (Captain AI v4). Pure: the
 * service selects the rows, these functions shape them into the contract types
 * of lib/assistant/api-contract.ts.
 */

import type {
    ConversationCard,
    ConversationKind,
    MessageFeedback,
    ThreadMessage,
    Visibility,
} from "../api-contract";
import { splitFollowUps } from "../answer";

export const PREVIEW_MAX_CHARS = 140;

/** What the service selects for one card. */
export interface ConversationCardRow {
    id: string;
    title: string;
    kind: ConversationKind;
    visibility: Visibility;
    pinnedAt: Date | null;
    folderId: string | null;
    clientId: string | null;
    missionId: string | null;
    messageCount: number;
    lastMessageAt: Date | null;
    createdAt: Date;
    createdById: string;
    mission: { name: string } | null;
    createdBy: { name: string | null } | null;
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

/**
 * The first ~140 characters of an answer as plain text: follow-up block,
 * visual markers, citation labels and markdown syntax removed. Null when
 * nothing readable is left.
 */
export function previewOf(content: string | null | undefined, max = PREVIEW_MAX_CHARS): string | null {
    const text = plainText(content);
    if (!text || text === "—") return null;
    if (text.length <= max) return text;
    const cut = text.slice(0, max - 1);
    const space = cut.lastIndexOf(" ");
    return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** An answer as one line of plain text (follow-ups, markers, markdown removed). */
export function plainText(content: string | null | undefined): string {
    if (!content) return "";
    const { body } = splitFollowUps(content);
    return body
        .replace(/^[ \t]*\[\[visuel\s+\d+\]\][ \t]*$/gim, " ")
        .replace(/```[\s\S]*?(```|$)/g, " ")
        .replace(/\[(E\d{1,3}(?:\s*[,;]\s*E\d{1,3})*)\](?!\()/g, "")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/^[ \t]*#{1,6}[ \t]+/gm, "")
        .replace(/^[ \t]*>[ \t]?/gm, "")
        .replace(/^[ \t]*(?:[-*+•]|\d+[.)])[ \t]+/gm, "")
        .replace(/^[ \t]*\|?[ \t]*:?-{3,}.*$/gm, " ")
        .replace(/\|/g, " ")
        .replace(/(\*\*|__|\*|_|~~|`)/g, "")
        .replace(/\s+/g, " ")
        // A removed citation label leaves a space before its punctuation.
        .replace(/ ([,.)])/g, "$1")
        .trim();
}

export function toConversationCard(
    row: ConversationCardRow,
    viewerId: string,
    lastAnswer: string | null | undefined,
): ConversationCard {
    return {
        id: row.id,
        title: row.title,
        kind: row.kind,
        visibility: row.visibility,
        pinnedAt: iso(row.pinnedAt),
        folderId: row.folderId,
        clientId: row.clientId,
        missionId: row.missionId,
        missionName: row.mission?.name ?? null,
        messageCount: row.messageCount,
        lastMessageAt: iso(row.lastMessageAt),
        createdAt: row.createdAt.toISOString(),
        isOwner: row.createdById === viewerId,
        ownerName: row.createdBy?.name?.trim() || null,
        preview: previewOf(lastAnswer),
    };
}

/** What the service selects for one message. */
export interface ThreadMessageRow {
    id: string;
    role: "USER" | "ASSISTANT";
    content: string;
    createdAt: Date;
    trace: unknown;
    action: unknown;
    attachments?: unknown;
    feedback?: unknown;
}

export type Attachment = { fileId: string; name: string; status: string };

export function parseAttachments(raw: unknown): Attachment[] | null {
    if (!Array.isArray(raw)) return null;
    const out: Attachment[] = [];
    for (const item of raw) {
        if (!item || typeof item !== "object") continue;
        const a = item as Record<string, unknown>;
        if (typeof a.fileId !== "string") continue;
        out.push({
            fileId: a.fileId,
            name: typeof a.name === "string" ? a.name : "Fichier",
            status: typeof a.status === "string" ? a.status : "PENDING",
        });
    }
    return out.length > 0 ? out : null;
}

export function parseFeedback(raw: unknown): MessageFeedback | null {
    if (!raw || typeof raw !== "object") return null;
    const f = raw as Record<string, unknown>;
    if (f.rating !== "up" && f.rating !== "down") return null;
    return {
        rating: f.rating,
        comment: typeof f.comment === "string" ? f.comment : null,
        at: typeof f.at === "string" ? f.at : new Date(0).toISOString(),
        by: typeof f.by === "string" ? f.by : "",
    };
}

export function toThreadMessage(row: ThreadMessageRow): ThreadMessage {
    return {
        id: row.id,
        role: row.role,
        content: row.content,
        createdAt: row.createdAt.toISOString(),
        trace: row.trace ?? null,
        action: row.action ?? null,
        attachments: parseAttachments(row.attachments),
        feedback: parseFeedback(row.feedback),
    };
}

/**
 * The summary a fork starts from: the source's rolling summary when it has
 * one, else a short excerpt of its last messages (oldest first), bounded.
 */
export function forkSeed(
    summary: string | null,
    recent: Array<{ role: "USER" | "ASSISTANT"; content: string }>,
    maxChars = 4000,
): string | null {
    const clean = summary?.trim();
    if (clean) return clean.length > maxChars ? `${clean.slice(0, maxChars - 1)}…` : clean;
    if (recent.length === 0) return null;
    const lines: string[] = [];
    let used = 0;
    // Newest last; keep the most recent lines that fit, then restore the order.
    for (let i = recent.length - 1; i >= 0; i--) {
        const m = recent[i];
        const body = splitFollowUps(m.content).body.replace(/\s+/g, " ").trim().slice(0, 600);
        if (!body) continue;
        const line = `${m.role === "USER" ? "Manager" : "Assistant"} : ${body}`;
        if (used + line.length > maxChars) break;
        used += line.length + 1;
        lines.unshift(line);
    }
    return lines.length > 0 ? `Reprise d'une conversation précédente. Derniers échanges :\n${lines.join("\n")}` : null;
}
