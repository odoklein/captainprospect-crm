"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Archive,
    ArchiveRestore,
    Building2,
    Database,
    Download,
    Edit,
    Eye,
    HeartPulse,
    LayoutList,
    List as ListIcon,
    MoreHorizontal,
    Plus,
    ScanSearch,
    Search,
    Trash2,
    TriangleAlert,
    Upload,
    Users,
    X,
} from "lucide-react";
import {
    Button,
    ConfirmModal,
    ContextMenu,
    KpiCard,
    PageHeader,
    SegmentedControl,
    Select,
    StatusDot,
    useContextMenu,
    useToast,
} from "@/components/ui";
import { FOCUS_RING } from "@/components/ui/recipes";
import type { Tone } from "@/components/ui/recipes";
import { cn } from "@/lib/utils";
import { ListHealthDashboard, fetchBulkHealth, listsHealthBulkKey } from "@/components/lists/ListHealthDashboard";
import type { HealthStatus, ListHealthSummary } from "@/lib/types/health";

// ============================================
// /manager/lists — the list library.
// One question per row: is this file worth calling, and is anyone calling it?
// Lead finding lives on /manager/lists/sourcing, CSV on /manager/lists/import.
// ============================================

interface ListData {
    id: string;
    name: string;
    type: "SUZALI" | "CLIENT" | "MIXED";
    source?: string;
    createdAt: string;
    isArchived?: boolean;
    archivedAt?: string | null;
    mission?: { id: string; name: string };
    _count: { companies: number };
    stats?: {
        companyCount: number;
        contactCount: number;
        completeness: { INCOMPLETE: number; PARTIAL: number; ACTIONABLE: number };
    };
}

type View = "active" | "watch" | "archived";
type Mode = "lists" | "health";
type Sort = "recent" | "attention" | "name" | "size";

const TYPE_LABEL: Record<ListData["type"], string> = { SUZALI: "Interne", CLIENT: "Client", MIXED: "Mixte" };

const HEALTH: Record<HealthStatus, { label: string; tone: Tone; rank: number }> = {
    STALLED: { label: "À l'arrêt", tone: "danger", rank: 0 },
    AT_RISK: { label: "À risque", tone: "warning", rank: 1 },
    IN_PROGRESS: { label: "En cours", tone: "success", rank: 2 },
    FULLY_PROSPECTED: { label: "Épuisée", tone: "info", rank: 3 },
    INSUFFICIENT_DATA: { label: "Trop petite", tone: "neutral", rank: 4 },
};

const LISTS_QUERY_KEY = ["manager", "lists"] as const;

