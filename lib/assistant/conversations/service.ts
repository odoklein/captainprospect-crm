/**
 * Conversations of the Captain AI v4 workspace: lists (by folder, agency view,
 * pinned), creation, the paged thread, rename / move / share / pin, fork and
 * answer feedback. Reads go through optional() so an instance without the v4
 * columns still lists and opens its threads (as PRIVATE, folder-less chats).
 *
 * Access: read = owner, or SHARED and an active MANAGER; write = owner. A
 * conversation the viewer may not read is reported missing (404).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AuthError, NotFoundError, ValidationError } from "@/lib/api-utils";
import { resolveProjectBinding } from "@/lib/ai/tools/context";
import { optional } from "../store/missing";
import { canReadConversation, canWriteConversation, type Viewer } from "../folders/rules";
import {
    AssistantAccessError,
    ensureClientFolder,
    getFolderCard,
    moveConversation,
    touchFolder,
} from "../folders/service";
import type {
    ConversationCard,
    ConversationsResponse,
    CreateConversationBody,
    FeedbackBody,
    FolderCard,
    PatchConversationBody,
    ThreadMessage,
    ThreadResponse,
} from "../api-contract";
import {
    forkSeed,
    toConversationCard,
    toThreadMessage,
    type ConversationCardRow,
    type ThreadMessageRow,
} from "./cards";
import { decodeCursor, keysetOrderBy, keysetWhere, pageOf, type CursorField } from "./cursor";
import { readableWhere } from "./rules";

export const NOT_FOUND = "Conversation introuvable";
export const TITLE_MAX = 120;
export const SEED_SUMMARY_MAX = 8000;
export const THREAD_LIMIT_DEFAULT = 60;
export const THREAD_LIMIT_MAX = 200;

// ============================================
// Viewer
// ============================================

/** The acting manager with the fields the read rule needs. */
export async function loadViewer(userId: string): Promise<Viewer> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, isActive: true } });
    if (!user) throw new AuthError("Non authentifié", 401);
    return { id: user.id, role: user.role, isActive: user.isActive };
}

// ============================================
// Selects and row mapping
// ============================================

const CARD_SELECT = {
    id: true,
    title: true,
    kind: true,
    visibility: true,
    pinnedAt: true,
    folderId: true,
    clientId: true,
    missionId: true,
    messageCount: true,
    lastMessageAt: true,
    createdAt: true,
    createdById: true,
    mission: { select: { name: true } },
    createdBy: { select: { name: true } },
} as const;

/** Pre-v4 columns only. */
const LEGACY_CARD_SELECT = {
    id: true,
    title: true,
    clientId: true,
    missionId: true,
    messageCount: true,
    lastMessageAt: true,
    createdAt: true,
    createdById: true,
    mission: { select: { name: true } },
    createdBy: { select: { name: true } },
} as const;

type LegacyCardRow = Omit<ConversationCardRow, "kind" | "visibility" | "pinnedAt" | "folderId">;

const fromLegacy = (row: LegacyCardRow): ConversationCardRow => ({
    ...row,
    kind: "CHAT",
    visibility: "PRIVATE",
    pinnedAt: null,
    folderId: null,
});

/** The latest live answer of each conversation (first 1500 chars), for the card previews. */
async function lastAnswers(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const run = (live: boolean) =>
        prisma.$queryRaw<Array<{ conversationId: string; content: string }>>`
            SELECT DISTINCT ON ("conversationId") "conversationId", left("content", 1500) AS "content"
            FROM "AssistantProjetMessage"
            WHERE "conversationId" IN (${Prisma.join(ids)})
              AND "role" = 'ASSISTANT'
              ${live ? Prisma.sql`AND "supersededAt" IS NULL` : Prisma.empty}
            ORDER BY "conversationId", "createdAt" DESC`;
    const rows = await optional("conversations.previews", () => run(true), () => run(false));
    return new Map(rows.map((r) => [r.conversationId, r.content]));
}

