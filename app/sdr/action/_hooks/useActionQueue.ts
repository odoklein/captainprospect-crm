"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { sdrActionQueueKey } from "@/lib/query-keys";
import type { QueueItem } from "../_lib/types";

async function fetchQueue(missionId: string, listId: string | null, search: string): Promise<QueueItem[]> {
    const params = new URLSearchParams({ missionId });
    if (listId) params.set("listId", listId);
    if (search) params.set("search", search);
    const res = await fetch(`/api/sdr/action-queue?${params.toString()}`);
    const json = await res.json();
    if (!json.success || !Array.isArray(json.data?.items)) {
        throw new Error(json.error || "Impossible de charger la file d'actions");
    }
    return json.data.items as QueueItem[];
}

/**
 * The table's data. Rows the SDR just worked are NOT removed here (the table
 * dims them instead) so the list never jumps under the cursor; a refetch —
 * manual, or when the drawer closes — drops them for real.
 */
export function useActionQueue(missionId: string | null, listId: string | null, search: string) {
    const queryClient = useQueryClient();
    const queryKey = sdrActionQueueKey(missionId, listId, search);

    const query = useQuery({
        queryKey,
        queryFn: () => fetchQueue(missionId!, listId, search),
        enabled: !!missionId,
        staleTime: 30_000,
        // Coming back from the softphone must not reshuffle the table mid-session.
        refetchOnWindowFocus: false,
        // Keep rows on screen while a new search runs — but never show another
        // mission's or list's rows as a placeholder.
        placeholderData: (previous, previousQuery) => {
            const prevKey = previousQuery?.queryKey as readonly unknown[] | undefined;
            return prevKey && prevKey[2] === missionId && prevKey[3] === (listId ?? "") ? previous : undefined;
        },
    });

    const refresh = useCallback(
        () => queryClient.invalidateQueries({ queryKey: ["sdr", "action-queue", missionId] }),
        [queryClient, missionId],
    );

    return {
        items: query.data ?? [],
        isLoading: query.isLoading,
        isFetching: query.isFetching,
        isPlaceholder: query.isPlaceholderData,
        error: query.error ? (query.error as Error).message : null,
        refresh,
    };
}
