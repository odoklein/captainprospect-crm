/**
 * Workspace search of the assistant (Captain AI v4): conversation titles and
 * message contents limited to the threads the viewer may read, folders by
 * name, folder files by name. 20 results per kind. Missing v4 tables: the
 * conversation search falls back to the viewer's own threads, the rest is empty.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { optional } from "../store/missing";
import type { Viewer } from "../folders/rules";
import type { SearchResponse } from "../api-contract";
import { readableWhere } from "../conversations/rules";
import { cleanQuery, escapeLike, snippetAround } from "./snippet";

export const SEARCH_PER_KIND = 20;
const CONTENT_SCAN = 120;

type ConversationHit = SearchResponse["conversations"][number];

async function searchConversations(viewer: Viewer, q: string, like: string): Promise<ConversationHit[]> {
    const run = async (v4: boolean): Promise<ConversationHit[]> => {
        const readable = (v4 ? readableWhere(viewer) : { createdById: viewer.id }) as Prisma.AssistantConversationWhereInput;
        const contains = { contains: like, mode: "insensitive" as const };
        const [byTitle, byContent] = await Promise.all([
            prisma.assistantConversation.findMany({
                where: { AND: [readable, { title: contains }] },
                orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
                take: SEARCH_PER_KIND,
                select: { id: true, title: true, lastMessageAt: true, ...(v4 ? { folderId: true } : {}) },
            }),
            prisma.assistantMessage.findMany({
                where: { content: contains, conversation: readable, ...(v4 ? { supersededAt: null } : {}) },
                orderBy: { createdAt: "desc" },
                take: CONTENT_SCAN,
                select: {
                    conversationId: true,
                    content: true,
                    conversation: { select: { id: true, title: true, lastMessageAt: true, ...(v4 ? { folderId: true } : {}) } },
                },
            }),
        ]);

        // The newest matching message of each thread gives its snippet.
        const matchByConversation = new Map<string, string>();
        for (const m of byContent) {
            if (!matchByConversation.has(m.conversationId)) matchByConversation.set(m.conversationId, m.content);
        }
        const hits = new Map<string, ConversationHit>();
        const folderOf = (row: object): string | null => (row as { folderId?: string | null }).folderId ?? null;
        for (const c of byTitle) {
            const content = matchByConversation.get(c.id);
            hits.set(c.id, {
                id: c.id,
                title: c.title,
                folderId: folderOf(c),
                snippet: (content ? snippetAround(content, q) : null) ?? c.title,
                lastMessageAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : null,
            });
        }
        for (const m of byContent) {
            if (hits.size >= SEARCH_PER_KIND) break;
            if (hits.has(m.conversationId)) continue;
            const c = m.conversation;
            hits.set(c.id, {
                id: c.id,
                title: c.title,
                folderId: folderOf(c),
                snippet: snippetAround(m.content, q) ?? c.title,
                lastMessageAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : null,
            });
        }
        return [...hits.values()].slice(0, SEARCH_PER_KIND);
    };
    return optional("search.conversations", () => run(true), () => run(false));
}

export async function searchAssistant(viewer: Viewer, rawQuery: string | null | undefined): Promise<SearchResponse> {
    const q = cleanQuery(rawQuery);
    if (!q) return { conversations: [], folders: [], files: [] };
    const like = escapeLike(q);
    const contains = { contains: like, mode: "insensitive" as const };

    const [conversations, folders, files] = await Promise.all([
        searchConversations(viewer, q, like),
        optional<SearchResponse["folders"]>(
            "search.folders",
            () =>
                prisma.assistantFolder.findMany({
                    where: { name: contains, archivedAt: null },
                    orderBy: [{ lastActivityAt: { sort: "desc", nulls: "last" } }, { name: "asc" }],
                    take: SEARCH_PER_KIND,
                    select: { id: true, name: true, kind: true, clientId: true },
                }),
            [],
        ),
        optional<SearchResponse["files"]>(
            "search.files",
            async () => {
                const rows = await prisma.assistantFileText.findMany({
                    where: { file: { deletedAt: null, OR: [{ originalName: contains }, { name: contains }] } },
                    orderBy: { createdAt: "desc" },
                    take: SEARCH_PER_KIND,
                    select: { fileId: true, folderId: true, file: { select: { originalName: true, name: true } } },
                });
                return rows.map((r) => ({
                    fileId: r.fileId,
                    folderId: r.folderId,
                    name: r.file.originalName || r.file.name,
                    snippet: null,
                }));
            },
            [],
        ),
    ]);
    return { conversations, folders, files };
}
