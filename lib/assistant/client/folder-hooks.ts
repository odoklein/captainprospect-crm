"use client";

/**
 * SWR hooks and mutations of the Captain AI folder home: folder detail,
 * folder conversations (infinite), memories, files (with polling and upload
 * progress), board pins and the palette search. Mutations are optimistic and
 * roll back on error; every failure surfaces as an ApiError (French message).
 *
 * The thread side (open conversation, messages) lives in thread-hooks.ts.
 */

import { useCallback, useMemo } from "react";
import useSWR, { useSWRConfig } from "swr";
import useSWRInfinite from "swr/infinite";
import {
    ASSISTANT_API,
    type ApiResponse,
    type ConversationsResponse,
    type CreateMemoryBody,
    type FolderCard,
    type FolderDetail,
    type FolderFilesResponse,
    type FolderListResponse,
    type MemoriesResponse,
    type MemoryItem,
    type PatchFolderBody,
    type PatchMemoryBody,
    type PatchPinBody,
    type PinItem,
    type SearchResponse,
    type UploadFilesResponse,
} from "../api-contract";
import { ApiError, apiGet, apiSend, withQuery } from "./fetcher";
import {
    filesNeedPolling,
    flattenConversationPages,
    mapMemory,
    mergeFiles,
    normalizePins,
    sortPins,
    upsertMemory,
} from "@/components/assistant-ui/workspace/folder/logic";

const QUIET = { revalidateOnFocus: false, shouldRetryOnError: false } as const;

function isObject(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === "object" && !Array.isArray(v);
}

// ============================================
// Folder list (palette, sidebar share the same key)
// ============================================

export function useFolderList() {
    return useSWR<FolderListResponse>(ASSISTANT_API.folders, apiGet, QUIET);
}

/** Creates (or returns) the CLIENT folder of a client that has none yet. */
export async function ensureClientFolder(clientId: string): Promise<FolderCard> {
    return apiSend<FolderCard>(ASSISTANT_API.ensureClientFolder, "POST", { clientId });
}

// ============================================
// Folder detail
// ============================================

export function useFolderDetail(folderId: string | null) {
    return useSWR<FolderDetail>(folderId ? ASSISTANT_API.folder(folderId) : null, apiGet, QUIET);
}

export function useFolderMutations(folderId: string | null) {
    const { mutate } = useSWRConfig();

    const patch = useCallback(
        async (body: PatchFolderBody): Promise<FolderDetail | undefined> => {
            if (!folderId) return undefined;
            const key = ASSISTANT_API.folder(folderId);
            const optimistic = (current: FolderDetail | undefined): FolderDetail | undefined => {
                if (!current) return current;
                const { archived, ...rest } = body;
                const next: FolderDetail = { ...current, ...(rest as Partial<FolderDetail>) };
                if (archived !== undefined) next.archivedAt = archived ? new Date().toISOString() : null;
                return next;
            };
            // Instructions are saved from a local editor: no optimistic write (the
            // token count comes from the server), but a refusal must not clobber.
            const result = await mutate<FolderDetail>(key, apiSend<FolderDetail>(key, "PATCH", body), {
                optimisticData: body.instructions === undefined ? (c) => optimistic(c) as FolderDetail : undefined,
                rollbackOnError: true,
                populateCache: (res, current) => (isObject(res) && typeof res.id === "string" ? res : (optimistic(current) as FolderDetail)),
                revalidate: false,
            });
            // Sidebar list: names, archive state and counts.
            void mutate(ASSISTANT_API.folders);
            return result;
        },
        [folderId, mutate],
    );

    return {
        patch,
        rename: (name: string) => patch({ name }),
        saveInstructions: (instructions: string) => patch({ instructions: instructions.trim() ? instructions : null }),
        archive: () => patch({ archived: true }),
        unarchive: () => patch({ archived: false }),
    };
}

// ============================================
// Folder conversations (infinite)
// ============================================

export const CONVERSATIONS_PAGE = 30;

