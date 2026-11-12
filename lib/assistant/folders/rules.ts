/**
 * Pure invariants of the assistant workspace (Captain AI v4): which folder a
 * conversation may live in, and who may read or write it. No I/O: the service
 * applies them and the API returns the French reasons as-is.
 *
 * - CLIENT folder  => the conversation's clientId is that folder's client.
 * - GENERAL folder => clientId null (a cross-client thread).
 * - Moves happen only among general folders and the agency view (no folder).
 *   A client folder is entered only by a conversation already bound to that
 *   client, and is never left.
 * - Read: the owner, or SHARED and an active MANAGER. Write: the owner only.
 */

export type FolderKind = "CLIENT" | "GENERAL";
export type Visibility = "PRIVATE" | "SHARED";

export interface FolderRef {
    id: string;
    kind: FolderKind;
    clientId: string | null;
}

export interface ConversationRef {
    clientId: string | null;
    folderId: string | null;
    createdById: string;
    visibility: Visibility;
}

export interface Viewer {
    id: string;
    role: string;
    isActive: boolean;
}

export type RuleResult = { ok: true } | { ok: false; reason: string };

const OK: RuleResult = { ok: true };
const refuse = (reason: string): RuleResult => ({ ok: false, reason });

export const RULE_MESSAGES = {
    clientFolderNeedsClient: "Une conversation ne rejoint le dossier d'un client que si elle est liée à ce client.",
    clientFolderIsFinal: "Les conversations d'un dossier client restent dans ce dossier.",
    clientBoundNotGeneral: "Cette conversation est liée à un client : elle ne peut pas aller dans un dossier général.",
    privateConversation: "Cette conversation est privée. Seul son auteur peut la consulter.",
    sharedManagersOnly: "Cette conversation est partagée entre managers uniquement.",
    ownerWritesOnly: "Seul l'auteur peut écrire dans cette conversation. Continue-la dans une nouvelle conversation.",
} as const;

/**
 * May `conv` go from folder `from` to folder `to`? Null = the agency view
 * (no folder). GENERAL <-> GENERAL <-> none is free; anything touching a
 * CLIENT folder is refused unless it is the conversation's own client folder.
 */
export function canMoveConversation(
    conv: Pick<ConversationRef, "clientId">,
    from: FolderRef | null,
    to: FolderRef | null,
): RuleResult {
    if ((from?.id ?? null) === (to?.id ?? null)) return OK;
    if (to?.kind === "CLIENT") {
        return conv.clientId !== null && conv.clientId === to.clientId ? OK : refuse(RULE_MESSAGES.clientFolderNeedsClient);
    }
    if (from?.kind === "CLIENT") return refuse(RULE_MESSAGES.clientFolderIsFinal);
    if (conv.clientId !== null) return refuse(RULE_MESSAGES.clientBoundNotGeneral);
    return OK;
}

/** The clientId/folderId a conversation carries once filed in `folder`. */
export function conversationScopeForFolder(folder: FolderRef | null): { folderId: string | null; clientId: string | null } {
    if (!folder) return { folderId: null, clientId: null };
    if (folder.kind === "CLIENT") return { folderId: folder.id, clientId: folder.clientId };
    return { folderId: folder.id, clientId: null };
}

export function isConversationOwner(viewer: Pick<Viewer, "id">, conv: Pick<ConversationRef, "createdById">): boolean {
    return viewer.id === conv.createdById;
}

/** Owner, or SHARED and an active MANAGER. */
export function canReadConversation(viewer: Viewer, conv: Pick<ConversationRef, "createdById" | "visibility">): RuleResult {
    if (isConversationOwner(viewer, conv)) return OK;
    if (conv.visibility !== "SHARED") return refuse(RULE_MESSAGES.privateConversation);
    if (viewer.role === "MANAGER" && viewer.isActive) return OK;
    return refuse(RULE_MESSAGES.sharedManagersOnly);
}

/** Owner only (v1): others fork into a new conversation. */
export function canWriteConversation(viewer: Pick<Viewer, "id">, conv: Pick<ConversationRef, "createdById">): RuleResult {
    return isConversationOwner(viewer, conv) ? OK : refuse(RULE_MESSAGES.ownerWritesOnly);
}
