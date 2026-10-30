/**
 * Pure access and replay rules of conversations (Captain AI v4). The read and
 * write predicates themselves live in ../folders/rules.ts; this file turns
 * them into query filters and decides what a regenerate or an edit replaces.
 */

import type { Viewer } from "../folders/rules";

/** SHARED threads are visible to active managers only. */
export function canSeeShared(viewer: Pick<Viewer, "role" | "isActive">): boolean {
    return viewer.role === "MANAGER" && viewer.isActive;
}

/**
 * Prisma `where` fragment: the conversations `viewer` may read (own, plus
 * SHARED for an active manager). Compose it inside an `AND` array so its `OR`
 * never collides with another one.
 */
export function readableWhere(viewer: Viewer): Record<string, unknown> {
    return canSeeShared(viewer)
        ? { OR: [{ createdById: viewer.id }, { visibility: "SHARED" }] }
        : { createdById: viewer.id };
}

/** One live (not superseded) message, as the replay planner needs it. */
export interface ReplayMessage {
    id: string;
    role: "USER" | "ASSISTANT";
    content: string;
    attachments?: unknown;
}

export type ReplayPlan =
    | {
          ok: true;
          mode: "regenerate" | "edit";
          /** The question the turn runs on. */
          question: string;
          /** Regenerate: the USER row reused as-is (no new USER row is inserted). */
          reuseUserMessage: ReplayMessage | null;
          /** Rows marked supersededAt in the same transaction as the new answer. */
          supersedeIds: string[];
      }
    | { ok: false; reason: string };

export const REPLAY_MESSAGES = {
    notLastAnswer: "Seule la dernière réponse de l'assistant peut être régénérée.",
    noQuestion: "La question de cette réponse est introuvable : relance-la en écrivant un nouveau message.",
    notLastQuestion: "Seul ton dernier message peut être modifié.",
    emptyEdit: "Le message modifié est vide.",
    both: "Choisis entre régénérer et modifier : pas les deux à la fois.",
} as const;

/**
 * What a regenerate or an edit replaces, from the conversation's live
 * messages newest first.
 *
 * - regenerate: the target must be the latest ASSISTANT message and the
 *   latest message overall; the turn reruns on the USER message before it.
 * - edit: the target must be the latest USER message; it and every answer
 *   after it are superseded, and the turn runs on the new text.
 */
export function planReplay(
    newestFirst: ReplayMessage[],
    request: { regenerateMessageId?: string; editMessageId?: string; message?: string },
): ReplayPlan {
    if (request.regenerateMessageId && request.editMessageId) return { ok: false, reason: REPLAY_MESSAGES.both };

    if (request.regenerateMessageId) {
        const last = newestFirst[0];
        if (!last || last.role !== "ASSISTANT" || last.id !== request.regenerateMessageId) {
            return { ok: false, reason: REPLAY_MESSAGES.notLastAnswer };
        }
        const question = newestFirst.slice(1).find((m) => m.role === "USER");
        if (!question || !question.content.trim()) return { ok: false, reason: REPLAY_MESSAGES.noQuestion };
        return {
            ok: true,
            mode: "regenerate",
            question: question.content,
            reuseUserMessage: question,
            supersedeIds: [last.id],
        };
    }

    if (request.editMessageId) {
        const index = newestFirst.findIndex((m) => m.role === "USER");
        if (index < 0 || newestFirst[index].id !== request.editMessageId) {
            return { ok: false, reason: REPLAY_MESSAGES.notLastQuestion };
        }
        const text = (request.message ?? "").trim();
        if (!text) return { ok: false, reason: REPLAY_MESSAGES.emptyEdit };
        // Everything newer than the edited message is an answer to it.
        const supersedeIds = newestFirst.slice(0, index + 1).map((m) => m.id);
        return { ok: true, mode: "edit", question: request.message as string, reuseUserMessage: null, supersedeIds };
    }

    return { ok: false, reason: REPLAY_MESSAGES.notLastAnswer };
}

/** messageCount delta of a turn: rows added minus rows superseded. */
export function messageCountDelta(insertsUserRow: boolean, supersededCount: number): number {
    return (insertsUserRow ? 1 : 0) + 1 - supersededCount;
}