export async function cardsFor(rows: ConversationCardRow[], viewer: Viewer): Promise<ConversationCard[]> {
    const answers = await lastAnswers(rows.map((r) => r.id));
    return rows.map((row) => toConversationCard(row, viewer.id, answers.get(row.id)));
}

type ReadableRow = ConversationCardRow & { summary: string | null };

/** The conversation when `viewer` may read it, else null. Works without the v4 columns. */
export async function findReadableConversation(id: string, viewer: Viewer): Promise<ReadableRow | null> {
    const row = await optional<ReadableRow | null>(
        "conversations.find",
        () => prisma.assistantConversation.findUnique({ where: { id }, select: { ...CARD_SELECT, summary: true } }),
        async () => {
            const legacy = await prisma.assistantConversation.findUnique({
                where: { id },
                select: { ...LEGACY_CARD_SELECT, summary: true },
            });
            return legacy ? { ...fromLegacy(legacy), summary: legacy.summary } : null;
        },
    );
    if (!row) return null;
    return canReadConversation(viewer, row).ok ? row : null;
}

async function requireReadable(id: string, viewer: Viewer): Promise<ReadableRow> {
    const row = await findReadableConversation(id, viewer);
    if (!row) throw new NotFoundError(NOT_FOUND);
    return row;
}

/** Readable and owned: anything else is a 404 (no probing). */
async function requireOwned(id: string, viewer: Viewer): Promise<ReadableRow> {
    const row = await requireReadable(id, viewer);
    if (!canWriteConversation(viewer, row).ok) throw new NotFoundError(NOT_FOUND);
    return row;
}

async function cardById(id: string, viewer: Viewer): Promise<ConversationCard> {
    const row = await requireReadable(id, viewer);
    return (await cardsFor([row], viewer))[0];
}

// ============================================
// Lists
// ============================================

export interface ConversationListQuery {
    folderId?: string | null;
    scope?: "agency" | null;
    pinned?: boolean;
    q?: string | null;
    cursor?: string | null;
    limit: number;
}

/**
 * One page of cards. `folderId`: the folder's threads (a CLIENT folder also
 * lists its client's unfiled legacy threads); `scope=agency`: no folder and no
 * client; `pinned`: the viewer's pinned threads, newest pin first. Without
 * any of them: every readable thread. `q` filters titles.
 */
export async function listConversations(viewer: Viewer, query: ConversationListQuery): Promise<ConversationsResponse> {
    const field: CursorField = query.pinned ? "pinnedAt" : "lastMessageAt";
    const run = async (): Promise<ConversationsResponse> => {
        const and: Prisma.AssistantConversationWhereInput[] = [readableWhere(viewer) as Prisma.AssistantConversationWhereInput];
        if (query.pinned) {
            and.push({ createdById: viewer.id, pinnedAt: { not: null } });
        } else if (query.folderId) {
            const folder = await prisma.assistantFolder.findUnique({
                where: { id: query.folderId },
                select: { id: true, kind: true, clientId: true },
            });
            if (!folder) throw new NotFoundError("Dossier introuvable");
            and.push(
                folder.kind === "CLIENT" && folder.clientId
                    ? { OR: [{ folderId: folder.id }, { clientId: folder.clientId }] }
                    : { folderId: folder.id },
            );
        } else if (query.scope === "agency") {
            and.push({ folderId: null, clientId: null });
        }
        const q = query.q?.trim();
        if (q) and.push({ title: { contains: q.slice(0, 200), mode: "insensitive" } });
        const after = keysetWhere(field, decodeCursor(query.cursor));
        if (after) and.push(after as Prisma.AssistantConversationWhereInput);

        const rows = await prisma.assistantConversation.findMany({
            where: { AND: and },
            orderBy: keysetOrderBy(field) as Prisma.AssistantConversationOrderByWithRelationInput[],
            take: query.limit + 1,
            select: CARD_SELECT,
        });
        const page = pageOf(rows, query.limit, (r) => (field === "pinnedAt" ? r.pinnedAt : r.lastMessageAt));
        return { items: await cardsFor(page.items, viewer), nextCursor: page.nextCursor };
    };
    return optional<ConversationsResponse>("conversations.list", run, { items: [], nextCursor: null, degraded: true });
}

