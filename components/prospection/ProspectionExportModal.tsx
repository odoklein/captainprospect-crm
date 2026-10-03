"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Archive, Calendar, CheckCircle2, Download, FileSpreadsheet, FileText,
    Filter, Layers, Loader2, Phone, Mail, Linkedin, RotateCcw, Users,
} from "lucide-react";
import { Modal } from "@/components/ui";
import { cn } from "@/lib/utils";
import { buildExportQuery } from "@/lib/prospection-export/filters";
import type { ExportChannel, TreatmentFilter } from "@/lib/prospection-export/types";
import type { ExportPreview } from "@/lib/prospection-export/workbook";
import { brand } from "@/lib/brand";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface ProspectionExportInitialFilters {
    listIds: string[] | null;
    statuses: string[];
    sdrIds: string[];
    channels: ExportChannel[];
    /** YYYY-MM-DD */
    from: string;
    /** YYYY-MM-DD */
    to: string;
}

export interface ProspectionExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    missionId: string;
    missionName: string;
    sdrOptions: { id: string; name: string }[];
    /** Filters of the page, used to pre-fill the dialog. */
    initial: ProspectionExportInitialFilters;
    onToast: (kind: "success" | "error", title: string, message?: string) => void;
}

type ExportFormat = "xlsx" | "csv";

const CHANNEL_OPTIONS: { value: ExportChannel; label: string; icon: React.ElementType }[] = [
    { value: "CALL", label: "Appels", icon: Phone },
    { value: "EMAIL", label: "Email", icon: Mail },
    { value: "LINKEDIN", label: "LinkedIn", icon: Linkedin },
];

const nf = new Intl.NumberFormat("fr-FR");

function pct(part: number | null | undefined, total: number | null | undefined): string {
    if (!total || part == null) return "—";
    return `${Math.round((part / total) * 100)} %`;
}

function isoDay(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

const PERIOD_PRESETS: { label: string; range: () => { from: string; to: string } }[] = [
    { label: "7 derniers jours", range: () => { const t = new Date(); const f = new Date(); f.setDate(t.getDate() - 6); return { from: isoDay(f), to: isoDay(t) }; } },
    { label: "30 derniers jours", range: () => { const t = new Date(); const f = new Date(); f.setDate(t.getDate() - 29); return { from: isoDay(f), to: isoDay(t) }; } },
    { label: "Ce mois-ci", range: () => { const t = new Date(); return { from: isoDay(new Date(t.getFullYear(), t.getMonth(), 1)), to: isoDay(t) }; } },
    { label: "Mois dernier", range: () => { const t = new Date(); return { from: isoDay(new Date(t.getFullYear(), t.getMonth() - 1, 1)), to: isoDay(new Date(t.getFullYear(), t.getMonth(), 0)) }; } },
];

function filenameFromDisposition(header: string | null, fallback: string): string {
    if (!header) return fallback;
    const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
    if (star) {
        try { return decodeURIComponent(star[1]); } catch { /* fall through */ }
    }
    const plain = /filename="([^"]+)"/i.exec(header);
    return plain?.[1] ?? fallback;
}

// ─────────────────────────────────────────────────────────────────────────────
// SMALL PIECES
// ─────────────────────────────────────────────────────────────────────────────

function Section({ icon: Icon, title, hint, children, aside }: {
    icon: React.ElementType; title: string; hint?: string; children: React.ReactNode; aside?: React.ReactNode;
}) {
    return (
        <section className="space-y-3">
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-primary-50 flex items-center justify-center shrink-0 mt-0.5">
                        <Icon className="w-3.5 h-3.5 text-primary-600" aria-hidden />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-slate-900">{title}</h3>
                        {hint && <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{hint}</p>}
                    </div>
                </div>
                {aside}
            </div>
            {children}
        </section>
    );
}

