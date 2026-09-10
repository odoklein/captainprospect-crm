"use client";

/**
 * ============================================================
 * DASHBOARD PROJET — client/mission staffing overview
 * ============================================================
 * One row per live mission: contracted days/week (client-level), who has
 * historically worked it (real call data), who's actually scheduled on it right
 * now (real planning data), and a flag when a mission has nobody scheduled.
 *
 * Data comes from GET /api/manager/dashboard-projet (lib/staffing/clientStaffing.ts).
 * "Jours/semaine" is editable inline and persists via PUT /api/clients/[id].
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    LayoutDashboard, Users, AlertTriangle, CheckCircle2, Download,
    Search, Pencil, Check, X as XIcon, Loader2, Phone, Mail, Briefcase,
} from "lucide-react";
import { DataTable, StatCard, Badge, Button, Input, useToast, type Column } from "@/components/ui";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { cn, avatarColorForId, initialsFromName } from "@/lib/utils";

interface Booker {
    id: string;
    name: string;
    actionCount?: number;
    lastActionAt?: string | null;
}

interface StaffingRow {
    missionId: string;
    missionName: string;
    channel: "CALL" | "EMAIL" | "LINKEDIN";
    status: "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED";
    clientId: string;
    clientName: string;
    clientStatus: string;
    contractedDaysPerWeek: number | null;
    historicalBookers: Booker[];
    currentBookers: Booker[];
    missingHeadcount: boolean;
}

interface StaffingOverview {
    rows: StaffingRow[];
    kpis: {
        totalMissions: number;
        activeMissions: number;
        missingHeadcount: number;
        clientsMissingDaysPerWeek: number;
        avgDaysPerWeek: number | null;
    };
}

const CHANNEL_ICON = { CALL: Phone, EMAIL: Mail, LINKEDIN: Briefcase } as const;
const CHANNEL_LABEL = { CALL: "Appel", EMAIL: "Email", LINKEDIN: "LinkedIn" } as const;

const STATUS_BADGE: Record<StaffingRow["status"], string> = {
    DRAFT: "bg-slate-100 text-slate-600 border-slate-200",
    ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
    PAUSED: "bg-amber-50 text-amber-700 border-amber-200",
    COMPLETED: "bg-slate-100 text-slate-500 border-slate-200",
    ARCHIVED: "bg-slate-100 text-slate-400 border-slate-200",
};
const STATUS_LABEL: Record<StaffingRow["status"], string> = {
    DRAFT: "Brouillon", ACTIVE: "Actif", PAUSED: "En pause", COMPLETED: "Terminé", ARCHIVED: "Archivé",
};

function BookerStack({ bookers, emptyLabel }: { bookers: Booker[]; emptyLabel: string }) {
    if (bookers.length === 0) {
        return <span className="text-xs text-slate-400 italic">{emptyLabel}</span>;
    }
    return (
        <div className="flex items-center -space-x-1.5" title={bookers.map((b) => b.name).join(", ")}>
            {bookers.slice(0, 4).map((b) => (
                <div
                    key={b.id}
                    className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ring-2 ring-white shrink-0",
                        avatarColorForId(b.id)
                    )}
                >
                    {initialsFromName(b.name)}
                </div>
            ))}
            {bookers.length > 4 && (
                <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 ring-2 ring-white flex items-center justify-center text-[9px] font-bold shrink-0">
                    +{bookers.length - 4}
                </div>
            )}
        </div>
    );
}

/** Inline "jours/semaine" editor — click to edit, persists via PUT /api/clients/[id]. */
function DaysPerWeekCell({ row, onSaved }: { row: StaffingRow; onSaved: (clientId: string, value: number | null) => void }) {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(row.contractedDaysPerWeek?.toString() ?? "");
    const [saving, setSaving] = useState(false);
    const { success, error: showError } = useToast();

    useEffect(() => { setValue(row.contractedDaysPerWeek?.toString() ?? ""); }, [row.contractedDaysPerWeek]);

    const save = async () => {
        const trimmed = value.trim();
        const parsed = trimmed === "" ? null : Number(trimmed.replace(",", "."));
        if (parsed !== null && (Number.isNaN(parsed) || parsed < 0 || parsed > 7)) {
            showError("Valeur invalide", "Entrez un nombre de jours entre 0 et 7");
            return;
        }
        setSaving(true);
        try {
            const res = await fetch(`/api/clients/${row.clientId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contractedDaysPerWeek: parsed }),
            });
            const json = await res.json();
            if (json.success) {
                onSaved(row.clientId, parsed);
                success("Enregistré", `${row.clientName} — ${parsed ?? "non renseigné"} j/semaine`);
                setEditing(false);
            } else showError("Erreur", json.error);
        } catch {
            showError("Erreur", "Impossible d'enregistrer");
        } finally {
            setSaving(false);
        }
    };

    if (editing) {
        return (
            <div className="flex items-center gap-1">
                <input
                    autoFocus
                    type="number"
                    min={0}
                    max={7}
                    step={0.5}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void save(); if (e.key === "Escape") setEditing(false); }}
                    className="w-16 h-8 px-2 text-sm border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
                <button onClick={save} disabled={saving} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => setEditing(false)} disabled={saving} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
                    <XIcon className="w-3.5 h-3.5" />
                </button>
            </div>
        );
    }

    return (
        <button
            onClick={() => setEditing(true)}
            className="group/days inline-flex items-center gap-1.5 rounded-lg px-2 py-1 -mx-2 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            title="Modifier le nombre de jours/semaine"
        >
            {row.contractedDaysPerWeek != null ? (
                <span className="text-sm font-semibold text-slate-900 tabular-nums">{row.contractedDaysPerWeek} j</span>
            ) : (
                <Badge className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">À renseigner</Badge>
            )}
            <Pencil className="w-3 h-3 text-slate-300 group-hover/days:text-indigo-500 transition-colors" />
        </button>
    );
}

export default function DashboardProjetPage() {
    const [data, setData] = useState<StaffingOverview | null>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [missingOnly, setMissingOnly] = useState(false);
    const [statusFilter, setStatusFilter] = useState<"ALL" | StaffingRow["status"]>("ALL");
    const { error: showError } = useToast();

    const fetchData = async () => {
        try {
            const res = await fetch("/api/manager/dashboard-projet");
            const json = await res.json();
            if (json.success) setData(json.data);
            else showError("Erreur", json.error || "Impossible de charger les données");
        } catch {
            showError("Erreur", "Erreur réseau");
        } finally {
            setLoading(false);
        }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: fetch once on mount
    useEffect(() => { void fetchData(); }, []);

    const handleDaysSaved = (clientId: string, value: number | null) => {
        setData((prev) => {
            if (!prev) return prev;
            const rows = prev.rows.map((r) => (r.clientId === clientId ? { ...r, contractedDaysPerWeek: value } : r));
            const clientSeen = new Set<string>();
            const perClient: (number | null)[] = [];
            rows.forEach((r) => {
                if (clientSeen.has(r.clientId)) return;
                clientSeen.add(r.clientId);
                perClient.push(r.contractedDaysPerWeek);
            });
            const known = perClient.filter((d): d is number => d != null);
            return {
                rows,
                kpis: {
                    ...prev.kpis,
                    clientsMissingDaysPerWeek: perClient.filter((d) => d == null).length,
                    avgDaysPerWeek: known.length ? known.reduce((a, b) => a + b, 0) / known.length : null,
                },
            };
        });
    };

    const filteredRows = useMemo(() => {
        if (!data) return [];
        const q = search.trim().toLowerCase();
        return data.rows.filter((r) => {
            if (missingOnly && !r.missingHeadcount) return false;
            if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
            if (q && !r.clientName.toLowerCase().includes(q) && !r.missionName.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [data, search, missingOnly, statusFilter]);

    const columns: Column<StaffingRow>[] = [
        {
            key: "clientName",
            header: "Client / Mission",
            sortable: true,
            render: (_v, row) => {
                const ChannelIcon = CHANNEL_ICON[row.channel];
                return (
                    <div className="min-w-0">
                        <Link href={`/manager/clients/${row.clientId}`} className="text-sm font-semibold text-slate-900 hover:text-indigo-600 transition-colors">
                            {row.clientName}
                        </Link>
                        <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-500">
                            <ChannelIcon className="w-3 h-3 shrink-0" title={CHANNEL_LABEL[row.channel]} />
                            <Link href={`/manager/missions/${row.missionId}`} className="hover:text-indigo-600 transition-colors truncate">
                                {row.missionName}
                            </Link>
                        </div>
                    </div>
                );
            },
        },
        {
            key: "contractedDaysPerWeek",
            header: "Jours / semaine",
            sortable: true,
            render: (_v, row) => <DaysPerWeekCell row={row} onSaved={handleDaysSaved} />,
        },
        {
            key: "historicalBookers",
            header: "Historique",
            render: (_v, row) => <BookerStack bookers={row.historicalBookers} emptyLabel="Aucun appel" />,
        },
        {
            key: "currentBookers",
            header: "Actuel (14 j)",
            render: (_v, row) => <BookerStack bookers={row.currentBookers} emptyLabel="Personne" />,
        },
        {
            key: "status",
            header: "Statut",
            sortable: true,
            render: (_v, row) =>
                row.missingHeadcount ? (
                    <Badge className="text-[10px] gap-1 bg-rose-50 text-rose-700 border-rose-200">
                        <AlertTriangle className="w-3 h-3" /> Effectif manquant
                    </Badge>
                ) : (
                    <Badge className={cn("text-[10px]", STATUS_BADGE[row.status])}>
                        {row.status === "ACTIVE" ? (
                            <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Couvert</span>
                        ) : (
                            STATUS_LABEL[row.status]
                        )}
                    </Badge>
                ),
        },
    ];

    const kpis = data?.kpis;

    return (
        <div className="p-6 max-w-[1600px] mx-auto space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-200 shrink-0">
                        <LayoutDashboard className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Dashboard Projet</h1>
                        <p className="text-sm text-slate-500 mt-0.5">Suivi client, jours contractés et affectation des bookers</p>
                    </div>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => window.open("/api/manager/dashboard-projet/export", "_blank")}
                >
                    <Download className="w-3.5 h-3.5" />
                    Exporter en CSV
                </Button>
            </div>

            {/* KPI row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    label="Missions actives"
                    value={loading ? "—" : kpis?.activeMissions ?? 0}
                    icon={LayoutDashboard}
                    iconBg="bg-indigo-100"
                    iconColor="text-indigo-600"
                    subtitle={<span className="text-slate-400">{kpis?.totalMissions ?? 0} missions au total</span>}
                />
                <StatCard
                    label="Effectif manquant"
                    value={loading ? "—" : kpis?.missingHeadcount ?? 0}
                    icon={AlertTriangle}
                    iconBg={kpis?.missingHeadcount ? "bg-rose-100" : "bg-slate-100"}
                    iconColor={kpis?.missingHeadcount ? "text-rose-600" : "text-slate-400"}
                    subtitle={<span className="text-slate-400">missions actives sans booker planifié</span>}
                />
                <StatCard
                    label="Jours/semaine à renseigner"
                    value={loading ? "—" : kpis?.clientsMissingDaysPerWeek ?? 0}
                    icon={Pencil}
                    iconBg={kpis?.clientsMissingDaysPerWeek ? "bg-amber-100" : "bg-slate-100"}
                    iconColor={kpis?.clientsMissingDaysPerWeek ? "text-amber-600" : "text-slate-400"}
                    subtitle={<span className="text-slate-400">clients sans volume contractuel</span>}
                />
                <StatCard
                    label="Jours/semaine moyens"
                    value={loading || kpis?.avgDaysPerWeek == null ? "—" : kpis.avgDaysPerWeek.toFixed(1)}
                    icon={Users}
                    iconBg="bg-emerald-100"
                    iconColor="text-emerald-600"
                    subtitle={<span className="text-slate-400">parmi les clients renseignés</span>}
                />
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[220px] max-w-sm">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                        placeholder="Rechercher un client ou une mission…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                    />
                </div>
                <button
                    onClick={() => setMissingOnly((v) => !v)}
                    className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500",
                        missingOnly ? "bg-rose-600 text-white border-rose-600" : "bg-white text-slate-600 border-slate-200 hover:border-rose-300 hover:text-rose-600"
                    )}
                >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Manque uniquement
                </button>
                <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                    {(["ALL", "ACTIVE", "PAUSED", "DRAFT"] as const).map((s) => (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(s)}
                            className={cn(
                                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                                statusFilter === s ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                            )}
                        >
                            {s === "ALL" ? "Tous" : STATUS_LABEL[s]}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                {loading ? (
                    <div className="p-6">
                        <TableSkeleton rows={6} columns={5} />
                    </div>
                ) : (
                    <DataTable
                        data={filteredRows}
                        columns={columns}
                        keyField="missionId"
                        pagination
                        pageSize={15}
                        emptyMessage={
                            data?.rows.length
                                ? "Aucune mission ne correspond aux filtres"
                                : "Aucune mission active pour le moment"
                        }
                    />
                )}
            </div>
        </div>
    );
}
