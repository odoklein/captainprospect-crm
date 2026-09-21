"use client";

/**
 * ============================================================
 * SIGNALEMENTS ABSENTS — the absences still to deal with
 * ============================================================
 * This space shows one thing and one thing only: RDV that were *flagged absent*
 * and are *not dealt with yet*. Past meetings that simply have no feedback are
 * deliberately NOT listed — they are not absences, nobody should be acting on
 * them from here, and mixing them in made the real backlog unreadable.
 *
 * Flagging a late no-show by hand now happens where the RDV is, from the
 * "Signaler absent" button at the top of the fiche RDV, which also lets the
 * manager pick the SDR who picks it back up.
 *
 * A report writes a MeetingFeedback with outcome NO_SHOW, which is exactly what
 * the SDR ("télépro") dashboard reads — so it shows up there immediately, with
 * no extra sync. See app/api/manager/rdv-absences/route.ts.
 *
 * A RDV that was re-booked instead of no-showed leaves by the other door:
 * "Replacé" cancels it with the `replaced` reason, which takes it off this list
 * and off the SDR absence board.
 *
 * And one that is neither — nothing to do with it today, but not closed either —
 * goes to "Absent en stand by": the no-show stays recorded, the RDV leaves the
 * SDR's absence banner and calling queue, and a manager can reactivate it here.
 *
 * This is a backlog, so the page is built to clear one: filter, sort oldest
 * first, and act on a batch in one go.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    AlertTriangle, CalendarX2, CheckCircle2, Clock, Loader2, RefreshCw,
    Search, UserX, Users, Building2, Send, CalendarClock, X, PauseCircle, PlayCircle,
} from "lucide-react";
import {
    Badge, Button, Input, Modal, ModalFooter, StatCard, Tabs, useToast,
} from "@/components/ui";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { NO_SHOW_REPORT_WINDOW_HOURS } from "@/lib/meetings/noShowWindow";

interface AbsenceRow {
    id: string;
    callbackDate: string | null;
    meetingType: string | null;
    contactName: string;
    companyName: string;
    missionId: string | null;
    missionName: string | null;
    campaignName: string | null;
    clientId: string | null;
    clientName: string;
    sdr: { id: string; name: string } | null;
    portalWindowOpen: boolean;
    feedback: {
        outcome: string;
        recontactRequested: string;
        note: string | null;
        source: string | null;
        reportedBy: string | null;
        reportedAt: string;
        standByAt: string | null;
        standByReason: string | null;
        standByBy: string | null;
    } | null;
}

interface AbsencesPayload {
    pending: AbsenceRow[];
    reported: AbsenceRow[];
    /** Absences set aside on purpose: on record, but off the SDR boards. */
    standby?: AbsenceRow[];
    sdrs?: { id: string; name: string; email: string }[];
    kpis: {
        pending: number;
        pendingLate: number;
        reportedManually: number;
        standby?: number;
        windowHours: number;
    };
}

const SOURCE_LABEL: Record<string, string> = {
    PORTAL_CLIENT: "Portail client",
    PORTAL_COMMERCIAL: "Portail commercial",
    MANAGER: "Manager (fiche RDV)",
    MANAGER_MANUAL: "Signalement manuel",
};

const RECONTACT_OPTS = [
    { value: "YES", label: "Oui, à recontacter" },
    { value: "MAYBE", label: "Peut-être" },
    { value: "NO", label: "Non, clôturer" },
] as const;

type TabKey = "reported" | "standby";
type SortKey = "oldest" | "newest";

function fmtDate(iso: string | null): string {
    if (!iso) return "Date inconnue";
    return new Date(iso).toLocaleString("fr-FR", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris",
    });
}

function hoursSince(iso: string | null): number | null {
    if (!iso) return null;
    return Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
}

function elapsedLabel(iso: string | null): string {
    const h = hoursSince(iso);
    if (h == null) return "—";
    if (h < 1) return "à l'instant";
    if (h < 24) return `il y a ${h} h`;
    const d = Math.floor(h / 24);
    if (d < 31) return `il y a ${d} j`;
    const m = Math.floor(d / 30);
    return `il y a ${m} mois`;
}

