// ============================================
// CLIENT SUPPORT MODULE — service layer
// ============================================
//
// Rules:
// - One support conversation per client company (auto-created on first access).
// - Every active MANAGER user is treated as a participant. A lightweight
//   SupportManagerState row is created lazily to track per-manager read state.
// - Clients can only see/post in their own conversation.
// - Managers can see/post in every conversation; resolving and reopening
//   is always a MANAGER-only action.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
    CreateSupportMessageInput,
    ManagerInboxFilters,
    SupportAttachmentDTO,
    SupportConversationDetailDTO,
    SupportConversationSummaryDTO,
    SupportMessageContext,
    SupportMessageDTO,
} from "./types";
import { SUPPORT_ATTACHMENT_MAX_COUNT, supportAttachmentUrl } from "./types";

const MESSAGE_PAGE_SIZE = 200;

function previewContent(content: string, limit = 140): string {
    const trimmed = content.replace(/\s+/g, " ").trim();
    if (trimmed.length <= limit) return trimmed;
    return trimmed.slice(0, limit - 1) + "…";
}

/**
 * Inbox/preview label for a message. An image-only message has no text, so fall
 * back to a photo marker instead of rendering an empty preview row.
 */
function messagePreview(content: string, attachmentCount: number): string | null {
    const text = previewContent(content);
    if (text) return text;
    if (attachmentCount > 0) {
        return attachmentCount > 1 ? `📷 ${attachmentCount} images` : "📷 Image";
    }
    return null;
}

function sanitiseContext(context: SupportMessageContext | undefined): Prisma.InputJsonValue | null {
    if (!context) return null;
    const clean: SupportMessageContext = {};
    if (typeof context.pageLabel === "string" && context.pageLabel.trim()) {
        clean.pageLabel = context.pageLabel.trim().slice(0, 120);
    }
    if (typeof context.pathname === "string" && context.pathname.trim()) {
        clean.pathname = context.pathname.trim().slice(0, 200);
    }
    if (Array.isArray(context.rdvRefs)) {
        const refs = context.rdvRefs
            .filter((ref): ref is string => typeof ref === "string")
            .map((ref) => ref.trim())
            .filter((ref) => ref.length > 0)
            .slice(0, 10);
        if (refs.length > 0) clean.rdvRefs = refs;
    }
    if (context.intent) clean.intent = context.intent;
    if (Object.keys(clean).length === 0) return null;
    return clean as Prisma.InputJsonValue;
}

/** Columns needed to build a SupportAttachmentDTO. */
const ATTACHMENT_SELECT = {
    id: true,
    fileName: true,
    mimeType: true,
    size: true,
    width: true,
    height: true,
} as const;

type AttachmentRow = {
    id: string;
    fileName: string;
    mimeType: string;
    size: number;
    width: number | null;
    height: number | null;
};

function toAttachmentDTO(row: AttachmentRow): SupportAttachmentDTO {
    return {
        id: row.id,
        fileName: row.fileName,
        mimeType: row.mimeType,
        size: row.size,
        width: row.width,
        height: row.height,
        url: supportAttachmentUrl(row.id),
    };
}

function toMessageDTO(message: {
    id: string;
    conversationId: string;
    role: string;
    content: string;
    intent: string | null;
    context: unknown;
    createdAt: Date;
    author: { id: string; name: string; role: string } | null;
    attachments?: AttachmentRow[];
}): SupportMessageDTO {
    return {
        id: message.id,
        conversationId: message.conversationId,
        role: message.role as SupportMessageDTO["role"],
        content: message.content,
        intent: (message.intent as SupportMessageDTO["intent"]) ?? null,
        context: (message.context as SupportMessageContext | null) ?? null,
        author: message.author
            ? {
                id: message.author.id,
                name: message.author.name,
                role: message.author.role,
            }
            : null,
        attachments: (message.attachments ?? []).map(toAttachmentDTO),
        createdAt: message.createdAt.toISOString(),
    };
}

/**
 * Fetch (or create) the single support conversation for a client company.
 * Used by the client portal bubble.
 */
export async function getOrCreateClientConversation(clientId: string): Promise<string> {
    const existing = await prisma.supportConversation.findUnique({
        where: { clientId },
        select: { id: true },
    });
    if (existing) return existing.id;

    const created = await prisma.supportConversation.create({
        data: { clientId },
        select: { id: true },
    });
    return created.id;
}

