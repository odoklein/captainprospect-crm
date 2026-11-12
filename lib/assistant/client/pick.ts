/**
 * Unwrapping of the Captain AI create/fork/patch responses.
 *
 * The conversation routes answer with the full `ConversationCard`. For older
 * callers they also carry a deprecated `conversation: { id, title, createdAt }`
 * stub next to it. The stub has no folder, client, kind or counts, so it must
 * never win over the card: a thread seeded from it opens with `folderId`
 * undefined, which the shell reads as « Vue agence ».
 */

import type { ConversationCard, FolderCard } from "../api-contract";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** A full card carries counts and a kind; the legacy stub does not. */
function looksLikeCard(value: Record<string, unknown>): boolean {
    return typeof value.id === "string" && ("messageCount" in value || "kind" in value || "folderId" in value);
}

/** `ConversationCard`, or `{ conversation: ConversationCard }` (never the three-field stub). */
export function pickConversation(data: unknown): ConversationCard {
    if (isRecord(data) && looksLikeCard(data)) return data as unknown as ConversationCard;
    if (isRecord(data) && isRecord(data.conversation)) return data.conversation as unknown as ConversationCard;
    return data as ConversationCard;
}

/** `FolderCard` or `{ folder: FolderCard }`. */
export function pickFolder(data: unknown): FolderCard {
    if (isRecord(data) && isRecord(data.folder)) return data.folder as unknown as FolderCard;
    return data as FolderCard;
}