/** Older than this and the backlog item is properly stale, not just late. */
function agingTone(iso: string | null): "fresh" | "late" | "stale" {
    const h = hoursSince(iso);
    if (h == null) return "fresh";
    if (h >= 24 * 14) return "stale";
    if (h >= NO_SHOW_REPORT_WINDOW_HOURS) return "late";
    return "fresh";
}

export default function RdvAbsencesPage() {
    const { success, error: showError } = useToast();
    const [data, setData] = useState<AbsencesPayload | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [tab, setTab] = useState<TabKey>("reported");
    const [query, setQuery] = useState("");
    const [clientFilter, setClientFilter] = useState<string>("all");
    const [sort, setSort] = useState<SortKey>("oldest");

    // Batch selection — clearing this list one row at a time is the slow way.
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const [reportTargets, setReportTargets] = useState<AbsenceRow[]>([]);
    const [recontact, setRecontact] = useState<string>("YES");
    const [note, setNote] = useState("");
    const [selectedSdrId, setSelectedSdrId] = useState<string>("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [replaceTargets, setReplaceTargets] = useState<AbsenceRow[]>([]);
    const [isReplacing, setIsReplacing] = useState(false);

    const [standByTargets, setStandByTargets] = useState<AbsenceRow[]>([]);
    const [standByReason, setStandByReason] = useState("");
    const [isStandingBy, setIsStandingBy] = useState(false);
    const [isReactivating, setIsReactivating] = useState(false);

    const load = useCallback(async (silent = false) => {
        if (silent) setIsRefreshing(true);
        else setIsLoading(true);
        try {
            // scope=reported: this space no longer lists the RDV without any
            // feedback, so there is no reason to go and fetch them.
            const res = await fetch("/api/manager/rdv-absences?scope=reported");
            const json = await res.json();
            if (json.success) setData(json.data as AbsencesPayload);
            else showError("Chargement impossible", json.error);
        } catch {
            showError("Chargement impossible");
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [showError]);

    useEffect(() => { load(); }, [load]);

    // Switching list or filters must not leave invisible rows selected.
    useEffect(() => { setSelected(new Set()); }, [tab, clientFilter, query]);

    const clientOptions = useMemo(() => {
        if (!data) return [];
        const seen = new Map<string, string>();
        for (const row of [...data.reported, ...(data.standby ?? [])]) {
            if (row.clientId) seen.set(row.clientId, row.clientName);
        }
        return Array.from(seen, ([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name, "fr"));
    }, [data]);

    const rows = useMemo(() => {
        if (!data) return [];
        const base = tab === "standby" ? (data.standby ?? []) : data.reported;
        let scoped = base;
        if (clientFilter !== "all") {
            scoped = scoped.filter((r) => r.clientId === clientFilter);
        }
        const q = query.trim().toLowerCase();
        if (q) {
            scoped = scoped.filter((r) =>
                [r.contactName, r.companyName, r.clientName, r.missionName, r.sdr?.name]
                    .filter(Boolean).join(" ").toLowerCase().includes(q)
            );
        }
        return [...scoped].sort((a, b) => {
            const ta = a.callbackDate ? new Date(a.callbackDate).getTime() : 0;
            const tb = b.callbackDate ? new Date(b.callbackDate).getTime() : 0;
            return sort === "oldest" ? ta - tb : tb - ta;
        });
    }, [data, tab, clientFilter, query, sort]);

    const selectedRows = useMemo(
        () => rows.filter((r) => selected.has(r.id)),
        [rows, selected],
    );
    const allVisibleSelected = rows.length > 0 && selectedRows.length === rows.length;

    function toggleRow(id: string) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function toggleAllVisible() {
        setSelected(allVisibleSelected ? new Set() : new Set(rows.map((r) => r.id)));
    }

    function openReport(rowsToReport: AbsenceRow[]) {
        setReportTargets(rowsToReport);
        setRecontact("YES");
        setNote("");
        setSelectedSdrId(rowsToReport.length === 1 && rowsToReport[0].sdr?.id ? rowsToReport[0].sdr.id : "");
    }

    async function submitReport() {
        if (reportTargets.length === 0) return;
        setIsSubmitting(true);
        try {
            const results = await Promise.allSettled(
                reportTargets.map(async (row) => {
                    const res = await fetch("/api/manager/rdv-absences", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            actionId: row.id,
                            recontactRequested: recontact,
                            note: note.trim() || undefined,
                            reassignSdrId: selectedSdrId || undefined,
                        }),
                    });
                    const json = await res.json();
                    if (!res.ok || !json.success) throw new Error(json.error || "Échec");
                    return row.id;
                }),
            );
            const ok = results.filter((r) => r.status === "fulfilled").length;
            const failed = results.length - ok;

            if (ok > 0) {
                success(
                    ok > 1 ? `${ok} RDV signalés absents` : "RDV signalé absent",
                    "Ils apparaissent dès maintenant dans le dashboard télépro.",
                );
            }
            if (failed > 0) {
                showError(
                    `${failed} signalement${failed > 1 ? "s" : ""} en échec`,
                    "Les autres ont bien été enregistrés.",
                );
            }
            setReportTargets([]);
            setSelected(new Set());
            await load(true);
        } finally {
            setIsSubmitting(false);
        }
    }

    /**
     * The RDV did not hold and a new one was booked in its place: close the old
     * one as cancelled with the "replaced" reason. That is what takes it out of
     * this space and off the SDR absence banner — flagging it absent used to be
     * the only exit, which misreported what happened.
     */
    async function submitReplace() {
        if (replaceTargets.length === 0) return;
        setIsReplacing(true);
        try {
            const results = await Promise.allSettled(
                replaceTargets.map(async (row) => {
                    const res = await fetch(`/api/manager/rdv/${row.id}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            result: "MEETING_CANCELLED",
                            cancellationReason: "replaced",
                        }),
                    });
                    const json = await res.json();
                    if (!res.ok || !json.success) throw new Error(json.error || "Échec");
                    return row.id;
                }),
            );
            const ok = results.filter((r) => r.status === "fulfilled").length;
            const failed = results.length - ok;

            if (ok > 0) {
                success(
                    ok > 1 ? `${ok} RDV marqués replacés` : "RDV marqué replacé",
                    "Ils sortent de cet espace et du tableau des absents côté SDR.",
                );
            }
            if (failed > 0) {
                showError(`${failed} RDV n'ont pas pu être mis à jour`);
            }
            setReplaceTargets([]);
            setSelected(new Set());
            await load(true);
        } finally {
            setIsReplacing(false);
        }
    }

    /**
     * Stand by: the absence is real and stays on record, but nobody should be
     * calling this contact right now. It is the exit that was missing — the only
     * other ways out were cancelling the RDV or flagging it replaced, both of
     * which say something that did not happen.
     */
    async function patchStandBy(targets: AbsenceRow[], standBy: boolean, reason?: string) {
        const results = await Promise.allSettled(
            targets.map(async (row) => {
                const res = await fetch("/api/manager/rdv-absences", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        actionId: row.id,
                        standBy,
                        reason: reason?.trim() || undefined,
                    }),
                });
                const json = await res.json();
                if (!res.ok || !json.success) throw new Error(json.error || "Échec");
                return row.id;
            }),
        );
        const ok = results.filter((r) => r.status === "fulfilled").length;
        return { ok, failed: results.length - ok };
    }

    async function submitStandBy() {
        if (standByTargets.length === 0) return;
        setIsStandingBy(true);
        try {
            const { ok, failed } = await patchStandBy(standByTargets, true, standByReason);
            if (ok > 0) {
                success(
                    ok > 1 ? `${ok} RDV mis en stand by` : "RDV mis en stand by",
                    "Ils sortent du tableau des absents côté SDR et de la file d'appels.",
                );
            }
            if (failed > 0) showError(`${failed} RDV n'ont pas pu être mis en stand by`);
            setStandByTargets([]);
            setStandByReason("");
            setSelected(new Set());
            await load(true);
        } finally {
            setIsStandingBy(false);
        }
    }

    async function reactivate(targets: AbsenceRow[]) {
        if (targets.length === 0) return;
        setIsReactivating(true);
        try {
            const { ok, failed } = await patchStandBy(targets, false);
            if (ok > 0) {
                success(
                    ok > 1 ? `${ok} RDV réactivés` : "RDV réactivé",
                    "Ils reviennent dans les absents à traiter, côté SDR aussi.",
                );
            }
            if (failed > 0) showError(`${failed} RDV n'ont pas pu être réactivés`);
            setSelected(new Set());
            await load(true);
        } finally {
            setIsReactivating(false);
        }
    }

    const kpis = data?.kpis;
    /** How much of the backlog has been sitting past the portal's own window. */
    const lateCount = useMemo(
        () => (data?.reported ?? []).filter((r) => agingTone(r.callbackDate) !== "fresh").length,
        [data],
    );

    const totalInTab = tab === "standby"
        ? data?.standby?.length ?? 0
        : data?.reported.length ?? 0;

    return (
        <div className="space-y-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <UserX className="w-6 h-6 text-rose-500" />
                        Signalements absents
                    </h1>
                    <p className="text-sm text-slate-500 mt-1 max-w-2xl">
                        Uniquement les RDV <strong>signalés absents et non traités</strong> : ni replacés, ni mis
                        en stand by. Pour signaler un absent hors délai, passez par le bouton
                        <strong> Signaler absent</strong> en haut de la fiche RDV.
                    </p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => load(true)} disabled={isRefreshing}>
                    {isRefreshing
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <RefreshCw className="w-4 h-4" />}
                    Actualiser
                </Button>
            </div>

            {/* KPIs double as filters: clicking one scopes the list below. */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    label="Absents à traiter"
                    value={data?.reported.length ?? 0}
                    icon={AlertTriangle}
                    iconBg="bg-rose-100"
                    iconColor="text-rose-600"
                    subtitle={<span className="text-slate-500">Signalés absents, ni replacés ni mis de côté</span>}
                    onClick={() => setTab("reported")}
                    className={cn(
                        "cursor-pointer transition-shadow hover:shadow-md",
                        tab === "reported" && "ring-2 ring-rose-200",
                    )}
                />
                <StatCard
                    label="En retard"
                    value={lateCount}
                    icon={Clock}
                    iconBg="bg-amber-100"
                    iconColor="text-amber-600"
                    subtitle={<span className="text-slate-500">À traiter depuis plus de {NO_SHOW_REPORT_WINDOW_HOURS}h</span>}
                />
                <StatCard
                    label="Signalés à la main"
                    value={kpis?.reportedManually ?? 0}
                    icon={CheckCircle2}
                    iconBg="bg-indigo-100"
                    iconColor="text-indigo-600"
                    subtitle={<span className="text-slate-500">Remontés par un manager, pas par le portail</span>}
                />
                <StatCard
                    label="En stand by"
                    value={kpis?.standby ?? 0}
                    icon={PauseCircle}
                    iconBg="bg-slate-100"
                    iconColor="text-slate-600"
                    subtitle={<span className="text-slate-500">Mis de côté — retirés des listes SDR</span>}
                    onClick={() => setTab("standby")}
                    className={cn(
                        "cursor-pointer transition-shadow hover:shadow-md",
                        tab === "standby" && "ring-2 ring-slate-300",
                    )}
                />
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 pt-3 border-b border-slate-200 bg-white">
                    <Tabs
                        tabs={[
                            { id: "reported", label: `À traiter (${data?.reported.length ?? 0})` },
                            { id: "standby", label: `En stand by (${data?.standby?.length ?? 0})` },
                        ]}
                        activeTab={tab}
                        onTabChange={(id) => setTab(id as TabKey)}
                    />
                </div>

                {/* Toolbar */}
                <div className="sticky top-14 z-20 p-3 border-b border-slate-200 flex items-center gap-2.5 flex-wrap bg-slate-50/95 backdrop-blur">
                    <div className="flex-1 min-w-[220px]">
                        <Input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Contact, société, client, booker…"
                            icon={<Search className="w-4 h-4" />}
                        />
                    </div>

                    <select
                        value={clientFilter}
                        onChange={(e) => setClientFilter(e.target.value)}
                        className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                        aria-label="Filtrer par client"
                    >
                        <option value="all">Tous les clients</option>
                        {clientOptions.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>

                    <select
                        value={sort}
                        onChange={(e) => setSort(e.target.value as SortKey)}
                        className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                        aria-label="Trier"
                    >
                        <option value="oldest">Plus anciens d&apos;abord</option>
                        <option value="newest">Plus récents d&apos;abord</option>
                    </select>

                    <span className="text-xs text-slate-500 whitespace-nowrap">
                        {rows.length} / {totalInTab}
                    </span>
                </div>

                {/* Batch bar */}
                {selectedRows.length > 0 && (
                    <div className="sticky top-[7.25rem] z-20 flex flex-wrap items-center gap-2 border-b border-indigo-100 bg-indigo-50/95 px-4 py-2.5 backdrop-blur">
                        <span className="text-sm font-semibold text-indigo-900">
                            {selectedRows.length} sélectionné{selectedRows.length > 1 ? "s" : ""}
                        </span>
                        <div className="flex-1" />
                        {tab === "reported" && (
                            <Button variant="primary" size="sm" onClick={() => openReport(selectedRows)}>
                                <RefreshCw className="w-4 h-4" />
                                Réaffecter SDR
                            </Button>
                        )}
                        {tab === "reported" && (
                            <Button variant="outline" size="sm" onClick={() => { setStandByReason(""); setStandByTargets(selectedRows); }}>
                                <PauseCircle className="w-4 h-4" />
                                Mettre en stand by
                            </Button>
                        )}
                        {tab === "standby" && (
                            <Button variant="primary" size="sm" onClick={() => reactivate(selectedRows)} disabled={isReactivating}>
                                {isReactivating ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                                Réactiver
                            </Button>
                        )}
                        {tab !== "standby" && (
                            <Button variant="outline" size="sm" onClick={() => setReplaceTargets(selectedRows)}>
                                <CalendarClock className="w-4 h-4" />
                                Marquer replacés
                            </Button>
                        )}
                        <button
                            type="button"
                            onClick={() => setSelected(new Set())}
                            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-slate-700"
                            aria-label="Vider la sélection"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {isLoading ? (
                    <div className="p-4"><TableSkeleton /></div>
                ) : rows.length === 0 ? (
                    <div className="p-12 text-center">
                        <CalendarX2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                        <p className="text-sm font-medium text-slate-700">
                            {tab === "standby"
                                ? "Aucun rendez-vous en stand by."
                                : "Aucun absent à traiter. Le backlog est vide."}
                        </p>
                        {(query || clientFilter !== "all") && totalInTab > 0 && (
                            <button
                                type="button"
                                onClick={() => { setQuery(""); setClientFilter("all"); }}
                                className="mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                            >
                                Réinitialiser les filtres ({totalInTab} au total)
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="flex items-center gap-3 border-b border-slate-100 bg-white px-4 py-2">
                            <input
                                type="checkbox"
                                checked={allVisibleSelected}
                                onChange={toggleAllVisible}
                                className="rounded border-slate-300"
                                aria-label="Tout sélectionner"
                            />
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                Tout sélectionner
                            </span>
                        </div>

                        <ul className="divide-y divide-slate-100">
                            {rows.map((row) => {
                                const tone = agingTone(row.callbackDate);
                                const isSelected = selected.has(row.id);
                                return (
                                    <li
                                        key={row.id}
                                        className={cn(
                                            "group relative flex items-start gap-3 px-4 py-3 transition-colors",
                                            isSelected ? "bg-indigo-50/50" : "hover:bg-slate-50/70",
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                "absolute inset-y-0 left-0 w-0.5",
                                                tone === "stale" ? "bg-rose-500"
                                                    : tone === "late" ? "bg-amber-400"
                                                        : "bg-transparent",
                                            )}
                                            aria-hidden="true"
                                        />
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => toggleRow(row.id)}
                                            className="mt-1 rounded border-slate-300"
                                            aria-label={`Sélectionner le RDV de ${row.contactName}`}
                                        />

                                        <div className="min-w-0 flex-1">
                                            {/* Identity */}
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-semibold text-slate-900">{row.contactName}</span>
                                                <span className="text-sm text-slate-600 inline-flex items-center gap-1">
                                                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                                    {row.companyName}
                                                </span>
                                                {tab === "standby" && (
                                                    <Badge variant="default">En stand by</Badge>
                                                )}
                                                {row.feedback?.source && (
                                                    <Badge variant={row.feedback.source === "MANAGER_MANUAL" ? "primary" : "default"}>
                                                        {SOURCE_LABEL[row.feedback.source] ?? row.feedback.source}
                                                    </Badge>
                                                )}
                                            </div>

                                            {/* Facts, one per column so the list can be scanned */}
                                            <div className="mt-1.5 grid gap-x-6 gap-y-1 text-xs text-slate-500 sm:grid-cols-3">
                                                <span className="inline-flex items-center gap-1.5">
                                                    <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                    <span className="truncate">{fmtDate(row.callbackDate)}</span>
                                                    <span
                                                        className={cn(
                                                            "font-semibold whitespace-nowrap",
                                                            tone === "stale" ? "text-rose-600"
                                                                : tone === "late" ? "text-amber-600"
                                                                    : "text-slate-400",
                                                        )}
                                                    >
                                                        · {elapsedLabel(row.callbackDate)}
                                                    </span>
                                                </span>
                                                <span className="inline-flex items-center gap-1.5 min-w-0">
                                                    <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                    <span className="truncate">
                                                        {row.clientName}
                                                        {row.missionName ? ` · ${row.missionName}` : ""}
                                                    </span>
                                                </span>
                                                {row.sdr && (
                                                    <span className="truncate">Booké par {row.sdr.name}</span>
                                                )}
                                            </div>

                                            {row.feedback?.note && (
                                                <p className="mt-2 border-l-2 border-slate-200 pl-2 text-xs italic text-slate-600">
                                                    {row.feedback.note}
                                                </p>
                                            )}
                                            {row.feedback?.reportedBy && (
                                                <p className="mt-1 text-xs text-slate-400">
                                                    Signalé par {row.feedback.reportedBy} le {fmtDate(row.feedback.reportedAt)}
                                                </p>
                                            )}
                                            {tab === "standby" && row.feedback?.standByAt && (
                                                <p className="mt-1 text-xs text-slate-500">
                                                    <PauseCircle className="mr-1 inline w-3 h-3 align-[-1px]" />
                                                    En stand by depuis le {fmtDate(row.feedback.standByAt)}
                                                    {row.feedback.standByBy ? ` — ${row.feedback.standByBy}` : ""}
                                                    {row.feedback.standByReason ? ` · ${row.feedback.standByReason}` : ""}
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex flex-shrink-0 items-center gap-2">
                                            {tab === "reported" && (
                                                <>
                                                    <Button variant="outline" size="sm" onClick={() => openReport([row])}>
                                                        <RefreshCw className="w-4 h-4" />
                                                        Réaffecter
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => { setStandByReason(""); setStandByTargets([row]); }}
                                                        title="Laisser ce RDV absent de côté : il sort des listes SDR sans être clôturé"
                                                    >
                                                        <PauseCircle className="w-4 h-4" />
                                                        Stand by
                                                    </Button>
                                                </>
                                            )}
                                            {tab === "standby" && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => reactivate([row])}
                                                    disabled={isReactivating}
                                                    title="Remettre ce RDV absent dans les listes SDR"
                                                >
                                                    {isReactivating ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                                                    Réactiver
                                                </Button>
                                            )}
                                            {tab !== "standby" && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setReplaceTargets([row])}
                                                    title="Le RDV a été replacé : le sortir de cette liste"
                                                >
                                                    <CalendarClock className="w-4 h-4" />
                                                    Replacé
                                                </Button>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </>
                )}
            </div>

            {/* Stand by — single or batch */}
            <Modal
                isOpen={standByTargets.length > 0}
                onClose={() => (isStandingBy ? undefined : setStandByTargets([]))}
                title={standByTargets.length > 1 ? `Mettre ${standByTargets.length} RDV absents en stand by` : "Mettre ce RDV absent en stand by"}
            >
                <div className="space-y-4">
                    {standByTargets.length === 1 ? (
                        <div className="rounded-lg bg-slate-50 p-3 text-sm">
                            <p className="font-semibold text-slate-900">{standByTargets[0].contactName}</p>
                            <p className="text-slate-500">
                                {standByTargets[0].companyName} · {fmtDate(standByTargets[0].callbackDate)}
                            </p>
                        </div>
                    ) : (
                        <div className="max-h-40 overflow-y-auto rounded-lg bg-slate-50 p-3 text-sm">
                            <ul className="space-y-1">
                                {standByTargets.map((r) => (
                                    <li key={r.id} className="flex justify-between gap-3">
                                        <span className="truncate font-medium text-slate-800">{r.contactName}</span>
                                        <span className="shrink-0 text-xs text-slate-500">{r.companyName}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <p className="text-sm text-slate-600">
                        Le RDV reste <strong>enregistré comme absent</strong> : rien n&apos;est clôturé ni réécrit.
                        Il sort simplement du tableau des absents côté SDR et de la file d&apos;appels prioritaire,
                        et vient se ranger dans l&apos;onglet <strong>En stand by</strong>.
                    </p>
                    <p className="text-sm text-slate-500">
                        Un clic sur <strong>Réactiver</strong> le remet dans les listes SDR à tout moment.
                    </p>

                    <div>
                        <label className="mb-1.5 block text-sm font-medium text-slate-700">
                            Motif (optionnel)
                        </label>
                        <textarea
                            value={standByReason}
                            onChange={(e) => setStandByReason(e.target.value)}
                            rows={3}
                            maxLength={1000}
                            placeholder="Pourquoi on le laisse de côté…"
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                        />
                        {standByTargets.length > 1 && (
                            <p className="mt-1 text-xs text-slate-400">
                                Le même motif sera enregistré sur les {standByTargets.length} RDV.
                            </p>
                        )}
                    </div>

                    <ModalFooter>
                        <Button variant="ghost" onClick={() => setStandByTargets([])} disabled={isStandingBy}>
                            Annuler
                        </Button>
                        <Button variant="primary" onClick={submitStandBy} disabled={isStandingBy}>
                            {isStandingBy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PauseCircle className="w-4 h-4" />}
                            Mettre en stand by
                        </Button>
                    </ModalFooter>
                </div>
            </Modal>

            {/* Replacé — single or batch */}
            <Modal
                isOpen={replaceTargets.length > 0}
                onClose={() => (isReplacing ? undefined : setReplaceTargets([]))}
                title={replaceTargets.length > 1 ? "Ces RDV ont été replacés ?" : "Ce RDV a été replacé ?"}
            >
                <div className="space-y-4">
                    <p className="text-sm text-slate-600">
                        {replaceTargets.length > 1
                            ? `Les ${replaceTargets.length} rendez-vous sélectionnés seront marqués `
                            : `L'ancien RDV${replaceTargets[0] ? ` avec ${replaceTargets[0].contactName} (${replaceTargets[0].companyName})` : ""} sera marqué `}
                        <strong>annulé — RDV replacé</strong>. Ils disparaissent de cet espace et du tableau
                        des absents côté SDR, et restent consultables dans l&apos;historique du RDV.
                    </p>
                    <p className="text-sm text-slate-500">
                        Le nouveau RDV se crée normalement de son côté : cette action ne le crée pas.
                    </p>
                    <ModalFooter>
                        <Button variant="ghost" onClick={() => setReplaceTargets([])} disabled={isReplacing}>
                            Annuler
                        </Button>
                        <Button variant="primary" onClick={submitReplace} disabled={isReplacing}>
                            {isReplacing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
                            Confirmer le replacement
                        </Button>
                    </ModalFooter>
                </div>
            </Modal>

            {/* Signaler absent — single or batch */}
            <Modal
                isOpen={reportTargets.length > 0}
                onClose={() => (isSubmitting ? undefined : setReportTargets([]))}
                title={reportTargets.length > 1 ? `Signaler ${reportTargets.length} contacts absents` : "Signaler un contact absent"}
            >
                <div className="space-y-4">
                    {reportTargets.length === 1 ? (
                        <div className="rounded-lg bg-slate-50 p-3 text-sm">
                            <p className="font-semibold text-slate-900">{reportTargets[0].contactName}</p>
                            <p className="text-slate-500">
                                {reportTargets[0].companyName} · {fmtDate(reportTargets[0].callbackDate)}
                            </p>
                        </div>
                    ) : (
                        <div className="max-h-40 overflow-y-auto rounded-lg bg-slate-50 p-3 text-sm">
                            <ul className="space-y-1">
                                {reportTargets.map((r) => (
                                    <li key={r.id} className="flex justify-between gap-3">
                                        <span className="truncate font-medium text-slate-800">{r.contactName}</span>
                                        <span className="shrink-0 text-xs text-slate-500">{r.companyName}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <p className="text-sm text-slate-600">
                        Ce signalement sera enregistré comme <strong>RDV absent</strong> et apparaîtra
                        immédiatement dans le dashboard télépro du booker concerné.
                    </p>

                    <div>
                        <label className="mb-1.5 block text-sm font-medium text-slate-700">
                            Le prospect est-il à recontacter ?
                        </label>
                        <div className="flex gap-2 flex-wrap">
                            {RECONTACT_OPTS.map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setRecontact(opt.value)}
                                    className={cn(
                                        "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                                        recontact === opt.value
                                            ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                                    )}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="mb-1.5 block text-sm font-medium text-slate-700">
                            Précision (optionnel)
                        </label>
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            rows={3}
                            maxLength={1000}
                            placeholder="Ce que le client a dit, le contexte…"
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                        />
                        {reportTargets.length > 1 && (
                            <p className="mt-1 text-xs text-slate-400">
                                La même précision sera enregistrée sur les {reportTargets.length} RDV.
                            </p>
                        )}
                    </div>

                    <div>
                        <label className="mb-1.5 block text-sm font-medium text-slate-700">
                            Assigner / Réaffecter au SDR
                        </label>
                        <select
                            value={selectedSdrId}
                            onChange={(e) => setSelectedSdrId(e.target.value)}
                            className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                        >
                            <option value="">Conserver le télépro initial</option>
                            {data?.sdrs?.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.name} ({s.email})
                                </option>
                            ))}
                        </select>
                        <p className="mt-1 text-xs text-slate-500">
                            Le prospect remontera tout en haut de la file d&apos;appels du SDR avec le tag d&apos;urgence rouge vif <strong>RDV ABSENT</strong>.
                        </p>
                    </div>

                    <ModalFooter>
                        <Button variant="ghost" onClick={() => setReportTargets([])} disabled={isSubmitting}>
                            Annuler
                        </Button>
                        <Button variant="danger" onClick={submitReport} disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            Confirmer le signalement
                        </Button>
                    </ModalFooter>
                </div>
            </Modal>
        </div>
    );
}