export async function getConversationIdForClientUser(userId: string): Promise<string | null> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { clientId: true, role: true },
    });
    if (!user || (user.role !== "CLIENT" && user.role !== "COMMERCIAL") || !user.clientId) return null;
    return getOrCreateClientConversation(user.clientId);
}

/**
 * Resolve the conversation a user is allowed to act on.
 * Managers reach any conversation; clients/commerciaux only ever reach their own,
 * so a forged `requestedId` can never widen access.
 * Returns null when access must be refused.
 */
export async function resolveAccessibleConversationId(
    user: { id: string; role: string },
    requestedId?: string | null,
): Promise<string | null> {
    if (user.role === "MANAGER") {
        if (!requestedId) return null;
        const conversation = await prisma.supportConversation.findUnique({
            where: { id: requestedId },
            select: { id: true },
        });
        return conversation?.id ?? null;
    }

    const ownId = await getConversationIdForClientUser(user.id);
    if (!ownId) return null;
    if (requestedId && requestedId !== ownId) return null;
    return ownId;
}

async function ensureManagerState(conversationId: string, managerId: string) {
    await prisma.supportManagerState.upsert({
        where: {
            conversationId_managerId: {
                conversationId,
                managerId,
            },
        },
        update: {},
        create: { conversationId, managerId },
    });
}

async function loadConversationCore(conversationId: string) {
    return prisma.supportConversation.findUnique({
        where: { id: conversationId },
        include: {
            client: { select: { id: true, name: true } },
            resolvedBy: { select: { id: true, name: true } },
        },
    });
}

async function countUnreadForManager(conversationId: string, managerId: string): Promise<number> {
    const state = await prisma.supportManagerState.findUnique({
        where: {
            conversationId_managerId: { conversationId, managerId },
        },
        select: { lastReadAt: true },
    });
    const lastReadAt = state?.lastReadAt ?? null;
    return prisma.supportMessage.count({
        where: {
            conversationId,
            role: { in: ["CLIENT", "SYSTEM"] },
            ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
        },
    });
}

async function countUnreadForClient(conversationId: string, clientUserId: string): Promise<number> {
    // Unread = manager messages newer than the cutoff, where the cutoff is the
    // most recent of: the client's own last message, and the read marker written
    // by markRead() when they open the panel. SupportManagerState is reused as a
    // generic per-user read marker (its `managerId` points at User, so a client
    // user fits) — without the marker the badge stayed lit for good until the
    // client happened to send a new message.
    const [lastClientMessage, readState] = await Promise.all([
        prisma.supportMessage.findFirst({
            where: { conversationId, authorId: clientUserId, role: "CLIENT" },
            orderBy: { createdAt: "desc" },
            select: { createdAt: true },
        }),
        prisma.supportManagerState.findUnique({
            where: {
                conversationId_managerId: { conversationId, managerId: clientUserId },
            },
            select: { lastReadAt: true },
        }),
    ]);
    const marks = [lastClientMessage?.createdAt, readState?.lastReadAt].filter(
        (d): d is Date => Boolean(d),
    );
    const cutoff = marks.length
        ? new Date(Math.max(...marks.map((d) => d.getTime())))
        : null;
    return prisma.supportMessage.count({
        where: {
            conversationId,
            role: "MANAGER",
            ...(cutoff ? { createdAt: { gt: cutoff } } : {}),
        },
    });
}

function buildSummary(core: Awaited<ReturnType<typeof loadConversationCore>>, unreadCount: number, isPinned = false): SupportConversationSummaryDTO | null {
    if (!core) return null;
    return {
        id: core.id,
        status: core.status,
        clientId: core.clientId,
        clientName: core.client.name,
        lastMessageAt: core.lastMessageAt ? core.lastMessageAt.toISOString() : null,
        lastMessagePreview: null,
        lastIntent: core.lastIntent,
        messageCount: core.messageCount,
        unreadCount,
        resolvedAt: core.resolvedAt ? core.resolvedAt.toISOString() : null,
        resolvedBy: core.resolvedBy
            ? { id: core.resolvedBy.id, name: core.resolvedBy.name }
            : null,
        updatedAt: core.updatedAt.toISOString(),
        isPinned,
        emailNotificationOnReply: core.emailNotificationOnReply,
    };
}

async function loadMessages(conversationId: string, limit = MESSAGE_PAGE_SIZE): Promise<SupportMessageDTO[]> {
    const messages = await prisma.supportMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: "asc" },
        take: limit,
        include: {
            author: { select: { id: true, name: true, role: true } },
            attachments: {
                select: ATTACHMENT_SELECT,
                orderBy: { createdAt: "asc" },
            },
        },
    });
    return messages.map(toMessageDTO);
}

