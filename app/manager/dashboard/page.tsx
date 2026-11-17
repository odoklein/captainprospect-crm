"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
    getPresetRange, toISO,
    type DateRangeValue, type DateRangePreset,
} from "@/components/dashboard/DateRangeFilter";
import {
    ManagerDashboardView,
    type ManagerDashboardStats,
    type MissionSummaryItem,
} from "@/components/accueil/ManagerDashboardView";
import type { ManagerHomePeriod } from "@/lib/manager-home/types";

/* ─── Constants ─── */
const PRESET_LABELS: Record<DateRangePreset, string> = {
    last7: "7 derniers jours", last4weeks: "4 dernières semaines",
    lastMonth: "30 derniers jours", last6months: "6 derniers mois",
    last12months: "12 derniers mois", monthToDate: "Mois en cours",
    quarterToDate: "Trimestre en cours", yearToDate: "Année en cours",
    allTime: "Tout",
};
const DEFAULT_PRESET: DateRangePreset = "lastMonth";
/** Per-viewer convenience: the period last picked on this browser. */
const STORAGE_KEY = "manager_dashboard_range";

function presetValue(preset: DateRangePreset): DateRangeValue {
    const { start, end } = getPresetRange(preset);
    return { preset, startDate: toISO(start), endDate: toISO(end) };
}

function readStoredRange(): DateRangeValue | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const v = JSON.parse(raw) as DateRangeValue;
        // Presets are re-anchored on today; custom ranges are kept as picked.
        if (v.preset && v.preset in PRESET_LABELS) return presetValue(v.preset);
        if (v.startDate && v.endDate) return { startDate: v.startDate, endDate: v.endDate };
    } catch {
        // storage unavailable (private mode, blocked): fall back to the default
    }
    return null;
}

function daysBetween(start: string, end: string): number {
    const [y1, m1, d1] = start.split("-").map(Number);
    const [y2, m2, d2] = end.split("-").map(Number);
    return Math.max(1, Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000) + 1);
}

/* ─── Data ─── */
// Each card's data is its own query: the KPIs render as soon as /api/stats answers,
// without waiting for the missions table, the period chart or the Allo call tags.

type CallMetrics = Record<string, { calls: number; connectedCalls: number }>;

async function getJson<T>(url: string): Promise<T | null> {
    const res = await fetch(url);
    const json = await res.json();
    return json.success ? (json.data as T) : null;
}

function fetchStats(start: string, end: string, missionId: string) {
    // callMetrics=0: the Allo crawl is loaded separately (fetchCallMetrics).
    return getJson<ManagerDashboardStats>(
        `/api/stats?startDate=${start}&endDate=${end}&callMetrics=0${missionId ? `&missionId=${missionId}` : ""}`,
    );
}

async function fetchMissions(start: string, end: string): Promise<MissionSummaryItem[]> {
    const data = await getJson<{ missions: MissionSummaryItem[] }>(
        `/api/stats/missions-summary?startDate=${start}&endDate=${end}&limit=10`,
    );
    return data?.missions ?? [];
}

async function fetchCallMetrics(start: string, end: string, sdrIds: string[]): Promise<CallMetrics> {
    const data = await getJson<{ metrics: CallMetrics }>(
        `/api/stats/sdr-call-metrics?startDate=${start}&endDate=${end}&sdrIds=${sdrIds.map(encodeURIComponent).join(",")}`,
    );
    return data?.metrics ?? {};
}

/** Real series, previous-period totals and recent RDVs (see lib/manager-home). */
async function fetchPeriod(start: string, end: string, missionId: string): Promise<ManagerHomePeriod | null> {
    const res = await fetch(`/api/manager/home/period?startDate=${start}&endDate=${end}${missionId ? `&missionId=${missionId}` : ""}`);
    const json = await res.json();
    return json.success ? json.data : null;
}

