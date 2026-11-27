"use client";

// The four hand-built charts of the client letter. Pure views over the
// payload of GET /api/client/letter: no fetching, no counting.
// Colour: the accent is kept for confirmed RDV; everything else is primary
// or neutral, told apart by lightness as well as hue.

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/missions/pulse";
import type { ClientLetter, Disposition } from "@/lib/client-portal/letter";
import { DEFINED, Definition } from "./Definition";

const fr = (n: number) => n.toLocaleString("fr-FR");

export const HATCH: CSSProperties = {
    backgroundImage: "repeating-linear-gradient(45deg, var(--brand-neutral-300) 0 1.5px, var(--brand-neutral-100) 1.5px 6px)",
};

// ── De votre cible aux rendez-vous ────────────────────────────────────────

const FUNNEL_FILL: Record<string, string> = {
    base: "bg-primary-200",
    called: "bg-primary-300",
    reached: "bg-primary-400",
    interested: "bg-primary-600",
    confirmed: "bg-accent",
    held: "bg-accent-700",
};

export function FunnelChart({ steps }: { steps: ClientLetter["funnel"] }) {
    const top = Math.max(steps[0]?.count ?? 0, ...steps.map((s) => s.count), 1);
    return (
        <ol className="space-y-2.5">
            {steps.map((s) => (
                <li key={s.key}>
                    <Definition text={s.definition} className="rounded-lg">
                        <div className="grid grid-cols-[minmax(0,1fr)_auto_3.25rem] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[8.5rem_minmax(0,1fr)_4.5rem_3.25rem]">
                            <span className={cn("truncate text-sm text-ink-2", DEFINED)}>{s.label}</span>
                            <div className="order-last col-span-3 h-5 rounded-r-md bg-surface-3 sm:order-none sm:col-span-1 sm:h-6" aria-hidden>
                                <div className={cn("h-full min-w-[4px] rounded-r-md", FUNNEL_FILL[s.key])} style={{ width: `${Math.min(100, (s.count / top) * 100)}%` }} />
                            </div>
                            <span className="text-right font-mono text-sm tabular-nums text-ink">{fr(s.count)}</span>
                            <span className="text-right font-mono text-xs tabular-nums text-ink-3">{s.rate === null ? "" : formatPercent(s.rate)}</span>
                        </div>
                    </Definition>
                </li>
            ))}
        </ol>
    );
}

// ── Ce que sont devenus les contactés ─────────────────────────────────────

const DISPOSITION_FILL: Record<Disposition, { className?: string; style?: CSSProperties }> = {
    rdv: { className: "bg-accent" },
    interested: { className: "bg-primary-600" },
    callback: { className: "bg-primary-300" },
    refusal: { className: "bg-ink-3" },
    offTarget: { className: "bg-line-strong" },
    notReached: { style: HATCH },
};

export function DispositionChart({ items, total }: { items: ClientLetter["dispositions"]; total: number }) {
    const shown = items.filter((d) => d.count > 0);
    return (
        <div className="space-y-4">
            <div
                role="img"
                aria-label={`Statut actuel des ${fr(total)} décideurs contactés : ${items.map((d) => `${d.label} ${d.count}`).join(", ")}`}
                className="flex h-9 gap-[3px] overflow-hidden rounded-lg bg-surface-3"
            >
                {shown.map((d) => (
                    <div
                        key={d.key}
                        title={`${d.label} : ${fr(d.count)}`}
                        className={cn("h-full min-w-[3px]", DISPOSITION_FILL[d.key].className)}
                        style={{ flex: `${d.count} 1 0`, ...DISPOSITION_FILL[d.key].style }}
                    />
                ))}
            </div>
            <ul className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                {items.map((d) => (
                    <li key={d.key}>
                        <Definition text={d.definition} placement="above" className="rounded-md">
                            <div className="flex items-center justify-between gap-3 border-t border-line-subtle py-2 text-sm">
                                <span className="flex min-w-0 items-center gap-2 text-ink-2">
                                    <span className={cn("h-3 w-3 shrink-0 rounded-[3px]", DISPOSITION_FILL[d.key].className)} style={DISPOSITION_FILL[d.key].style} aria-hidden />
                                    <span className={cn("truncate", DEFINED)}>{d.label}</span>
                                </span>
                                <span className="font-mono tabular-nums text-ink">
                                    {fr(d.count)}
                                    <span className="ml-2 text-xs text-ink-3">{total ? formatPercent(d.count / total) : ""}</span>
                                </span>
                            </div>
                        </Definition>
                    </li>
                ))}
            </ul>
        </div>
    );
}

// ── RDV confirmés par semaine ─────────────────────────────────────────────

const weekDay = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });

export function WeeklyChart({ weeks, letterWeekStart }: { weeks: ClientLetter["weeks"]; letterWeekStart: string }) {
    const max = Math.max(1, ...weeks.map((w) => w.count));
    const dense = weeks.length > 8;
    const letterAt = Date.parse(letterWeekStart);
    return (
        <div>
            <div
                role="img"
                aria-label={`RDV confirmés par semaine : ${weeks.map((w) => `${w.current ? "semaine en cours" : `semaine du ${weekDay.format(new Date(w.start))}`} ${w.count}`).join(", ")}`}
                className="flex h-44 items-end gap-1.5 border-b border-line pt-6 sm:gap-2.5"
            >
                {weeks.map((w) => {
                    const isLetter = Date.parse(w.start) === letterAt;
                    return (
                        <div key={w.start} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                            <span className={cn("font-mono text-xs tabular-nums", w.count ? "text-ink" : "text-ink-4")}>{w.count}</span>
                            <div
                                className={cn(
                                    "w-full max-w-12 rounded-t-md",
                                    w.current ? "border border-b-0 border-accent bg-accent-soft" : isLetter ? "bg-accent" : "bg-primary-300",
                                )}
                                style={{ height: `${Math.max(w.count ? 6 : 2, (w.count / max) * 120)}px` }}
                            />
                        </div>
                    );
                })}
            </div>
            <div className="mt-1.5 flex gap-1.5 font-mono text-[11px] text-ink-3 sm:gap-2.5">
                {weeks.map((w, i) => (
                    <span key={w.start} className="min-w-0 flex-1 truncate text-center">
                        {w.current ? "en cours" : dense && (weeks.length - 1 - i) % 2 === 1 ? "" : weekDay.format(new Date(w.start))}
                    </span>
                ))}
            </div>
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-accent" aria-hidden />Semaine de la lettre</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-accent bg-accent-soft" aria-hidden />Semaine en cours, en direct</span>
            </p>
        </div>
    );
}

// ── Ce que le marché vous dit ─────────────────────────────────────────────

export function ReasonsChart({ refusals }: { refusals: ClientLetter["refusals"] }) {
    const top = Math.max(...refusals.reasons.map((r) => r.share), 0.0001);
    return (
        <ul className="space-y-3.5">
            {refusals.reasons.map((r) => (
                <li key={r.label} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 text-ink-2">{r.label}</span>
                        <span className="shrink-0 font-mono tabular-nums text-ink">
                            {formatPercent(r.share)}
                            <span className="ml-2 text-xs text-ink-3">{fr(r.count)}</span>
                        </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-3" aria-hidden>
                        <div className="h-full rounded-full bg-ink-3" style={{ width: `${(r.share / top) * 100}%` }} />
                    </div>
                </li>
            ))}
        </ul>
    );
}