/** The viewer's pinned threads for the folder rail (newest pin first). */
export async function listPinnedCards(viewer: Viewer, take = 20): Promise<ConversationCard[]> {
    const page = await listConversations(viewer, { pinned: true, limit: take });
    return page.items;
}

// ============================================
// Create, fork
// ============================================

interface NewConversation {
    folderId: string | null;
    clientId: string | null;
    missionId: string | null;
    title: string;
    titleEdited: boolean;
    summary: string | null;
}

async function insertConversation(viewer: Viewer, data: NewConversation): Promise<ConversationCard> {
    const row = await optional<ConversationCardRow>(
        "conversations.create",
        () =>
            prisma.assistantConversation.create({
                data: {
                    createdById: viewer.id,
                    folderId: data.folderId,
                    clientId: data.clientId,
                    missionId: data.missionId,
                    kind: "CHAT",
                    visibility: "PRIVATE",
                    title: data.title,
                    summary: data.summary,
                    ...(data.titleEdited ? { titleEditedAt: new Date() } : {}),
                },
                select: CARD_SELECT,
            }),
        async () =>
            fromLegacy(
                await prisma.assistantConversation.create({
                    data: { createdById: viewer.id, clientId: data.clientId, missionId: data.missionId, title: data.title },
                    select: LEGACY_CARD_SELECT,
                }),
            ),
    );
    if (data.folderId) await touchFolder(data.folderId);
    return { ...toConversationCard(row, viewer.id, null) };
}

const cleanTitle = (raw: string | null | undefined): string | null => {
    const value = raw?.replace(/\s+/g, " ").trim();
    return value ? value.slice(0, TITLE_MAX) : null;
};

/**
 * A new thread for the viewer. With `folderId` it lives in that folder (a
 * CLIENT folder binds its client; a GENERAL folder holds no client). With only
 * `clientId` the client's folder is ensured (when the instance has folders).
 * Neither = an agency-view thread.
 */
export async function createConversation(viewer: Viewer, body: CreateConversationBody): Promise<ConversationCard> {
    let folderId: string | null = null;
    let folderName: string | null = null;
    let clientId: string | null = body.clientId ?? null;

    if (body.folderId) {
        const folder = await optional(
            "conversations.create.folder",
            () =>
                prisma.assistantFolder.findUnique({
                    where: { id: body.folderId as string },
                    select: { id: true, kind: true, clientId: true, name: true, archivedAt: true },
                }),
            null,
        );
        if (!folder) throw new NotFoundError("Dossier introuvable");
        if (folder.archivedAt) throw new ValidationError("Ce dossier est archivé : désarchive-le pour y ouvrir une conversation.");
        if (folder.kind === "CLIENT") {
            if (clientId && clientId !== folder.clientId) {
                throw new ValidationError("Ce client ne correspond pas au dossier choisi.");
            }
            clientId = folder.clientId;
        } else if (clientId) {
            throw new ValidationError("Un dossier général ne contient pas de conversation liée à un client.");
        }
        folderId = folder.id;
        folderName = folder.name;
    }

    const project = clientId ? await resolveProjectBinding(clientId, body.missionId) : null;
    if (!project && body.missionId) throw new ValidationError("Une mission demande son client.");

    if (project && !folderId) {
        const folder = await optional("conversations.create.ensure", () => ensureClientFolder(project.clientId, viewer.id), null);
        folderId = folder?.id ?? null;
    }

    const explicit = cleanTitle(body.title);
    const title =
        explicit ??
        (project
            ? project.missionName
                ? `${project.clientName} — ${project.missionName}`
                : project.clientName
            : folderName && !project
              ? folderName
              : "Vue agence");
    const seed = body.seedSummary?.trim() ? body.seedSummary.trim().slice(0, SEED_SUMMARY_MAX) : null;

    return insertConversation(viewer, {
        folderId,
        clientId: project?.clientId ?? null,
        missionId: project?.missionId ?? null,
        title,
        titleEdited: explicit !== null,
        summary: seed,
    });
}

