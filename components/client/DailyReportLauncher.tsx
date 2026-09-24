"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowRight, ChevronLeft, ChevronRight, FileBarChart2, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DailyReportPanel } from "./DailyReportPanel";
import type { DailyInsight, DailyReport } from "@/lib/client/daily-report-types";

/**
 * "Rapport de la veille" on the client's main portal page.
 * From 7:30 (client's local time) a floating button appears above the support
 * bubble. The report is prefetched so the hint can say what happened and the
 * popup opens instantly. The popup browses working days (◀ ▶) and shows an AI
 * summary (lib/client/daily-report + /api/client/daily-report/insight).
 */

const SHOW_FROM_MINUTES = 7 * 60 + 30;
const SEEN_KEY = "cp_daily_report_seen";
const HINT_DISMISSED_KEY = "cp_daily_report_hint_dismissed";
const INSIGHT_CACHE_PREFIX = "cp_daily_report_insight:";
const MAX_BACK_WORKING_DAYS = 20;

// ─── Local-day helpers (YYYY-MM-DD in the browser's timezone) ────────────────

const toKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromKey = (k: string) => {
    const [y, m, d] = k.split("-").map(Number);
    return new Date(y, m - 1, d);
};
const shiftKey = (k: string, n: number) => {
    const d = fromKey(k);
    d.setDate(d.getDate() + n);
    return toKey(d);
};
const isWeekendKey = (k: string) => [0, 6].includes(fromKey(k).getDay());
/** Nearest working day strictly before `k` (Monday → Friday). */
function previousWorkingDay(k: string): string {
    let d = shiftKey(k, -1);
    while (isWeekendKey(d)) d = shiftKey(d, -1);
    return d;
}
function nextWorkingDay(k: string): string {
    let d = shiftKey(k, 1);
    while (isWeekendKey(d)) d = shiftKey(d, 1);
    return d;
}
const readStore = (store: Storage | undefined, key: string) => {
    try { return store?.getItem(key) ?? null; } catch { return null; }
};
const writeStore = (store: Storage | undefined, key: string, value: string) => {
    try { store?.setItem(key, value); } catch { /* storage unavailable */ }
};

type Load<T> = { status: "idle" | "loading" | "done" | "error"; data?: T };

