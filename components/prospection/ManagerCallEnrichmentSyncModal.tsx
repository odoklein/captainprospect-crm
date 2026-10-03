"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
    Loader2,
    RefreshCw,
    CheckCircle2,
    XCircle,
    Mic,
    FileText,
    Calendar,
    AlertCircle,
    ChevronDown,
    ChevronUp,
    Phone,
    Clock,
    RotateCcw,
    X,
    AlertTriangle,
} from "lucide-react";
import { Modal } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ACTION_RESULT_LABELS } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CallEnrichmentQueueItem = {
    id: string;
    createdAt: string;
    result: string;
    durationSec: number | null;
    missionName: string;
    campaignName: string;
    contactLine: string;
    companyLine: string;
    phonesForMatch: string;
    sdrName: string;
    note: string | null;
    hasSummary: boolean;
    hasRecording: boolean;
    hasTranscription: boolean;
    callSummary: string | null;
    callTranscription: string | null;
    callSummaryPreview: string | null;
    callTranscriptionPreview: string | null;
    callEnrichmentAt: string | null;
    callEnrichmentError: string | null;
    willUseForce: boolean;
};

export interface ManagerCallEnrichmentSyncModalProps {
    isOpen: boolean;
    onClose: () => void;
    missionId?: string;
    missionName?: string;
    onSynced: () => void;
    onToast: (kind: "success" | "error", title: string, message?: string) => void;
}

// ─── Detail tab type ──────────────────────────────────────────────────────────

type DetailTab = "crm" | "summary" | "transcription" | "note";

// ─── Sync progress state ──────────────────────────────────────────────────────

type SyncProgress = {
    total: number;
    processed: number;
    enriched: number;
    errors: number;
    noMatch: number;
    noPhone: number;
    skipped: number;
};

// ─── Date preset ─────────────────────────────────────────────────────────────

type DatePreset = "7d" | "14d" | "30d" | "90d" | "custom";

