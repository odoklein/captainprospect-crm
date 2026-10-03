"use client";

/**
 * ============================================================
 * JOURNAL D'AUDIT — manager page
 * ============================================================
 * The unified "who did what" trail (exports, deletions, role / permission
 * changes, forced logouts…). Backed by GET /api/manager/audit. Retention is
 * 90 days — see lib/audit.ts and the cleanup job.
 *
 * Exporting the log is itself audited server-side.
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Download, Loader2, ScrollText, X } from "lucide-react";
import { Button, PageHeader, Select } from "@/components/ui";
import { cn } from "@/lib/utils";

// ============================================
// TYPES
// ============================================

interface AuditRow {
    id: string;
    actorId: string | null;
    actorRole: string | null;
    action: string;
    entityType: string;
    entityId: string | null;
    summary: string;
    before: unknown;
    after: unknown;
    metadata: unknown;
    ip: string | null;
    createdAt: string;
    actor: { id: string; name: string; email: string } | null;
}

interface Facets {
    actions: string[];
    entityTypes: string[];
    actors: { id: string; name: string; role: string }[];
}

interface Filters {
    actorId: string;
    action: string;
    entityType: string;
    from: string;
    to: string;
}

const EMPTY_FILTERS: Filters = { actorId: "", action: "", entityType: "", from: "", to: "" };
const PAGE_SIZE = 50;

// ============================================
// PRESENTATION
// ============================================

const ACTION_LABELS: Record<string, string> = {
    CREATE: "Création",
    UPDATE: "Modification",
    DELETE: "Suppression",
    EXPORT: "Export",
    ROLE_CHANGE: "Changement de rôle",
    STATUS_CHANGE: "Statut du compte",
    PERMISSION_CHANGE: "Permissions",
    SESSION_REVOKE: "Session révoquée",
    FORCE_LOGOUT: "Déconnexion forcée",
    BULK_ACTION: "Action groupée",
};

const ENTITY_LABELS: Record<string, string> = {
    User: "Utilisateur",
    Client: "Client",
    Mission: "Mission",
    List: "Liste",
    Campaign: "Stratégie",
    Invoice: "Facture",
    Report: "Rapport",
    Email: "Emails",
    StaffingOverview: "Dashboard projet",
    AuditLog: "Journal d'audit",
};

const ROLE_LABELS: Record<string, string> = {
    MANAGER: "Manager", SDR: "SDR", BUSINESS_DEVELOPER: "Business Dev",
    DEVELOPER: "Développeur", CLIENT: "Client", BOOKER: "Booker", COMMERCIAL: "Commercial",
};

function actionTone(action: string): string {
    switch (action) {
        case "DELETE":
            return "bg-rose-50 text-rose-700 border-rose-200";
        case "EXPORT":
            return "bg-amber-50 text-amber-700 border-amber-200";
        case "ROLE_CHANGE":
        case "PERMISSION_CHANGE":
            return "bg-accent-50 text-accent-700 border-accent-200";
        case "STATUS_CHANGE":
        case "FORCE_LOGOUT":
        case "SESSION_REVOKE":
            return "bg-orange-50 text-orange-700 border-orange-200";
        default:
            return "bg-slate-50 text-slate-600 border-slate-200";
    }
}

function formatWhen(iso: string): string {
    return new Date(iso).toLocaleString("fr-FR", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
}

function isEmptyJson(v: unknown): boolean {
    if (v == null) return true;
    if (typeof v === "object") return Object.keys(v as object).length === 0;
    return false;
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
    if (isEmptyJson(value)) return null;
    return (
        <div className="min-w-0">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
            <pre className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-x-auto max-h-56 text-slate-700">
                {JSON.stringify(value, null, 2)}
            </pre>
        </div>
    );
}

// ============================================
// PAGE
// ============================================

export default function AuditPage() {
    const [rows, setRows] = useState<AuditRow[]>([]);
    const [facets, setFacets] = useState<Facets>({ actions: [], entityTypes: [], actors: [] });
    const [total, setTotal] = useState(0);
    const [offset, setOffset] = useState(0);
    const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<string | null>(null);

    const query = useMemo(() => {
        const p = new URLSearchParams();
        if (filters.actorId) p.set("actorId", filters.actorId);
        if (filters.action) p.set("action", filters.action);
        if (filters.entityType) p.set("entityType", filters.entityType);
        if (filters.from) p.set("from", filters.from);
        if (filters.to) p.set("to", filters.to);
        return p;
    }, [filters]);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const p = new URLSearchParams(query);
            p.set("limit", String(PAGE_SIZE));
            p.set("offset", String(offset));
            const res = await fetch(`/api/manager/audit?${p.toString()}`);
            const j = await res.json();
            if (!j.success) throw new Error(j.error ?? "Erreur de chargement");
            setRows(j.data.events);
            setTotal(j.data.total);
            setFacets(j.data.facets);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Erreur de chargement");
        } finally {
            setLoading(false);
        }
    }, [query, offset]);

    useEffect(() => { load(); }, [load]);

    const setFilter = (patch: Partial<Filters>) => {
        setOffset(0);
        setExpanded(null);
        setFilters((f) => ({ ...f, ...patch }));
    };

    const hasFilters = Object.values(filters).some(Boolean);
    const page = Math.floor(offset / PAGE_SIZE) + 1;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const actorOptions = [
        { value: "", label: "Tous les utilisateurs" },
        ...facets.actors.map((a) => ({ value: a.id, label: `${a.name} (${ROLE_LABELS[a.role] ?? a.role})` })),
    ];
    const actionOptions = [
        { value: "", label: "Toutes les actions" },
        ...facets.actions.map((a) => ({ value: a, label: ACTION_LABELS[a] ?? a })),
    ];
    const entityOptions = [
        { value: "", label: "Tous les types" },
        ...facets.entityTypes.map((e) => ({ value: e, label: ENTITY_LABELS[e] ?? e })),
    ];

    const dateClass =
        "px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20";

    return (
        <div className="space-y-6">
            <PageHeader
                title="Journal d'audit"
                subtitle="Qui a fait quoi : exports, suppressions, changements de rôle et de permissions, déconnexions forcées. Conservé 90 jours."
                icon={<ScrollText className="w-5 h-5" />}
                onRefresh={load}
                isRefreshing={loading}
                actions={
                    <a href={`/api/manager/audit?${new URLSearchParams([...query.entries(), ["format", "csv"]]).toString()}`}>
                        <Button variant="secondary" size="sm">
                            <Download className="w-4 h-4" /> Exporter CSV
                        </Button>
                    </a>
                }
            />

            {/* Filters */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 items-end">
                    <Select options={actorOptions} value={filters.actorId} onChange={(v) => setFilter({ actorId: v })} label="Utilisateur" searchable />
                    <Select options={actionOptions} value={filters.action} onChange={(v) => setFilter({ action: v })} label="Action" />
                    <Select options={entityOptions} value={filters.entityType} onChange={(v) => setFilter({ entityType: v })} label="Type d'objet" />
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Du</label>
                        <input type="date" className={cn(dateClass, "w-full")} value={filters.from} max={filters.to || undefined} onChange={(e) => setFilter({ from: e.target.value })} />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Au</label>
                        <input type="date" className={cn(dateClass, "w-full")} value={filters.to} min={filters.from || undefined} onChange={(e) => setFilter({ to: e.target.value })} />
                    </div>
                </div>
                {hasFilters && (
                    <button
                        onClick={() => { setOffset(0); setFilters(EMPTY_FILTERS); }}
                        className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700"
                    >
                        <X className="w-3.5 h-3.5" /> Réinitialiser les filtres
                    </button>
                )}
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                {error ? (
                    <div className="p-10 text-center text-sm text-rose-600">{error}</div>
                ) : loading && rows.length === 0 ? (
                    <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-primary-500 animate-spin" /></div>
                ) : rows.length === 0 ? (
                    <div className="p-14 text-center">
                        <ScrollText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500 text-sm">
                            {hasFilters ? "Aucun événement ne correspond à ces filtres." : "Aucun événement enregistré pour le moment."}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100">
                                    <th className="px-4 py-3 w-8" />
                                    <th className="px-4 py-3">Date</th>
                                    <th className="px-4 py-3">Utilisateur</th>
                                    <th className="px-4 py-3">Action</th>
                                    <th className="px-4 py-3">Objet</th>
                                    <th className="px-4 py-3">Détail</th>
                                    <th className="px-4 py-3">IP</th>
                                </tr>
                            </thead>
                            <tbody className={cn(loading && "opacity-60")}>
                                {rows.map((r) => {
                                    const open = expanded === r.id;
                                    const hasDetail = !isEmptyJson(r.before) || !isEmptyJson(r.after) || !isEmptyJson(r.metadata);
                                    return (
                                        <Fragment key={r.id}>
                                            <tr
                                                className={cn("border-b border-slate-50 hover:bg-slate-50/60", hasDetail && "cursor-pointer")}
                                                onClick={() => hasDetail && setExpanded(open ? null : r.id)}
                                            >
                                                <td className="px-4 py-3 text-slate-300">
                                                    {hasDetail && <ChevronDown className={cn("w-4 h-4 transition-transform", open && "rotate-180")} />}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-slate-500">{formatWhen(r.createdAt)}</td>
                                                <td className="px-4 py-3">
                                                    <p className="font-medium text-slate-800">{r.actor?.name ?? "Utilisateur supprimé"}</p>
                                                    {r.actorRole && <p className="text-xs text-slate-400">{ROLE_LABELS[r.actorRole] ?? r.actorRole}</p>}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={cn("inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap", actionTone(r.action))}>
                                                        {ACTION_LABELS[r.action] ?? r.action}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{ENTITY_LABELS[r.entityType] ?? r.entityType}</td>
                                                <td className="px-4 py-3 text-slate-700 min-w-[260px]">{r.summary}</td>
                                                <td className="px-4 py-3 font-mono text-xs text-slate-400 whitespace-nowrap">{r.ip ?? "—"}</td>
                                            </tr>
                                            {open && (
                                                <tr className="bg-slate-50/50 border-b border-slate-100">
                                                    <td />
                                                    <td colSpan={6} className="px-4 py-4">
                                                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                                            <JsonBlock label="Avant" value={r.before} />
                                                            <JsonBlock label="Après" value={r.after} />
                                                            <JsonBlock label="Contexte" value={r.metadata} />
                                                        </div>
                                                        {r.entityId && (
                                                            <p className="mt-3 text-xs text-slate-400">
                                                                ID de l'objet : <span className="font-mono">{r.entityId}</span>
                                                            </p>
                                                        )}
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {total > 0 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
                        <span>{total} événement{total > 1 ? "s" : ""}</span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                                disabled={offset === 0 || loading}
                                className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30"
                                aria-label="Page précédente"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span>Page {page} / {pages}</span>
                            <button
                                onClick={() => setOffset(offset + PAGE_SIZE)}
                                disabled={page >= pages || loading}
                                className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30"
                                aria-label="Page suivante"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