export function useFolderConversations(folderId: string | null, q: string) {
    const query = q.trim();
    const getKey = useCallback(
        (index: number, previous: ConversationsResponse | null) => {
            if (previous && !previous.nextCursor) return null;
            return withQuery(ASSISTANT_API.conversations, {
                folderId: folderId ?? undefined,
                scope: folderId ? undefined : "agency",
                q: query || undefined,
                limit: CONVERSATIONS_PAGE,
                cursor: index === 0 ? undefined : previous?.nextCursor,
            });
        },
        [folderId, query],
    );
    const swr = useSWRInfinite<ConversationsResponse>(getKey, apiGet, { ...QUIET, revalidateFirstPage: false });
    const pages = swr.data;
    const items = useMemo(() => flattenConversationPages(pages), [pages]);
    const last = pages?.[pages.length - 1];
    const hasMore = !!last?.nextCursor;
    const isLoadingMore = swr.isValidating && swr.size > (pages?.length ?? 0);

    return {
        items,
        error: swr.error as ApiError | undefined,
        isLoading: swr.isLoading,
        isLoadingMore,
        hasMore,
        degraded: !!pages?.[0]?.degraded,
        loadMore: () => {
            if (hasMore && !isLoadingMore) void swr.setSize(swr.size + 1);
        },
        reload: () => swr.mutate(),
    };
}

// ============================================
// Memories
// ============================================

export function memoriesKey(folderId: string | null, includeDeleted: boolean): string {
    return withQuery(ASSISTANT_API.memories, { folderId: folderId ?? undefined, includeDeleted: includeDeleted ? 1 : undefined });
}

const EMPTY_MEMORIES: MemoriesResponse = { agency: [], folder: [], user: [] };

export function useMemories(folderId: string | null, includeDeleted: boolean) {
    const key = memoriesKey(folderId, includeDeleted);
    const swr = useSWR<MemoriesResponse>(key, apiGet, QUIET);
    const { mutate: globalMutate } = useSWRConfig();

    /** The other memory lists (other folder, deleted toggle) are stale after a write. */
    const refreshOthers = useCallback(() => {
        void globalMutate((k) => typeof k === "string" && k.startsWith(ASSISTANT_API.memories) && k !== key);
    }, [globalMutate, key]);

    const run = useCallback(
        async <R>(request: Promise<R>, optimistic: (d: MemoriesResponse) => MemoriesResponse, settle: (d: MemoriesResponse, res: R) => MemoriesResponse) => {
            let out: R | undefined;
            await swr.mutate(
                request.then((res) => {
                    out = res;
                    return res as unknown as MemoriesResponse;
                }),
                {
                    optimisticData: (current) => optimistic(current ?? EMPTY_MEMORIES),
                    rollbackOnError: true,
                    populateCache: (res, current) => settle(current ?? EMPTY_MEMORIES, res as unknown as R),
                    revalidate: false,
                },
            );
            refreshOthers();
            return out as R;
        },
        [swr, refreshOthers],
    );

    const create = useCallback(
        (body: CreateMemoryBody) => {
            const now = new Date().toISOString();
            const tempId = `tmp-${Date.now()}`;
            const temp: MemoryItem = {
                id: tempId,
                scope: body.scope,
                kind: body.kind,
                content: body.content,
                pinned: !!body.pinned,
                folderId: body.folderId ?? null,
                missionId: null,
                source: { by: "user" },
                useCount: 0,
                lastUsedAt: null,
                createdAt: now,
                updatedAt: now,
                deletedAt: null,
            };
            return run(
                apiSend<MemoryItem>(ASSISTANT_API.memories, "POST", body),
                (d) => upsertMemory(d, temp),
                (d, res) => (isObject(res) && typeof res.id === "string" ? upsertMemory(d, res, tempId) : d),
            );
        },
        [run],
    );

    const patch = useCallback(
        (id: string, body: PatchMemoryBody) =>
            run(
                apiSend<MemoryItem>(ASSISTANT_API.memory(id), "PATCH", body),
                (d) => mapMemory(d, id, (m) => ({ ...m, ...body, updatedAt: new Date().toISOString() })),
                (d, res) => (isObject(res) && typeof res.id === "string" ? mapMemory(d, id, () => res) : d),
            ),
        [run],
    );

    const remove = useCallback(
        (item: MemoryItem) =>
            run(
                apiSend<unknown>(ASSISTANT_API.memory(item.id), "DELETE"),
                (d) => mapMemory(d, item.id, (m) => (includeDeleted ? { ...m, deletedAt: new Date().toISOString() } : null)),
                (d) => d,
            ),
        [run, includeDeleted],
    );

    const restore = useCallback(
        (item: MemoryItem) =>
            run(
                apiSend<MemoryItem>(ASSISTANT_API.memoryRestore(item.id), "POST"),
                (d) => upsertMemory(d, { ...item, deletedAt: null }),
                (d, res) => upsertMemory(d, isObject(res) && typeof res.id === "string" ? res : { ...item, deletedAt: null }),
            ),
        [run],
    );

    return {
        data: swr.data,
        error: swr.error as ApiError | undefined,
        isLoading: swr.isLoading,
        create,
        patch,
        remove,
        restore,
    };
}