const DATE_PRESETS: { label: string; value: DatePreset; days: number }[] = [
    { label: "7 j", value: "7d", days: 7 },
    { label: "14 j", value: "14d", days: 14 },
    { label: "30 j", value: "30d", days: 30 },
    { label: "90 j", value: "90d", days: 90 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(sec: number | null): string {
    if (sec == null || sec <= 0) return "—";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m${String(s).padStart(2, "0")}s`;
}

function resultLabel(code: string): string {
    return ACTION_RESULT_LABELS[code] ?? code;
}

function dateFromNow(daysBack: number): string {
    const d = new Date();
    d.setDate(d.getDate() - daysBack);
    return d.toISOString().slice(0, 10);
}

function todayStr(): string {
    return new Date().toISOString().slice(0, 10);
}

function rangeFromPreset(preset: DatePreset): { from: string; to: string } {
    const preset_map: Record<DatePreset, number> = {
        "7d": 7,
        "14d": 14,
        "30d": 30,
        "90d": 90,
        custom: 30,
    };
    return { from: dateFromNow(preset_map[preset]), to: todayStr() };
}

// ─── Status badge helpers ─────────────────────────────────────────────────────

function StatusBadgeGroup({
    hasSummary,
    hasRecording,
    hasTranscription,
}: {
    hasSummary: boolean;
    hasRecording: boolean;
    hasTranscription: boolean;
}) {
    const badges = [
        { label: "Résumé", has: hasSummary },
        { label: "Audio", has: hasRecording },
        { label: "Transcr.", has: hasTranscription },
    ];

    const missing = badges.filter((b) => !b.has);
    const present = badges.filter((b) => b.has);

    return (
        <div className="flex flex-col gap-1">
            {missing.map((b) => (
                <span
                    key={b.label}
                    title={`${b.label} manquant`}
                    className={cn(
                        "inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-md",
                        "bg-amber-50 text-amber-700 border border-amber-100",
                    )}
                >
                    <XCircle className="w-3 h-3 shrink-0" />
                    {b.label}
                </span>
            ))}
            {present.map((b) => (
                <span
                    key={b.label}
                    title={`${b.label} présent`}
                    className={cn(
                        "inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-md",
                        "bg-emerald-50 text-emerald-700 border border-emerald-100",
                    )}
                >
                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                    {b.label}
                </span>
            ))}
        </div>
    );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function SyncProgressBar({ progress }: { progress: SyncProgress }) {
    const pct = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;

    return (
        <div className="rounded-xl border border-primary-100 bg-primary-50/50 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-primary-800">
                <span className="flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Synchronisation en cours…
                </span>
                <span className="tabular-nums">
                    {progress.processed} / {progress.total}
                </span>
            </div>
            <div className="h-1.5 bg-primary-100 rounded-full overflow-hidden">
                <div
                    className="h-full bg-primary-500 rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                />
            </div>
            <div className="flex flex-wrap gap-3 text-[11px] text-slate-600">
                <span className="inline-flex items-center gap-1 text-emerald-700 font-medium"><CheckCircle2 className="w-3 h-3 shrink-0" />{progress.enriched} enrichie(s)</span>
                {progress.errors > 0 && (
                    <span className="inline-flex items-center gap-1 text-red-600 font-medium"><XCircle className="w-3 h-3 shrink-0" />{progress.errors} erreur(s)</span>
                )}
                {progress.noMatch > 0 && (
                    <span className="text-amber-700">{progress.noMatch} sans correspondance</span>
                )}
                {progress.noPhone > 0 && (
                    <span className="text-amber-700">{progress.noPhone} sans téléphone</span>
                )}
                {progress.skipped > 0 && (
                    <span className="text-slate-400">{progress.skipped} ignorée(s)</span>
                )}
            </div>
        </div>
    );
}

// ─── Row detail panel ─────────────────────────────────────────────────────────

function RowDetailPanel({
    row,
    colSpan,
}: {
    row: CallEnrichmentQueueItem;
    colSpan: number;
}) {
    const [activeTab, setActiveTab] = useState<DetailTab>("crm");

    const tabs: { id: DetailTab; label: string; hasData: boolean; missing?: boolean }[] = [
        { id: "crm", label: "CRM", hasData: true },
        {
            id: "summary",
            label: "Résumé",
            hasData: !!row.callSummary?.trim(),
            missing: !row.hasSummary,
        },
        {
            id: "transcription",
            label: "Transcription",
            hasData: !!row.callTranscription?.trim(),
            missing: !row.hasTranscription,
        },
        { id: "note", label: "Note", hasData: !!row.note?.trim() },
    ];

    return (
        <tr className="bg-slate-50/80 border-b border-slate-200">
            <td colSpan={colSpan} className="px-4 pt-3 pb-4 align-top">
                {/* Tab strip */}
                <div className="flex gap-1 mb-3 border-b border-slate-200 pb-0">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "relative px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors -mb-px border-b-2",
                                activeTab === tab.id
                                    ? "text-primary-700 border-primary-500 bg-white"
                                    : "text-slate-500 border-transparent hover:text-slate-700 hover:bg-slate-100",
                            )}
                        >
                            {tab.label}
                            {tab.missing && (
                                <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-amber-400 align-middle" />
                            )}
                        </button>
                    ))}
                </div>

                {/* Tab panes */}
                <div className="text-xs text-slate-700">
                    {activeTab === "crm" && (
                        <div className="space-y-3">
                            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
                                <div>
                                    <dt className="text-[11px] text-slate-400 mb-0.5">Résultat</dt>
                                    <dd className="font-medium text-slate-900">{resultLabel(row.result)}</dd>
                                </div>
                                <div>
                                    <dt className="text-[11px] text-slate-400 mb-0.5">Durée</dt>
                                    <dd className="font-medium tabular-nums">{formatDuration(row.durationSec)}</dd>
                                </div>
                                <div className="col-span-2">
                                    <dt className="text-[11px] text-slate-400 mb-0.5">Mission</dt>
                                    <dd className="font-medium break-words">{row.missionName}</dd>
                                </div>
                                <div className="col-span-2">
                                    <dt className="text-[11px] text-slate-400 mb-0.5">Campagne</dt>
                                    <dd className="font-medium break-words">{row.campaignName}</dd>
                                </div>
                                <div className="col-span-4">
                                    <dt className="text-[11px] text-slate-400 mb-0.5">
                                        Numéros utilisés pour matcher Allo
                                    </dt>
                                    <dd className="font-mono text-[11px] text-slate-600 break-all">
                                        {row.phonesForMatch}
                                    </dd>
                                </div>
                            </dl>
                            {row.callEnrichmentAt && (
                                <p className="text-[11px] text-slate-400">
                                    Dernière synchro Allo :{" "}
                                    <time dateTime={row.callEnrichmentAt} className="text-slate-600">
                                        {new Date(row.callEnrichmentAt).toLocaleString("fr-FR")}
                                    </time>
                                </p>
                            )}
                            {row.callEnrichmentError && (
                                <div className="flex items-start gap-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                    {row.callEnrichmentError}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === "summary" && (
                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                            {row.callSummary?.trim() ? (
                                <p className="whitespace-pre-wrap text-sm text-slate-800 leading-relaxed max-h-56 overflow-y-auto pr-1">
                                    {row.callSummary}
                                </p>
                            ) : (
                                <p className="text-slate-400 italic text-sm">
                                    Aucun résumé — une synchronisation peut le récupérer depuis Allo.
                                </p>
                            )}
                        </div>
                    )}

                    {activeTab === "transcription" && (
                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                            {row.callTranscription?.trim() ? (
                                <pre className="whitespace-pre-wrap font-sans text-[13px] text-slate-800 leading-relaxed max-h-72 overflow-y-auto pr-1">
                                    {row.callTranscription}
                                </pre>
                            ) : (
                                <p className="text-slate-400 italic text-sm">
                                    Aucune transcription stockée.
                                </p>
                            )}
                        </div>
                    )}

                    {activeTab === "note" && (
                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                            {row.note?.trim() ? (
                                <p className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed max-h-40 overflow-y-auto">
                                    {row.note}
                                </p>
                            ) : (
                                <p className="text-slate-400 italic text-sm">Aucune note commerciale.</p>
                            )}
                        </div>
                    )}
                </div>
            </td>
        </tr>
    );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function ManagerCallEnrichmentSyncModal({
    isOpen,
    onClose,
    missionId,
    missionName,
    onSynced,
    onToast,
}: ManagerCallEnrichmentSyncModalProps) {
    const allMissionsMode = !missionId;

    // Date range
    const [datePreset, setDatePreset] = useState<DatePreset>("30d");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [dateError, setDateError] = useState<string | null>(null);

    // Data
    const [items, setItems] = useState<CallEnrichmentQueueItem[]>([]);
    const [scanned, setScanned] = useState(0);
    const [callMissionCount, setCallMissionCount] = useState<number | null>(null);

    // UI state
    const [loadingList, setLoadingList] = useState(false);
    const [listError, setListError] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    // Sync progress
    const [syncing, setSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
    const abortRef = useRef<boolean>(false);

    // ── Date helpers ───────────────────────────────────────────────────────────

    const applyPreset = useCallback(
        (preset: DatePreset) => {
            if (preset === "custom") return;
            const r = rangeFromPreset(preset);
            setDateFrom(r.from);
            setDateTo(r.to);
            setDateError(null);
        },
        [],
    );

    const validateDates = (from: string, to: string): string | null => {
        if (!from || !to) return "Veuillez renseigner les deux dates.";
        if (from > to) return "La date de début doit être antérieure à la date de fin.";
        return null;
    };

    // ── Fetch list ─────────────────────────────────────────────────────────────

    const fetchList = useCallback(
        async (from: string, to: string) => {
            const err = validateDates(from, to);
            if (err) {
                setDateError(err);
                return;
            }
            setDateError(null);

            if (!allMissionsMode && !missionId) return;
            setLoadingList(true);
            setListError(null);
            try {
                const qs = new URLSearchParams({ from, to });
                if (missionId) qs.set("missionId", missionId);
                else qs.set("allCallMissions", "1");
                const res = await fetch(`/api/manager/prospection/call-enrichment?${qs}`);
                const json = await res.json();
                if (!json.success) {
                    setListError(json.error ?? "Impossible de charger la liste");
                    setItems([]);
                    setScanned(0);
                    setSelectedIds(new Set());
                    setCallMissionCount(null);
                    return;
                }
                const data = json.data as {
                    items: CallEnrichmentQueueItem[];
                    scanned: number;
                    callMissionCount?: number;
                };
                setItems(data.items);
                setScanned(data.scanned);
                setSelectedIds(new Set(data.items.map((i) => i.id)));
                setExpandedIds(new Set());
                setCallMissionCount(
                    typeof data.callMissionCount === "number" ? data.callMissionCount : null,
                );
            } catch {
                setListError("Erreur réseau");
                setItems([]);
                setScanned(0);
                setSelectedIds(new Set());
                setCallMissionCount(null);
            } finally {
                setLoadingList(false);
            }
        },
        [missionId, allMissionsMode],
    );

    // ── Init on open ───────────────────────────────────────────────────────────

    useEffect(() => {
        if (!isOpen) return;
        const preset: DatePreset = "30d";
        const r = rangeFromPreset(preset);
        setDatePreset(preset);
        setDateFrom(r.from);
        setDateTo(r.to);
        setDateError(null);
        setSyncProgress(null);
        void fetchList(r.from, r.to);
    }, [isOpen, fetchList]);

    // ── Selection helpers ──────────────────────────────────────────────────────

    const toggle = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleExpanded = (id: string) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const selectAll = () => setSelectedIds(new Set(items.map((i) => i.id)));
    const selectNone = () => setSelectedIds(new Set());

    const allSelected = items.length > 0 && items.every((i) => selectedIds.has(i.id));
    const someSelected = selectedIds.size > 0;

    // ── Sync ───────────────────────────────────────────────────────────────────

    const CHUNK = 200;

    const runSync = async (ids: string[]) => {
        if (ids.length === 0) {
            onToast("error", "Aucune action sélectionnée");
            return;
        }

        abortRef.current = false;
        setSyncing(true);
        setSyncProgress({
            total: ids.length,
            processed: 0,
            enriched: 0,
            errors: 0,
            noMatch: 0,
            noPhone: 0,
            skipped: 0,
        });

        try {
            let enriched = 0;
            let noMatch = 0;
            let noPhone = 0;
            let errors = 0;
            let skipped = 0;
            let processed = 0;

            for (let i = 0; i < ids.length; i += CHUNK) {
                if (abortRef.current) break;
                const chunk = ids.slice(i, i + CHUNK);
                const body = missionId
                    ? { missionId, actionIds: chunk }
                    : { actionIds: chunk };
                const res = await fetch("/api/manager/prospection/call-enrichment", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });
                const json = await res.json();
                if (!json.success) {
                    onToast("error", "Synchronisation", json.error ?? "Échec");
                    return;
                }
                const d = json.data as {
                    enriched: number;
                    total: number;
                    noMatch: number;
                    noPhone: number;
                    errors: number;
                    skipped: number;
                };
                enriched += d.enriched;
                noMatch += d.noMatch;
                noPhone += d.noPhone;
                errors += d.errors;
                skipped += d.skipped;
                processed += chunk.length;

                setSyncProgress({
                    total: ids.length,
                    processed,
                    enriched,
                    errors,
                    noMatch,
                    noPhone,
                    skipped,
                });
            }

            if (!abortRef.current) {
                onToast(
                    "success",
                    "Synchronisation terminée",
                    `${enriched} enrichie(s) sur ${ids.length}. ` +
                        (noMatch ? `${noMatch} sans correspondance Allo. ` : "") +
                        (noPhone ? `${noPhone} sans téléphone. ` : "") +
                        (errors ? `${errors} erreur(s). ` : "") +
                        (skipped ? `${skipped} ignorée(s).` : ""),
                );
                onSynced();
                await fetchList(dateFrom, dateTo);
            }
        } catch {
            onToast("error", "Synchronisation", "Erreur réseau");
        } finally {
            setSyncing(false);
            setSyncProgress(null);
        }
    };

    const cancelSync = () => {
        abortRef.current = true;
    };

    // ── Column count ───────────────────────────────────────────────────────────

    // Columns: ☐ | ↕ | Date | Contact | SDR | [Mission] | Statut | (hover actions via CSS)
    const tableColSpan = allMissionsMode ? 7 : 6;

    // ─────────────────────────────────────────────────────────────────────────

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={
                allMissionsMode
                    ? "Sync appels Allo — toutes les missions"
                    : "Sync appels Allo"
            }
            description={
                missionName ??
                (allMissionsMode ? "Missions actives avec canal Appel" : undefined)
            }
            size="xl"
            className={cn(allMissionsMode ? "max-w-6xl" : "max-w-5xl")}
        >
            <div className="space-y-4">

                {/* ── Description ─────────────────────────────────────────── */}
                <p className="text-sm text-slate-500 leading-relaxed">
                    {allMissionsMode ? (
                        <>
                            Vue agrégée sur{" "}
                            <strong className="text-slate-700 font-semibold">
                                {callMissionCount != null ? callMissionCount : "…"} mission
                                {callMissionCount !== 1 ? "s" : ""}
                            </strong>{" "}
                            actives (canal appel). Jusqu'à 2 000 appels les plus récents sur
                            l'intervalle.
                        </>
                    ) : (
                        <>
                            Appels sans résumé ou enregistrement sur la période. Lancez une
                            synchronisation avec Allo pour les enrichir.
                        </>
                    )}{" "}
                    Cliquez sur la flèche d'une ligne pour le détail complet.
                </p>

                {/* ── Filter bar ───────────────────────────────────────────── */}
                <div className="flex flex-wrap items-end gap-3">
                    {/* Preset chips */}
                    <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden />
                        <div className="flex gap-1">
                            {DATE_PRESETS.map((p) => (
                                <button
                                    key={p.value}
                                    type="button"
                                    onClick={() => {
                                        setDatePreset(p.value);
                                        applyPreset(p.value);
                                    }}
                                    className={cn(
                                        "h-7 px-2.5 rounded-lg text-xs font-semibold transition-colors border",
                                        datePreset === p.value
                                            ? "bg-primary-600 text-white border-primary-600"
                                            : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                                    )}
                                >
                                    {p.label}
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={() => setDatePreset("custom")}
                                className={cn(
                                    "h-7 px-2.5 rounded-lg text-xs font-semibold transition-colors border",
                                    datePreset === "custom"
                                        ? "bg-primary-600 text-white border-primary-600"
                                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                                )}
                            >
                                Personnalisé
                            </button>
                        </div>
                    </div>

                    {/* Custom date inputs — only visible in custom mode */}
                    {datePreset === "custom" && (
                        <div className="flex items-end gap-2">
                            <div>
                                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">
                                    Du
                                </label>
                                <input
                                    type="date"
                                    value={dateFrom}
                                    max={dateTo || todayStr()}
                                    onChange={(e) => {
                                        setDateFrom(e.target.value);
                                        setDateError(null);
                                    }}
                                    className={cn(
                                        "h-8 px-2.5 text-xs font-semibold bg-white border rounded-lg text-slate-800",
                                        "focus:outline-none focus:ring-2 focus:ring-primary-400/30 transition-colors",
                                        dateError ? "border-red-300" : "border-slate-200",
                                    )}
                                />
                            </div>
                            <div>
                                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">
                                    Au
                                </label>
                                <input
                                    type="date"
                                    value={dateTo}
                                    min={dateFrom}
                                    max={todayStr()}
                                    onChange={(e) => {
                                        setDateTo(e.target.value);
                                        setDateError(null);
                                    }}
                                    className={cn(
                                        "h-8 px-2.5 text-xs font-semibold bg-white border rounded-lg text-slate-800",
                                        "focus:outline-none focus:ring-2 focus:ring-primary-400/30 transition-colors",
                                        dateError ? "border-red-300" : "border-slate-200",
                                    )}
                                />
                            </div>
                        </div>
                    )}

                    {/* Refresh */}
                    <button
                        type="button"
                        disabled={loadingList || !dateFrom || !dateTo}
                        onClick={() => fetchList(dateFrom, dateTo)}
                        className={cn(
                            "h-8 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors",
                            "bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50",
                        )}
                    >
                        {loadingList ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                        ) : (
                            <RefreshCw className="w-3.5 h-3.5" aria-hidden />
                        )}
                        Actualiser
                    </button>
                </div>

                {/* Date validation error */}
                {dateError && (
                    <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden />
                        {dateError}
                    </div>
                )}

                {/* List error */}
                {listError && (
                    <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                        <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
                        {listError}
                    </div>
                )}

                {/* ── Toolbar ──────────────────────────────────────────────── */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">
                        <strong className="text-slate-800">{items.length}</strong> action
                        {items.length !== 1 ? "s" : ""} incomplète{items.length !== 1 ? "s" : ""}
                        {scanned > 0 && (
                            <>
                                {" "}
                                sur{" "}
                                <strong className="text-slate-700">{scanned}</strong> scanné
                                {scanned !== 1 ? "s" : ""}
                                {allMissionsMode && callMissionCount != null
                                    ? ` — ${callMissionCount} mission${callMissionCount !== 1 ? "s" : ""}`
                                    : ""}
                            </>
                        )}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                        <button
                            type="button"
                            disabled={items.length === 0 || syncing}
                            onClick={selectAll}
                            className="h-7 px-2.5 rounded-lg border border-slate-200 text-slate-600 font-medium hover:bg-slate-50 disabled:opacity-40 text-xs transition-colors"
                        >
                            Tout sélectionner
                        </button>
                        <button
                            type="button"
                            disabled={items.length === 0 || syncing}
                            onClick={selectNone}
                            className="h-7 px-2.5 rounded-lg border border-slate-200 text-slate-600 font-medium hover:bg-slate-50 disabled:opacity-40 text-xs transition-colors"
                        >
                            Tout désélectionner
                        </button>
                    </div>
                </div>

                {/* ── Table ────────────────────────────────────────────────── */}
                <div className="rounded-xl border border-slate-200 overflow-hidden max-h-[min(52vh,480px)] overflow-y-auto">
                    {loadingList && items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400">
                            <Loader2 className="w-7 h-7 animate-spin text-primary-400" />
                            <span className="text-sm">Chargement…</span>
                        </div>
                    ) : items.length === 0 ? (
                        <div className="py-14 text-center px-6 space-y-2">
                            {scanned > 0 ? (
                                <>
                                    <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                                    <p className="text-sm font-medium text-slate-700">
                                        Tous les appels sont enrichis
                                    </p>
                                    <p className="text-xs text-slate-400">
                                        Aucune action incomplète sur cette période.
                                    </p>
                                </>
                            ) : (
                                <>
                                    <Calendar className="w-8 h-8 text-slate-300 mx-auto" />
                                    <p className="text-sm font-medium text-slate-600">
                                        Aucun appel sur cette période
                                    </p>
                                    <p className="text-xs text-slate-400">
                                        Essayez d'élargir l'intervalle à 90 j.
                                    </p>
                                </>
                            )}
                        </div>
                    ) : (
                        <table className="w-full text-left text-sm border-collapse">
                            <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="w-9 px-3 py-2.5">
                                        <input
                                            type="checkbox"
                                            checked={allSelected}
                                            onChange={() => (allSelected ? selectNone() : selectAll())}
                                            aria-label="Sélectionner toutes les lignes"
                                            className="w-4 h-4 rounded border-slate-300 accent-primary-600"
                                        />
                                    </th>
                                    <th className="w-8 px-1 py-2.5" />
                                    <th className="px-3 py-2.5 text-xs font-medium text-slate-400 whitespace-nowrap">
                                        Date
                                    </th>
                                    <th className="px-3 py-2.5 text-xs font-medium text-slate-400 min-w-[180px]">
                                        Contact / Société
                                    </th>
                                    <th className="px-3 py-2.5 text-xs font-medium text-slate-400 whitespace-nowrap">
                                        SDR
                                    </th>
                                    {allMissionsMode && (
                                        <th className="px-3 py-2.5 text-xs font-medium text-slate-400 min-w-[110px]">
                                            Mission
                                        </th>
                                    )}
                                    <th className="px-3 py-2.5 text-xs font-medium text-slate-400">
                                        Statut
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {items.map((row) => {
                                    const sel = selectedIds.has(row.id);
                                    const expanded = expandedIds.has(row.id);
                                    return (
                                        <Fragment key={row.id}>
                                            <tr
                                                className={cn(
                                                    "group relative transition-colors",
                                                    sel ? "bg-primary-50/40" : "hover:bg-slate-50/60",
                                                )}
                                            >
                                                {/* Select */}
                                                <td className="px-3 py-2.5">
                                                    <input
                                                        type="checkbox"
                                                        checked={sel}
                                                        onChange={() => toggle(row.id)}
                                                        aria-label={`Sélectionner ${row.contactLine}`}
                                                        className="w-4 h-4 rounded border-slate-300 accent-primary-600"
                                                    />
                                                </td>

                                                {/* Expand */}
                                                <td className="px-1 py-2.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleExpanded(row.id)}
                                                        aria-expanded={expanded}
                                                        aria-label={
                                                            expanded
                                                                ? "Masquer le détail"
                                                                : "Afficher le détail"
                                                        }
                                                        className="p-1 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                                                    >
                                                        {expanded ? (
                                                            <ChevronUp className="w-3.5 h-3.5" aria-hidden />
                                                        ) : (
                                                            <ChevronDown className="w-3.5 h-3.5" aria-hidden />
                                                        )}
                                                    </button>
                                                </td>

                                                {/* Date + duration */}
                                                <td className="px-3 py-2.5 whitespace-nowrap">
                                                    <p className="text-xs text-slate-700 tabular-nums">
                                                        {new Date(row.createdAt).toLocaleString("fr-FR", {
                                                            day: "2-digit",
                                                            month: "short",
                                                            hour: "2-digit",
                                                            minute: "2-digit",
                                                        })}
                                                    </p>
                                                    {row.durationSec != null && row.durationSec > 0 && (
                                                        <p className="text-[11px] text-slate-400 tabular-nums flex items-center gap-0.5 mt-0.5">
                                                            <Clock className="w-2.5 h-2.5" />
                                                            {formatDuration(row.durationSec)}
                                                        </p>
                                                    )}
                                                </td>

                                                {/* Contact — name + company only */}
                                                <td className="px-3 py-2.5 min-w-0 max-w-[min(320px,36vw)]">
                                                    <p
                                                        className="font-semibold text-slate-800 text-sm truncate"
                                                        title={row.contactLine}
                                                    >
                                                        {row.contactLine}
                                                    </p>
                                                    <p
                                                        className="text-xs text-slate-400 truncate mt-0.5"
                                                        title={row.companyLine}
                                                    >
                                                        {row.companyLine}
                                                    </p>
                                                    {row.willUseForce && (
                                                        <span className="inline-flex items-center gap-0.5 mt-1 text-[10px] font-medium text-slate-400">
                                                            <RotateCcw className="w-2.5 h-2.5" />
                                                            re-sync forcé
                                                        </span>
                                                    )}
                                                </td>

                                                {/* SDR */}
                                                <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">
                                                    {row.sdrName}
                                                </td>

                                                {/* Mission (all-missions mode) */}
                                                {allMissionsMode && (
                                                    <td className="px-3 py-2.5 min-w-0 max-w-[130px]">
                                                        <p
                                                            className="text-xs font-medium text-slate-700 truncate"
                                                            title={row.missionName}
                                                        >
                                                            {row.missionName}
                                                        </p>
                                                    </td>
                                                )}

                                                {/* Status badges — merged column */}
                                                <td className="px-3 py-2.5">
                                                    <div className="flex items-start gap-2">
                                                        <StatusBadgeGroup
                                                            hasSummary={row.hasSummary}
                                                            hasRecording={row.hasRecording}
                                                            hasTranscription={row.hasTranscription}
                                                        />

                                                        {/* Hover-reveal sync action */}
                                                        <button
                                                            type="button"
                                                            disabled={syncing}
                                                            onClick={() => runSync([row.id])}
                                                            title="Synchroniser cette ligne"
                                                            className={cn(
                                                                "opacity-0 group-hover:opacity-100 focus:opacity-100",
                                                                "transition-opacity ml-auto shrink-0",
                                                                "p-1 rounded-md text-primary-600 hover:bg-primary-50",
                                                                "disabled:opacity-30",
                                                            )}
                                                        >
                                                            <RefreshCw className="w-3.5 h-3.5" aria-hidden />
                                                        </button>
                                                    </div>
                                                    {row.callEnrichmentError && (
                                                        <p className="text-[10px] text-amber-700 mt-1 leading-snug max-w-[160px]">
                                                            {row.callEnrichmentError}
                                                        </p>
                                                    )}
                                                </td>
                                            </tr>

                                            {/* Expanded detail */}
                                            {expanded && (
                                                <RowDetailPanel
                                                    row={row}
                                                    colSpan={tableColSpan}
                                                />
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* ── Sync progress ─────────────────────────────────────────── */}
                {syncing && syncProgress && (
                    <div className="space-y-2">
                        <SyncProgressBar progress={syncProgress} />
                        <button
                            type="button"
                            onClick={cancelSync}
                            className="text-xs text-slate-500 hover:text-red-600 underline underline-offset-2 transition-colors"
                        >
                            Annuler
                        </button>
                    </div>
                )}

                {/* ── Footer actions ────────────────────────────────────────── */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={syncing}
                        className={cn(
                            "h-9 px-4 rounded-lg text-sm font-medium text-slate-600",
                            "border border-slate-200 hover:bg-slate-50 transition-colors",
                            "disabled:opacity-40",
                        )}
                    >
                        Fermer
                    </button>

                    <div className="flex items-center gap-2">
                        {/* Secondary: sync all (with confirmation guard) */}
                        <button
                            type="button"
                            disabled={syncing || items.length === 0}
                            onClick={() => {
                                if (
                                    window.confirm(
                                        `Synchroniser les ${items.length} actions (sélection ignorée) ?`,
                                    )
                                ) {
                                    void runSync(items.map((i) => i.id));
                                }
                            }}
                            className={cn(
                                "h-9 px-4 rounded-lg text-sm font-medium flex items-center gap-1.5",
                                "bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition-colors",
                                "disabled:opacity-40",
                            )}
                        >
                            {syncing ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                            ) : (
                                <Mic className="w-3.5 h-3.5" aria-hidden />
                            )}
                            Tout ({items.length})
                        </button>

                        {/* Primary: sync selection */}
                        <button
                            type="button"
                            disabled={syncing || !someSelected}
                            onClick={() => runSync([...selectedIds])}
                            className={cn(
                                "h-9 px-4 rounded-lg text-sm font-semibold flex items-center gap-1.5",
                                "bg-primary-600 text-white hover:bg-primary-700 transition-colors",
                                "disabled:opacity-40",
                            )}
                        >
                            {syncing ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                            ) : (
                                <FileText className="w-3.5 h-3.5" aria-hidden />
                            )}
                            Synchroniser la sélection
                            {selectedIds.size > 0 && (
                                <span className="ml-1 bg-primary-500 rounded-md px-1.5 py-0.5 text-xs tabular-nums">
                                    {selectedIds.size}
                                </span>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}