"use client";

/**
 * SWR hooks and mutations behind the Captain AI workspace: the rail's folder
 * list, threads (with older pages and background merges), conversation
 * create / patch / fork / delete, feedback, pins and usage.
 *
 * Every mutation is optimistic where it can be, updates the caches it touches
 * in place (thread, folder conversation lists, rail pins) instead of
 * refetching, and rolls back + rethrows on error so the caller toasts.
 * Folder detail, files and memory hooks live in folder-hooks.ts.
 */

import { useMemo } from "react";
import useSWR, { useSWRConfig } from "swr";
import {
    AGENT_API,
    ASSISTANT_API,
    type AgentOverview,
    type ConversationCard,
    type CreateConversationBody,
    type CreateFolderBody,
    type CreatePinBody,
    type FeedbackBody,
    type FolderCard,
    type FolderListResponse,
    type PatchConversationBody,
    type PinItem,
    type ThreadResponse,
} from "@/lib/assistant/api-contract";
import type { UserAiUsageSummary } from "@/lib/ai/usage";
import { apiGet, apiSend, withQuery } from "./fetcher";
import { pickConversation, pickFolder } from "./pick";
import {
    isConversationPage,
    isConversationPages,
    mergeThreadRefresh,
    patchMessage,
    prependOlder,
    removeFromPage,
    removeFromPages,
    syncPinned,
    upsertInPage,
    upsertInPages,
} from "@/components/assistant-ui/workspace/thread/model";
import { renderKeys } from "@/components/assistant-ui/workspace/thread/handover";

// ============================================
// Keys
// ============================================

export const FOLDERS_KEY = ASSISTANT_API.folders;
export const USAGE_KEY = ASSISTANT_API.usage;
export const AGENT_OVERVIEW_KEY = AGENT_API.overview;
export const threadKey = (id: string) => ASSISTANT_API.conversation(id);

const CONVERSATIONS = ASSISTANT_API.conversations;
const isConversationListKey = (key: unknown): key is string =>
    typeof key === "string" && (key === CONVERSATIONS || key.startsWith(`${CONVERSATIONS}?`));
/** useSWRInfinite aggregates live under `$inf$<first page key>`. */
const INFINITE_PREFIX = "$inf$";
const infiniteListKey = (key: unknown): string | null =>
    typeof key === "string" && key.startsWith(INFINITE_PREFIX) && isConversationListKey(key.slice(INFINITE_PREFIX.length))
        ? key.slice(INFINITE_PREFIX.length)
        : null;

// ============================================
// Response shapes the routes may wrap
// ============================================

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

// Unwrapping lives in ./pick (pure, tested): the full card must win over the deprecated stub.
export { pickConversation, pickFolder };

/** `PinItem` or `{ pin: PinItem }`. */
function pickPin(data: unknown): PinItem {
    if (isRecord(data) && isRecord(data.pin)) return data.pin as unknown as PinItem;
    return data as PinItem;
}

// ============================================
// Reads
// ============================================

export function useFolders() {
    return useSWR<FolderListResponse>(FOLDERS_KEY, apiGet, { revalidateOnFocus: false, keepPreviousData: true });
}

export function useUsage() {
    return useSWR<UserAiUsageSummary>(USAGE_KEY, apiGet, { revalidateOnFocus: false, shouldRetryOnError: false });
}

/** Polled every minute; errors stay silent (the badge hides). */
export function useAgentOverview(enabled = true) {
    return useSWR<AgentOverview>(enabled ? AGENT_OVERVIEW_KEY : null, apiGet, {
        refreshInterval: 60_000,
        shouldRetryOnError: false,
        revalidateOnFocus: false,
    });
}

/**
 * A thread. When the cache already holds it (seeded on create, or visited
 * before) the mount does not refetch — a send may be streaming into it — and
 * the caller asks for a merge refresh instead (`refreshThread`).
 */
export function useThread(id: string | null) {
    const { cache } = useSWRConfig();
    const hasCache = id ? cache.get(threadKey(id))?.data !== undefined : false;
    const swr = useSWR<ThreadResponse>(id ? threadKey(id) : null, apiGet, {
        revalidateOnMount: !hasCache,
        revalidateIfStale: false,
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        shouldRetryOnError: false,
    });
    return { ...swr, hadCache: hasCache };
}

// ============================================
// Mutations
// ============================================

export interface ThreadActions {
    getThread(id: string): ThreadResponse | undefined;
    setThread(id: string, thread: ThreadResponse | undefined): void;
    updateThread(id: string, fn: (thread: ThreadResponse) => ThreadResponse): void;
    /** Fetch the newest page and merge it under the older pages already loaded. */
    refreshThread(id: string): Promise<ThreadResponse | null>;
    loadOlder(id: string, cursor: string): Promise<void>;
    /** Rail pins + every cached conversation list, plus the thread's own card. */
    syncConversation(card: ConversationCard, toFront?: boolean): void;
    createConversation(body: CreateConversationBody): Promise<ConversationCard>;
    patchConversation(id: string, body: PatchConversationBody): Promise<void>;
    forkConversation(id: string): Promise<ConversationCard>;
    deleteConversation(id: string): Promise<void>;
    sendFeedback(conversationId: string, messageId: string, rating: FeedbackBody["rating"]): Promise<void>;
    createPin(folderId: string, body: CreatePinBody): Promise<PinItem>;
    deletePin(folderId: string, pinId: string): Promise<void>;
    ensureClientFolder(clientId: string): Promise<FolderCard>;
    createFolder(body: CreateFolderBody): Promise<FolderCard>;
    bumpUsage(costEur: number): void;
}