/**
 * Continue a thread the viewer can read (typically a colleague's SHARED one)
 * in a new private thread of their own: same folder, client and mission,
 * seeded with the source's summary (or its last exchanges).
 */
export async function forkConversation(sourceId: string, viewer: Viewer): Promise<ConversationCard> {
    const source = await requireReadable(sourceId, viewer);
    const recent = source.summary?.trim()
        ? []
        : await optional(
              "conversations.fork.recent",
              () =>
                  prisma.assistantMessage.findMany({
                      where: { conversationId: source.id, supersededAt: null },
                      orderBy: { createdAt: "desc" },
                      take: 8,
                      select: { role: true, content: true },
                  }),
              () =>
                  prisma.assistantMessage.findMany({
                      where: { conversationId: source.id },
                      orderBy: { createdAt: "desc" },
                      take: 8,
                      select: { role: true, content: true },
                  }),
          );
    const folderArchived = source.folderId
        ? await optional(
              "conversations.fork.folder",
              () =>
                  prisma.assistantFolder
                      .findUnique({ where: { id: source.folderId as string }, select: { archivedAt: true } })
                      .then((f) => !f || f.archivedAt !== null),
              true,
          )
        : false;
    return insertConversation(viewer, {
        // An archived GENERAL folder takes no new thread: the fork lands in the agency view.
        folderId: folderArchived && !source.clientId ? null : source.folderId,
        clientId: source.clientId,
        missionId: source.missionId,
        title: `Suite — ${source.title}`.slice(0, TITLE_MAX),
        titleEdited: false,
        summary: forkSeed(source.summary, [...recent].reverse()),
    });
}

// ============================================
// Thread
// ============================================

const MESSAGE_SELECT = {
    id: true,
    role: true,
    content: true,
    createdAt: true,
    trace: true,
    action: true,
    attachments: true,
    feedback: true,
} as const;

const LEGACY_MESSAGE_SELECT = { id: true, role: true, content: true, createdAt: true, trace: true, action: true } as const;

/** The CLIENT folder of a legacy unfiled thread, so its header still shows the folder. */
async function folderOf(row: ConversationCardRow, viewer: Viewer): Promise<FolderCard | null> {
    if (row.folderId) return getFolderCard(row.folderId, viewer);
    if (!row.clientId) return null;
    const folder = await optional(
        "conversations.thread.client_folder",
        () => prisma.assistantFolder.findUnique({ where: { clientId: row.clientId as string }, select: { id: true } }),
        null,
    );
    return folder ? getFolderCard(folder.id, viewer) : null;
}

/**
 * One page of a thread, newest page first, returned oldest → newest.
 * `before` = the oldest message id of the page already shown.
 */
export async function getThread(
    id: string,
    viewer: Viewer,
    options: { before?: string | null; limit: number },
): Promise<ThreadResponse> {
    const row = await requireReadable(id, viewer);

    let anchor: { id: string; createdAt: Date } | null = null;
    if (options.before) {
        anchor = await prisma.assistantMessage.findFirst({
            where: { id: options.before, conversationId: row.id },
            select: { id: true, createdAt: true },
        });
        if (!anchor) throw new ValidationError("Curseur de messages invalide.");
    }
    const older: Prisma.AssistantMessageWhereInput = anchor
        ? { OR: [{ createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { lt: anchor.id } }] }
        : {};
    const orderBy: Prisma.AssistantMessageOrderByWithRelationInput[] = [{ createdAt: "desc" }, { id: "desc" }];
    const take = options.limit + 1;

    const newestFirst = await optional<ThreadMessageRow[]>(
        "conversations.thread.messages",
        () =>
            prisma.assistantMessage.findMany({
                where: { AND: [{ conversationId: row.id, supersededAt: null }, older] },
                orderBy,
                take,
                select: MESSAGE_SELECT,
            }),
        () =>
            prisma.assistantMessage.findMany({
                where: { AND: [{ conversationId: row.id }, older] },
                orderBy,
                take,
                select: LEGACY_MESSAGE_SELECT,
            }),
    );
    const hasOlder = newestFirst.length > options.limit;
    const kept = newestFirst.slice(0, options.limit);
    const messages = [...kept].reverse().map(toThreadMessage);

    const [card, folder] = await Promise.all([cardsFor([row], viewer).then((c) => c[0]), folderOf(row, viewer)]);
    return {
        conversation: { ...card, summary: row.summary, folder },
        messages,
        olderCursor: hasOlder && messages.length > 0 ? messages[0].id : null,
        canWrite: canWriteConversation(viewer, row).ok,
    };
}