/* ─── Page ─── */
export default function ManagerDashboard() {
    const { data: session } = useSession();
    // SSR has no storage and renders the skeleton either way, so reading it here can't mismatch.
    const [dateRange, setDateRange] = useState<DateRangeValue>(
        () => (typeof window !== "undefined" ? readStoredRange() : null) ?? presetValue(DEFAULT_PRESET),
    );
    const [missionFilter, setMissionFilter] = useState("");

    const changeRange = (v: DateRangeValue) => {
        setDateRange(v);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
        } catch {
            // not persisted — the choice still applies for this visit
        }
    };

    const fallback = getPresetRange((dateRange.preset as DateRangePreset) || DEFAULT_PRESET);
    const start = dateRange.startDate && dateRange.endDate ? dateRange.startDate : toISO(fallback.start);
    const end = dateRange.startDate && dateRange.endDate ? dateRange.endDate : toISO(fallback.end);

    const statsQuery = useQuery({
        queryKey: ["manager", "dashboard", "stats", start, end, missionFilter],
        queryFn: () => fetchStats(start, end, missionFilter),
        refetchInterval: 60_000,
        // Hold the previous render while a new period loads — no skeleton flash.
        placeholderData: keepPreviousData,
    });
    // Not filtered by mission: it also feeds the mission picker.
    const missionsQuery = useQuery({
        queryKey: ["manager", "dashboard", "missions", start, end],
        queryFn: () => fetchMissions(start, end),
        refetchInterval: 60_000,
        placeholderData: keepPreviousData,
    });
    const periodQuery = useQuery({
        queryKey: ["manager", "dashboard", "period", start, end, missionFilter],
        queryFn: () => fetchPeriod(start, end, missionFilter),
        refetchInterval: 60_000,
        placeholderData: keepPreviousData,
    });

    // Allo tags for the people on the RDV leaderboard, once we know who they are.
    // Server-cached 5 min, so polling faster than that would only re-read the cache.
    const leaderIds = useMemo(
        () => (statsQuery.data?.rdvLeaderboard ?? []).map((r) => r.id).sort(),
        [statsQuery.data?.rdvLeaderboard],
    );
    const callsQuery = useQuery({
        queryKey: ["manager", "dashboard", "calls", start, end, leaderIds.join(",")],
        queryFn: () => fetchCallMetrics(start, end, leaderIds),
        enabled: leaderIds.length > 0,
        staleTime: 5 * 60_000,
        refetchInterval: 5 * 60_000,
        placeholderData: keepPreviousData,
    });

    const stats = useMemo<ManagerDashboardStats | null>(() => {
        const s = statsQuery.data;
        if (!s) return null;
        const metrics = callsQuery.data;
        // Absent entries render as "loading" in the leaderboard, not as 0.
        const leaderboard = metrics
            ? s.rdvLeaderboard
                .filter((r) => metrics[r.id])
                .map((r) => ({ id: r.id, name: r.name, actions: r.actions, ...metrics[r.id] }))
            : [];
        return { ...s, leaderboard };
    }, [statsQuery.data, callsQuery.data]);

    const periodLabel = dateRange.preset
        ? PRESET_LABELS[dateRange.preset]
        : `Du ${new Date(`${start}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} au ${new Date(`${end}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`;

    return (
        <div className="space-y-6">
        <ManagerDashboardView
            firstName={session?.user?.name?.split(" ")[0] ?? "Manager"}
            stats={stats}
            missions={missionsQuery.data ?? []}
            missionsLoading={missionsQuery.isLoading}
            callMetricsLoading={leaderIds.length > 0 && !callsQuery.data}
            period={periodQuery.data ?? null}
            isLoading={statsQuery.isLoading}
            isFetching={statsQuery.isFetching || missionsQuery.isFetching || periodQuery.isFetching}
            updatedAt={statsQuery.dataUpdatedAt}
            onRefresh={() => {
                void statsQuery.refetch();
                void missionsQuery.refetch();
                void periodQuery.refetch();
                if (leaderIds.length > 0) void callsQuery.refetch();
            }}
            periodLabel={periodLabel}
            rangeDays={daysBetween(start, end)}
            dateRange={dateRange}
            onDateRangeChange={changeRange}
            missionFilter={missionFilter}
            onMissionFilterChange={setMissionFilter}
        />
        </div>
    );
}
