"use client";

// Client portal home (app/client/portal) — same content as before, drawn in the
// SDR "Accueil" language (components/accueil/AccueilUI.tsx). Pure view: the page
// owns fetching; `breakdown` is the analysis card (fetches on its own).

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Calendar, CalendarCheck, ChevronLeft, ChevronRight, ChevronRight as Chevron, PhoneCall, RefreshCw, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import {
    CARD, CARD_HOVER, EmptyBlock, FOCUS, HeroCard, HeroPill, ICON_BUTTON, IconTile, PILL, SectionHeader, Shimmer, StatusPill, TextLink,
} from "./AccueilUI";

export interface ClientHomeMeeting {
    id: string;
    createdAt: string;
    callbackDate?: string | null;
    note?: string | null;
    result?: string;
    contact: {
        firstName?: string | null;
        lastName?: string | null;
        title?: string | null;
        company: { name: string };
    } | null;
    company?: { name: string } | null;
    campaign: {
        name: string;
        mission: { name: string };
    };
    interlocuteur?: {
        id: string;
        firstName?: string | null;
        lastName?: string | null;
        title?: string | null;
    } | null;
}

export interface ClientHomeViewProps {
    greeting: string;
    userName: string;
    monthLabel: string;
    missionName: string;
    meetingsBooked: number;
    callsCount: number;
    callsMonthLabel: string;
    canGoNextMonth: boolean;
    onPrevMonth: () => void;
    onNextMonth: () => void;
    isRefreshing: boolean;
    onRefresh: () => void;
    showCallHistory: boolean;
    showDatabase: boolean;
    breakdown: ReactNode;
    upcomingMeetings: ClientHomeMeeting[];
}

function formatMeetingDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function formatMeetingTime(dateString: string): string {
    return new Date(dateString).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatShortMonth(dateString: string): string {
    return new Date(dateString).toLocaleDateString("fr-FR", { month: "short" }).toUpperCase().replace(".", "");
}

export function ClientHomeView(props: ClientHomeViewProps) {
    const {
        greeting, userName, monthLabel, missionName, meetingsBooked, callsCount, callsMonthLabel, canGoNextMonth,
        onPrevMonth, onNextMonth, isRefreshing, onRefresh, showCallHistory, showDatabase, breakdown, upcomingMeetings,
    } = props;

    return (
        <div className="w-full space-y-6 pb-12 antialiased text-zinc-900">
            {/* ═══ 1. Greeting ═══ */}
            <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pt-1">
                <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        {missionName && (
                            <StatusPill tone="emerald" pulse>
                                <span className="max-w-[260px] truncate">{missionName}</span>
                            </StatusPill>
                        )}
                        <StatusPill tone="slate" icon={Calendar}>{monthLabel}</StatusPill>
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-900">
                        {greeting}, {userName} ! 👋
                    </h1>
                    <p className="text-xs sm:text-sm text-zinc-500 font-medium">
                        Vos rendez-vous obtenus et l&apos;activité de prospection menée pour vous.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onRefresh}
                    disabled={isRefreshing}
                    className={cn(ICON_BUTTON, "h-11 w-11 rounded-2xl self-start sm:self-auto")}
                    title="Rafraîchir"
                    aria-label="Actualiser les données"
                >
                    <RefreshCw className={cn("w-4 h-4", isRefreshing && "motion-safe:animate-spin")} aria-hidden />
                </button>
            </header>

            {/* ═══ 2. Hero — RDV cumulés & appels du mois ═══ */}
            <HeroCard className="space-y-6">
                <HeroPill icon={CalendarCheck}>Rendez-vous cumulés</HeroPill>

                <div className="flex items-baseline gap-2">
                    <AnimatedNumber
                        value={meetingsBooked}
                        className="text-[72px] md:text-[84px] font-black text-white leading-[0.85] tracking-tighter"
                    />
                    <span className="text-2xl font-black text-emerald-300/80">RDV</span>
                </div>

                <div className="pt-5 border-t border-emerald-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider">Appels passés</span>
                        {/* Month stepper — track 12px / p-1 → buttons 8px */}
                        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-emerald-950/90 border border-emerald-700/80">
                            <button
                                type="button"
                                onClick={onPrevMonth}
                                className={cn(
                                    "w-7 h-7 rounded-lg flex items-center justify-center text-emerald-200 hover:text-white hover:bg-emerald-900/80 transition-colors",
                                    "outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60",
                                )}
                                aria-label="Mois précédent"
                            >
                                <ChevronLeft className="w-4 h-4" aria-hidden />
                            </button>
                            <span className="min-w-[116px] text-center text-xs font-bold text-white px-1 tabular-nums" aria-live="polite">
                                {callsMonthLabel}
                            </span>
                            <button
                                type="button"
                                onClick={onNextMonth}
                                disabled={!canGoNextMonth}
                                className={cn(
                                    "w-7 h-7 rounded-lg flex items-center justify-center text-emerald-200 hover:text-white hover:bg-emerald-900/80 transition-colors",
                                    "disabled:opacity-35 disabled:pointer-events-none outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60",
                                )}
                                aria-label="Mois suivant"
                            >
                                <ChevronRight className="w-4 h-4" aria-hidden />
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 p-3.5 pr-5 rounded-2xl bg-emerald-950/70 border border-emerald-800/60">
                        <div className="w-10 h-10 rounded-xl bg-emerald-800/80 border border-emerald-700/60 flex items-center justify-center flex-shrink-0">
                            <PhoneCall className="w-[18px] h-[18px] text-emerald-300" aria-hidden />
                        </div>
                        <div>
                            <AnimatedNumber value={callsCount} className="text-xl font-black text-white leading-none" />
                            <p className="text-[11px] text-emerald-300/80 mt-1 font-semibold">appels en {callsMonthLabel.toLowerCase()}</p>
                        </div>
                    </div>
                </div>
            </HeroCard>

            {/* ═══ 3. Shortcuts (portal settings) ═══ */}
            {(showCallHistory || showDatabase) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {showCallHistory && (
                        <ShortcutCard
                            href="/client/portal/calls"
                            icon={<IconTile icon={PhoneCall} tone="emerald" size="lg" />}
                            title="Historique des appels"
                            hint="Consultez tous les appels passés par l'équipe."
                        />
                    )}
                    {showDatabase && (
                        <ShortcutCard
                            href="/client/portal/database"
                            icon={<IconTile icon={Users} tone="indigo" size="lg" />}
                            title="Base de données"
                            hint="Vue des entreprises et contacts suivis par l'équipe."
                        />
                    )}
                </div>
            )}

            {/* ═══ 4. Analyse de la prospection ═══ */}
            {breakdown}

            {/* ═══ 5. Prochains rendez-vous ═══ */}
            <section className={cn(CARD, "p-6 space-y-4")}>
                <SectionHeader
                    icon={CalendarCheck}
                    tone="emerald"
                    title="Prochains rendez-vous"
                    count={upcomingMeetings.length}
                    subtitle="Planifiés par votre équipe"
                    right={<TextLink href="/client/portal/meetings">Voir tous mes rendez-vous</TextLink>}
                />

                {upcomingMeetings.length === 0 ? (
                    <EmptyBlock
                        icon={Calendar}
                        tone="slate"
                        title="Aucun RDV à venir"
                        hint="Les prochains RDV planifiés par votre équipe apparaîtront ici."
                    />
                ) : (
                    <ul className="space-y-2.5">
                        {upcomingMeetings.map((m) => (
                            <li key={m.id}>
                                <MeetingRow meeting={m} />
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}

function ShortcutCard({ href, icon, title, hint }: { href: string; icon: ReactNode; title: string; hint: string }) {
    return (
        <Link href={href} className={cn(CARD, CARD_HOVER, FOCUS, "group flex items-center gap-4 p-5")}>
            {icon}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-extrabold text-zinc-900">{title}</p>
                <p className="text-xs font-medium text-zinc-500 mt-0.5">{hint}</p>
            </div>
            <span className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 group-hover:bg-zinc-950 transition-colors">
                <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-white group-hover:translate-x-0.5 transition-all" aria-hidden />
            </span>
        </Link>
    );
}

function MeetingRow({ meeting: m }: { meeting: ClientHomeMeeting }) {
    const contactName = m.contact
        ? [m.contact.firstName, m.contact.lastName].filter(Boolean).join(" ") || "Contact"
        : "Contact entreprise";
    const companyName = m.contact?.company?.name ?? m.company?.name ?? "Entreprise inconnue";
    const d = m.callbackDate ? new Date(m.callbackDate) : null;
    const interlocuteur = m.interlocuteur
        ? [m.interlocuteur.firstName, m.interlocuteur.lastName].filter(Boolean).join(" ") || "Commercial assigné"
        : null;

    return (
        <Link
            href="/client/portal/meetings"
            className={cn(
                "group flex items-center gap-4 p-3.5 rounded-2xl border bg-white border-slate-200 shadow-2xs",
                "hover:border-slate-300 hover:shadow-[0_4px_14px_rgba(15,23,42,0.05)] transition-[border-color,box-shadow]",
                FOCUS,
            )}
        >
            {/* Date block — 12px radius inside the 16px row */}
            <div className="w-14 h-14 shrink-0 flex flex-col items-center justify-center rounded-xl bg-slate-50 border border-slate-200 group-hover:bg-emerald-50 group-hover:border-emerald-200/80 transition-colors">
                {d ? (
                    <>
                        <span className="text-lg font-black text-zinc-900 leading-none tabular-nums">{d.getDate()}</span>
                        <span className="text-[9px] font-extrabold text-zinc-400 uppercase tracking-wider mt-1">{formatShortMonth(m.callbackDate!)}</span>
                    </>
                ) : (
                    <span className="text-[10px] font-extrabold text-zinc-400 text-center leading-tight px-1">À<br />confirmer</span>
                )}
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5 min-w-0">
                    <span className="text-sm font-extrabold text-zinc-900 truncate">{contactName}</span>
                    <span className="text-xs font-semibold text-zinc-500 truncate">chez {companyName}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                    {m.callbackDate ? (
                        <>
                            <span className="text-xs font-bold text-emerald-700 capitalize">{formatMeetingDate(m.callbackDate)}</span>
                            <span className="text-[11px] font-bold text-zinc-400 tabular-nums">{formatMeetingTime(m.callbackDate)}</span>
                        </>
                    ) : (
                        <span className="text-xs font-semibold text-zinc-400 italic">Date à confirmer</span>
                    )}
                </div>
            </div>

            <div className="hidden md:flex items-center gap-1.5 shrink-0 max-w-[40%]">
                <span className={cn("inline-flex h-6 items-center px-2.5 rounded-full border text-[11px] font-bold truncate", PILL.emerald)}>
                    {m.campaign?.mission?.name ?? "—"}
                </span>
                {interlocuteur && (
                    <span className={cn("inline-flex h-6 items-center px-2.5 rounded-full border text-[11px] font-bold truncate", PILL.indigo)}>
                        {interlocuteur}
                    </span>
                )}
            </div>

            <span className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 group-hover:bg-zinc-950 transition-colors">
                <Chevron className="w-4 h-4 text-zinc-400 group-hover:text-white transition-colors" aria-hidden />
            </span>
        </Link>
    );
}

export function ClientHomeSkeleton() {
    return (
        <div className="w-full space-y-6 pb-12" aria-busy="true" aria-label="Chargement de l'accueil">
            <div className="flex items-end justify-between gap-4 pt-1">
                <div className="space-y-2.5">
                    <div className="flex gap-2">
                        <Shimmer className="h-7 w-40 rounded-full" />
                        <Shimmer className="h-7 w-32 rounded-full" />
                    </div>
                    <Shimmer className="h-9 w-72 rounded-xl" />
                    <Shimmer className="h-4 w-80 max-w-full rounded-lg" />
                </div>
                <Shimmer className="h-11 w-11 rounded-2xl" />
            </div>
            <div className="h-[300px] rounded-3xl bg-[#0B3524]/90 motion-safe:animate-pulse" />
            <Shimmer className="h-[420px] rounded-3xl" />
            <Shimmer className="h-[260px] rounded-3xl" />
        </div>
    );
}