function Chip({ active, onClick, disabled, children, count }: {
    active: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode; count?: number;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-pressed={active}
            className={cn(
                "flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 rounded-xl border text-[11px] font-bold transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:opacity-40 disabled:cursor-not-allowed",
                active
                    ? "bg-primary-50 border-primary-300 text-primary-700 shadow-sm"
                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
            )}
        >
            {children}
            {count !== undefined && (
                <span className={cn(
                    "ml-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-black tabular-nums",
                    active ? "bg-white/70" : "bg-slate-100 text-slate-500"
                )}>
                    {nf.format(count)}
                </span>
            )}
        </button>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────────────────────────────────────────

export function ProspectionExportModal({
    isOpen, onClose, missionId, missionName, sdrOptions, initial, onToast,
}: ProspectionExportModalProps) {
    const [selectedLists, setSelectedLists] = useState<string[] | null>(initial.listIds);
    const [treatment, setTreatment] = useState<TreatmentFilter>("all");
    const [statuses, setStatuses] = useState<string[]>(initial.statuses);
    const [sdrId, setSdrId] = useState<string>(initial.sdrIds[0] ?? "");
    const [channels, setChannels] = useState<ExportChannel[]>(initial.channels);
    const [from, setFrom] = useState(initial.from);
    const [to, setTo] = useState(initial.to);
    const [format, setFormat] = useState<ExportFormat>("xlsx");
    const [includeSummary, setIncludeSummary] = useState(true);
    const [includeHistory, setIncludeHistory] = useState(true);
    const [showArchived, setShowArchived] = useState(false);

    const [preview, setPreview] = useState<ExportPreview | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [downloading, setDownloading] = useState(false);
    const requestSeq = useRef(0);

    // Re-seed from the page every time the dialog opens.
    useEffect(() => {
        if (!isOpen) return;
        setSelectedLists(initial.listIds);
        setTreatment("all");
        setStatuses(initial.statuses);
        setSdrId(initial.sdrIds[0] ?? "");
        setChannels(initial.channels);
        setFrom(initial.from);
        setTo(initial.to);
        setPreview(null);
        setPreviewError(null);
        setShowArchived(!!initial.listIds?.length);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    const prefilled = !!(initial.listIds?.length || initial.statuses.length || initial.sdrIds.length || initial.channels.length || initial.from || initial.to);

    const query = useMemo(() => buildExportQuery({
        listIds: selectedLists,
        statuses: treatment === "untreated" ? [] : statuses,
        treatment,
        sdrIds: sdrId ? [sdrId] : [],
        channels,
        from,
        to,
    }), [selectedLists, statuses, treatment, sdrId, channels, from, to]);

    // ── live preview (debounced) ───────────────────────────────────────────
    useEffect(() => {
        if (!isOpen || !missionId) return;
        const seq = ++requestSeq.current;
        setPreviewLoading(true);
        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`/api/missions/${missionId}/prospection-export/preview?${query}`);
                const json = await res.json();
                if (seq !== requestSeq.current) return;
                if (!json.success) throw new Error(json.error || "Aperçu indisponible");
                // A null selection stays null (server default) until the first toggle,
                // so opening the dialog costs a single preview request.
                setPreview(json.data as ExportPreview);
                setPreviewError(null);
            } catch (err) {
                if (seq !== requestSeq.current) return;
                setPreviewError(err instanceof Error ? err.message : "Aperçu indisponible");
            } finally {
                if (seq === requestSeq.current) setPreviewLoading(false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [isOpen, missionId, query]);

    const lists = preview?.lists ?? [];
    const archivedCount = lists.filter((l) => l.isArchived).length;
    const visibleLists = lists.filter((l) => showArchived || !l.isArchived || selectedLists?.includes(l.id));
    const selectedSet = new Set(selectedLists ?? lists.filter((l) => l.selected).map((l) => l.id));

    const toggleList = (id: string) => {
        setSelectedLists((prev) => {
            const base = prev ?? lists.filter((l) => l.selected).map((l) => l.id);
            return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
        });
    };
    const toggleStatus = (code: string) =>
        setStatuses((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
    const toggleChannel = (ch: ExportChannel) =>
        setChannels((prev) => (prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]));

    const resetAll = () => {
        setSelectedLists(lists.filter((l) => !l.isArchived).map((l) => l.id));
        setTreatment("all");
        setStatuses([]);
        setSdrId("");
        setChannels([]);
        setFrom("");
        setTo("");
    };

    const totals = preview?.totals;
    const exportedRows = totals?.exportedRows ?? 0;
    const selectedCount = selectedSet.size;
    const hasActionFilters = !!(sdrId || channels.length || from || to);

    // ── download ───────────────────────────────────────────────────────────
    const handleExport = useCallback(async () => {
        if (downloading) return;
        setDownloading(true);
        try {
            const q = new URLSearchParams(query);
            q.set("format", format);
            if (format === "xlsx") {
                if (!includeSummary) q.set("summary", "0");
                if (!includeHistory) q.set("history", "0");
            }
            const res = await fetch(`/api/missions/${missionId}/prospection-export?${q}`);
            if (!res.ok) {
                let message = `Erreur ${res.status}`;
                try { message = (await res.json()).error || message; } catch { /* binary or empty */ }
                throw new Error(message);
            }
            const blob = await res.blob();
            const filename = filenameFromDisposition(res.headers.get("Content-Disposition"), `export_${missionName}.${format}`);
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 10_000);
            onToast("success", "Export prêt", `${nf.format(exportedRows)} ligne${exportedRows > 1 ? "s" : ""} · ${filename}`);
            onClose();
        } catch (err) {
            onToast("error", "Export impossible", err instanceof Error ? err.message : undefined);
        } finally {
            setDownloading(false);
        }
    }, [downloading, query, format, includeSummary, includeHistory, missionId, missionName, exportedRows, onToast, onClose]);

    // ─────────────────────────────────────────────────────────────────────
    return (
        <Modal
            isOpen={isOpen}
            onClose={() => { if (!downloading) onClose(); }}
            title="Exporter la base prospectée"
            description={`${missionName} — le fichier du client dans son format d'origine, enrichi du suivi ${brand.name}.`}
            size="xl"
            contentClassName="p-0 md:p-0 overflow-hidden flex flex-col min-h-0"
        >
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-6 py-5 space-y-7">
                {prefilled && (
                    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 font-semibold">
                        <span className="flex items-center gap-1.5">
                            <Filter className="w-3.5 h-3.5" aria-hidden />
                            Pré-rempli avec les filtres de la vue en cours.
                        </span>
                        <button type="button" onClick={resetAll} className="flex items-center gap-1 font-bold hover:underline">
                            <RotateCcw className="w-3 h-3" aria-hidden /> Tout exporter
                        </button>
                    </div>
                )}

                {/* ── Lists ─────────────────────────────────────────────── */}
                <Section
                    icon={Layers}
                    title="Listes à exporter"
                    hint="Chaque liste garde les colonnes du fichier envoyé par le client, dans le même ordre."
                    aside={lists.length > 1 ? (
                        <div className="flex items-center gap-1 shrink-0">
                            <button type="button" onClick={() => setSelectedLists(visibleLists.map((l) => l.id))}
                                className="px-2 py-1 rounded-lg text-[11px] font-bold text-primary-700 hover:bg-primary-50">Tout</button>
                            <button type="button" onClick={() => setSelectedLists([])}
                                className="px-2 py-1 rounded-lg text-[11px] font-bold text-slate-500 hover:bg-slate-100">Aucune</button>
                        </div>
                    ) : undefined}
                >
                    {!preview && previewLoading ? (
                        <div className="flex items-center gap-2 text-xs text-slate-500 py-4">
                            <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Chargement des listes…
                        </div>
                    ) : lists.length === 0 ? (
                        <p className="text-xs text-slate-500 py-2">Aucune liste sur cette mission.</p>
                    ) : (
                        <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                            {visibleLists.map((l) => {
                                const checked = selectedSet.has(l.id);
                                return (
                                    <label key={l.id} className={cn(
                                        "flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors",
                                        checked ? "bg-primary-50/40" : "hover:bg-slate-50"
                                    )}>
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => toggleList(l.id)}
                                            className="mt-0.5 w-4 h-4 rounded border-slate-300 accent-primary-600 cursor-pointer"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-sm font-bold text-slate-900 truncate">{l.name}</span>
                                                {l.hasOriginalFormat ? (
                                                    <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-700">
                                                        Format d&apos;origine · {l.originalColumns} col.
                                                    </span>
                                                ) : (
                                                    <span className="px-1.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-500">
                                                        Format standard
                                                    </span>
                                                )}
                                                {l.isArchived && (
                                                    <span className="px-1.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-[10px] font-bold text-amber-700">
                                                        Archivée
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                                                {l.rows !== null ? (
                                                    <>
                                                        {nf.format(l.rows)} ligne{l.rows !== 1 ? "s" : ""} · {nf.format(l.companies)} sociétés · {nf.format(l.contacts ?? 0)} contacts ·{" "}
                                                        <span className="font-semibold text-slate-700">{pct(l.treatedRows, l.rows)} traité</span>
                                                    </>
                                                ) : (
                                                    <>{nf.format(l.companies)} sociétés</>
                                                )}
                                                {l.importedAt && <> · importée le {new Date(l.importedAt).toLocaleDateString("fr-FR")}</>}
                                            </p>
                                            {l.ignoredColumns.length > 0 && (
                                                <p className="text-[10px] text-slate-400 mt-0.5 truncate" title={l.ignoredColumns.join(", ")}>
                                                    Colonnes ignorées à l&apos;import (non conservées) : {l.ignoredColumns.join(", ")}
                                                </p>
                                            )}
                                        </div>
                                        {checked && l.exportedRows !== null && (
                                            <span className="shrink-0 text-xs font-black text-primary-700 tabular-nums">
                                                {nf.format(l.exportedRows)}
                                            </span>
                                        )}
                                    </label>
                                );
                            })}
                        </div>
                    )}
                    {archivedCount > 0 && (
                        <button type="button" onClick={() => setShowArchived((v) => !v)}
                            className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-slate-800">
                            <Archive className="w-3.5 h-3.5" aria-hidden />
                            {showArchived ? "Masquer" : "Afficher"} les listes archivées ({archivedCount})
                        </button>
                    )}
                </Section>

                {/* ── Rows ──────────────────────────────────────────────── */}
                <Section
                    icon={Filter}
                    title="Lignes à inclure"
                    hint="Le statut actuel est le résultat de la dernière action sur la ligne."
                >
                    <div role="radiogroup" aria-label="Traitement" className="grid grid-cols-3 gap-2">
                        {([
                            { value: "all", label: "Toute la base", count: totals?.rows },
                            { value: "treated", label: "Traités", count: totals?.treatedRows },
                            { value: "untreated", label: "Non traités", count: totals ? totals.rows - totals.treatedRows : undefined },
                        ] as { value: TreatmentFilter; label: string; count?: number }[]).map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                role="radio"
                                aria-checked={treatment === opt.value}
                                onClick={() => setTreatment(opt.value)}
                                className={cn(
                                    "px-3 py-2.5 rounded-xl border text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400",
                                    treatment === opt.value
                                        ? "bg-primary-600 border-primary-600 text-white shadow-sm"
                                        : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                                )}
                            >
                                <span className="block text-xs font-bold">{opt.label}</span>
                                <span className={cn("block text-[11px] tabular-nums mt-0.5", treatment === opt.value ? "text-primary-100" : "text-slate-400")}>
                                    {opt.count !== undefined ? `${nf.format(opt.count)} lignes` : "…"}
                                </span>
                            </button>
                        ))}
                    </div>

                    {treatment !== "untreated" && (preview?.statuses.length ?? 0) > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Statut actuel</p>
                                {statuses.length > 0 && (
                                    <button type="button" onClick={() => setStatuses([])} className="text-[11px] font-bold text-primary-700 hover:underline">
                                        Tous les statuts
                                    </button>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer par statut actuel">
                                {preview!.statuses.map((s) => (
                                    <Chip key={s.code} active={statuses.includes(s.code)} onClick={() => toggleStatus(s.code)} count={s.count}>
                                        {s.label}
                                    </Chip>
                                ))}
                                {/* Statuses picked on the page but absent from this selection stay removable. */}
                                {statuses.filter((c) => !preview!.statuses.some((s) => s.code === c)).map((code) => (
                                    <Chip key={code} active onClick={() => toggleStatus(code)} count={0}>{code}</Chip>
                                ))}
                            </div>
                        </div>
                    )}
                </Section>

                {/* ── Counted actions ───────────────────────────────────── */}
                <Section
                    icon={Users}
                    title="Actions prises en compte"
                    hint="Définit les actions comptées (tentatives, statut, historique). Une ligne sans action dans ce périmètre compte comme non traitée."
                >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label htmlFor="export-sdr" className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">SDR</label>
                            <select
                                id="export-sdr"
                                value={sdrId}
                                onChange={(e) => setSdrId(e.target.value)}
                                className="w-full h-9 px-3 text-sm font-semibold bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:border-primary-400 cursor-pointer"
                            >
                                <option value="">Tous les SDR</option>
                                {sdrOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <p className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Canal</p>
                            <div className="flex gap-1.5">
                                {CHANNEL_OPTIONS.map((c) => {
                                    const Icon = c.icon;
                                    return (
                                        <Chip key={c.value} active={channels.includes(c.value)} onClick={() => toggleChannel(c.value)}>
                                            <Icon className="w-3 h-3" aria-hidden /> {c.label}
                                        </Chip>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Période</p>
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-slate-400" aria-hidden />
                                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Du"
                                    className="h-9 px-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:border-primary-400" />
                                <span className="text-xs text-slate-400">→</span>
                                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Au"
                                    className="h-9 px-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:border-primary-400" />
                            </div>
                            {PERIOD_PRESETS.map((p) => (
                                <button key={p.label} type="button"
                                    onClick={() => { const r = p.range(); setFrom(r.from); setTo(r.to); }}
                                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-slate-600 hover:bg-slate-50">
                                    {p.label}
                                </button>
                            ))}
                            {(from || to) && (
                                <button type="button" onClick={() => { setFrom(""); setTo(""); }}
                                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-500 hover:bg-slate-100">
                                    Depuis le début
                                </button>
                            )}
                        </div>
                    </div>
                    {hasActionFilters && treatment === "all" && (
                        <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                            Astuce : choisissez « Traités » pour n&apos;exporter que les lignes travaillées dans ce périmètre.
                        </p>
                    )}
                </Section>

                {/* ── Format ────────────────────────────────────────────── */}
                <Section icon={FileSpreadsheet} title="Format du fichier">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {([
                            { value: "xlsx", icon: FileSpreadsheet, label: "Excel (.xlsx)", desc: "Synthèse, une feuille par liste, historique détaillé. Recommandé pour le client." },
                            { value: "csv", icon: FileText, label: "CSV (;)", desc: "Une seule table, toutes listes confondues. Pour réimporter ailleurs." },
                        ] as { value: ExportFormat; icon: React.ElementType; label: string; desc: string }[]).map((f) => {
                            const Icon = f.icon;
                            const active = format === f.value;
                            return (
                                <button key={f.value} type="button" onClick={() => setFormat(f.value)} aria-pressed={active}
                                    className={cn(
                                        "flex items-start gap-3 p-3 rounded-xl border text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400",
                                        active ? "border-primary-400 bg-primary-50/60 ring-1 ring-primary-400" : "border-slate-200 bg-white hover:border-slate-300"
                                    )}>
                                    <Icon className={cn("w-5 h-5 shrink-0 mt-0.5", active ? "text-primary-600" : "text-slate-400")} aria-hidden />
                                    <span>
                                        <span className="block text-xs font-bold text-slate-900">{f.label}</span>
                                        <span className="block text-[11px] text-slate-500 mt-0.5 leading-snug">{f.desc}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    {format === "xlsx" && (
                        <div className="flex flex-wrap gap-4 pt-1">
                            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                                <input type="checkbox" checked={includeSummary} onChange={(e) => setIncludeSummary(e.target.checked)}
                                    className="w-4 h-4 rounded border-slate-300 accent-primary-600" />
                                Feuille « Synthèse » (avancement, statuts, SDR)
                            </label>
                            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                                <input type="checkbox" checked={includeHistory} onChange={(e) => setIncludeHistory(e.target.checked)}
                                    className="w-4 h-4 rounded border-slate-300 accent-primary-600" />
                                Feuille « Historique » (une ligne par action)
                            </label>
                        </div>
                    )}
                    <p className="text-[11px] text-slate-400 leading-snug">
                        Colonnes ajoutées à chaque ligne : traité, statut actuel, date de la dernière action, tentatives d&apos;appel,
                        nombre d&apos;actions, dernier SDR, prochain rappel, RDV, dernier commentaire, résumé d&apos;appel, historique complet.
                    </p>
                </Section>
            </div>

            {/* ── Footer ────────────────────────────────────────────────── */}
            <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="min-w-0 text-xs" aria-live="polite">
                    {previewError ? (
                        <span className="text-red-600 font-semibold">{previewError}</span>
                    ) : totals ? (
                        <span className="flex items-center gap-2 text-slate-600">
                            {previewLoading
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary-500" aria-hidden />
                                : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" aria-hidden />}
                            <span>
                                <span className="font-black text-slate-900 tabular-nums">{nf.format(exportedRows)}</span> ligne{exportedRows !== 1 ? "s" : ""}
                                {" "}· {selectedCount} liste{selectedCount !== 1 ? "s" : ""}
                                {" "}· {nf.format(totals.actions)} action{totals.actions !== 1 ? "s" : ""} ({nf.format(totals.calls)} appel{totals.calls !== 1 ? "s" : ""})
                            </span>
                        </span>
                    ) : (
                        <span className="flex items-center gap-2 text-slate-500">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> Calcul de l&apos;aperçu…
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button type="button" onClick={onClose} disabled={downloading}
                        className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                        Annuler
                    </button>
                    <button
                        type="button"
                        onClick={handleExport}
                        disabled={downloading || previewLoading || !totals || exportedRows === 0 || selectedCount === 0}
                        className="h-10 px-5 flex items-center gap-2 rounded-xl bg-primary-600 text-white text-sm font-bold shadow-sm hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                    >
                        {downloading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Download className="w-4 h-4" aria-hidden />}
                        {downloading ? "Génération du fichier…" : `Exporter ${format === "xlsx" ? "en Excel" : "en CSV"}`}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
