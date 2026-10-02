"use client";

import { useState } from "react";
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
interface DashboardData {
    stats: ManagerDashboardStats | null;
    missions: MissionSummaryItem[];
}

async function fetchDashboardData(start: string, end: string, missionId: string): Promise<DashboardData> {
    const statsUrl = `/api/stats?startDate=${start}&endDate=${end}${missionId ? `&missionId=${missionId}` : ""}`;
    const [statsRes, missionsRes] = await Promise.all([
        fetch(statsUrl),
        fetch(`/api/stats/missions-summary?startDate=${start}&endDate=${end}&limit=10`),
    ]);
    const [statsJson, missionsJson] = await Promise.all([statsRes.json(), missionsRes.json()]);
    return {
        stats: statsJson.success ? statsJson.data : null,
        missions: missionsJson.success ? missionsJson.data?.missions ?? [] : [],
    };
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

    const main = useQuery({
        queryKey: ["manager", "dashboard", start, end, missionFilter],
        queryFn: () => fetchDashboardData(start, end, missionFilter),
        refetchInterval: 60_000,
        // Hold the previous render while a new period loads — no skeleton flash.
        placeholderData: keepPreviousData,
    });
    const periodQuery = useQuery({
        queryKey: ["manager", "dashboard", "period", start, end, missionFilter],
        queryFn: () => fetchPeriod(start, end, missionFilter),
        refetchInterval: 60_000,
        placeholderData: keepPreviousData,
    });

    const periodLabel = dateRange.preset
        ? PRESET_LABELS[dateRange.preset]
        : `Du ${new Date(`${start}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} au ${new Date(`${end}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`;

    return (
        <ManagerDashboardView
            firstName={session?.user?.name?.split(" ")[0] ?? "Manager"}
            stats={main.data?.stats ?? null}
            missions={main.data?.missions ?? []}
            period={periodQuery.data ?? null}
            isLoading={main.isLoading}
            isFetching={main.isFetching || periodQuery.isFetching}
            updatedAt={main.dataUpdatedAt}
            onRefresh={() => {
                void main.refetch();
                void periodQuery.refetch();
            }}
            periodLabel={periodLabel}
            rangeDays={daysBetween(start, end)}
            dateRange={dateRange}
            onDateRangeChange={changeRange}
            missionFilter={missionFilter}
            onMissionFilterChange={setMissionFilter}
        />
    );
}
