"use client";

// TEMPORARY visual check of the Accueil redesign with fixture data — delete before commit.

import { useEffect, useState } from "react";
import { ManagerDashboardView } from "@/components/accueil/ManagerDashboardView";
import { ClientHomeView } from "@/components/accueil/ClientHomeView";
import { BreakdownChartsView, type BreakdownPeriod } from "@/components/client/BreakdownCharts";
import { bucketSeries, parsePeriodRange } from "@/lib/manager-home/rules";

const range = parsePeriodRange("2026-09-03", "2026-10-02")!;
const series = bucketSeries(
    Array.from({ length: 30 }, (_, i) => {
        const d = new Date(Date.UTC(2026, 8, 3 + i, 9));
        const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
        return { at: d, actions: weekend ? 0 : 180 + ((i * 37) % 90), meetings: weekend ? 0 : (i * 7) % 6 };
    }),
    range,
);

const now = Date.now();
const iso = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString();

export default function PreviewAccueil() {
    const [view, setView] = useState<"manager" | "client">("manager");
    const [period, setPeriod] = useState<BreakdownPeriod>("month");
    const [mission, setMission] = useState("");
    useEffect(() => {
        if (window.location.search.includes("client")) setView("client");
    }, []);
    return (
        <div className="min-h-screen bg-[#fafbfc] text-zinc-900 flex">
            <aside className="w-[240px] shrink-0 bg-white border-r border-slate-200 hidden lg:block" />
            <main className="flex-1 min-w-0">
                <div className="h-14 bg-white border-b border-slate-200 flex items-center gap-2 px-6">
                    <button className="text-xs font-bold px-3 py-1 rounded-lg bg-slate-100" onClick={() => setView("manager")}>Manager</button>
                    <button className="text-xs font-bold px-3 py-1 rounded-lg bg-slate-100" onClick={() => setView("client")}>Client</button>
                </div>
                <div className="cp-content">
                    <div className="max-w-[1440px] mx-auto w-full">
                        {view === "manager" ? (
                            <ManagerDashboardView
                                firstName="Odo"
                                stats={{
                                    totalActions: 4212,
                                    meetingsBooked: 64,
                                    conversionRate: 1.52,
                                    resultBreakdown: {
                                        NO_RESPONSE: 2210, BARRAGE_STANDARD: 380, MEETING_BOOKED: 64, INTERESTED: 141,
                                        CALLBACK_REQUESTED: 318, RAPPEL: 40, REFUS: 512, DISQUALIFIED: 90, BAD_CONTACT: 210,
                                        NUMERO_KO: 77, MAIL_ENVOYE: 170,
                                    },
                                    leaderboard: [
                                        { id: "a", name: "Morgane Lefèvre", calls: 1320, connectedCalls: 402, actions: 1288 },
                                        { id: "b", name: "Julien Martin", calls: 1104, connectedCalls: 311, actions: 1090 },
                                        { id: "c", name: "Sarah Benali", calls: 980, connectedCalls: 240, actions: 1012 },
                                        { id: "d", name: "Karim Diallo", calls: 801, connectedCalls: 190, actions: 822 },
                                    ],
                                    rdvLeaderboard: [
                                        { id: "a", name: "Morgane Lefèvre", rdv: 24, actions: 1288 },
                                        { id: "b", name: "Julien Martin", rdv: 18, actions: 1090 },
                                        { id: "c", name: "Sarah Benali", rdv: 13, actions: 1012 },
                                        { id: "d", name: "Karim Diallo", rdv: 9, actions: 822 },
                                    ],
                                }}
                                missions={[
                                    { id: "m1", name: "Prospection PME Île-de-France", isActive: true, client: { id: "c1", name: "Atlas Logistique" }, sdrCount: 3, actionsThisPeriod: 1800, meetingsThisPeriod: 19, lastActionAt: iso(4) },
                                    { id: "m2", name: "Lancement offre Cloud", isActive: true, client: { id: "c2", name: "Nuvola" }, sdrCount: 2, actionsThisPeriod: 1200, meetingsThisPeriod: 14, lastActionAt: iso(30) },
                                    { id: "m3", name: "Relance grands comptes", isActive: true, client: { id: "c3", name: "Bâtisseurs du Sud" }, sdrCount: 1, actionsThisPeriod: 700, meetingsThisPeriod: 12, lastActionAt: iso(300) },
                                    { id: "m4", name: "Salon Batimat 2026", isActive: true, client: { id: "c4", name: "Optimum RH" }, sdrCount: 1, actionsThisPeriod: 400, meetingsThisPeriod: 7, lastActionAt: iso(3000) },
                                ]}
                                period={{
                                    range: { start: range.start, end: range.end, days: range.days, prevStart: range.prevStart, prevEnd: range.prevEnd, granularity: range.granularity },
                                    current: { actions: 4212, meetings: 64, hotLeads: 459 },
                                    previous: { actions: 3890, meetings: 71, hotLeads: 402 },
                                    series,
                                    recentMeetings: [
                                        { id: "r1", createdAt: iso(6), meetingAt: iso(-4000), sdrName: "Morgane L.", contactName: "Claire Dubois", companyName: "Atlas Logistique", missionName: "Prospection PME Île-de-France", confirmationStatus: "PENDING" },
                                        { id: "r2", createdAt: iso(52), meetingAt: iso(-9000), sdrName: "Julien M.", contactName: "Marc Petit", companyName: "Nuvola", missionName: "Lancement offre Cloud", confirmationStatus: "CONFIRMED" },
                                        { id: "r3", createdAt: iso(190), meetingAt: null, sdrName: "Sarah B.", contactName: null, companyName: "Groupe Hexa", missionName: "Relance grands comptes", confirmationStatus: "CONFIRMED" },
                                        { id: "r4", createdAt: iso(1600), meetingAt: iso(-1200), sdrName: "Karim D.", contactName: "Nadia Haddad", companyName: "Optimum RH", missionName: "Salon Batimat 2026", confirmationStatus: "CANCELLED" },
                                    ],
                                }}
                                isLoading={false}
                                isFetching={false}
                                updatedAt={now}
                                onRefresh={() => {}}
                                periodLabel="30 derniers jours"
                                rangeDays={31}
                                dateRange={{ preset: "lastMonth", startDate: range.start, endDate: range.end }}
                                onDateRangeChange={() => {}}
                                missionFilter={mission}
                                onMissionFilterChange={setMission}
                            />
                        ) : (
                            <ClientHomeView
                                greeting="Bonjour"
                                userName="Claire"
                                monthLabel="Octobre 2026"
                                missionName="Prospection PME Île-de-France"
                                meetingsBooked={128}
                                callsCount={1284}
                                callsMonthLabel="Octobre 2026"
                                canGoNextMonth={false}
                                onPrevMonth={() => {}}
                                onNextMonth={() => {}}
                                isRefreshing={false}
                                onRefresh={() => {}}
                                showCallHistory
                                showDatabase
                                breakdown={
                                    <BreakdownChartsView
                                        isLoading={false}
                                        period={period}
                                        onPeriodChange={setPeriod}
                                        data={{
                                            totalCalls: 1284,
                                            totalRdv: 31,
                                            byFunction: [
                                                { label: "Directeur général", calls: 420, rdv: 14, rate: 3.3 },
                                                { label: "DAF", calls: 310, rdv: 8, rate: 2.6 },
                                                { label: "DRH", calls: 220, rdv: 5, rate: 2.3 },
                                                { label: "Responsable achats", calls: 140, rdv: 3, rate: 2.1 },
                                                { label: "Office manager", calls: 9, rdv: 2, rate: 22.2 },
                                            ],
                                            byIndustry: [], bySize: [],
                                        }}
                                    />
                                }
                                upcomingMeetings={[
                                    { id: "u1", createdAt: iso(100), callbackDate: iso(-1500), contact: { firstName: "Marc", lastName: "Petit", company: { name: "Nuvola" } }, campaign: { name: "C", mission: { name: "Lancement offre Cloud" } }, interlocuteur: { id: "i", firstName: "Paul", lastName: "Girard" } },
                                    { id: "u2", createdAt: iso(100), callbackDate: iso(-5200), contact: { firstName: "Nadia", lastName: "Haddad", company: { name: "Optimum RH" } }, campaign: { name: "C", mission: { name: "Salon Batimat 2026" } } },
                                    { id: "u3", createdAt: iso(100), callbackDate: null, contact: null, company: { name: "Groupe Hexa" }, campaign: { name: "C", mission: { name: "Relance grands comptes" } } },
                                ]}
                            />
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
