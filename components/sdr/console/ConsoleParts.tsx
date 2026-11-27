"use client";

import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { Kbd } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { JournalRow } from "@/lib/calls-journal/types";
import type { QueuePreviewRow } from "./useFocusConsole";

const PRIORITY_SHORT: Record<string, { label: string; tone: string }> = {
    ABSENT_RDV: { label: "RDV à recaler", tone: "text-danger-ink" },
    CALLBACK: { label: "Rappel", tone: "text-warning-ink" },
    FOLLOW_UP: { label: "Relance", tone: "text-info-ink" },
    NEW: { label: "Nouveau", tone: "text-ink-3" },
    RETRY: { label: "Nouvelle tentative", tone: "text-ink-3" },
};

function hm(iso: string): string {
    return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
}

function duration(sec: number | null): string | null {
    if (!sec || sec <= 0) return null;
    return `${Math.floor(sec / 60)} min ${String(sec % 60).padStart(2, "0")}`;
}

/**
 * A call placed from the integrated phone that still has no result. It stays
 * invisible to the manager and the client until it is qualified, so the Focus
 * mode holds its automatic call until it is.
 */
export function UnqualifiedBanner({ call, count, onQualify }: { call: JournalRow; count: number; onQualify: () => void }) {
    const who = call.contact?.name || call.company?.name || "un prospect";
    const len = duration(call.durationSec);
    return (
        <div role="status" className="cp-pop flex flex-wrap items-center gap-x-3 gap-y-2 rounded-panel border border-danger-line bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger-ink">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            <p className="min-w-0 flex-1">
                <span className="font-semibold">Appel de {hm(call.at)} sans résultat</span>
                {` · ${who}`}
                {call.company && call.contact ? ` (${call.company.name})` : ""}
                {len ? ` · ${len}` : ""}
                {count > 1 ? ` · ${count - 1} autre${count > 2 ? "s" : ""} en attente` : ""}
                <span className="block text-[12px] text-danger-ink/80">Le manager et le client ne le voient pas tant qu’il n’est pas qualifié. L’appel automatique attend.</span>
            </p>
            <button
                type="button"
                onClick={onQualify}
                className="cp-press inline-flex h-8 shrink-0 items-center gap-2 rounded-control bg-danger px-3 text-[12.5px] font-semibold text-white hover:brightness-110"
            >
                Qualifier <Kbd className="border-white/30 bg-white/10 text-white">Q</Kbd>
            </button>
        </div>
    );
}

function rowName(r: QueuePreviewRow): string {
    const name = r.contact ? [r.contact.firstName, r.contact.lastName].filter(Boolean).join(" ").trim() : "";
    return name || r.company.name;
}

/** The next prospects the queue will serve, so the SDR sees what is coming. */
export function UpNextList({ rows, loading }: { rows: QueuePreviewRow[]; loading: boolean }) {
    return (
        <div className="hidden min-h-0 flex-col lg:flex">
            <p className="px-4 pb-1.5 pt-3 text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">Ensuite</p>
            {loading ? (
                <div className="space-y-1.5 px-4 pb-2">
                    {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="cp-shimmer h-8 rounded-control" />
                    ))}
                </div>
            ) : rows.length === 0 ? (
                <p className="px-4 pb-2 text-[12px] text-ink-3">Rien d’autre en file.</p>
            ) : (
                <ol className="space-y-0.5 px-2 pb-2">
                    {rows.map((r) => {
                        const p = PRIORITY_SHORT[r.priority] ?? PRIORITY_SHORT.NEW;
                        return (
                            <li key={`${r.contact?.id ?? ""}|${r.company.id}`} className="rounded-control px-2 py-1.5">
                                <p className="truncate text-[12.5px] font-medium text-ink">{rowName(r)}</p>
                                <p className="truncate text-[11.5px] text-ink-3">
                                    {r.contact ? `${r.company.name} · ` : ""}
                                    <span className={p.tone}>{p.label}</span>
                                </p>
                            </li>
                        );
                    })}
                </ol>
            )}
        </div>
    );
}

/** ‹ Mission › — switch without going back to the launch screen. */
export function MissionSwitcher({
    name,
    canSwitch,
    disabled,
    onPrev,
    onNext,
    onOpen,
}: {
    name: string;
    canSwitch: boolean;
    disabled: boolean;
    onPrev: () => void;
    onNext: () => void;
    /** The name itself opens the launch screen (every mission, the calling mode). */
    onOpen: () => void;
}) {
    return (
        <div className="flex min-w-0 items-center gap-0.5">
            {canSwitch && (
                <button
                    type="button"
                    onClick={onPrev}
                    disabled={disabled}
                    aria-label="Mission précédente ([)"
                    title="Mission précédente ( [ )"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-control text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-40"
                >
                    <ChevronLeft className="h-3.5 w-3.5" />
                </button>
            )}
            <button
                type="button"
                onClick={onOpen}
                disabled={disabled}
                title="Changer de mission ou de mode"
                className={cn("min-w-0 truncate rounded-control text-left text-[12px] text-ink-3 hover:text-ink disabled:opacity-40", canSwitch && "px-0.5")}
            >
                {name}
            </button>
            {canSwitch && (
                <button
                    type="button"
                    onClick={onNext}
                    disabled={disabled}
                    aria-label="Mission suivante (])"
                    title="Mission suivante ( ] )"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-control text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-40"
                >
                    <ChevronRight className="h-3.5 w-3.5" />
                </button>
            )}
        </div>
    );
}