export function DailyReportLauncher() {
    const { data: session } = useSession();
    const [available, setAvailable] = useState(false);
    const [phase, setPhase] = useState<"closed" | "open" | "closing">("closed");
    const [unseen, setUnseen] = useState(false);
    const [hintVisible, setHintVisible] = useState(false);
    const [today] = useState(() => toKey(new Date()));
    const defaultDay = previousWorkingDay(today);
    const [day, setDay] = useState(defaultDay);
    const [reports, setReports] = useState<Record<string, Load<DailyReport>>>({});
    const [insights, setInsights] = useState<Record<string, Load<DailyInsight>>>({});
    const launcherRef = useRef<HTMLButtonElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);

    const queryFor = useCallback(
        (d: string) => new URLSearchParams({ day: d, today, tz: String(new Date().getTimezoneOffset()) }).toString(),
        [today]
    );

    const loadReport = useCallback(async (d: string) => {
        setReports((prev) => ({ ...prev, [d]: { status: "loading", data: prev[d]?.data } }));
        try {
            const res = await fetch(`/api/client/daily-report?${queryFor(d)}`, { cache: "no-store" });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error();
            setReports((prev) => ({ ...prev, [d]: { status: "done", data: json.data } }));
        } catch {
            setReports((prev) => ({ ...prev, [d]: { status: "error" } }));
        }
    }, [queryFor]);

    const loadInsight = useCallback(async (d: string) => {
        const cacheKey = `${INSIGHT_CACHE_PREFIX}${d}:${today}`;
        const cached = readStore(typeof window !== "undefined" ? sessionStorage : undefined, cacheKey);
        if (cached) {
            try {
                setInsights((prev) => ({ ...prev, [d]: { status: "done", data: JSON.parse(cached) } }));
                return;
            } catch { /* corrupted cache: refetch */ }
        }
        setInsights((prev) => ({ ...prev, [d]: { status: "loading" } }));
        try {
            const res = await fetch(`/api/client/daily-report/insight?${queryFor(d)}`, { cache: "no-store" });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error();
            writeStore(sessionStorage, cacheKey, JSON.stringify(json.data));
            setInsights((prev) => ({ ...prev, [d]: { status: "done", data: json.data } }));
        } catch {
            setInsights((prev) => ({ ...prev, [d]: { status: "error" } }));
        }
    }, [queryFor, today]);

    // Reveal at 7:30 — immediately if already past, otherwise when the clock gets there.
    useEffect(() => {
        const now = new Date();
        const reveal = () => {
            setAvailable(true);
            setUnseen(readStore(localStorage, SEEN_KEY) !== today);
            setHintVisible(readStore(localStorage, HINT_DISMISSED_KEY) !== today);
            void loadReport(defaultDay); // prefetch: instant popup + informative hint
        };
        const wait = (SHOW_FROM_MINUTES - (now.getHours() * 60 + now.getMinutes())) * 60_000 - now.getSeconds() * 1000;
        if (wait <= 0) {
            reveal();
            return;
        }
        const t = window.setTimeout(reveal, wait);
        return () => window.clearTimeout(t);
        // Runs once per mount; `today` and `defaultDay` are fixed for the page's life.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const open = () => {
        setPhase("open");
        setUnseen(false);
        setHintVisible(false);
        writeStore(localStorage, SEEN_KEY, today);
        setDay(defaultDay);
        if (!reports[defaultDay] || reports[defaultDay].status === "error") void loadReport(defaultDay);
        if (!insights[defaultDay]) void loadInsight(defaultDay);
    };

    const close = useCallback(() => {
        setPhase("closing");
        const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        window.setTimeout(() => {
            setPhase("closed");
            launcherRef.current?.focus();
        }, reduce ? 0 : 220);
    }, []);

    const goTo = (d: string) => {
        setDay(d);
        if (!reports[d]) void loadReport(d);
        if (!insights[d]) void loadInsight(d);
    };

    useEffect(() => {
        if (phase !== "open") return;
        dialogRef.current?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") close();
        };
        document.addEventListener("keydown", onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [phase, close]);

    if (!available) return null;

    const firstName = session?.user?.name?.split(" ")[0] ?? "";
    const current = reports[day];
    const report = current?.data ?? null;
    const insightState = insights[day];
    const prefetched = reports[defaultDay]?.data;
    const oldestDay = (() => {
        let d = defaultDay;
        for (let i = 0; i < MAX_BACK_WORKING_DAYS; i++) d = previousWorkingDay(d);
        return d;
    })();
    const canGoBack = day > oldestDay;
    const canGoForward = day < defaultDay;
    const dayLabel = fromKey(day).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    const isYesterdayReport = day === defaultDay;

    const hintText = prefetched
        ? prefetched.totals.meetings > 0
            ? `${prefetched.totals.meetings} nouveau${prefetched.totals.meetings > 1 ? "x" : ""} RDV hier`
            : prefetched.totals.calls > 0
                ? `${prefetched.totals.calls} appels passés hier`
                : "Votre rapport d'hier est prêt"
        : "Votre rapport d'hier est prêt";

    return (
        <>
            <style>{`
                @keyframes cpDrFloat { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
                @keyframes cpDrPanelIn { from { opacity: 0; transform: translateY(18px) scale(.96) } to { opacity: 1; transform: none } }
                @keyframes cpDrPanelOut { from { opacity: 1; transform: none } to { opacity: 0; transform: translateY(12px) scale(.97) } }
                @keyframes cpDrFadeIn { from { opacity: 0 } to { opacity: 1 } }
                @keyframes cpDrFadeOut { from { opacity: 1 } to { opacity: 0 } }
                @keyframes cpDrHint { from { opacity: 0; transform: translateX(10px) } to { opacity: 1; transform: none } }
                @keyframes cpDrIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
                @keyframes cpDrWord { from { opacity: 0; filter: blur(3px) } to { opacity: 1; filter: none } }
                @keyframes cpDrGrow { from { transform: scaleY(0) } to { transform: scaleY(1) } }
                @keyframes cpDrShimmer { from { background-position: -200px 0 } to { background-position: 200px 0 } }
                .cp-dr-shimmer { background: linear-gradient(90deg,#F1F2F8 0%,#E6E8F2 50%,#F1F2F8 100%); background-size: 400px 100%; animation: cpDrShimmer 1.2s linear infinite; }
                @media (prefers-reduced-motion: reduce) {
                    .cp-dr-anim, .cp-dr-shimmer { animation: none !important; }
                }
            `}</style>

            {/* Floating launcher — just above the support bubble (bottom-right, 24px). */}
            {phase === "closed" && (
                <div className="fixed right-6 bottom-[96px] z-[90] flex items-center gap-2">
                    {hintVisible && (
                        <div
                            className="cp-dr-anim hidden sm:flex items-center gap-1 rounded-full bg-white py-1 pl-3 pr-1 shadow-lg ring-1 ring-[#E4E6EF]"
                            style={{ animation: "cpDrHint .45s .2s ease-out both" }}
                        >
                            <button type="button" onClick={open} className="text-[12.5px] font-medium text-[#27355F]">
                                {hintText}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setHintVisible(false);
                                    writeStore(localStorage, HINT_DISMISSED_KEY, today);
                                }}
                                aria-label="Masquer ce message pour aujourd'hui"
                                className="rounded-full p-1 text-[#A3A8BD] hover:bg-[#F1F2F8] hover:text-[#4A5070]"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </div>
                    )}
                    <button
                        ref={launcherRef}
                        type="button"
                        onClick={open}
                        aria-label="Ouvrir le rapport de la veille"
                        title="Rapport de la veille"
                        className="cp-dr-anim group relative flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#27355F] text-white shadow-[0_10px_30px_-8px_rgba(39,53,95,0.6)] transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#27355F]/25"
                        style={{ animation: "cpDrFloat 3.4s ease-in-out infinite" }}
                    >
                        <FileBarChart2 className="h-5 w-5 transition-transform group-hover:rotate-[-6deg]" />
                        {unseen && (
                            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5">
                                <span className="cp-dr-anim absolute inline-flex h-full w-full animate-ping rounded-full bg-[#C44E8A] opacity-60" />
                                <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-[#C44E8A] ring-2 ring-white" />
                            </span>
                        )}
                    </button>
                </div>
            )}

            {phase !== "closed" && (
                <div className="fixed inset-0 z-[150] flex items-end justify-center p-0 sm:items-center sm:justify-end sm:p-6">
                    <div
                        aria-hidden="true"
                        onClick={close}
                        className="cp-dr-anim absolute inset-0 bg-[#1A1D2E]/25 backdrop-blur-[2px]"
                        style={{ animation: `${phase === "closing" ? "cpDrFadeOut" : "cpDrFadeIn"} .22s ease-out both` }}
                    />
                    <div
                        ref={dialogRef}
                        tabIndex={-1}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="daily-report-title"
                        className="cp-dr-anim relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-[0_24px_60px_-12px_rgba(26,29,46,0.35)] outline-none sm:w-[460px] sm:rounded-2xl"
                        style={{
                            animation: `${phase === "closing" ? "cpDrPanelOut .22s ease-in" : "cpDrPanelIn .34s cubic-bezier(.16,1,.3,1)"} both`,
                            transformOrigin: "bottom right",
                        }}
                    >
                        {/* Header */}
                        <div className="relative shrink-0 overflow-hidden bg-[#27355F] px-5 pb-4 pt-5 text-white">
                            <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-[#C44E8A]/35 blur-2xl" />
                            <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 left-10 h-40 w-40 rounded-full bg-[#5A6FB8]/30 blur-2xl" />
                            <button
                                type="button"
                                onClick={close}
                                aria-label="Fermer le rapport"
                                className="absolute right-3 top-3 rounded-lg p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"
                            >
                                <X className="h-4 w-4" />
                            </button>
                            <p className="relative text-[11px] font-medium uppercase tracking-[0.08em] text-white/60">Rapport quotidien</p>
                            <h2 id="daily-report-title" className="relative mt-1 text-[19px] font-semibold">
                                Bonjour{firstName ? ` ${firstName}` : ""} 👋
                            </h2>
                            <div className="relative mt-3 flex items-center justify-between gap-2 rounded-xl bg-white/10 px-1.5 py-1">
                                <button
                                    type="button"
                                    onClick={() => goTo(previousWorkingDay(day))}
                                    disabled={!canGoBack}
                                    aria-label="Jour ouvré précédent"
                                    className="rounded-lg p-1.5 text-white/80 transition hover:bg-white/10 disabled:opacity-30"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                                <div className="min-w-0 text-center" aria-live="polite">
                                    <div className="truncate text-[13px] font-medium capitalize">{dayLabel}</div>
                                    <div className="text-[10.5px] text-white/60">{isYesterdayReport ? "Dernier jour ouvré" : "Historique"}</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => goTo(nextWorkingDay(day))}
                                    disabled={!canGoForward}
                                    aria-label="Jour ouvré suivant"
                                    className="rounded-lg p-1.5 text-white/80 transition hover:bg-white/10 disabled:opacity-30"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="min-h-[240px] flex-1 overflow-y-auto">
                            {report ? (
                                <div key={day} className={cn("transition-opacity", current?.status === "loading" && "opacity-60")}>
                                    <DailyReportPanel
                                        report={report}
                                        insight={insightState?.data ?? null}
                                        insightLoading={insightState?.status === "loading"}
                                    />
                                </div>
                            ) : current?.status === "error" ? (
                                <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
                                    <p className="text-[13px] text-[#4A5070]">Impossible de charger ce rapport.</p>
                                    <button
                                        type="button"
                                        onClick={() => void loadReport(day)}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#E4E6EF] px-3 py-1.5 text-[12.5px] font-medium text-[#1A1D2E] hover:bg-[#F6F7FB]"
                                    >
                                        <RefreshCw className="h-3.5 w-3.5" /> Réessayer
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-3 px-5 py-5" aria-label="Chargement du rapport">
                                    <div className="h-24 rounded-xl cp-dr-shimmer" />
                                    <div className="grid grid-cols-2 gap-2.5">
                                        {Array.from({ length: 4 }).map((_, i) => (
                                            <div key={i} className="h-[86px] rounded-xl cp-dr-shimmer" />
                                        ))}
                                    </div>
                                    <div className="h-32 rounded-xl cp-dr-shimmer" />
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[#EEF0F6] px-5 py-3">
                            <Link href="/client/portal/meetings" onClick={close} className="text-[12.5px] font-medium text-[#5B6180] hover:text-[#1A1D2E]">
                                Tous les rendez-vous
                            </Link>
                            <Link
                                href="/client/portal/reporting"
                                onClick={close}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-[#27355F] px-3 py-1.5 text-[12.5px] font-medium text-white transition hover:bg-[#1E2A4D]"
                            >
                                Rapport complet <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
