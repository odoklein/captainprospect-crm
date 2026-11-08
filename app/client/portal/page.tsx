"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/ui";
import { BreakdownCharts } from "@/components/client/BreakdownCharts";
import { LaunchWarmupScreen, type PortalLaunchMission } from "@/components/portal/LaunchWarmupScreen";
import { DailyReportLauncher } from "@/components/client/DailyReportLauncher";
import { ClientHomeSkeleton, ClientHomeView, type ClientHomeMeeting } from "@/components/accueil/ClientHomeView";
import type { ClientTeamData } from "@/components/accueil/ClientMissionTeamCard";

interface DashboardStats {
    totalActions: number;
    meetingsBooked: number;
    meetingsConfirmed?: number;
    monthlyObjective: number | null;
    activeMissions: number;
}

type ClientMeeting = ClientHomeMeeting;

interface Mission {
    id: string;
    name: string;
    isActive: boolean;
}

interface PortalSettings {
    portalShowCallHistory: boolean;
    portalShowDatabase: boolean;
}

const MONTH_NAMES = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function getGreeting(): string {
    const h = new Date().getHours();
    if (h >= 18) return "Bonsoir";
    if (h >= 12) return "Bon après-midi";
    return "Bonjour";
}

export default function ClientPortal() {
    const { data: session } = useSession();
    const toast = useToast();
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [upcomingMeetings, setUpcomingMeetings] = useState<ClientMeeting[]>([]);
    const [missionName, setMissionName] = useState<string>("");
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [portalSettings, setPortalSettings] = useState<PortalSettings | null>(null);
    const [totalMeetingsCount, setTotalMeetingsCount] = useState<number>(0);
    const [callsCountForMonth, setCallsCountForMonth] = useState<number>(0);
    const [launchMissions, setLaunchMissions] = useState<PortalLaunchMission[]>([]);
    const [team, setTeam] = useState<ClientTeamData | null>(null);
    const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
    // Month selector for calls stats: 0 = current month, -1 = previous, etc.
    const [callsMonthOffset, setCallsMonthOffset] = useState(0);

    const clientId = (session?.user as { clientId?: string })?.clientId;
    const userName = session?.user?.name?.split(" ")[0] ?? "Client";

    const now = new Date();
    const currentMonth = MONTH_NAMES[now.getMonth()];
    const currentYear = now.getFullYear();

    const fetchData = useCallback(async (refresh = false) => {
        if (refresh) setIsRefreshing(true);
        else setIsLoading(true);
        try {
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            const startDate = monthStart.toISOString().split("T")[0];
            const endDate = monthEnd.toISOString().split("T")[0];

            // For calls stats: selected month from offset
            const callsMonthDate = new Date(now.getFullYear(), now.getMonth() + callsMonthOffset, 1);
            const callsStart = new Date(callsMonthDate.getFullYear(), callsMonthDate.getMonth(), 1);
            const callsEnd = new Date(callsMonthDate.getFullYear(), callsMonthDate.getMonth() + 1, 0, 23, 59, 59, 999);
            const callsStartStr = callsStart.toISOString().split("T")[0];
            const callsEndStr = callsEnd.toISOString().split("T")[0];

            const [statsRes, missionsRes, meetingsRes, settingsRes, callsRes, launchRes, teamRes] = await Promise.all([
                fetch(`/api/stats?startDate=${startDate}&endDate=${endDate}`),
                fetch("/api/missions?isActive=true"),
                clientId ? fetch(`/api/clients/${clientId}/meetings`) : Promise.resolve(null),
                fetch("/api/client/portal/settings"),
                fetch(`/api/client/calls?startDate=${callsStartStr}&endDate=${callsEndStr}`),
                fetch("/api/portal/launch-state", { cache: "no-store" }),
                fetch("/api/client/team", { cache: "no-store" }),
            ]);

            const [statsJson, missionsJson, meetingsJson, settingsJson, callsJson, launchJson, teamJson] = await Promise.all([
                statsRes.json(),
                missionsRes.json(),
                meetingsRes?.ok ? meetingsRes.json() : Promise.resolve(null),
                settingsRes.json(),
                callsRes.ok ? callsRes.json() : Promise.resolve({ success: false }),
                launchRes.json(),
                // The team card is an extra: if it fails, the rest of the home still loads.
                teamRes.ok ? teamRes.json().catch(() => null) : Promise.resolve(null),
            ]);

            if (statsJson.success) setStats(statsJson.data);
            if (missionsJson.success) {
                const missions = Array.isArray(missionsJson.data) ? missionsJson.data as Mission[] : [];
                setMissionName(missions[0]?.name ?? "");
            }
            if (meetingsJson?.success) {
                const allMeetings: ClientMeeting[] = meetingsJson.data?.allMeetings ?? [];
                const upcoming = allMeetings
                    .filter((m) => {
                        if (!m.callbackDate) return true;
                        return new Date(m.callbackDate) >= new Date();
                    })
                    .sort((a, b) => {
                        const da = a.callbackDate ? new Date(a.callbackDate).getTime() : 0;
                        const db = b.callbackDate ? new Date(b.callbackDate).getTime() : 0;
                        return da - db;
                    })
                    .slice(0, 5);
                setUpcomingMeetings(upcoming);
                // The hero counts a RDV only once it is confirmed and still booked:
                // a cancelled one is not a meeting the client got.
                const confirmedCount = allMeetings.filter(
                    (m) => m.result !== "MEETING_CANCELLED" && m.confirmationStatus !== "CANCELLED"
                ).length;
                setTotalMeetingsCount(confirmedCount);
            }
            if (settingsJson?.success) {
                setPortalSettings(settingsJson.data);
            }
            if (callsJson?.success) {
                setCallsCountForMonth(callsJson.data?.total ?? 0);
            }
            if (launchJson?.success) {
                setLaunchMissions(launchJson.data?.missions ?? []);
            }
            // On failure, show the card's empty state rather than a skeleton that never resolves.
            setTeam(teamJson?.success ? teamJson.data : { missions: [], members: [], lastActivityAt: null, actionsLast7Days: 0 });
            setUpdatedAt(new Date());
        } catch (error) {
            console.error("Failed to fetch data:", error);
            setTeam((prev) => prev ?? { missions: [], members: [], lastActivityAt: null, actionsLast7Days: 0 });
            toast.error("Erreur de chargement", "Impossible de charger les données");
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clientId, callsMonthOffset]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    if (isLoading && !stats) {
        return <ClientHomeSkeleton />;
    }

    if (launchMissions.length > 0) {
        return <LaunchWarmupScreen missions={launchMissions} userName={userName} />;
    }

    // No fallback to stats.meetingsBooked: that number is all booked RDV (pending and
    // cancelled included) and would silently contradict the confirmed count.
    const meetingsBooked = totalMeetingsCount;

    const callsMonth = new Date(now.getFullYear(), now.getMonth() + callsMonthOffset, 1);

    return (
        <>
            <ClientHomeView
                greeting={getGreeting()}
                userName={userName}
                monthLabel={`${currentMonth} ${currentYear}`}
                missionName={missionName}
                meetingsBooked={meetingsBooked}
                callsCount={callsCountForMonth}
                callsMonthLabel={`${MONTH_NAMES[callsMonth.getMonth()]} ${callsMonth.getFullYear()}`}
                canGoNextMonth={callsMonthOffset < 0}
                onPrevMonth={() => setCallsMonthOffset((o) => o - 1)}
                onNextMonth={() => setCallsMonthOffset((o) => Math.min(o + 1, 0))}
                isRefreshing={isRefreshing}
                onRefresh={() => fetchData(true)}
                showCallHistory={!!portalSettings?.portalShowCallHistory}
                showDatabase={!!portalSettings?.portalShowDatabase}
                breakdown={<BreakdownCharts />}
                upcomingMeetings={upcomingMeetings}
                team={team}
                updatedAt={updatedAt}
            />

            {/* Floating "rapport de la veille" — appears from 7:30 each morning. */}
            <DailyReportLauncher />
        </>
    );
}