// ============================================
// Files
// ============================================

export function useFolderFiles(folderId: string | null) {
    const key = folderId ? ASSISTANT_API.folderFiles(folderId) : null;
    const swr = useSWR<FolderFilesResponse>(key, apiGet, {
        ...QUIET,
        refreshInterval: (latest) => (latest && filesNeedPolling(latest.files) ? 3000 : 0),
    });
    const { mutate: globalMutate } = useSWRConfig();

    const touchFolder = useCallback(() => {
        if (!folderId) return;
        void globalMutate(ASSISTANT_API.folder(folderId));
    }, [folderId, globalMutate]);

    /** Adds files returned by an upload to the list without refetching. */
    const addUploaded = useCallback(
        (files: FolderFile[]) => {
            void swr.mutate((current) => (current ? { ...current, files: mergeFiles(current.files, files) } : current), { revalidate: false });
            touchFolder();
        },
        [swr, touchFolder],
    );

    const remove = useCallback(
        async (fileId: string) => {
            if (!folderId) return;
            await swr.mutate(apiSend<unknown>(ASSISTANT_API.folderFile(folderId, fileId), "DELETE").then(() => undefined as unknown as FolderFilesResponse), {
                optimisticData: (current) => (current ? { ...current, files: current.files.filter((f) => f.fileId !== fileId) } : (current as unknown as FolderFilesResponse)),
                rollbackOnError: true,
                populateCache: (_res, current) => (current ? { ...current, files: current.files.filter((f) => f.fileId !== fileId) } : (current as unknown as FolderFilesResponse)),
                revalidate: false,
            });
            touchFolder();
        },
        [folderId, swr, touchFolder],
    );

    const reindex = useCallback(
        async (fileId: string) => {
            if (!folderId) return;
            const setPending = (current: FolderFilesResponse | undefined) =>
                (current
                    ? { ...current, files: current.files.map((f) => (f.fileId === fileId ? { ...f, status: "PENDING" as const, error: null } : f)) }
                    : current) as FolderFilesResponse;
            await swr.mutate(apiSend<unknown>(ASSISTANT_API.folderFileReindex(folderId, fileId), "POST").then(() => undefined as unknown as FolderFilesResponse), {
                optimisticData: setPending,
                rollbackOnError: true,
                populateCache: (_res, current) => setPending(current),
                revalidate: true,
            });
        },
        [folderId, swr],
    );

    const indexProject = useCallback(async () => {
        if (!folderId) return null;
        const res = await apiSend<unknown>(ASSISTANT_API.folderIndexProject(folderId), "POST");
        await swr.mutate();
        touchFolder();
        return res;
    }, [folderId, swr, touchFolder]);

    return {
        data: swr.data,
        error: swr.error as ApiError | undefined,
        isLoading: swr.isLoading,
        addUploaded,
        remove,
        reindex,
        indexProject,
        reload: () => swr.mutate(),
    };
}

type FolderFile = FolderFilesResponse["files"][number];

/**
 * Uploads ONE file (multipart field `file`) with progress, through XHR since
 * fetch has no upload progress. Resolves with the route's envelope data.
 */