/**
 * Fetch the full conversation payload for the client portal bubble.
 */
export async function getConversationForClientUser(
    userId: string,
): Promise<SupportConversationDetailDTO | null> {
    const conversationId = await getConversationIdForClientUser(userId);
    if (!conversationId) return null;
    const core = await loadConversationCore(conversationId);
    if (!core) return null;
    const unread = await countUnreadForClient(conversationId, userId);
    const summary = buildSummary(core, unread);
    if (!summary) return null;
    const messages = await loadMessages(conversationId);
    const lastMessage = messages.at(-1);
    return {
        ...summary,
        lastMessagePreview: lastMessage
            ? messagePreview(lastMessage.content, lastMessage.attachments.length)
            : null,
        messages,
    };
}

/**
 * Fetch a conversation by id for a manager, ensuring their manager-state row exists.
 */
export async function getConversationForManager(
    conversationId: string,
    managerId: string,
): Promise<SupportConversationDetailDTO | null> {
    const core = await loadConversationCore(conversationId);
    if (!core) return null;
    if (core.messageCount === 0) return null;
    await ensureManagerState(conversationId, managerId);
    const unread = await countUnreadForManager(conversationId, managerId);
    const state = await prisma.supportManagerState.findUnique({
        where: { conversationId_managerId: { conversationId, managerId } },
        select: { isPinned: true },
    });
    const summary = buildSummary(core, unread, state?.isPinned ?? false);
    if (!summary) return null;
    const messages = await loadMessages(conversationId);
    const lastMessage = messages.at(-1);
    return {
        ...summary,
        lastMessagePreview: lastMessage
            ? messagePreview(lastMessage.content, lastMessage.attachments.length)
            : null,
        messages,
    };
}

/**
 * List every support conversation for the manager workspace.
 * Every active manager sees every conversation.
 */
export async function listManagerInbox(
    managerId: string,
    filters: ManagerInboxFilters = {},
): Promise<SupportConversationSummaryDTO[]> {
    const where: Prisma.SupportConversationWhereInput = {
        messageCount: { gt: 0 },
    };
    if (filters.status) where.status = filters.status;
    if (filters.search) {
        where.client = { name: { contains: filters.search, mode: "insensitive" } };
    }

    const conversations = await prisma.supportConversation.findMany({
        where,
        orderBy: [{ status: "asc" }, { lastMessageAt: "desc" }, { updatedAt: "desc" }],
        include: {
            client: { select: { id: true, name: true } },
            resolvedBy: { select: { id: true, name: true } },
            messages: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { content: true, _count: { select: { attachments: true } } },
            },
            managerStates: {
                where: { managerId },
                select: { lastReadAt: true, isPinned: true },
            },
        },
        take: 100,
    });

    const summaries: SupportConversationSummaryDTO[] = [];
    for (const conv of conversations) {
        const state = conv.managerStates[0];
        const lastReadAt = state?.lastReadAt ?? null;
        const unreadCount = await prisma.supportMessage.count({
            where: {
                conversationId: conv.id,
                role: { in: ["CLIENT", "SYSTEM"] },
                ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
            },
        });
        const summary: SupportConversationSummaryDTO = {
            id: conv.id,
            status: conv.status,
            clientId: conv.clientId,
            clientName: conv.client.name,
            lastMessageAt: conv.lastMessageAt ? conv.lastMessageAt.toISOString() : null,
            lastMessagePreview: conv.messages[0]
                ? messagePreview(conv.messages[0].content, conv.messages[0]._count.attachments)
                : null,
            lastIntent: conv.lastIntent,
            messageCount: conv.messageCount,
            unreadCount,
            resolvedAt: conv.resolvedAt ? conv.resolvedAt.toISOString() : null,
            resolvedBy: conv.resolvedBy
                ? { id: conv.resolvedBy.id, name: conv.resolvedBy.name }
                : null,
            updatedAt: conv.updatedAt.toISOString(),
            isPinned: state?.isPinned ?? false,
        };
        if (filters.unreadOnly && summary.unreadCount === 0) continue;
        summaries.push(summary);
    }
    return summaries;
}

/**
 * Managers also get a single rolled-up unread counter for the sidebar pill.
 */
