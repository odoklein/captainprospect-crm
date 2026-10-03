"use client";

import { useEffect, useMemo, useState } from "react";
import { Phone, PhoneCall, PhoneOff, Loader2, CheckCircle2, Search, Copy } from "lucide-react";
import { Modal, Button, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";

export interface AlloCallPickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    loading: boolean;
    /** Réponses brutes API (champs variables selon WithAllo) */
    calls: unknown[];
    filterPhone: string;
    alloLineCount: number | null;
    selectedId: string | null;
    onSelectId: (id: string) => void;
    onConfirm: () => void;
}

function stripPhoneSpaces(s: string): string {
    return s.replace(/\s+/g, "");
}

function contactPhoneVariantsForUi(raw: string): string[] {
    const v: string[] = [raw];
    if (raw.startsWith("+33")) v.push("0" + raw.slice(3));
    if (raw.startsWith("+")) v.push(raw.slice(1));
    return [...new Set(v.map(stripPhoneSpaces))];
}

function sideMatchesContact(side: string, variants: string[]): boolean {
    const n = stripPhoneSpaces(side).toLowerCase();
    if (!n) return false;
    return variants.some((v) => {
        const q = v.toLowerCase();
        if (!q) return false;
        return n.includes(q) || q.includes(n);
    });
}

function parisCalendarDayKey(d: Date): string {
    return d.toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
}

function parisDayKeyNow(): string {
    return parisCalendarDayKey(new Date());
}

function parisDayKeyYesterday(): string {
    return new Date(Date.now() - 86400000).toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
}

function formatParisDateTime(d: Date): string {
    return d.toLocaleString("fr-FR", {
        timeZone: "Europe/Paris",
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function labelForParisDayKey(key: string): string {
    const t = parisDayKeyNow();
    const y = parisDayKeyYesterday();
    if (key === t) return "Aujourd’hui";
    if (key === y) return "Hier";
    if (key === "unknown") return "Date inconnue";
    const [year, month, day] = key.split("-").map(Number);
    if (!year || !month || !day) return key;
    const d = new Date(Date.UTC(year, month - 1, day));
    return d.toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    });
}

type NormalizedAlloCall = {
    id: string;
    displayFrom: string;
    displayTo: string;
    duration: number;
    direction: "INBOUND" | "OUTBOUND";
    outcome?: string;
    summaryText: string;
    transcriptPreview: string | null;
    startedAt: Date | null;
    parisDay: string | null;
};

function normalizeAlloCallForModal(raw: unknown): NormalizedAlloCall | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const id = r.id != null ? String(r.id) : "";
    if (!id) return null;
    const displayFrom = String(r.from ?? r.from_number ?? "");
    const displayTo = String(r.to ?? r.to_number ?? "");
    const summaryRaw =
        typeof r.summary === "string"
            ? r.summary
            : typeof r.call_summary === "string"
              ? r.call_summary
              : "";
    const summaryText = summaryRaw.trim();
    const ts = r.start_time ?? r.start_date ?? r.created_at;
    let startedAt: Date | null = null;
    if (ts != null && ts !== "") {
        if (typeof ts === "number") {
            startedAt = new Date(ts > 1e12 ? ts : ts * 1000);
        } else {
            startedAt = new Date(String(ts));
        }
        if (Number.isNaN(startedAt.getTime())) startedAt = null;
    }
    const transcript = Array.isArray(r.transcript)
        ? (r.transcript as Array<{ source?: string; text?: string }>)
        : [];
    let transcriptPreview: string | null = null;
    if (transcript.length > 0) {
        const first = transcript
            .map((e) => (typeof e.text === "string" ? e.text.trim() : ""))
            .find(Boolean);
        transcriptPreview = first ?? null;
    } else if (typeof r.transcription === "string" && r.transcription.trim()) {
        transcriptPreview = r.transcription.trim();
    }
    const dir = String(r.direction ?? r.type ?? "OUTBOUND").toUpperCase();
    const duration =
        typeof r.duration === "number"
            ? r.duration
            : typeof r.length_in_minutes === "number"
              ? Math.round(r.length_in_minutes * 60)
              : 0;
    return {
        id,
        displayFrom,
        displayTo,
        duration,
        direction: dir === "INBOUND" ? "INBOUND" : "OUTBOUND",
        outcome: typeof r.outcome === "string" ? r.outcome : undefined,
        summaryText,
        transcriptPreview,
        startedAt,
        parisDay: startedAt ? parisCalendarDayKey(startedAt) : null,
    };
}

