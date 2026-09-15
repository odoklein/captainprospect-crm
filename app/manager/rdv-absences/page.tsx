"use client";

/**
 * ============================================================
 * SIGNALEMENTS ABSENTS — manual no-show reporting
 * ============================================================
 * Clients and commerciaux can flag a "Contact absent" from their portal for 48h
 * after the meeting. Past that, the portal button is closed and the no-show has
 * to be raised here, by hand.
 *
 * A report writes a MeetingFeedback with outcome NO_SHOW, which is exactly what
 * the SDR ("télépro") dashboard reads — so it shows up there immediately, with
 * no extra sync. See app/api/manager/rdv-absences/route.ts.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    AlertTriangle, CalendarX2, CheckCircle2, Clock, Loader2, RefreshCw,
    Search, UserX, Users, Building2, Send,
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
    } | null;
}

interface AbsencesPayload {
    pending: AbsenceRow[];
    reported: AbsenceRow[];
    kpis: {
        pending: number;
        pendingLate: number;
        reportedManually: number;
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
    if (h < 24) return `il y a ${h}h`;
    const d = Math.floor(h / 24);
    return `il y a ${d}${d > 1 ? "s" : ""}`;
}

export default function RdvAbsencesPage() {
    const { success, error: showError } = useToast();
    const [data, setData] = useState<AbsencesPayload | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [tab, setTab] = useState<"pending" | "reported">("pending");
    const [query, setQuery] = useState("");
    const [lateOnly, setLateOnly] = useState(true);

    const [target, setTarget] = useState<AbsenceRow | null>(null);
    const [recontact, setRecontact] = useState<string>("YES");
    const [note, setNote] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const load = useCallback(async (silent = false) => {
        if (silent) setIsRefreshing(true);
        else setIsLoading(true);
        try {
            const res = await fetch("/api/manager/rdv-absences");
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

    const rows = useMemo(() => {
        if (!data) return [];
        const base = tab === "pending" ? data.pending : data.reported;
        const scoped = tab === "pending" && lateOnly
            ? base.filter((r) => !r.portalWindowOpen)
            : base;
        const q = query.trim().toLowerCase();
        if (!q) return scoped;
        return scoped.filter((r) =>
            [r.contactName, r.companyName, r.clientName, r.missionName, r.sdr?.name]
                .filter(Boolean).join(" ").toLowerCase().includes(q)
        );
    }, [data, tab, lateOnly, query]);

    function openReport(row: AbsenceRow) {
        setTarget(row);
        setRecontact("YES");
        setNote("");
    }

    async function submitReport() {
        if (!target) return;
        setIsSubmitting(true);
        try {
            const res = await fetch("/api/manager/rdv-absences", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    actionId: target.id,
                    recontactRequested: recontact,
                    note: note.trim() || undefined,
                }),
            });
            const json = await res.json();
            if (!json.success) {
                showError("Signalement impossible", json.error);
                return;
            }
            success("RDV signalé absent", "Il apparaît dès maintenant dans le dashboard télépro.");
            setTarget(null);
            await load(true);
        } catch {
            showError("Signalement impossible");
        } finally {
            setIsSubmitting(false);
        }
    }

    const kpis = data?.kpis;

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <UserX className="w-6 h-6 text-rose-500" />
                        Signalements absents
                    </h1>
                    <p className="text-sm text-slate-500 mt-1 max-w-2xl">
                        Le portail client laisse {NO_SHOW_REPORT_WINDOW_HOURS}h pour signaler un contact absent.
                        Passé ce délai, le signalement se fait ici — il remonte directement au dashboard télépro.
                    </p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => load(true)} disabled={isRefreshing}>
                    {isRefreshing
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <RefreshCw className="w-4 h-4" />}
                    Actualiser
                </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard
                    label={`Hors délai ${NO_SHOW_REPORT_WINDOW_HOURS}h`}
                    value={kpis?.pendingLate ?? 0}
                    icon={AlertTriangle}
                    iconBg="bg-rose-100"
                    iconColor="text-rose-600"
                    subtitle={<span className="text-slate-500">RDV passés sans retour, non signalables par le client</span>}
                />
                <StatCard
                    label="En attente de retour"
                    value={kpis?.pending ?? 0}
                    icon={Clock}
                    iconBg="bg-amber-100"
                    iconColor="text-amber-600"
                    subtitle={<span className="text-slate-500">Tous les RDV passés sans avis</span>}
                />
                <StatCard
                    label="Signalés à la main"
                    value={kpis?.reportedManually ?? 0}
                    icon={CheckCircle2}
                    iconBg="bg-indigo-100"
                    iconColor="text-indigo-600"
                    subtitle={<span className="text-slate-500">Remontés depuis cet espace</span>}
                />
            </div>

            <div className="bg-white border border-slate-200 rounded-xl">
                <div className="p-4 border-b border-slate-200 flex items-center gap-3 flex-wrap">
                    <Tabs
                        tabs={[
                            { id: "pending", label: `À traiter (${data?.pending.length ?? 0})` },
                            { id: "reported", label: `Déjà absents (${data?.reported.length ?? 0})` },
                        ]}
                        activeTab={tab}
                        onTabChange={(id) => setTab(id as "pending" | "reported")}
                    />
                    <div className="flex-1 min-w-[220px]">
                        <Input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Contact, société, client, booker…"
                            icon={<Search className="w-4 h-4" />}
                        />
                    </div>
                    {tab === "pending" && (
                        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={lateOnly}
                                onChange={(e) => setLateOnly(e.target.checked)}
                                className="rounded border-slate-300"
                            />
                            Hors délai uniquement
                        </label>
                    )}
                </div>

                {isLoading ? (
                    <div className="p-4"><TableSkeleton /></div>
                ) : rows.length === 0 ? (
                    <div className="p-12 text-center">
                        <CalendarX2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                        <p className="text-sm text-slate-500">
                            {tab === "pending"
                                ? "Aucun rendez-vous en attente de signalement."
                                : "Aucun rendez-vous marqué absent."}
                        </p>
                    </div>
                ) : (
                    <ul className="divide-y divide-slate-100">
                        {rows.map((row) => (
                            <li key={row.id} className="p-4 flex items-start gap-4 hover:bg-slate-50/70 transition-colors">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-semibold text-slate-900">{row.contactName}</span>
                                        <span className="text-slate-400">·</span>
                                        <span className="text-sm text-slate-600 inline-flex items-center gap-1">
                                            <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                            {row.companyName}
                                        </span>
                                        {!row.portalWindowOpen && tab === "pending" && (
                                            <Badge variant="danger">
                                                Hors délai {NO_SHOW_REPORT_WINDOW_HOURS}h
                                            </Badge>
                                        )}
                                        {row.portalWindowOpen && tab === "pending" && (
                                            <Badge variant="warning">
                                                Le client peut encore signaler
                                            </Badge>
                                        )}
                                        {row.feedback?.source && tab === "reported" && (
                                            <Badge variant={row.feedback.source === "MANAGER_MANUAL" ? "primary" : "default"}>
                                                {SOURCE_LABEL[row.feedback.source] ?? row.feedback.source}
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="mt-1 text-xs text-slate-500 flex items-center gap-3 flex-wrap">
                                        <span>{fmtDate(row.callbackDate)} · {elapsedLabel(row.callbackDate)}</span>
                                        <span className="inline-flex items-center gap-1">
                                            <Users className="w-3.5 h-3.5" />
                                            {row.clientName}
                                            {row.missionName ? ` · ${row.missionName}` : ""}
                                        </span>
                                        {row.sdr && <span>Booké par {row.sdr.name}</span>}
                                    </div>
                                    {row.feedback?.note && (
                                        <p className="mt-2 text-xs text-slate-600 italic border-l-2 border-slate-200 pl-2">
                                            {row.feedback.note}
                                        </p>
                                    )}
                                    {tab === "reported" && row.feedback?.reportedBy && (
                                        <p className="mt-1 text-xs text-slate-400">
                                            Signalé par {row.feedback.reportedBy} le {fmtDate(row.feedback.reportedAt)}
                                        </p>
                                    )}
                                </div>
                                {tab === "pending" && (
                                    <Button variant="danger" size="sm" onClick={() => openReport(row)}>
                                        <UserX className="w-4 h-4" />
                                        Signaler absent
                                    </Button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <Modal
                isOpen={!!target}
                onClose={() => (isSubmitting ? undefined : setTarget(null))}
                title="Signaler un contact absent"
                description={target ? `${target.contactName} · ${target.companyName} — ${fmtDate(target.callbackDate)}` : undefined}
                size="md"
            >
                <div className="space-y-5">
                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                        Ce signalement sera enregistré comme <strong>RDV absent</strong> et apparaîtra
                        immédiatement dans le dashboard télépro
                        {target?.sdr ? ` de ${target.sdr.name}` : ""}.
                    </div>

                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                            Recontacter ce prospect ?
                        </p>
                        <div className="flex gap-2">
                            {RECONTACT_OPTS.map(({ value, label }) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setRecontact(value)}
                                    className={cn(
                                        "flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
                                        recontact === value
                                            ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                                    )}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                            Commentaire <span className="normal-case font-normal text-slate-400">(optionnel)</span>
                        </p>
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            rows={3}
                            maxLength={1000}
                            placeholder="Contexte, retour du client, suite à donner…"
                            className="w-full rounded-lg border border-slate-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
                        />
                    </div>
                </div>

                <ModalFooter>
                    <Button variant="secondary" onClick={() => setTarget(null)} disabled={isSubmitting}>
                        Annuler
                    </Button>
                    <Button variant="danger" onClick={submitReport} isLoading={isSubmitting}>
                        <Send className="w-4 h-4" />
                        Confirmer le signalement
                    </Button>
                </ModalFooter>
            </Modal>
        </div>
    );
}