export async function getManagerInboxStats(managerId: string): Promise<{
    totalUnread: number;
    activeConversations: number;
    resolvedConversations: number;
}> {
    const [active, resolved] = await Promise.all([
        prisma.supportConversation.count({
            where: { status: "ACTIVE", messageCount: { gt: 0 } },
        }),
        prisma.supportConversation.count({
            where: { status: "RESOLVED", messageCount: { gt: 0 } },
        }),
    ]);

    // Total unread = messages from client/system newer than this manager's
    // per-conversation lastReadAt. Conversations without a state row count as
    // fully unread.
    const states = await prisma.supportManagerState.findMany({
        where: { managerId },
        select: { conversationId: true, lastReadAt: true },
    });
    const stateMap = new Map(states.map((s) => [s.conversationId, s.lastReadAt]));

    const conversations = await prisma.supportConversation.findMany({
        where: { messageCount: { gt: 0 } },
        select: { id: true },
    });
    let totalUnread = 0;
    for (const conv of conversations) {
        const lastReadAt = stateMap.get(conv.id) ?? null;
        const unread = await prisma.supportMessage.count({
            where: {
                conversationId: conv.id,
                role: { in: ["CLIENT", "SYSTEM"] },
                ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
            },
        });
        totalUnread += unread;
    }
    return { totalUnread, activeConversations: active, resolvedConversations: resolved };
}

/**
 * Post a message to a conversation. Role is derived from the author role
 * (CLIENT vs MANAGER). If the conversation is resolved, sending re-opens it.
 */
export async function postMessage(
    conversationId: string,
    authorUserId: string,
    input: CreateSupportMessageInput,
    authorRole: "CLIENT" | "MANAGER",
): Promise<SupportMessageDTO> {
    const content = input.content.trim();

    // Only claim attachments that were uploaded to THIS conversation by THIS user
    // and are not already tied to a message — an id from another thread is ignored
    // rather than trusted.
    const requestedIds = (input.attachmentIds ?? []).slice(0, SUPPORT_ATTACHMENT_MAX_COUNT);
    const attachmentIds = requestedIds.length
        ? (
            await prisma.supportAttachment.findMany({
                where: {
                    id: { in: requestedIds },
                    conversationId,
                    messageId: null,
                    uploadedById: authorUserId,
                },
                select: { id: true },
            })
        ).map((a) => a.id)
        : [];

    if (!content && attachmentIds.length === 0) {
        throw new Error("Le message est vide");
    }
    if (content.length > 4000) {
        throw new Error("Le message dépasse la limite de 4000 caractères");
    }

    const context = sanitiseContext(input.context);

    const [message] = await prisma.$transaction([
        prisma.supportMessage.create({
            data: {
                conversationId,
                authorId: authorUserId,
                role: authorRole,
                content,
                intent: input.intent ?? null,
                context: context ?? Prisma.JsonNull,
                ...(attachmentIds.length > 0
                    ? { attachments: { connect: attachmentIds.map((id) => ({ id })) } }
                    : {}),
            },
            include: {
                author: { select: { id: true, name: true, role: true } },
                attachments: {
                    select: ATTACHMENT_SELECT,
                    orderBy: { createdAt: "asc" },
                },
            },
        }),
        prisma.supportConversation.update({
            where: { id: conversationId },
            data: {
                messageCount: { increment: 1 },
                lastMessageAt: new Date(),
                lastIntent: input.intent ?? undefined,
                status: "ACTIVE",
                resolvedAt: null,
                resolvedById: null,
            },
        }),
    ]);

    if (authorRole === "MANAGER") {
        // Mark the posting manager as up-to-date automatically.
        await prisma.supportManagerState.upsert({
            where: { conversationId_managerId: { conversationId, managerId: authorUserId } },
            update: { lastReadAt: new Date() },
            create: { conversationId, managerId: authorUserId, lastReadAt: new Date() },
        });
    }

    return toMessageDTO({
        id: message.id,
        conversationId: message.conversationId,
        role: message.role,
        content: message.content,
        intent: message.intent,
        context: message.context,
        createdAt: message.createdAt,
        attachments: message.attachments,
        author: message.author
            ? {
                id: message.author.id,
                name: message.author.name,
                role: message.author.role,
            }
            : null,
    });
}

/**
 * Mark the conversation as read for a client or a manager.
 */
export async function markRead(
    conversationId: string,
    userId: string,
    _role: "CLIENT" | "MANAGER",
): Promise<void> {
    // Same row for both sides: SupportManagerState is keyed on a User id, and a
    // client user gets their own row (managers only ever read their own).
    await prisma.supportManagerState.upsert({
        where: { conversationId_managerId: { conversationId, managerId: userId } },
        update: { lastReadAt: new Date() },
        create: { conversationId, managerId: userId, lastReadAt: new Date() },
    });
}