export function AlloCallPickerModal({
    isOpen,
    onClose,
    loading,
    calls,
    filterPhone,
    alloLineCount,
    selectedId,
    onSelectId,
    onConfirm,
}: AlloCallPickerModalProps) {
    const { success, error: showError } = useToast();
    const [search, setSearch] = useState("");
    const [dayQuickFilter, setDayQuickFilter] = useState<"all" | "today" | "yesterday">("all");

    useEffect(() => {
        if (!isOpen) {
            setSearch("");
            setDayQuickFilter("all");
        }
    }, [isOpen]);

    const contactVariants = useMemo(
        () => (filterPhone ? contactPhoneVariantsForUi(filterPhone) : []),
        [filterPhone]
    );

    const normalizedCalls = useMemo(() => {
        const list: NormalizedAlloCall[] = [];
        for (const c of calls) {
            const n = normalizeAlloCallForModal(c);
            if (n) list.push(n);
        }
        return list;
    }, [calls]);

    const filteredCalls = useMemo(() => {
        const q = stripPhoneSpaces(search).toLowerCase();
        const todayK = parisDayKeyNow();
        const yestK = parisDayKeyYesterday();
        return normalizedCalls.filter((c) => {
            if (dayQuickFilter === "today" && c.parisDay !== todayK) return false;
            if (dayQuickFilter === "yesterday" && c.parisDay !== yestK) return false;
            if (!q) return true;
            const blob = [
                c.displayFrom,
                c.displayTo,
                c.summaryText,
                c.outcome ?? "",
                c.transcriptPreview ?? "",
                c.startedAt ? formatParisDateTime(c.startedAt) : "",
            ]
                .join(" ")
                .toLowerCase();
            return blob.includes(q);
        });
    }, [normalizedCalls, search, dayQuickFilter]);

    const groupedByDay = useMemo(() => {
        const map = new Map<string, NormalizedAlloCall[]>();
        for (const c of filteredCalls) {
            const key = c.parisDay ?? "unknown";
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(c);
        }
        const keys = [...map.keys()].filter((k) => k !== "unknown").sort((a, b) => b.localeCompare(a));
        const unknown = map.get("unknown");
        const orderedKeys = unknown?.length ? [...keys, "unknown"] : keys;
        return { orderedKeys, map };
    }, [filteredCalls]);

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Lier un appel Allo"
            description="Seuls les appels où le numéro du contact apparaît (émetteur ou destinataire) sont listés, sur vos lignes Allo configurées."
            size="md"
        >
            <div className="space-y-3 -mt-1">
                {!loading && normalizedCalls.length > 0 && (
                    <div className="rounded-xl border border-primary-100 bg-primary-50/70 p-3 shadow-sm">
                        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between">
                            <div className="space-y-0.5 min-w-0">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-primary-600">
                                    Numéro du contact utilisé pour le filtre
                                </p>
                                <p className="font-mono text-sm font-bold text-slate-900 tracking-tight break-all">
                                    {filterPhone || "—"}
                                </p>
                                <p className="text-xs text-slate-600 leading-snug max-w-prose">
                                    Correspondances sur les variantes (+33, 0…, sans indicatif). Fuseau horaire des groupes :{" "}
                                    <span className="font-semibold text-slate-800">Europe/Paris</span>
                                    {alloLineCount != null && alloLineCount > 0 && (
                                        <>
                                            {" "}
                                            ·{" "}
                                            <span className="font-semibold text-slate-800">
                                                {alloLineCount} ligne{alloLineCount > 1 ? "s" : ""} Allo
                                            </span>{" "}
                                            interrogée{alloLineCount > 1 ? "s" : ""}
                                        </>
                                    )}
                                    .
                                </p>
                            </div>
                            {filterPhone && (
                                <Button
                                    type="button"
                                    variant="secondary"
                                    className="shrink-0 gap-1.5 text-xs h-8"
                                    onClick={async () => {
                                        try {
                                            await navigator.clipboard.writeText(filterPhone);
                                            success("Copié", "Numéro copié dans le presse-papiers.");
                                        } catch {
                                            showError("Copie", "Impossible de copier le numéro.");
                                        }
                                    }}
                                >
                                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                                    Copier
                                </Button>
                            )}
                        </div>
                    </div>
                )}

                {!loading && normalizedCalls.length > 0 && (
                    <div className="space-y-1.5">
                        <label htmlFor="allo-call-search" className="sr-only">
                            Filtrer la liste des appels
                        </label>
                        <div className="relative">
                            <Search
                                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                                aria-hidden="true"
                            />
                            <input
                                id="allo-call-search"
                                type="search"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Filtrer par heure, numéro, résumé, statut…"
                                className="w-full pl-10 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400"
                            />
                        </div>
                        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer par jour">
                            {(
                                [
                                    { id: "all" as const, label: "Tous" },
                                    { id: "today" as const, label: "Aujourd’hui" },
                                    { id: "yesterday" as const, label: "Hier" },
                                ] as const
                            ).map((chip) => (
                                <button
                                    key={chip.id}
                                    type="button"
                                    onClick={() => setDayQuickFilter(chip.id)}
                                    className={cn(
                                        "text-[11px] font-semibold rounded-full px-2.5 py-1 border transition-all",
                                        dayQuickFilter === chip.id
                                            ? "bg-primary-600 text-white border-primary-600 shadow-sm"
                                            : "bg-white text-slate-600 border-slate-200 hover:border-primary-200 hover:bg-primary-50/50"
                                    )}
                                >
                                    {chip.label}
                                </button>
                            ))}
                        </div>
                        <p className="text-[10px] text-slate-500">
                            {filteredCalls.length} affiché{filteredCalls.length > 1 ? "s" : ""}
                            {normalizedCalls.length !== filteredCalls.length
                                ? ` sur ${normalizedCalls.length}`
                                : ""}{" "}
                            · horodatage affiché en heure de Paris
                        </p>
                    </div>
                )}

                <div className="space-y-3 max-h-[min(50vh,24rem)] overflow-y-auto pr-1 custom-scrollbar">
                    {loading ? (
                        <div className="flex items-center justify-center py-14">
                            <Loader2 className="w-6 h-6 animate-spin text-primary-500" aria-hidden="true" />
                            <span className="ml-3 text-sm text-slate-500">Chargement des appels Allo…</span>
                        </div>
                    ) : normalizedCalls.length === 0 ? (
                        <div className="text-center py-12 px-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50">
                            <PhoneOff className="w-10 h-10 text-slate-300 mx-auto mb-3" aria-hidden="true" />
                            <p className="text-sm font-semibold text-slate-700">Aucun appel trouvé</p>
                            <p className="text-xs text-slate-500 mt-1.5 max-w-md mx-auto leading-relaxed">
                                Aucun appel Allo récent ne contient le numéro{" "}
                                <span className="font-mono font-medium text-slate-700">{filterPhone || "…"}</span> sur
                                vos lignes. Vérifiez le numéro fiche contact ou la synchro Allo.
                            </p>
                        </div>
                    ) : filteredCalls.length === 0 ? (
                        <div className="text-center py-10 rounded-2xl border border-amber-100 bg-amber-50/40">
                            <p className="text-sm font-medium text-amber-900">Aucun appel ne correspond aux filtres</p>
                            <p className="text-xs text-amber-800/80 mt-1">Élargissez la recherche ou choisissez « Tous ».</p>
                        </div>
                    ) : (
                        groupedByDay.orderedKeys.map((dayKey) => {
                            const dayCalls = groupedByDay.map.get(dayKey) ?? [];
                            if (dayCalls.length === 0) return null;
                            return (
                                <section key={dayKey} className="space-y-1.5">
                                    <div className="flex items-center gap-2 sticky top-0 z-[1] bg-white/95 backdrop-blur-sm py-1 -mx-1 px-1">
                                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                            {dayKey === "unknown" ? "Date inconnue" : labelForParisDayKey(dayKey)}
                                        </span>
                                        <span className="text-[11px] font-medium text-slate-400 tabular-nums">
                                            ({dayCalls.length})
                                        </span>
                                    </div>
                                    <div className="space-y-1.5">
                                        {dayCalls.map((call) => {
                                            const durationMin = Math.floor(call.duration / 60);
                                            const durationSec = call.duration % 60;
                                            const isSelected = call.id === selectedId;
                                            const fromIsContact = sideMatchesContact(call.displayFrom, contactVariants);
                                            const toIsContact = sideMatchesContact(call.displayTo, contactVariants);
                                            return (
                                                <button
                                                    key={call.id}
                                                    type="button"
                                                    onClick={() => onSelectId(call.id)}
                                                    className={cn(
                                                        "w-full text-left rounded-xl border transition-all shadow-sm",
                                                        isSelected
                                                            ? "border-primary-500 bg-primary-50/80 ring-2 ring-primary-400/35 shadow-md"
                                                            : "border-slate-200 bg-white hover:border-primary-200 hover:shadow"
                                                    )}
                                                >
                                                    <div className="p-3 flex gap-2.5">
                                                        <div
                                                            className={cn(
                                                                "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                                                                call.direction === "OUTBOUND"
                                                                    ? "bg-primary-100 text-primary-600"
                                                                    : "bg-emerald-100 text-emerald-600"
                                                            )}
                                                        >
                                                            <Phone className="w-4 h-4" aria-hidden="true" />
                                                        </div>
                                                        <div className="flex-1 min-w-0 space-y-1.5">
                                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                                <span className="text-xs font-bold text-slate-800">
                                                                    {call.direction === "OUTBOUND" ? "Sortant" : "Entrant"}
                                                                </span>
                                                                {call.startedAt && (
                                                                    <span className="text-xs text-slate-600 font-medium">
                                                                        {formatParisDateTime(call.startedAt)}
                                                                    </span>
                                                                )}
                                                                {call.duration > 0 && (
                                                                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200/80">
                                                                        {durationMin > 0 ? `${durationMin} min ` : ""}
                                                                        {durationSec}s
                                                                    </span>
                                                                )}
                                                                {call.outcome && (
                                                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200/80">
                                                                        {call.outcome}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex flex-col gap-1 text-xs sm:flex-row sm:items-center sm:flex-wrap sm:gap-x-2">
                                                                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                                                    <span className="text-slate-400 shrink-0">De</span>
                                                                    <span
                                                                        className={cn(
                                                                            "font-mono text-slate-700 break-all",
                                                                            fromIsContact && "font-bold text-primary-800"
                                                                        )}
                                                                    >
                                                                        {call.displayFrom || "—"}
                                                                    </span>
                                                                    {fromIsContact && (
                                                                        <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-primary-100 text-primary-700 border border-primary-200">
                                                                            Contact
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <span
                                                                    className="text-slate-300"
                                                                    aria-hidden="true"
                                                                >
                                                                    →
                                                                </span>
                                                                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                                                    <span className="text-slate-400 shrink-0">Vers</span>
                                                                    <span
                                                                        className={cn(
                                                                            "font-mono text-slate-700 break-all",
                                                                            toIsContact && "font-bold text-primary-800"
                                                                        )}
                                                                    >
                                                                        {call.displayTo || "—"}
                                                                    </span>
                                                                    {toIsContact && (
                                                                        <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-primary-100 text-primary-700 border border-primary-200">
                                                                            Contact
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-2">
                                                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                                                                    Résumé Allo
                                                                </p>
                                                                {call.summaryText ? (
                                                                    <p className="text-xs text-slate-800 leading-snug line-clamp-2">
                                                                        {call.summaryText}
                                                                    </p>
                                                                ) : (
                                                                    <p className="text-xs text-slate-400 italic">
                                                                        Aucun résumé.
                                                                    </p>
                                                                )}
                                                            </div>
                                                            {call.transcriptPreview && (
                                                                <div className="rounded-lg border border-slate-100 bg-white px-2.5 py-2">
                                                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                                                                        Extrait transcription
                                                                    </p>
                                                                    <p className="text-[11px] text-slate-600 line-clamp-2 leading-snug">
                                                                        {call.transcriptPreview}
                                                                    </p>
                                                                </div>
                                                            )}
                                                        </div>
                                                        {isSelected && (
                                                            <CheckCircle2
                                                                className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5"
                                                                aria-hidden="true"
                                                            />
                                                        )}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>
                            );
                        })
                    )}
                </div>
            </div>
            {!loading && normalizedCalls.length > 0 && (
                <div className="flex flex-col-reverse gap-3 pt-4 mt-2 border-t border-slate-100 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[11px] text-slate-400">
                        La sélection est enregistrée avec votre action pour traçabilité.
                    </p>
                    <div className="flex items-center justify-end gap-3">
                        <Button variant="ghost" onClick={onClose}>
                            Annuler
                        </Button>
                        <Button onClick={onConfirm} disabled={!selectedId} className="gap-2">
                            <PhoneCall className="w-4 h-4" aria-hidden="true" />
                            Valider ce choix
                        </Button>
                    </div>
                </div>
            )}
        </Modal>
    );
}
