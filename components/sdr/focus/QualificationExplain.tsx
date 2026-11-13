"use client";

// ============================================
// QUALIFICATION — the « why this prospect, why now » chip (Mode Focus, File
// d'actions). The chip reads like a sentence (« Priorité haute · Rappel demandé
// hier »); a click opens the explanation: every reason with its weight and
// source, what is known (and whether a person verified it), what is not.
// Nothing here is computed on the client: it renders lib/qualification's view.
// ============================================

import { useEffect, useId, useRef, useState } from "react";
import { CircleHelp, Phone, ShieldAlert, Sparkles, Target, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { QualificationState, QualificationView, Reason } from "@/lib/qualification/types";

const TONE: Record<QualificationState, string> = {
    PRIORITAIRE: "border-primary/25 bg-primary/10 text-primary",
    A_RELANCER: "border-warning/30 bg-warning-soft text-warning-ink",
    PRET_A_APPELER: "border-success/30 bg-success-soft text-success-ink",
    A_QUALIFIER: "border-line bg-surface-2 text-ink-2",
    EN_COURS: "border-line bg-surface-2 text-ink-2",
    QUALIFIE: "border-accent-200 bg-accent-50 text-accent-700",
    RDV_PRIS: "border-success/30 bg-success-soft text-success-ink",
    NON_PERTINENT: "border-danger/25 bg-danger-soft text-danger-ink",
};

const SOURCE: Record<Reason["source"], { icon: typeof User; label: string }> = {
    sdr: { icon: User, label: "Saisi par un SDR" },
    crm: { icon: Phone, label: "Donnée CRM" },
    ai: { icon: Sparkles, label: "Entendu en appel (IA, avec citation)" },
    targeting: { icon: Target, label: "Ciblage de la mission" },
};

export function QualificationExplain({ q, compact = false }: { q: QualificationView; compact?: boolean }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const panelId = useId();
    const warn = q.blockers.some((b) => b.startsWith("Opposition"));

    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
        const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
        document.addEventListener("mousedown", close);
        document.addEventListener("keydown", esc);
        return () => {
            document.removeEventListener("mousedown", close);
            document.removeEventListener("keydown", esc);
        };
    }, [open]);

    const weighted = q.reasons.filter((r) => r.points !== 0);
    const notes = q.reasons.filter((r) => r.points === 0);

    return (
        <div ref={ref} className="relative inline-flex min-w-0">
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    setOpen((v) => !v);
                }}
                aria-expanded={open}
                aria-controls={panelId}
                title="Pourquoi ce prospect ?"
                className={cn(
                    "inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border font-medium transition-colors hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                    compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-[11.5px]",
                    TONE[q.state],
                )}
            >
                {warn && <ShieldAlert className="h-3 w-3 shrink-0" aria-hidden />}
                <span className="truncate">{q.headline}</span>
                {!compact && <span className="tabular-nums opacity-70">{q.score}</span>}
            </button>

            {open && (
                <div
                    id={panelId}
                    role="dialog"
                    aria-label="Pourquoi ce prospect"
                    onClick={(e) => e.stopPropagation()}
                    className="cp-pop absolute left-0 top-[calc(100%+6px)] z-50 w-[min(360px,calc(100vw-32px))] rounded-[16px] border border-line bg-surface p-4 text-left text-ink shadow-overlay"
                >
                    <div className="flex items-baseline justify-between gap-3">
                        <p className="text-[13px] font-semibold">{q.stateLabel}</p>
                        <p className="text-[12px] tabular-nums text-ink-3">
                            Score <span className="text-[15px] font-semibold text-ink">{q.score}</span>/100
                        </p>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                        <div className={cn("h-full rounded-full", q.tier === "haute" ? "bg-primary" : q.tier === "normale" ? "bg-accent" : "bg-ink-4")} style={{ width: `${q.score}%` }} />
                    </div>

                    {q.blockers.length > 0 && (
                        <ul className="mt-3 space-y-1">
                            {q.blockers.map((b) => (
                                <li key={b} className="flex items-start gap-1.5 rounded-control bg-warning-soft px-2 py-1.5 text-[12px] text-warning-ink">
                                    <ShieldAlert className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden /> {b}
                                </li>
                            ))}
                        </ul>
                    )}

                    {weighted.length > 0 && (
                        <ul className="mt-3 space-y-1.5">
                            {weighted.map((r) => {
                                const S = SOURCE[r.source];
                                return (
                                    <li key={r.code} className="flex items-start gap-2 text-[12.5px]">
                                        <S.icon className="mt-[2px] h-3.5 w-3.5 shrink-0 text-ink-4" aria-label={S.label} />
                                        <span className="min-w-0 flex-1">
                                            {r.label}
                                            {r.evidence && <span className="block truncate text-[11.5px] italic text-ink-3">« {r.evidence} »</span>}
                                        </span>
                                        <span className={cn("shrink-0 tabular-nums font-medium", r.points > 0 ? "text-success-ink" : "text-danger-ink")}>
                                            {r.points > 0 ? "+" : ""}
                                            {r.points}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}

                    {q.known.length > 0 && (
                        <div className="mt-3 border-t border-line-subtle pt-3">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-4">Ce que l&apos;on sait</p>
                            <ul className="mt-1.5 space-y-1">
                                {q.known.map((k, i) => (
                                    <li key={`${k.label}-${i}`} className="flex items-start gap-2 text-[12.5px]">
                                        <span className="w-20 shrink-0 text-ink-3">{k.label}</span>
                                        <span className="min-w-0 flex-1">{k.value}</span>
                                        <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold", k.verified ? "bg-success-soft text-success-ink" : "bg-accent-50 text-accent-700")}>
                                            {k.verified ? "Vérifié" : "IA · à vérifier"}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {q.unverified.length > 0 && (
                        <div className="mt-3 border-t border-line-subtle pt-3">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-4">À découvrir pendant l&apos;appel</p>
                            <ul className="mt-1.5 flex flex-wrap gap-1.5">
                                {q.unverified.map((u) => (
                                    <li key={u} className="flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11.5px] text-ink-2">
                                        <CircleHelp className="h-3 w-3 text-ink-4" aria-hidden /> {u}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {notes.length > 0 && <p className="mt-3 text-[11px] text-ink-4">{notes.map((n) => n.label).join(" · ")}</p>}
                </div>
            )}
        </div>
    );
}