// ============================================
// Patch, delete, feedback
// ============================================

/** Rename, move, share, pin. Owner only; the move rules come from ../folders/rules.ts. */
export async function patchConversation(
    id: string,
    viewer: Viewer,
    body: PatchConversationBody,
): Promise<ConversationCard> {
    const row = await requireOwned(id, viewer);

    if (body.folderId !== undefined && (body.folderId ?? null) !== row.folderId) {
        await moveConversation(row.id, body.folderId ?? null, viewer);
    }

    const data: Prisma.AssistantConversationUpdateInput = {};
    if (body.title !== undefined) {
        const title = cleanTitle(body.title);
        if (!title) throw new ValidationError("Le titre est vide.");
        data.title = title;
        data.titleEditedAt = new Date();
    }
    if (body.visibility !== undefined) data.visibility = body.visibility;
    if (body.pinned !== undefined) data.pinnedAt = body.pinned ? (row.pinnedAt ?? new Date()) : null;

    if (Object.keys(data).length > 0) {
        const done = await optional(
            "conversations.patch",
            () => prisma.assistantConversation.update({ where: { id: row.id }, data, select: { id: true } }).then(() => true),
            async () => {
                // Pre-v4: only the title exists.
                if (data.visibility !== undefined || data.pinnedAt !== undefined) return false;
                await prisma.assistantConversation.update({ where: { id: row.id }, data: { title: data.title } });
                return true;
            },
        );
        if (!done) throw new AssistantAccessError("Le partage et l'épinglage ne sont pas encore activés sur cette instance.", 503);
    }
    return cardById(row.id, viewer);
}

export async function deleteConversation(id: string, viewer: Viewer): Promise<void> {
    const row = await requireOwned(id, viewer);
    await prisma.assistantConversation.delete({ where: { id: row.id } });
}

/** Rates an answer; a null rating clears it. Any reader of the thread may rate. */
export async function setMessageFeedback(
    conversationId: string,
    messageId: string,
    viewer: Viewer,
    body: FeedbackBody,
): Promise<ThreadMessage> {
    const conv = await requireReadable(conversationId, viewer);
    const message = await prisma.assistantMessage.findFirst({
        where: { id: messageId, conversationId: conv.id },
        select: { id: true, role: true },
    });
    if (!message) throw new NotFoundError("Message introuvable");
    if (message.role !== "ASSISTANT") throw new ValidationError("Seules les réponses de l'assistant se notent.");

    const comment = body.comment?.trim() ? body.comment.trim().slice(0, 1000) : null;
    const feedback =
        body.rating === null
            ? Prisma.DbNull
            : ({ rating: body.rating, comment, at: new Date().toISOString(), by: viewer.id } as Prisma.InputJsonValue);
    const updated = await optional(
        "conversations.feedback",
        () => prisma.assistantMessage.update({ where: { id: message.id }, data: { feedback }, select: MESSAGE_SELECT }),
        null,
    );
    if (!updated) throw new AssistantAccessError("Les avis sur les réponses ne sont pas encore activés sur cette instance.", 503);
    return toThreadMessage(updated);
}
