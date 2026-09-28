"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { sdrUnifiedDrawerStatusConfigKey } from "@/lib/query-keys";
import {
    buildCallbackCodes,
    FALLBACK_STATUSES,
    statusRequiresNote,
    toneForStatus,
    type OutcomeTone,
} from "../_lib/status-ui";
import type { StatusConfig, StatusDefinition } from "../_lib/types";

/**
 * Mission status config. Uses the UnifiedActionDrawer's query key and payload
 * shape on purpose: the drawer then opens with the config already cached.
 */
export function useStatusConfig(missionId: string | null) {
    const { data } = useQuery<StatusConfig | null>({
        queryKey: sdrUnifiedDrawerStatusConfigKey(missionId),
        queryFn: async () => {
            const r = await fetch(`/api/config/action-statuses?missionId=${missionId}`);
            const j = await r.json();
            if (!j.success || !j.data?.statuses) return null;
            return { statuses: j.data.statuses };
        },
        enabled: !!missionId,
        staleTime: 120_000,
    });

    const statuses: StatusDefinition[] = useMemo(
        () => (data?.statuses?.length ? data.statuses : FALLBACK_STATUSES),
        [data],
    );

    const byCode = useMemo(() => new Map(statuses.map((s) => [s.code, s])), [statuses]);
    const labels = useMemo(() => Object.fromEntries(statuses.map((s) => [s.code, s.label])) as Record<string, string>, [statuses]);
    const callbackCodes = useMemo(() => buildCallbackCodes(statuses), [statuses]);

    const requiresNote = useCallback((code: string) => statusRequiresNote(code, statuses), [statuses]);
    const toneOf = useCallback((code: string): OutcomeTone => toneForStatus(code, byCode.get(code)), [byCode]);
    const isCallback = useCallback((code: string | null | undefined) => !!code && callbackCodes.has(code), [callbackCodes]);

    return { statuses, labels, callbackCodes, requiresNote, toneOf, isCallback };
}

export type StatusModel = ReturnType<typeof useStatusConfig>;