export function uploadFolderFile(folderId: string, file: File, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<UploadFilesResponse> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", ASSISTANT_API.folderFiles(folderId));
        xhr.setRequestHeader("Accept", "application/json");
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && e.total > 0) onProgress(Math.min(0.99, e.loaded / e.total));
        };
        xhr.onload = () => {
            let body: ApiResponse<UploadFilesResponse> | null = null;
            try {
                body = JSON.parse(xhr.responseText) as ApiResponse<UploadFilesResponse>;
            } catch {
                body = null;
            }
            if (xhr.status >= 200 && xhr.status < 300 && body && body.success === true) {
                onProgress(1);
                resolve({ files: body.data.files ?? [], rejected: body.data.rejected ?? [] });
                return;
            }
            const message =
                body && body.success === false && body.error
                    ? body.error
                    : xhr.status === 413
                      ? "Fichier trop volumineux pour le serveur."
                      : "L'envoi a échoué. Réessaie dans un instant.";
            reject(new ApiError(message, xhr.status));
        };
        xhr.onerror = () => reject(new ApiError("Connexion perdue pendant l'envoi.", 0));
        xhr.onabort = () => reject(new ApiError("Envoi annulé.", 0));
        if (signal) {
            if (signal.aborted) {
                reject(new ApiError("Envoi annulé.", 0));
                return;
            }
            signal.addEventListener("abort", () => xhr.abort(), { once: true });
        }
        const form = new FormData();
        form.append("file", file, file.name);
        xhr.send(form);
    });
}

// ============================================
// Pins (Tableau)
// ============================================

async function fetchPins(url: string): Promise<PinItem[]> {
    return sortPins(normalizePins(await apiGet<unknown>(url)));
}

export function usePins(folderId: string | null) {
    const key = folderId ? ASSISTANT_API.folderPins(folderId) : null;
    const swr = useSWR<PinItem[]>(key, fetchPins, QUIET);
    const { mutate: globalMutate } = useSWRConfig();

    const touchFolder = useCallback(() => {
        if (folderId) void globalMutate(ASSISTANT_API.folder(folderId));
    }, [folderId, globalMutate]);

    /** Replaces the local list (optimistic reorder, hide before a deferred delete). */
    const setLocal = useCallback((fn: (pins: PinItem[]) => PinItem[]) => swr.mutate((current) => fn(current ?? []), { revalidate: false }), [swr]);

    const patch = useCallback(
        async (pinId: string, body: PatchPinBody) => {
            if (!folderId) return;
            await swr.mutate(apiSend<unknown>(ASSISTANT_API.pin(folderId, pinId), "PATCH", body).then(() => undefined as unknown as PinItem[]), {
                optimisticData: (current) => sortPins((current ?? []).map((p) => (p.id === pinId ? { ...p, ...body } : p))),
                rollbackOnError: true,
                populateCache: (_res, current) => sortPins((current ?? []).map((p) => (p.id === pinId ? { ...p, ...body } : p))),
                revalidate: false,
            });
        },
        [folderId, swr],
    );

    /** Sends position PATCHes for an already-applied local reorder; refetches on failure. */
    const persistOrder = useCallback(
        async (patches: Array<{ id: string; position: number }>) => {
            if (!folderId) return;
            try {
                for (const p of patches) await apiSend<unknown>(ASSISTANT_API.pin(folderId, p.id), "PATCH", { position: p.position });
            } finally {
                void swr.mutate();
            }
        },
        [folderId, swr],
    );

    const destroy = useCallback(
        async (pinId: string) => {
            if (!folderId) return;
            await apiSend<unknown>(ASSISTANT_API.pin(folderId, pinId), "DELETE");
            touchFolder();
        },
        [folderId, touchFolder],
    );

    const refresh = useCallback(
        async (pinId: string): Promise<PinItem | null> => {
            if (!folderId) return null;
            const res = await apiSend<unknown>(ASSISTANT_API.pinRefresh(folderId, pinId), "POST");
            const pin = isObject(res) && typeof res.id === "string" ? (res as unknown as PinItem) : isObject(res) && isObject(res.pin) ? (res.pin as unknown as PinItem) : null;
            if (pin) await setLocal((pins) => sortPins(pins.map((p) => (p.id === pinId ? pin : p))));
            else await swr.mutate();
            return pin;
        },
        [folderId, setLocal, swr],
    );

    return {
        pins: swr.data,
        error: swr.error as ApiError | undefined,
        isLoading: swr.isLoading,
        setLocal,
        patch,
        persistOrder,
        destroy,
        refresh,
        reload: () => swr.mutate(),
    };
}

// ============================================
// Search (palette)
// ============================================

export const SEARCH_MIN_CHARS = 2;

export function useAssistantSearch(q: string) {
    const query = q.trim();
    return useSWR<SearchResponse>(query.length >= SEARCH_MIN_CHARS ? withQuery(ASSISTANT_API.search, { q: query }) : null, apiGet, {
        ...QUIET,
        keepPreviousData: true,
    });
}