export function useThreadActions(): ThreadActions {
    const { mutate, cache } = useSWRConfig();

    return useMemo<ThreadActions>(() => {
        const getThread = (id: string) => cache.get(threadKey(id))?.data as ThreadResponse | undefined;
        const setThread = (id: string, thread: ThreadResponse | undefined) => {
            void mutate(threadKey(id), thread, { revalidate: false });
        };
        const updateThread = (id: string, fn: (thread: ThreadResponse) => ThreadResponse) => {
            void mutate<ThreadResponse>(threadKey(id), (cur) => (cur ? fn(cur) : cur), { revalidate: false });
        };

        const syncConversation = (card: ConversationCard, toFront = false) => {
            for (const key of cache.keys()) {
                const data = cache.get(key)?.data;
                const inf = infiniteListKey(key);
                if (inf !== null) {
                    if (!isConversationPages(data)) continue;
                    const next = upsertInPages(data, inf, card, toFront);
                    if (next !== data) void mutate(key, next, { revalidate: false });
                    continue;
                }
                if (!isConversationListKey(key) || !isConversationPage(data)) continue;
                const next = upsertInPage(data, key, card, toFront);
                if (next !== data) void mutate(key, next, { revalidate: false });
            }
            void mutate<FolderListResponse>(FOLDERS_KEY, (cur) => (cur ? syncPinned(cur, card) : cur), { revalidate: false });
            updateThreadCard(card);
        };

        const updateThreadCard = (card: Partial<ConversationCard> & { id: string }) => {
            const cur = getThread(card.id);
            if (!cur) return;
            setThread(card.id, { ...cur, conversation: { ...cur.conversation, ...card } });
        };

        const removeConversation = (id: string) => {
            for (const key of cache.keys()) {
                const data = cache.get(key)?.data;
                if (infiniteListKey(key) !== null) {
                    if (!isConversationPages(data)) continue;
                    const next = removeFromPages(data, id);
                    if (next !== data) void mutate(key, next, { revalidate: false });
                    continue;
                }
                if (!isConversationListKey(key) || !isConversationPage(data)) continue;
                const next = removeFromPage(data, id);
                if (next !== data) void mutate(key, next, { revalidate: false });
            }
            void mutate<FolderListResponse>(FOLDERS_KEY, (cur) => (cur ? syncPinned(cur, null, id) : cur), { revalidate: false });
        };

        const refreshThread = async (id: string) => {
            try {
                const fresh = await apiGet<ThreadResponse>(threadKey(id));
                const current = getThread(id);
                const merged = mergeThreadRefresh(current, fresh);
                // Server rows replacing browser-minted ones keep their render key:
                // the question and answer just written update in place, no remount.
                if (current) renderKeys.carry(current.messages, merged.messages);
                setThread(id, merged);
                syncConversation(fresh.conversation);
                return merged;
            } catch {
                return null;
            }
        };

        const loadOlder = async (id: string, cursor: string) => {
            const older = await apiGet<ThreadResponse>(withQuery(threadKey(id), { before: cursor, limit: 60 }));
            updateThread(id, (cur) => prependOlder(cur, older));
        };

        const createConversation = async (body: CreateConversationBody) => {
            const card = pickConversation(await apiSend<unknown>(CONVERSATIONS, "POST", body));
            // Seed the thread so it opens instantly, without a GET racing the first send.
            if (!getThread(card.id)) {
                const folders = cache.get(FOLDERS_KEY)?.data as FolderListResponse | undefined;
                const folder = card.folderId
                    ? (folders?.general.find((f) => f.id === card.folderId) ??
                      folders?.clients.find((c) => c.folder?.id === card.folderId)?.folder ??
                      null)
                    : null;
                setThread(card.id, {
                    conversation: { ...card, summary: null, folder },
                    messages: [],
                    olderCursor: null,
                    canWrite: true,
                });
            }
            syncConversation(card, true);
            return card;
        };

        const patchConversation = async (id: string, body: PatchConversationBody) => {
            const before = getThread(id)?.conversation;
            const optimistic: Partial<ConversationCard> & { id: string } = { id };
            if (body.title !== undefined) optimistic.title = body.title;
            if (body.visibility !== undefined) optimistic.visibility = body.visibility;
            if (body.folderId !== undefined) optimistic.folderId = body.folderId;
            if (body.pinned !== undefined) optimistic.pinnedAt = body.pinned ? new Date().toISOString() : null;
            if (before) syncConversation({ ...before, ...optimistic });
            else updateThreadCard(optimistic);
            try {
                const saved = await apiSend<unknown>(ASSISTANT_API.conversation(id), "PATCH", body);
                const card = pickConversation(saved);
                if (card && typeof card.id === "string") {
                    syncConversation(card);
                    if (body.folderId !== undefined) {
                        // The folder card in the thread header changes with the move.
                        void refreshThread(id);
                    }
                }
            } catch (error) {
                if (before) syncConversation(before);
                throw error;
            }
        };

        const forkConversation = async (id: string) => {
            const card = pickConversation(await apiSend<unknown>(ASSISTANT_API.conversationFork(id), "POST"));
            syncConversation(card, true);
            return card;
        };

        const deleteConversation = async (id: string) => {
            await apiSend<unknown>(ASSISTANT_API.conversation(id), "DELETE");
            removeConversation(id);
            void mutate(threadKey(id), undefined, { revalidate: false });
        };

        const sendFeedback = async (conversationId: string, messageId: string, rating: FeedbackBody["rating"]) => {
            const before = getThread(conversationId)?.messages.find((m) => m.id === messageId)?.feedback ?? null;
            updateThread(conversationId, (t) =>
                patchMessage(t, messageId, { feedback: rating ? { rating, at: new Date().toISOString(), by: "" } : null }),
            );
            try {
                await apiSend<unknown>(ASSISTANT_API.messageFeedback(conversationId, messageId), "POST", { rating } satisfies FeedbackBody);
            } catch (error) {
                updateThread(conversationId, (t) => patchMessage(t, messageId, { feedback: before }));
                throw error;
            }
        };

        const createPin = async (folderId: string, body: CreatePinBody) => {
            const pin = pickPin(await apiSend<unknown>(ASSISTANT_API.folderPins(folderId), "POST", body));
            void mutate(ASSISTANT_API.folderPins(folderId));
            void mutate<FolderListResponse>(
                FOLDERS_KEY,
                (cur) =>
                    cur && {
                        ...cur,
                        general: cur.general.map((f) => (f.id === folderId ? { ...f, counts: { ...f.counts, pins: f.counts.pins + 1 } } : f)),
                    },
                { revalidate: false },
            );
            return pin;
        };

        const deletePin = async (folderId: string, pinId: string) => {
            await apiSend<unknown>(ASSISTANT_API.pin(folderId, pinId), "DELETE");
            void mutate(ASSISTANT_API.folderPins(folderId));
        };

        const ensureClientFolder = async (clientId: string) => {
            const folder = pickFolder(await apiSend<unknown>(ASSISTANT_API.ensureClientFolder, "POST", { clientId }));
            void mutate<FolderListResponse>(
                FOLDERS_KEY,
                (cur) => cur && { ...cur, clients: cur.clients.map((c) => (c.clientId === clientId ? { ...c, folder } : c)) },
                { revalidate: false },
            );
            return folder;
        };

        const createFolder = async (body: CreateFolderBody) => {
            const tempId = `tmp-${Date.now()}`;
            const now = new Date().toISOString();
            const temp: FolderCard = {
                id: tempId,
                kind: "GENERAL",
                name: body.name,
                color: body.color ?? null,
                icon: body.icon ?? null,
                clientId: null,
                counts: { conversations: 0, memories: 0, files: 0, pins: 0 },
                lastActivityAt: now,
                hasAgentActivity: false,
            };
            void mutate<FolderListResponse>(FOLDERS_KEY, (cur) => cur && { ...cur, general: [...cur.general, temp] }, { revalidate: false });
            try {
                const folder = pickFolder(await apiSend<unknown>(ASSISTANT_API.folders, "POST", body));
                void mutate<FolderListResponse>(
                    FOLDERS_KEY,
                    (cur) => cur && { ...cur, general: cur.general.map((f) => (f.id === tempId ? folder : f)) },
                    { revalidate: false },
                );
                return folder;
            } catch (error) {
                void mutate<FolderListResponse>(
                    FOLDERS_KEY,
                    (cur) => cur && { ...cur, general: cur.general.filter((f) => f.id !== tempId) },
                    { revalidate: false },
                );
                throw error;
            }
        };

        const bumpUsage = (costEur: number) => {
            if (!(costEur > 0)) return;
            void mutate<UserAiUsageSummary>(
                USAGE_KEY,
                (cur) =>
                    cur && {
                        ...cur,
                        today: { ...cur.today, costEur: cur.today.costEur + costEur, requestCount: cur.today.requestCount + 1 },
                        total: { ...cur.total, costEur: cur.total.costEur + costEur, requestCount: cur.total.requestCount + 1 },
                    },
                { revalidate: false },
            );
        };

        return {
            getThread,
            setThread,
            updateThread,
            refreshThread,
            loadOlder,
            syncConversation,
            createConversation,
            patchConversation,
            forkConversation,
            deleteConversation,
            sendFeedback,
            createPin,
            deletePin,
            ensureClientFolder,
            createFolder,
            bumpUsage,
        };
    }, [mutate, cache]);
}
