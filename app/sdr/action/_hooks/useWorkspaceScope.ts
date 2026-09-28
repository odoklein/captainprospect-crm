"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ListItem, Mission, TodayBlocks } from "../_lib/types";

// Same raw-string keys the previous page used, so SDRs keep their selection.
const MISSION_STORAGE_KEY = "sdr_selected_mission";
const LIST_STORAGE_KEY = "sdr_selected_list";

const SCOPE_QUERY_KEY = ["sdr", "action-cockpit", "scope"] as const;

interface ScopeData {
    missions: Mission[];
    lists: ListItem[];
    /** null when the planning endpoint failed — then every mission stays selectable. */
    today: TodayBlocks | null;
}

type ApiJson = { success?: boolean; data?: unknown; error?: string };

async function fetchJson(url: string): Promise<ApiJson> {
    const res = await fetch(url);
    return res.json();
}

async function fetchScope(): Promise<ScopeData> {
    const [missionsJson, listsJson, todayJson] = await Promise.all([
        fetchJson("/api/sdr/missions"),
        fetchJson("/api/sdr/lists"),
        fetchJson("/api/sdr/today-blocks").catch((): ApiJson => ({ success: false })),
    ]);
    if (!missionsJson.success) throw new Error(missionsJson.error || "Impossible de charger les missions");
    return {
        missions: (missionsJson.data as Mission[]) ?? [],
        lists: listsJson.success ? ((listsJson.data as ListItem[]) ?? []) : [],
        today: todayJson.success ? (todayJson.data as TodayBlocks) : null,
    };
}

function readStorage(key: string): string | null {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeStorage(key: string, value: string | null) {
    try {
        if (value) window.localStorage.setItem(key, value);
        else window.localStorage.removeItem(key);
    } catch {
        // ignore
    }
}

/**
 * Mission + list the SDR is working on. SDRs may only work today's planned
 * missions (the API enforces it too); the last choice is remembered.
 */
export function useWorkspaceScope() {
    const { data, isLoading, error, refetch } = useQuery({
        queryKey: SCOPE_QUERY_KEY,
        queryFn: fetchScope,
        staleTime: 5 * 60_000,
        refetchOnWindowFocus: false,
    });

    const allMissions = useMemo(() => data?.missions ?? [], [data]);
    const selectableMissions = useMemo(() => {
        if (!data) return [];
        if (!data.today) return data.missions;
        const planned = data.today.hasBlocksToday ? new Set(data.today.todayMissionIds) : new Set<string>();
        return data.missions.filter((m) => planned.has(m.id));
    }, [data]);

    const listsForMission = useCallback(
        (id: string | null) => (data?.lists ?? []).filter((l) => l.mission.id === id),
        [data],
    );

    // Explicit choices made on this page; everything else is derived, so a
    // mission leaving today's planning falls back without an effect.
    const [missionChoice, setMissionChoice] = useState<string | null>(null);
    const [listChoice, setListChoice] = useState<{ missionId: string; listId: string | null } | null>(null);

    // Last session's choice. Data only exists client-side, so reading storage here is hydration-safe.
    const saved = useMemo(
        () => (data ? { mission: readStorage(MISSION_STORAGE_KEY), list: readStorage(LIST_STORAGE_KEY) } : null),
        [data],
    );

    const missionId = useMemo(() => {
        const valid = (id: string | null | undefined) => (id && selectableMissions.some((m) => m.id === id) ? id : null);
        return valid(missionChoice) ?? valid(saved?.mission) ?? selectableMissions[0]?.id ?? null;
    }, [missionChoice, saved, selectableMissions]);

    const lists = useMemo(() => listsForMission(missionId), [listsForMission, missionId]);

    const listId = useMemo(() => {
        const valid = (id: string | null | undefined) => (id && lists.some((l) => l.id === id) ? id : null);
        if (listChoice && listChoice.missionId === missionId) {
            return listChoice.listId === null ? null : valid(listChoice.listId) ?? lists[0]?.id ?? null;
        }
        return valid(saved?.list) ?? lists[0]?.id ?? null;
    }, [listChoice, missionId, lists, saved]);

    const setMission = useCallback((id: string) => {
        const first = listsForMission(id)[0]?.id ?? null;
        setMissionChoice(id);
        setListChoice({ missionId: id, listId: first });
        writeStorage(MISSION_STORAGE_KEY, id);
        writeStorage(LIST_STORAGE_KEY, first);
    }, [listsForMission]);

    const setList = useCallback((id: string | null) => {
        if (!missionId) return;
        setListChoice({ missionId, listId: id });
        writeStorage(LIST_STORAGE_KEY, id);
    }, [missionId]);

    const mission = useMemo(() => allMissions.find((m) => m.id === missionId) ?? null, [allMissions, missionId]);

    return {
        isLoading,
        error: error ? (error as Error).message : null,
        refetch,
        allMissions,
        selectableMissions,
        mission,
        missionId,
        lists,
        listId,
        setMission,
        setList,
    };
}

export type WorkspaceScope = ReturnType<typeof useWorkspaceScope>;