async function fetchListsApi(): Promise<ListData[]> {
    const pageSize = 200;
    let page = 1;
    let hasMore = true;
    const all: ListData[] = [];
    while (hasMore) {
        const res = await fetch(`/api/lists?page=${page}&limit=${pageSize}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.error || "Impossible de charger les listes");
        const batch = Array.isArray(json.data) ? (json.data as ListData[]) : [];
        all.push(...batch);
        hasMore = Boolean(json.pagination?.hasMore);
        page += 1;
        if (!json.pagination && batch.length < pageSize) hasMore = false;
    }
    return all;
}

const actionablePct = (l: ListData) => {
    const total = l.stats?.contactCount || 0;
    return total > 0 ? Math.round(((l.stats?.completeness?.ACTIONABLE || 0) / total) * 100) : null;
};

const needsWatch = (h?: ListHealthSummary) => h?.status === "AT_RISK" || h?.status === "STALLED";

const relDate = (iso: string) => {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    if (days < 1) return "aujourd'hui";
    if (days < 2) return "hier";
    if (days < 30) return `il y a ${days} j`;
    return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" });
};

export default function ListsPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { success, error: showError } = useToast();
    const { data: lists = [], isLoading, isFetching, refetch } = useQuery({ queryKey: LISTS_QUERY_KEY, queryFn: fetchListsApi });

    const [mode, setMode] = useState<Mode>("lists");
    const [view, setView] = useState<View>("active");
    const [search, setSearch] = useState("");
    const [missionId, setMissionId] = useState("");
    const [sort, setSort] = useState<Sort>("recent");
    const [deleting, setDeleting] = useState<ListData | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const { position, contextData, handleContextMenu, close: closeMenu } = useContextMenu();

    // Health of every non-archived list, picked server-side: runs alongside the
    // lists load, and the « Santé de la prospection » tab reuses the same cache.
    const { data: healthRows, isLoading: healthLoading } = useQuery({
        queryKey: listsHealthBulkKey(),
        queryFn: () => fetchBulkHealth(),
        staleTime: 3 * 60 * 1000,
    });
    const health = useMemo(
        () => new Map<string, ListHealthSummary>((healthRows ?? []).map((h) => [h.listId, h])),
        [healthRows],
    );

    // ============================================
    // ACTIONS
    // ============================================

    const handleDelete = async () => {
        if (!deleting) return;
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/lists/${deleting.id}`, { method: "DELETE" });
            const json = await res.json();
            if (json.success) {
                success("Liste supprimée", `${deleting.name} a été supprimée`);
                queryClient.invalidateQueries({ queryKey: LISTS_QUERY_KEY });
                queryClient.invalidateQueries({ queryKey: listsHealthBulkKey().slice(0, 1) });
            } else showError("Erreur", json.error || "Impossible de supprimer");
        } catch {
            showError("Erreur", "Impossible de supprimer la liste");
        } finally {
            setIsDeleting(false);
            setDeleting(null);
        }
    };

    const toggleArchive = async (list: ListData) => {
        const archived = !list.isArchived;
        const patch = (value: boolean, at: string | null | undefined) =>
            queryClient.setQueryData<ListData[]>(LISTS_QUERY_KEY, (old) =>
                old?.map((l) => (l.id === list.id ? { ...l, isArchived: value, archivedAt: at } : l)),
            );
        patch(archived, archived ? new Date().toISOString() : null);
        try {
            const res = await fetch(`/api/lists/${list.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isArchived: archived }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            queryClient.invalidateQueries({ queryKey: listsHealthBulkKey().slice(0, 1) });
            success(archived ? "Liste archivée" : "Liste désarchivée", list.name);
        } catch (e) {
            patch(!!list.isArchived, list.archivedAt);
            showError("Erreur", (e instanceof Error && e.message) || "Impossible de modifier la liste");
        }
    };

    const menuItems = (list: ListData) => [
        { label: "Ouvrir", icon: <Eye className="size-4" />, onClick: () => router.push(`/manager/lists/${list.id}`) },
        { label: "Modifier", icon: <Edit className="size-4" />, onClick: () => router.push(`/manager/lists/${list.id}/edit`) },
        { label: "Exporter CSV", icon: <Download className="size-4" />, onClick: () => window.open(`/api/lists/${list.id}/export`, "_blank") },
        {
            label: list.isArchived ? "Désarchiver" : "Archiver",
            icon: list.isArchived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />,
            onClick: () => toggleArchive(list),
            variant: "default" as const,
            divider: true,
        },
        { label: "Supprimer", icon: <Trash2 className="size-4" />, onClick: () => setDeleting(list), variant: "danger" as const },
    ];

    // ============================================
    // DERIVED
    // ============================================

    const kpis = useMemo(() => {
        const active = lists.filter((l) => !l.isArchived);
        let atRisk = 0;
        let stalled = 0;
        for (const h of health.values()) {
            if (h.status === "AT_RISK") atRisk++;
            else if (h.status === "STALLED") stalled++;
        }
        return {
            active: active.length,
            archived: lists.length - active.length,
            companies: active.reduce((n, l) => n + (l._count?.companies || 0), 0),
            contacts: active.reduce((n, l) => n + (l.stats?.contactCount || 0), 0),
            actionable: active.reduce((n, l) => n + (l.stats?.completeness?.ACTIONABLE || 0), 0),
            atRisk,
            stalled,
            watch: atRisk + stalled,
        };
    }, [lists, health]);

    const missionOptions = useMemo(() => {
        const m = new Map<string, string>();
        lists.forEach((l) => l.mission && m.set(l.mission.id, l.mission.name));
        return [
            { value: "", label: "Toutes les missions" },
            ...[...m].sort((a, b) => a[1].localeCompare(b[1], "fr")).map(([value, label]) => ({ value, label })),
        ];
    }, [lists]);

    const rows = useMemo(() => {
        const q = search.trim().toLowerCase();
        const out = lists.filter((l) => {
            if (view === "archived" ? !l.isArchived : l.isArchived) return false;
            if (view === "watch" && !needsWatch(health.get(l.id))) return false;
            if (missionId && l.mission?.id !== missionId) return false;
            if (q && !`${l.name} ${l.mission?.name ?? ""} ${l.source ?? ""}`.toLowerCase().includes(q)) return false;
            return true;
        });
        const rank = (l: ListData) => {
            const h = health.get(l.id);
            return h ? HEALTH[h.status].rank : 9;
        };
        out.sort((a, b) => {
            if (sort === "name") return a.name.localeCompare(b.name, "fr");
            if (sort === "size") return (b.stats?.contactCount || 0) - (a.stats?.contactCount || 0);
            if (sort === "attention") return rank(a) - rank(b) || (health.get(b.id)?.daysSinceLastAction ?? 0) - (health.get(a.id)?.daysSinceLastAction ?? 0);
            return +new Date(b.createdAt) - +new Date(a.createdAt);
        });
        return out;
    }, [lists, health, view, missionId, search, sort]);

    const filtered = !!search || !!missionId;

    return (
        <div className="space-y-6">
            <PageHeader
                title="Listes"
                subtitle="Les fichiers de prospection, leur qualité et leur avancement"
                icon={<Database />}
                onRefresh={() => refetch()}
                isRefreshing={isFetching}
                actions={
                    <>
                        <Link href="/manager/lists/import">
                            <Button variant="secondary">
                                <Upload className="size-4" /> Importer un CSV
                            </Button>
                        </Link>
                        <Link href="/manager/lists/sourcing">
                            <Button>
                                <ScanSearch className="size-4" /> Sourcer des leads
                            </Button>
                        </Link>
                    </>
                }
            />

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <KpiCard label="Listes actives" value={kpis.active} icon={ListIcon} tone="primary" loading={isLoading} hint={kpis.archived ? `${kpis.archived} archivée${kpis.archived > 1 ? "s" : ""}` : "Aucune archivée"} />
                <KpiCard label="Sociétés" value={kpis.companies.toLocaleString("fr-FR")} icon={Building2} tone="info" loading={isLoading} hint="Dans les listes actives" />
                <KpiCard label="Contacts" value={kpis.contacts.toLocaleString("fr-FR")} icon={Users} tone="accent" loading={isLoading} hint={`${kpis.actionable.toLocaleString("fr-FR")} joignables`} />
                <button
                    type="button"
                    disabled={kpis.watch === 0}
                    onClick={() => {
                        setMode("lists");
                        setView("watch");
                        setSort("attention");
                    }}
                    className={cn("rounded-card text-left", FOCUS_RING, kpis.watch > 0 && "transition-transform hover:-translate-y-px")}
                >
                    <KpiCard
                        className="h-full"
                        label="À surveiller"
                        value={kpis.watch}
                        icon={TriangleAlert}
                        tone={kpis.watch > 0 ? "danger" : "neutral"}
                        loading={isLoading || healthLoading}
                        hint={kpis.watch > 0 ? `${kpis.atRisk} à risque · ${kpis.stalled} à l'arrêt` : "Rien à signaler"}
                    />
                </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <SegmentedControl<Mode>
                    ariaLabel="Affichage"
                    value={mode}
                    onChange={setMode}
                    options={[
                        { value: "lists", label: "Listes", icon: LayoutList },
                        { value: "health", label: "Santé de la prospection", icon: HeartPulse },
                    ]}
                />
                {mode === "lists" && (
                    <SegmentedControl<View>
                        ariaLabel="Filtre de statut"
                        size="sm"
                        value={view}
                        onChange={setView}
                        options={[
                            { value: "active", label: "Actives", count: kpis.active },
                            { value: "watch", label: "À surveiller", count: kpis.watch, alert: kpis.watch > 0 },
                            { value: "archived", label: "Archivées", count: kpis.archived },
                        ]}
                    />
                )}
            </div>

            {mode === "health" ? (
                <div className="rounded-card border border-line bg-surface p-5 shadow-card">
                    <ListHealthDashboard />
                </div>
            ) : (
                <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
                    {/* Toolbar */}
                    <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
                        <div className="relative w-full sm:w-72">
                            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-4" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Rechercher une liste, une mission…"
                                className="h-9 w-full rounded-control border border-line bg-surface pl-9 pr-8 text-sm text-ink shadow-2xs outline-none placeholder:text-ink-4 focus:border-primary-400 focus:ring-4 focus:ring-primary-500/12"
                            />
                            {search && (
                                <button type="button" aria-label="Effacer" onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink">
                                    <X className="size-3.5" />
                                </button>
                            )}
                        </div>
                        <div className="w-full sm:w-60">
                            <Select searchable value={missionId} onChange={setMissionId} options={missionOptions} />
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                            <span className="text-xs text-ink-4 tabular-nums">
                                {rows.length} liste{rows.length > 1 ? "s" : ""}
                            </span>
                            <div className="w-48">
                                <Select
                                    value={sort}
                                    onChange={(v) => setSort(v as Sort)}
                                    options={[
                                        { value: "recent", label: "Plus récentes" },
                                        { value: "attention", label: "À traiter d'abord" },
                                        { value: "size", label: "Plus de contacts" },
                                        { value: "name", label: "Nom A→Z" },
                                    ]}
                                />
                            </div>
                        </div>
                    </div>

                    {isLoading && lists.length === 0 ? (
                        <TableSkeleton />
                    ) : rows.length === 0 ? (
                        <EmptyLists view={view} filtered={filtered} onReset={() => { setSearch(""); setMissionId(""); }} />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[920px] border-collapse text-left">
                                <thead>
                                    <tr className="border-b border-line bg-surface-2 text-2xs font-semibold uppercase tracking-[0.06em] text-ink-3">
                                        <th className="py-2.5 pl-5 pr-3">Liste</th>
                                        <th className="py-2.5 pr-3">Mission</th>
                                        <th className="w-24 py-2.5 pr-3 text-right">Sociétés</th>
                                        <th className="w-24 py-2.5 pr-3 text-right">Contacts</th>
                                        <th className="w-40 py-2.5 pr-3">Joignables</th>
                                        <th className="w-44 py-2.5 pr-3">Avancement</th>
                                        <th className="w-36 py-2.5 pr-3">Activité</th>
                                        <th className="w-12 py-2.5 pr-3" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((list) => (
                                        <ListRow
                                            key={list.id}
                                            list={list}
                                            health={health.get(list.id)}
                                            healthLoading={healthLoading}
                                            onOpen={() => router.push(`/manager/lists/${list.id}`)}
                                            onMenu={(e) => handleContextMenu(e, list)}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            <ContextMenu items={contextData ? menuItems(contextData) : []} position={position} onClose={closeMenu} />

            <ConfirmModal
                isOpen={!!deleting}
                onClose={() => setDeleting(null)}
                onConfirm={handleDelete}
                title="Supprimer la liste ?"
                message={`« ${deleting?.name} » sera supprimée avec toutes ses sociétés et contacts. Pour la retirer sans rien perdre, archivez-la plutôt.`}
                confirmText="Supprimer"
                variant="danger"
                isLoading={isDeleting}
            />
        </div>
    );
}

// ============================================
// ROW
// ============================================

function ListRow({
    list,
    health,
    healthLoading,
    onOpen,
    onMenu,
}: {
    list: ListData;
    health?: ListHealthSummary;
    healthLoading: boolean;
    onOpen: () => void;
    onMenu: (e: React.MouseEvent) => void;
}) {
    const pct = actionablePct(list);
    const contacts = list.stats?.contactCount || 0;
    const h = health ? HEALTH[health.status] : null;
    const coverage = health?.coverageRate ?? null;

    return (
        <tr
            onClick={onOpen}
            onContextMenu={onMenu}
            className={cn("group cursor-pointer border-b border-line-subtle transition-colors last:border-0 hover:bg-surface-2", list.isArchived && "opacity-60")}
        >
            <td className="max-w-0 py-3 pl-5 pr-3">
                <Link
                    href={`/manager/lists/${list.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="block truncate text-sm font-semibold text-ink outline-none group-hover:text-primary-700 focus-visible:underline"
                >
                    {list.name}
                </Link>
                <div className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-ink-3">
                    <span>{TYPE_LABEL[list.type]}</span>
                    {list.source && (
                        <>
                            <span className="text-ink-4">·</span>
                            <span className="truncate">{list.source}</span>
                        </>
                    )}
                    <span className="text-ink-4">·</span>
                    <span className="shrink-0">{relDate(list.createdAt)}</span>
                </div>
            </td>
            <td className="max-w-0 py-3 pr-3">
                <span className="block truncate text-[13px] text-ink-2">{list.mission?.name ?? "—"}</span>
            </td>
            <td className="py-3 pr-3 text-right text-[13px] font-medium text-ink tabular-nums">
                {(list._count?.companies || 0).toLocaleString("fr-FR")}
            </td>
            <td className="py-3 pr-3 text-right text-[13px] font-medium text-ink tabular-nums">{contacts.toLocaleString("fr-FR")}</td>
            <td className="py-3 pr-3">
                {pct === null ? (
                    <span className="text-xs text-ink-4">—</span>
                ) : (
                    <Meter
                        value={pct}
                        tone={pct >= 80 ? "success" : pct >= 50 ? "warning" : "neutral"}
                        title={`${list.stats?.completeness.ACTIONABLE ?? 0} contacts actionnables sur ${contacts}`}
                    />
                )}
            </td>
            <td className="py-3 pr-3">
                {health && h ? (
                    <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-2" title={health.statusLabel}>
                                <StatusDot tone={h.tone} />
                                {h.label}
                            </span>
                            {coverage !== null && <span className="text-2xs text-ink-3 tabular-nums">{Math.round(coverage)}% traité</span>}
                        </div>
                        {coverage !== null && (
                            <div className="h-1 overflow-hidden rounded-full bg-surface-3">
                                <div className="h-full rounded-full bg-primary-600" style={{ width: `${Math.min(100, coverage)}%` }} />
                            </div>
                        )}
                    </div>
                ) : healthLoading && !list.isArchived ? (
                    <div className="h-3 w-24 animate-pulse rounded bg-surface-3" />
                ) : (
                    <span className="text-xs text-ink-4">—</span>
                )}
            </td>
            <td className="py-3 pr-3 text-xs tabular-nums">
                {!health ? (
                    <span className="text-ink-4">—</span>
                ) : health.daysSinceLastAction === null ? (
                    <span className="text-ink-4">Jamais appelée</span>
                ) : (
                    <div>
                        <div className={cn(health.daysSinceLastAction >= 7 ? "font-medium text-warning-ink" : "text-ink-2")}>
                            {health.daysSinceLastAction === 0 ? "Aujourd'hui" : `Il y a ${health.daysSinceLastAction} j`}
                        </div>
                        <div className="text-ink-4">
                            {health.actions7d} action{health.actions7d > 1 ? "s" : ""} / 7 j
                        </div>
                    </div>
                )}
            </td>
            <td className="py-3 pr-3 text-right">
                <button
                    type="button"
                    aria-label={`Actions pour ${list.name}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        onMenu(e);
                    }}
                    className={cn(
                        "inline-flex size-8 items-center justify-center rounded-lg text-ink-4 opacity-0 transition hover:bg-surface-3 hover:text-ink group-hover:opacity-100 focus-visible:opacity-100",
                        FOCUS_RING,
                    )}
                >
                    <MoreHorizontal className="size-4" />
                </button>
            </td>
        </tr>
    );
}

function Meter({ value, tone, title }: { value: number; tone: Tone; title?: string }) {
    const fill = { success: "bg-success", warning: "bg-warning", neutral: "bg-ink-4" }[tone as "success" | "warning" | "neutral"] ?? "bg-ink-4";
    return (
        <div className="flex items-center gap-2" title={title}>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                <div className={cn("h-full rounded-full", fill)} style={{ width: `${value}%` }} />
            </div>
            <span className="w-9 text-right text-xs font-medium text-ink-2 tabular-nums">{value}%</span>
        </div>
    );
}

function TableSkeleton() {
    return (
        <div className="divide-y divide-line-subtle">
            {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex items-center gap-6 px-5 py-4">
                    <div className="flex-1 space-y-1.5">
                        <div className="h-3.5 w-1/3 animate-pulse rounded bg-surface-3" />
                        <div className="h-2.5 w-1/5 animate-pulse rounded bg-surface-3" />
                    </div>
                    <div className="h-3 w-28 animate-pulse rounded bg-surface-3" />
                    <div className="h-3 w-12 animate-pulse rounded bg-surface-3" />
                    <div className="h-3 w-32 animate-pulse rounded bg-surface-3" />
                </div>
            ))}
        </div>
    );
}

function EmptyLists({ view, filtered, onReset }: { view: View; filtered: boolean; onReset: () => void }) {
    if (filtered) {
        return (
            <div className="px-6 py-14 text-center">
                <p className="text-sm font-semibold text-ink">Aucune liste ne correspond</p>
                <Button variant="link" size="sm" onClick={onReset} className="mt-1">
                    Effacer la recherche
                </Button>
            </div>
        );
    }
    if (view === "watch") {
        return (
            <div className="px-6 py-14 text-center">
                <p className="text-sm font-semibold text-ink">Aucune liste à surveiller</p>
                <p className="mt-1 text-sm text-ink-3">Toutes les listes actives sont travaillées régulièrement.</p>
            </div>
        );
    }
    if (view === "archived") {
        return <div className="px-6 py-14 text-center text-sm text-ink-3">Aucune liste archivée.</div>;
    }
    return (
        <div className="px-6 py-16 text-center">
            <span className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-700 ring-1 ring-inset ring-primary-100">
                <Plus className="size-5" />
            </span>
            <p className="text-base font-semibold text-ink">Aucune liste pour l&apos;instant</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-ink-3">
                Trouvez des sociétés sur Google Maps et le registre officiel, ou importez un fichier existant.
            </p>
            <div className="mt-5 flex justify-center gap-2">
                <Link href="/manager/lists/import">
                    <Button variant="secondary">
                        <Upload className="size-4" /> Importer un CSV
                    </Button>
                </Link>
                <Link href="/manager/lists/sourcing">
                    <Button>
                        <ScanSearch className="size-4" /> Sourcer des leads
                    </Button>
                </Link>
            </div>
        </div>
    );
}