export async function resolveConversation(
    conversationId: string,
    managerId: string,
    managerName: string,
): Promise<void> {
    await prisma.$transaction([
        prisma.supportConversation.update({
            where: { id: conversationId },
            data: {
                status: "RESOLVED",
                resolvedAt: new Date(),
                resolvedById: managerId,
            },
        }),
        prisma.supportMessage.create({
            data: {
                conversationId,
                role: "SYSTEM",
                authorId: managerId,
                content: `${managerName} a marqué la conversation comme résolue.`,
            },
        }),
    ]);
}

export async function reopenConversation(
    conversationId: string,
    userId: string,
    userName: string,
    userRole: "CLIENT" | "MANAGER",
): Promise<void> {
    const isClientReopen = userRole === "CLIENT";
    await prisma.$transaction([
        prisma.supportConversation.update({
            where: { id: conversationId },
            data: { status: "ACTIVE", resolvedAt: null, resolvedById: null },
        }),
        prisma.supportMessage.create({
            data: {
                conversationId,
                role: "SYSTEM",
                authorId: userId,
                content: isClientReopen
                    ? `${userName} a démarré une nouvelle conversation après résolution.`
                    : `${userName} a réouvert la conversation.`,
                context: {
                    pathname: isClientReopen ? "client-new-thread" : "manager",
                    pageLabel: isClientReopen ? "new-thread" : "reopen",
                } as Prisma.InputJsonValue,
            },
        }),
    ]);
}

export async function togglePin(
    conversationId: string,
    managerId: string,
    pinned: boolean,
): Promise<void> {
    await prisma.supportManagerState.upsert({
        where: { conversationId_managerId: { conversationId, managerId } },
        update: { isPinned: pinned },
        create: { conversationId, managerId, isPinned: pinned },
    });
}

/**
 * Toggle the client's email-on-reply preference for their support conversation.
 */
export async function setEmailNotificationPreference(
    conversationId: string,
    enabled: boolean,
): Promise<void> {
    await prisma.supportConversation.update({
        where: { id: conversationId },
        data: { emailNotificationOnReply: enabled },
    });
}

/**
 * If the conversation has emailNotificationOnReply enabled, send a notification
 * email to the client. Called after a manager posts a reply.
 */
export async function notifyClientByEmailIfEnabled(
    conversationId: string,
    managerName: string,
    messagePreview: string,
): Promise<void> {
    const conv = await prisma.supportConversation.findUnique({
        where: { id: conversationId },
        select: {
            emailNotificationOnReply: true,
            client: {
                select: {
                    name: true,
                    users: {
                        where: { role: "CLIENT" },
                        select: { email: true, name: true },
                        take: 1,
                    },
                },
            },
        },
    });
    if (!conv?.emailNotificationOnReply) return;
    const clientUser = conv.client.users[0];
    if (!clientUser?.email) return;

    const { sendTransactionalEmail } = await import("@/lib/email/transactional");
    const preview = messagePreview.length > 200
        ? messagePreview.slice(0, 199) + "…"
        : messagePreview;

    await sendTransactionalEmail({
        to: clientUser.email,
        subject: `Nouvelle réponse de l'équipe support — Captain Prospect`,
        html: `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1f2b1f">
  <p style="font-size:15px">Bonjour ${clientUser.name ?? ""},</p>
  <p style="font-size:15px">L'équipe support Captain Prospect vous a répondu :</p>
  <blockquote style="border-left:3px solid #6366f1;margin:16px 0;padding:10px 16px;background:#f5f4ff;border-radius:4px;font-size:14px;color:#2b3a2b">
    ${preview.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}
  </blockquote>
  <p style="font-size:13px;color:#6b7280">
    Connectez-vous à votre espace client pour répondre ou consulter la conversation complète.
  </p>
</div>`,
        text: `Bonjour ${clientUser.name ?? ""},\n\nL'équipe support Captain Prospect vous a répondu :\n\n${preview}\n\nConnectez-vous à votre espace client pour répondre.`,
    });
}

/**
 * Count messages authored after a given cutoff. Used by the polling hooks.
 */
export async function countMessagesAfter(
    conversationId: string,
    after: Date,
): Promise<number> {
    return prisma.supportMessage.count({
        where: { conversationId, createdAt: { gt: after } },
    });
}
