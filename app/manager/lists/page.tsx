"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Download, Edit, Eye, MoreHorizontal, RefreshCw, ScanSearch, Trash2, Upload, X } from "lucide-react";
import { ConfirmModal, ContextMenu, useContextMenu, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { fetchBulkHealth, listsHealthBulkKey } from "@/components/lists/ListHealthDashboard";
import type { HealthStatus, ListHealthSummary } from "@/lib/types/health";
import { listStock, stockLabel, type ListStock } from "@/lib/lists/stock";
import { HealthBar } from "@/components/workspace/HealthBar";
import { useWorkspaceKeys } from "@/components/workspace/useWorkspaceKeys";
import {
    CONTROL, EmptyBlock, FacetSelect, FIRST_CELL, ICON_CONTROL, KeyHints, LAST_CELL, LoadingBar, Metric, MetricStrip,
    PRIMARY_CONTROL, SearchField, ShortcutsDialog, TableSkeleton, TD, TH, ViewTabs, WorkspaceFooter, WorkspaceFrame,
    WorkspaceHeader, WorkspaceMain, WorkspaceToolbar, useWide, type ShortcutGroup,
} from "@/components/workspace/Workspace";

// ============================================
// /manager/lists — the list library, in the shared workspace frame
// (components/workspace). One question per row: is this file worth calling,
// how much is left in it, and is anyone calling it?
//
// One level of views (Actives, À surveiller, Archivées). A list's health —
// its trend, its estimate, the hints — opens beside the table (Entrée), so
// reading it never leaves the library. The numbers on top are the ones a
// manager acts on: what is left to call, and for how many days.
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
type Sort = "recent" | "attention" | "stock" | "size" | "name";

const TYPE_LABEL: Record<ListData["type"], string> = { SUZALI: "Interne", CLIENT: "Client", MIXED: "Mixte" };

// Only what needs the manager is coloured: « En cours » is the normal state.
const HEALTH: Record<HealthStatus, { label: string; dot: string; text: string; rank: number }> = {
    STALLED: { label: "À l'arrêt", dot: "bg-danger", text: "text-danger-ink", rank: 0 },
    AT_RISK: { label: "À risque", dot: "bg-warning", text: "text-warning-ink", rank: 1 },
    IN_PROGRESS: { label: "En cours", dot: "bg-ink-4", text: "text-ink-2", rank: 2 },
    FULLY_PROSPECTED: { label: "Épuisée", dot: "bg-ink-4", text: "text-ink-2", rank: 3 },
    INSUFFICIENT_DATA: { label: "Trop petite", dot: "bg-line-strong", text: "text-ink-3", rank: 4 },
};

const SORTS: { id: Sort; label: string }[] = [
    { id: "attention", label: "À traiter d'abord" },
    { id: "stock", label: "Stock le plus court" },
    { id: "size", label: "Plus de contacts" },
    { id: "name", label: "Nom A→Z" },
];

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

const needsWatch = (h?: ListHealthSummary) => h?.status === "AT_RISK" || h?.status === "STALLED";

const relDate = (iso: string) => {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    if (days < 1) return "aujourd'hui";
    if (days < 2) return "hier";
    if (days < 30) return `il y a ${days} j`;
    return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" });
};

function stockOf(list: ListData, health?: ListHealthSummary): ListStock {
    return listStock({
        contacts: list.stats?.contactCount ?? 0,
        actionable: list.stats?.completeness?.ACTIONABLE ?? 0,
        treated: health?.contactedContacts ?? 0,
        actions7d: health?.actions7d ?? 0,
    });
}

/** Worked through: archive it in one click (undo in the toast). */
const isExhausted = (list: ListData, health: ListHealthSummary | undefined, stock: ListStock) =>
    !list.isArchived && (health?.status === "FULLY_PROSPECTED" || (stock.reachable === 0 && stock.treated > 0));

const SHORTCUTS: ShortcutGroup[] = [
    { title: "Se déplacer", keys: [[["j"], "Liste suivante"], [["k"], "Liste précédente"], [["1", "2", "3"], "Actives, À surveiller, Archivées"], [["/"], "Rechercher"]] },
    { title: "Agir", keys: [[["Entrée"], "Voir la santé de la liste"], [["o"], "Ouvrir la liste"], [["Échap"], "Fermer le volet"], [["?"], "Cette aide"]] },
];

export default function ListsPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { success, error: showError, addToast } = useToast();
    const { data: lists = [], isLoading, isFetching, refetch } = useQuery({ queryKey: LISTS_QUERY_KEY, queryFn: fetchListsApi });

    const [view, setView] = useState<View>("active");
    const [search, setSearch] = useState("");
    const [missionId, setMissionId] = useState("");
    const [sort, setSort] = useState<Sort | "">("");
    const [deleting, setDeleting] = useState<ListData | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [cursor, setCursor] = useState(0);
    const [openId, setOpenId] = useState<string | null>(null);
    const [help, setHelp] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);
    const wide = useWide();
    const { position, contextData, handleContextMenu, close: closeMenu } = useContextMenu();

    // Health of every non-archived list, picked server-side: runs alongside the lists load.
    const { data: healthRows, isLoading: healthLoading } = useQuery({
        queryKey: listsHealthBulkKey(),
        queryFn: () => fetchBulkHealth(),
        staleTime: 3 * 60 * 1000,
    });
    const health = useMemo(() => new Map<string, ListHealthSummary>((healthRows ?? []).map((h) => [h.listId, h])), [healthRows]);

    // ── actions ──────────────────────────────────────────────────────────────

    const handleDelete = async () => {
        if (!deleting) return;
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/lists/${deleting.id}`, { method: "DELETE" });
            const json = await res.json();
            if (json.success) {
                success("Liste supprimée", `${deleting.name} a été supprimée`);
                if (openId === deleting.id) setOpenId(null);
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

    const setArchived = useCallback(
        async (list: ListData, archived: boolean, withUndo = true) => {
            const patch = (value: boolean, at: string | null | undefined) =>
                queryClient.setQueryData<ListData[]>(LISTS_QUERY_KEY, (old) => old?.map((l) => (l.id === list.id ? { ...l, isArchived: value, archivedAt: at } : l)));
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
                addToast({
                    type: "success",
                    title: archived ? "Liste archivée" : "Liste désarchivée",
                    message: list.name,
                    action: withUndo ? { label: "Annuler", onClick: () => void setArchived(list, !archived, false) } : undefined,
                });
            } catch (e) {
                patch(!!list.isArchived, list.archivedAt);
                showError("Erreur", (e instanceof Error && e.message) || "Impossible de modifier la liste");
            }
        },
        [queryClient, addToast, showError],
    );

    const menuItems = (list: ListData) => [
        { label: "Ouvrir", icon: <Eye className="size-4" />, onClick: () => router.push(`/manager/lists/${list.id}`) },
        { label: "Modifier", icon: <Edit className="size-4" />, onClick: () => router.push(`/manager/lists/${list.id}/edit`) },
        { label: "Exporter CSV", icon: <Download className="size-4" />, onClick: () => window.open(`/api/lists/${list.id}/export`, "_blank") },
        {
            label: list.isArchived ? "Désarchiver" : "Archiver",
            icon: list.isArchived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />,
            onClick: () => void setArchived(list, !list.isArchived),
            variant: "default" as const,
            divider: true,
        },
        { label: "Supprimer", icon: <Trash2 className="size-4" />, onClick: () => setDeleting(list), variant: "danger" as const },
    ];

    // ── derived ──────────────────────────────────────────────────────────────

    const stocks = useMemo(() => new Map(lists.map((l) => [l.id, stockOf(l, health.get(l.id))])), [lists, health]);

    const kpis = useMemo(() => {
        const active = lists.filter((l) => !l.isArchived);
        let atRisk = 0;
        let stalled = 0;
        let reachable = 0;
        let actions7d = 0;
        for (const l of active) {
            const h = health.get(l.id);
            if (h?.status === "AT_RISK") atRisk++;
            else if (h?.status === "STALLED") stalled++;
            reachable += stocks.get(l.id)?.reachable ?? 0;
            actions7d += h?.actions7d ?? 0;
        }
        const contacts = active.reduce((n, l) => n + (l.stats?.contactCount || 0), 0);
        const actionable = active.reduce((n, l) => n + (l.stats?.completeness?.ACTIONABLE || 0), 0);
        const perDay = actions7d / 7;
        return {
            active: active.length,
            archived: lists.length - active.length,
            contacts,
            actionable,
            reachable,
            daysLeft: reachable === 0 ? (contacts > 0 ? 0 : null) : perDay > 0 ? Math.ceil(reachable / perDay) : null,
            atRisk,
            stalled,
            watch: atRisk + stalled,
        };
    }, [lists, health, stocks]);

    const missionOptions = useMemo(() => {
        const m = new Map<string, { label: string; count: number }>();
        lists.forEach((l) => {
            if (!l.mission || l.isArchived !== (view === "archived")) return;
            const cur = m.get(l.mission.id);
            m.set(l.mission.id, { label: l.mission.name, count: (cur?.count ?? 0) + 1 });
        });
        return [...m].sort((a, b) => a[1].label.localeCompare(b[1].label, "fr")).map(([id, v]) => ({ id, label: v.label, count: v.count }));
    }, [lists, view]);

    const effectiveSort: Sort = sort || (view === "watch" ? "attention" : "recent");
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
        const days = (l: ListData) => stocks.get(l.id)?.daysLeft ?? Number.POSITIVE_INFINITY;
        out.sort((a, b) => {
            if (effectiveSort === "name") return a.name.localeCompare(b.name, "fr");
            if (effectiveSort === "size") return (b.stats?.contactCount || 0) - (a.stats?.contactCount || 0);
            if (effectiveSort === "stock") return days(a) - days(b);
            if (effectiveSort === "attention")
                return rank(a) - rank(b) || (health.get(b.id)?.daysSinceLastAction ?? 0) - (health.get(a.id)?.daysSinceLastAction ?? 0);
            return +new Date(b.createdAt) - +new Date(a.createdAt);
        });
        return out;
    }, [lists, health, stocks, view, missionId, search, effectiveSort]);

    const filtered = !!search || !!missionId;
    const rowButtons = view === "archived" || rows.some((l) => isExhausted(l, health.get(l.id), stocks.get(l.id)!));
    const safeCursor = Math.min(cursor, Math.max(0, rows.length - 1));
    const openList = openId ? lists.find((l) => l.id === openId) ?? null : null;
    const showPane = Boolean(openList) && wide === true;

    const changeView = (v: View) => {
        setView(v);
        setCursor(0);
        setMissionId("");
    };

    const move = (delta: number) => {
        if (!rows.length) return;
        const next = Math.max(0, Math.min(rows.length - 1, safeCursor + delta));
        setCursor(next);
        if (showPane) setOpenId(rows[next].id);
        document.querySelector(`[data-list-row="${next}"]`)?.scrollIntoView({ block: "nearest" });
    };
    const open = (index: number) => {
        const list = rows[index];
        if (!list) return;
        setCursor(index);
        if (wide) setOpenId(list.id);
        else router.push(`/manager/lists/${list.id}`);
    };

    useWorkspaceKeys({
        j: () => move(1),
        ArrowDown: () => move(1),
        k: () => move(-1),
        ArrowUp: () => move(-1),
        Enter: () => open(safeCursor),
        o: () => rows[safeCursor] && router.push(`/manager/lists/${rows[safeCursor].id}`),
        Escape: () => setOpenId(null),
        "/": () => searchRef.current?.focus(),
        "1": () => changeView("active"),
        "2": () => changeView("watch"),
        "3": () => changeView("archived"),
        "?": () => setHelp(true),
    });

    return (
        <WorkspaceFrame>
            <WorkspaceMain>
                <WorkspaceHeader
                    title="Listes"
                    subtitle="Les fichiers de prospection : ce qu'il reste à appeler, et qui les travaille"
                    actions={
                        <>
                            <button type="button" onClick={() => refetch()} disabled={isFetching} aria-label="Actualiser les listes" title="Actualiser" className={ICON_CONTROL}>
                                <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin motion-reduce:animate-none")} />
                            </button>
                            <Link href="/manager/lists/import" className={CONTROL}>
                                <Upload className="h-3.5 w-3.5" /> Importer un CSV
                            </Link>
                            <Link href="/manager/lists/sourcing" className={PRIMARY_CONTROL}>
                                <ScanSearch className="h-3.5 w-3.5" /> Sourcer des leads
                            </Link>
                        </>
                    }
                    tabs={
                        <ViewTabs<View>
                            label="Vue"
                            value={view}
                            onChange={changeView}
                            tabs={[
                                { id: "active", label: "Actives", count: kpis.active, hotkey: "1" },
                                { id: "watch", label: "À surveiller", count: kpis.watch, tone: "danger", hotkey: "2" },
                                { id: "archived", label: "Archivées", count: kpis.archived, hotkey: "3" },
                            ]}
                        />
                    }
                />

                <WorkspaceToolbar>
                    <SearchField value={search} onChange={(v) => { setSearch(v); setCursor(0); }} placeholder="Liste, mission, source…" inputRef={searchRef} />
                    <FacetSelect label="Mission" value={missionId} options={missionOptions} onChange={(v) => { setMissionId(v); setCursor(0); }} allLabel="Toutes" />
                    <FacetSelect
                        label="Tri"
                        value={sort}
                        options={SORTS.filter((s) => s.id !== (view === "watch" ? "attention" : "recent"))}
                        onChange={(v) => setSort(v as Sort | "")}
                        allLabel={view === "watch" ? "À traiter d'abord" : "Plus récentes"}
                    />
                    <span className="ml-auto text-[12px] text-ink-3 tabular-nums">
                        {rows.length} liste{rows.length > 1 ? "s" : ""}
                    </span>
                </WorkspaceToolbar>

                <div className="@container relative min-h-0 flex-1 overflow-auto pb-12" aria-busy={isLoading}>
                    <LoadingBar loading={isFetching && !isLoading} />
                    {view !== "archived" && (
                        <MetricStrip loading={isLoading}>
                            <Metric
                                label="Contacts joignables"
                                value={kpis.actionable.toLocaleString("fr-FR")}
                                hint={kpis.contacts ? `sur ${kpis.contacts.toLocaleString("fr-FR")} · ${Math.round((kpis.actionable / kpis.contacts) * 100)} %` : undefined}
                                title="Avec un téléphone ou un email exploitable, dans les listes actives"
                            />
                            <Metric
                                label="Reste à appeler"
                                value={healthLoading ? "…" : kpis.reachable.toLocaleString("fr-FR")}
                                hint="joignables jamais traités"
                            />
                            <Metric
                                label="Stock d'appels"
                                value={healthLoading ? "…" : stockLabel(kpis.daysLeft)}
                                tone={kpis.daysLeft !== null && kpis.daysLeft > 0 && kpis.daysLeft < 5 ? "warning" : undefined}
                                hint={kpis.daysLeft === null ? "personne n'appelle" : "au rythme des 7 derniers jours"}
                                title="Contacts joignables restants divisés par le nombre d'actions par jour des 7 derniers jours (un appel par contact)."
                            />
                            <Metric
                                label="À surveiller"
                                value={healthLoading ? "…" : kpis.watch}
                                tone={kpis.watch > 0 ? "danger" : undefined}
                                hint={kpis.watch > 0 ? `${kpis.stalled} à l'arrêt · ${kpis.atRisk} à risque` : "rien à signaler"}
                                onClick={kpis.watch > 0 ? () => changeView("watch") : undefined}
                            />
                        </MetricStrip>
                    )}

                    {isLoading && lists.length === 0 ? (
                        <TableSkeleton />
                    ) : rows.length === 0 ? (
                        <EmptyLists view={view} filtered={filtered} onReset={() => { setSearch(""); setMissionId(""); }} />
                    ) : (
                        <table className="w-full table-fixed border-collapse bg-surface text-[13px]">
                            <thead className="sticky top-0 z-[1]">
                                <tr className="bg-surface-2/95 shadow-[inset_0_-1px_0_var(--ds-line)] backdrop-blur">
                                    <th className={cn(TH, FIRST_CELL)}>Liste</th>
                                    <th className={cn(TH, "hidden w-[18%] @min-[960px]:table-cell")}>Mission</th>
                                    <th className={cn(TH, "w-[132px] @min-[480px]:w-[220px]")}>Santé</th>
                                    <th className={cn(TH, "hidden w-[140px] @min-[720px]:table-cell")}>Activité</th>
                                    <th className={cn(TH, "hidden w-[104px] text-right @min-[720px]:table-cell")}>Contacts</th>
                                    <th className={cn(TH, "hidden w-[96px] text-right @min-[960px]:table-cell")}>Stock</th>
                                    {/* Room for « Archiver » when a row offers it, so it never covers the numbers. */}
                                    <th className={cn(TH, LAST_CELL, rowButtons ? "w-[52px] @min-[480px]:w-[148px]" : "w-[52px]")} aria-label="Actions" />
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((list, i) => (
                                    <ListRow
                                        key={list.id}
                                        index={i}
                                        list={list}
                                        health={health.get(list.id)}
                                        stock={stocks.get(list.id)!}
                                        healthLoading={healthLoading}
                                        active={i === safeCursor}
                                        opened={openId === list.id}
                                        onOpen={() => open(i)}
                                        onMenu={(e) => handleContextMenu(e, list)}
                                        onArchive={(v) => void setArchived(list, v)}
                                    />
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {rows.length > 0 && (
                    <WorkspaceFooter>
                        <KeyHints hints={[[["j", "k"], "se déplacer"], [["Entrée"], "santé"], [["o"], "ouvrir"]]} onHelp={() => setHelp(true)} />
                        <span className="tabular-nums">
                            {rows.length} liste{rows.length > 1 ? "s" : ""}
                        </span>
                    </WorkspaceFooter>
                )}
            </WorkspaceMain>

            {showPane && openList && (
                <ListPane
                    list={openList}
                    health={health.get(openList.id)}
                    stock={stocks.get(openList.id) ?? stockOf(openList)}
                    onClose={() => setOpenId(null)}
                    onArchive={(v) => void setArchived(openList, v)}
                />
            )}

            <ContextMenu items={contextData ? menuItems(contextData) : []} position={position} onClose={closeMenu} />
            <ShortcutsDialog open={help} onClose={() => setHelp(false)} groups={SHORTCUTS} />
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
        </WorkspaceFrame>
    );
}

// ============================================
// ROW
// ============================================

function HealthState({ health }: { health: ListHealthSummary }) {
    const h = HEALTH[health.status];
    return (
        <span className={cn("inline-flex items-center gap-1.5 text-[12px] font-medium", h.text)} title={health.statusLabel}>
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", h.dot)} aria-hidden />
            {h.label}
        </span>
    );
}

function activityText(health: ListHealthSummary): { text: string; late: boolean } {
    if (health.daysSinceLastAction === null) return { text: "Jamais appelée", late: false };
    const when = health.daysSinceLastAction === 0 ? "Aujourd'hui" : `Il y a ${health.daysSinceLastAction} j`;
    return { text: `${when} · ${health.actions7d} / 7 j`, late: health.daysSinceLastAction >= 7 };
}

function ListRow({
    index,
    list,
    health,
    stock,
    healthLoading,
    active,
    opened,
    onOpen,
    onMenu,
    onArchive,
}: {
    index: number;
    list: ListData;
    health?: ListHealthSummary;
    stock: ListStock;
    healthLoading: boolean;
    active: boolean;
    opened: boolean;
    onOpen: () => void;
    onMenu: (e: React.MouseEvent) => void;
    onArchive: (archived: boolean) => void;
}) {
    const contacts = list.stats?.contactCount || 0;
    const activity = health ? activityText(health) : null;
    const exhausted = isExhausted(list, health, stock);
    const low = stock.daysLeft !== null && stock.daysLeft > 0 && stock.daysLeft < 5;

    return (
        <tr
            data-list-row={index}
            onClick={onOpen}
            onContextMenu={onMenu}
            className={cn(
                "group cursor-pointer scroll-mt-9 border-b border-line-subtle transition-colors duration-150",
                opened ? "bg-primary-soft" : active ? "bg-primary-soft/50" : "hover:bg-surface-2",
                list.isArchived && "text-ink-3",
            )}
        >
            <td className={cn(TD, FIRST_CELL, "min-w-0", (active || opened) && "shadow-[inset_2px_0_0_var(--ds-primary)]")}>
                <Link
                    href={`/manager/lists/${list.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="block truncate font-medium text-ink outline-none hover:underline focus-visible:underline"
                >
                    {list.name}
                </Link>
                <div className="mt-0.5 truncate text-[12px] text-ink-3">
                    {[
                        TYPE_LABEL[list.type],
                        list.source,
                        relDate(list.createdAt),
                    ]
                        .filter(Boolean)
                        .join(" · ")}
                    {list.mission && <span className="@min-[960px]:hidden"> · {list.mission.name}</span>}
                </div>
            </td>
            <td className={cn(TD, "hidden truncate text-ink-2 @min-[960px]:table-cell")}>{list.mission?.name ?? "—"}</td>
            <td className={TD}>
                {health ? (
                    <div className="min-w-0 space-y-1">
                        <HealthState health={health} />
                        <HealthBar stock={stock} showLabel={false} className="@min-[480px]:hidden" />
                        <HealthBar stock={stock} className="hidden @min-[480px]:flex" />
                    </div>
                ) : healthLoading && !list.isArchived ? (
                    <div className="h-3 w-24 animate-pulse rounded bg-surface-3" />
                ) : (
                    <span className="text-[12px] text-ink-4">—</span>
                )}
            </td>
            <td className={cn(TD, "hidden text-[12px] tabular-nums @min-[720px]:table-cell")}>
                {activity ? <span className={activity.late ? "font-medium text-warning-ink" : "text-ink-2"}>{activity.text}</span> : <span className="text-ink-4">—</span>}
            </td>
            <td className={cn(TD, "hidden text-right tabular-nums @min-[720px]:table-cell")}>
                <div className="font-medium text-ink">{contacts.toLocaleString("fr-FR")}</div>
                <div className="text-[12px] text-ink-3">{(list._count?.companies || 0).toLocaleString("fr-FR")} soc.</div>
            </td>
            <td
                className={cn(TD, "hidden text-right text-[12px] tabular-nums @min-[960px]:table-cell", low ? "font-medium text-warning-ink" : "text-ink-2")}
                title={stock.reachable ? `${stock.reachable.toLocaleString("fr-FR")} contacts joignables à appeler` : undefined}
            >
                {health ? stockLabel(stock.daysLeft) : "—"}
            </td>
            <td className={cn(TD, LAST_CELL, "relative text-right")}>
                <span className="absolute inset-y-0 right-0 flex items-center gap-1 pr-4 sm:pr-6">
                    {exhausted && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onArchive(true);
                            }}
                            className="hidden h-7 items-center whitespace-nowrap rounded-control border border-line bg-surface px-2 text-[12px] font-medium text-ink-2 hover:text-ink @min-[480px]:inline-flex"
                            title="Liste traitée jusqu'au bout : la retirer des listes actives"
                        >
                            Archiver
                        </button>
                    )}
                    {list.isArchived && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onArchive(false);
                            }}
                            className="hidden h-7 whitespace-nowrap rounded-control border border-line bg-surface px-2 text-[12px] font-medium text-ink-2 hover:text-ink @min-[480px]:group-hover:inline-flex @min-[480px]:group-hover:items-center"
                        >
                            Désarchiver
                        </button>
                    )}
                    <button
                        type="button"
                        aria-label={`Actions pour ${list.name}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            onMenu(e);
                        }}
                        className="inline-flex size-7 items-center justify-center rounded-control text-ink-3 opacity-0 transition hover:bg-surface-3 hover:text-ink group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                    >
                        <MoreHorizontal className="size-4" />
                    </button>
                </span>
            </td>
        </tr>
    );
}

// ============================================
// PANE — a list's health beside the table
// ============================================

const CONFIDENCE: Record<string, string> = { HIGH: "élevée", MEDIUM: "moyenne", LOW: "faible" };

const HINT_CLASS: Record<string, string> = {
    CRITICAL: "border-danger-line bg-danger-soft text-danger-ink",
    WARNING: "border-warning-line bg-warning-soft text-warning-ink",
    POSITIVE: "border-success-line bg-success-soft text-success-ink",
    INFO: "border-line bg-surface-2 text-ink-2",
};

function ListPane({
    list,
    health,
    stock,
    onClose,
    onArchive,
}: {
    list: ListData;
    health?: ListHealthSummary;
    stock: ListStock;
    onClose: () => void;
    onArchive: (archived: boolean) => void;
}) {
    const contacts = list.stats?.contactCount || 0;
    const actionable = list.stats?.completeness?.ACTIONABLE || 0;
    const facts: [string, string][] = [
        ["Contacts", contacts.toLocaleString("fr-FR")],
        ["Joignables", `${actionable.toLocaleString("fr-FR")}${contacts ? ` · ${Math.round((actionable / contacts) * 100)} %` : ""}`],
        ["Traités", stock.treated.toLocaleString("fr-FR")],
        ["Reste à appeler", stock.reachable.toLocaleString("fr-FR")],
        ["Stock d'appels", stockLabel(stock.daysLeft)],
        ["Sociétés", (list._count?.companies || 0).toLocaleString("fr-FR")],
    ];
    return (
        <aside
            className="flex w-[400px] shrink-0 flex-col border-l border-line bg-surface 2xl:w-[480px]"
            aria-label={`Santé de la liste ${list.name}`}
        >
            <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
                <div className="min-w-0">
                    <h2 className="truncate text-[15px] font-semibold text-ink">{list.name}</h2>
                    <p className="mt-0.5 truncate text-[12px] text-ink-3">
                        {[list.mission?.name, health?.clientName, TYPE_LABEL[list.type]].filter(Boolean).join(" · ")}
                    </p>
                </div>
                <button type="button" onClick={onClose} className={ICON_CONTROL} aria-label="Fermer le volet (Échap)">
                    <X className="h-4 w-4" />
                </button>
            </header>
            <div className="min-h-0 flex-1 space-y-5 overflow-auto px-5 py-4">
                {health ? (
                    <>
                        <section>
                            <div className="flex items-center justify-between gap-3">
                                <HealthState health={health} />
                                <span className="text-[12px] text-ink-3">{health.statusLabel}</span>
                            </div>
                            <HealthBar stock={stock} className="mt-2 [&>div]:max-w-none" />
                        </section>
                        <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
                            {facts.map(([label, value]) => (
                                <div key={label}>
                                    <dt className="text-[12px] text-ink-3">{label}</dt>
                                    <dd className="mt-0.5 text-[15px] font-semibold tabular-nums text-ink">{value}</dd>
                                </div>
                            ))}
                        </dl>
                        <section className="space-y-1 text-[13px] text-ink-2">
                            <p>
                                {health.daysSinceLastAction === null
                                    ? "Personne n'a encore appelé cette liste."
                                    : `Dernière action ${health.daysSinceLastAction === 0 ? "aujourd'hui" : `il y a ${health.daysSinceLastAction} j`} · ${health.actions7d} action${health.actions7d > 1 ? "s" : ""} sur 7 jours.`}
                            </p>
                            {health.velocity?.trendExplanation && <p className="text-ink-3">{health.velocity.trendExplanation}</p>}
                            {health.eta?.etaDate && health.eta.confidence !== "INSUFFICIENT" && (
                                <p className="text-ink-3">
                                    Fin estimée le {new Date(health.eta.etaDate).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
                                    {CONFIDENCE[health.eta.confidence] ? ` (fiabilité ${CONFIDENCE[health.eta.confidence]})` : ""}
                                </p>
                            )}
                        </section>
                        {health.hints.length > 0 && (
                            <ul className="space-y-2">
                                {health.hints.map((h) => (
                                    <li key={h.message} className={cn("rounded-xl border px-3 py-2 text-[12.5px]", HINT_CLASS[h.type] ?? HINT_CLASS.INFO)}>
                                        <p className="font-medium">{h.message}</p>
                                        {h.detail && <p className="mt-0.5 opacity-80">{h.detail}</p>}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </>
                ) : (
                    <p className="text-[13px] text-ink-3">{list.isArchived ? "Liste archivée : sa santé n'est plus suivie." : "Santé en cours de calcul…"}</p>
                )}
            </div>
            <footer className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
                <Link href={`/manager/lists/${list.id}`} className={PRIMARY_CONTROL}>
                    Ouvrir la liste
                </Link>
                <Link href={`/manager/lists/${list.id}/edit`} className={CONTROL}>
                    Modifier
                </Link>
                <a href={`/api/lists/${list.id}/export`} target="_blank" rel="noreferrer" className={CONTROL}>
                    <Download className="h-3.5 w-3.5" /> CSV
                </a>
                <button type="button" onClick={() => onArchive(!list.isArchived)} className={cn(CONTROL, "ml-auto")}>
                    {list.isArchived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                    {list.isArchived ? "Désarchiver" : "Archiver"}
                </button>
            </footer>
        </aside>
    );
}

function EmptyLists({ view, filtered, onReset }: { view: View; filtered: boolean; onReset: () => void }) {
    if (filtered) {
        return (
            <EmptyBlock
                title="Aucune liste ne correspond"
                action={
                    <button type="button" onClick={onReset} className={CONTROL}>
                        Effacer la recherche
                    </button>
                }
            />
        );
    }
    if (view === "watch") return <EmptyBlock title="Aucune liste à surveiller" body="Toutes les listes actives sont travaillées régulièrement." />;
    if (view === "archived") return <EmptyBlock title="Aucune liste archivée" body="Une liste traitée jusqu'au bout propose « Archiver » dans sa ligne." />;
    return (
        <EmptyBlock
            title="Aucune liste pour l'instant"
            body="Trouvez des sociétés sur Google Maps et le registre officiel, ou importez un fichier existant."
            action={
                <>
                    <Link href="/manager/lists/import" className={CONTROL}>
                        <Upload className="h-3.5 w-3.5" /> Importer un CSV
                    </Link>
                    <Link href="/manager/lists/sourcing" className={PRIMARY_CONTROL}>
                        <ScanSearch className="h-3.5 w-3.5" /> Sourcer des leads
                    </Link>
                </>
            }
        />
    );
}
