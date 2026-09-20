"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    AlertTriangle,
    Ban,
    CalendarClock,
    LifeBuoy,
    MessageSquare,
    Paperclip,
    Plus,
    Search,
    Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Input, EmptyState, LoadingState, StatCard, useToast } from "@/components/ui";
import { TicketStatusBadge, TicketPriorityBadge, TicketCategoryBadge } from "./TicketBadges";
import { TicketThread } from "./TicketThread";
import { TicketSidePanel } from "./TicketSidePanel";
import { TicketFormModal } from "./TicketFormModal";
import type {
    TaskPriority,
    TicketCategory,
    TicketDashboardCounts,
    TicketDetail,
    TicketListItem,
    TicketStatus,
} from "./types";
import {
    TICKET_CATEGORY_LABELS,
    TICKET_PRIORITY_LABELS,
    TICKET_STATUS_LABELS,
    formatTicketRef,
} from "@/lib/tickets/constants";

interface TicketWorkspaceProps {
    currentUserId: string;
    isManager: boolean;
    developers: { id: string; name: string }[];
    clients: { id: string; name: string }[];
    defaultOnlyMine?: boolean;
}

type StatusFilter = "ALL" | "OPEN" | TicketStatus;
type PriorityFilter = "ALL" | TaskPriority;
type CategoryFilter = "ALL" | TicketCategory;

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
    { value: "OPEN", label: "Ouverts" },
    { value: "ALL", label: "Tous" },
    { value: "NEW", label: TICKET_STATUS_LABELS.NEW },
    { value: "TODO", label: TICKET_STATUS_LABELS.TODO },
    { value: "IN_PROGRESS", label: TICKET_STATUS_LABELS.IN_PROGRESS },
    { value: "BLOCKED", label: TICKET_STATUS_LABELS.BLOCKED },
    { value: "TESTING", label: TICKET_STATUS_LABELS.TESTING },
    { value: "COMPLETED", label: TICKET_STATUS_LABELS.COMPLETED },
];

const PRIORITY_FILTERS: { value: PriorityFilter; label: string }[] = [
    { value: "ALL", label: "Toutes priorités" },
    { value: "URGENT", label: TICKET_PRIORITY_LABELS.URGENT },
    { value: "HIGH", label: TICKET_PRIORITY_LABELS.HIGH },
    { value: "MEDIUM", label: TICKET_PRIORITY_LABELS.MEDIUM },
    { value: "LOW", label: TICKET_PRIORITY_LABELS.LOW },
];

const CATEGORY_FILTERS: { value: CategoryFilter; label: string }[] = [
    { value: "ALL", label: "Toutes catégories" },
    { value: "BUG", label: TICKET_CATEGORY_LABELS.BUG },
    { value: "IMPROVEMENT", label: TICKET_CATEGORY_LABELS.IMPROVEMENT },
    { value: "FEATURE_REQUEST", label: TICKET_CATEGORY_LABELS.FEATURE_REQUEST },
    { value: "TECHNICAL_SUPPORT", label: TICKET_CATEGORY_LABELS.TECHNICAL_SUPPORT },
];

const PRIORITY_ACCENT: Record<TaskPriority, string> = {
    URGENT: "border-l-4 border-l-red-500",
    HIGH: "border-l-4 border-l-orange-500",
    MEDIUM: "border-l-[3px] border-l-amber-400",
    LOW: "border-l-2 border-l-slate-200",
};

export function TicketWorkspace({
    currentUserId,
    isManager,
    developers,
    clients,
    defaultOnlyMine = false,
}: TicketWorkspaceProps) {
    const toast = useToast();

    const [tickets, setTickets] = useState<TicketListItem[]>([]);
    const [counts, setCounts] = useState<TicketDashboardCounts | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [detail, setDetail] = useState<TicketDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isDetailLoading, setIsDetailLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("OPEN");
    const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("ALL");
    const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("ALL");
    const [onlyMine, setOnlyMine] = useState(defaultOnlyMine);
    const [activeMobileTab, setActiveMobileTab] = useState<"thread" | "details">("thread");
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editing, setEditing] = useState<TicketDetail | null>(null);

    const fetchTickets = useCallback(async () => {
        const params = new URLSearchParams();
        if (statusFilter === "OPEN") {
            params.set("status", "NEW,TODO,IN_PROGRESS,BLOCKED,TESTING");
        } else if (statusFilter !== "ALL") {
            params.set("status", statusFilter);
        }
        if (priorityFilter !== "ALL") params.set("priority", priorityFilter);
        if (categoryFilter !== "ALL") params.set("category", categoryFilter);
        if (onlyMine) params.set("assigneeId", currentUserId);
        if (search.trim()) params.set("search", search.trim());

        try {
            const response = await fetch(`/api/tickets?${params.toString()}`);
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.error || "Chargement impossible");
            }
            setTickets(result.data);
            setError(null);
            return result.data as TicketListItem[];
        } catch (err) {
            const message = err instanceof Error ? err.message : "Erreur serveur";
            setError(message);
            toast.error(message);
            return [];
        } finally {
            setIsLoading(false);
        }
    }, [statusFilter, priorityFilter, categoryFilter, onlyMine, search, currentUserId, toast]);

    const fetchCounts = useCallback(async () => {
        try {
            const response = await fetch("/api/tickets/dashboard");
            const result = await response.json();
            if (response.ok && result.success) setCounts(result.data);
        } catch {
            // Counters are decorative — a failure here must not block the board.
        }
    }, []);

    const fetchDetail = useCallback(async (ticketId: string) => {
        setIsDetailLoading(true);
        try {
            const response = await fetch(`/api/tickets/${ticketId}`);
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.error || "Ticket introuvable");
            }
            setDetail(result.data);
        } catch {
            setDetail(null);
        } finally {
            setIsDetailLoading(false);
        }
    }, []);

    // Refetch the list when the actual filters change — deliberately NOT keyed on
    // the `fetchTickets` identity. That callback closes over the toast context,
    // whose identity churns every time any toast appears, which would otherwise
    // turn a single failing request into a refetch + error-toast storm.
    useEffect(() => {
        fetchTickets();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [statusFilter, priorityFilter, categoryFilter, onlyMine, search, currentUserId]);

    // Dashboard counters are global and don't depend on the filters — load once.
    useEffect(() => {
        fetchCounts();
    }, [fetchCounts]);

    useEffect(() => {
        if (selectedId) fetchDetail(selectedId);
        else setDetail(null);
    }, [selectedId, fetchDetail]);

    // Keep selection in sync with the current ticket list (first load, filter switch, search)
    useEffect(() => {
        if (tickets.length > 0) {
            if (!selectedId || !tickets.some((t) => t.id === selectedId)) {
                setSelectedId(tickets[0].id);
            }
        } else {
            setSelectedId(null);
        }
    }, [tickets, selectedId]);

    const refreshAll = useCallback(async () => {
        await Promise.all([fetchTickets(), fetchCounts()]);
        if (selectedId) await fetchDetail(selectedId);
    }, [fetchTickets, fetchCounts, fetchDetail, selectedId]);

    const statCards = useMemo(
        () => [
            { label: "Urgents", value: counts?.urgent ?? 0, icon: AlertTriangle, iconBg: "bg-red-100", iconColor: "text-red-600" },
            { label: "Bloqués", value: counts?.blocked ?? 0, icon: Ban, iconBg: "bg-orange-100", iconColor: "text-orange-600" },
            { label: "En cours", value: counts?.active ?? 0, icon: Activity, iconBg: "bg-indigo-100", iconColor: "text-indigo-600" },
            { label: "En retard", value: counts?.overdue ?? 0, icon: CalendarClock, iconBg: "bg-amber-100", iconColor: "text-amber-600" },
        ],
        [counts],
    );

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Support technique</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Bugs, améliorations et demandes de fonctionnalités, centralisés.
                    </p>
                </div>
                {isManager && (
                    <Button
                        onClick={() => {
                            setEditing(null);
                            setIsFormOpen(true);
                        }}
                    >
                        <Plus className="w-4 h-4" />
                        Nouveau ticket
                    </Button>
                )}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {statCards.map((card) => (
                    <StatCard key={card.label} {...card} />
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_320px] gap-4 h-[calc(100vh-20rem)] min-h-[32rem]">
                {/* Left: ticket list */}
                <div className="flex flex-col min-h-0 bg-white border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="p-4 space-y-3 border-b border-slate-200">
                        <Input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Rechercher un ticket…"
                            icon={<Search className="w-4 h-4 text-slate-400" />}
                        />
                        <div className="flex flex-wrap gap-1.5">
                            {STATUS_FILTERS.map((filter) => (
                                <button
                                    key={filter.value}
                                    type="button"
                                    onClick={() => setStatusFilter(filter.value)}
                                    className={cn(
                                        "px-2.5 py-1 text-xs font-medium rounded-full border transition-colors",
                                        statusFilter === filter.value
                                            ? "bg-slate-900 text-white border-slate-900 shadow-2xs"
                                            : "bg-white text-slate-600 border-slate-200 hover:border-slate-300",
                                    )}
                                >
                                    {filter.label}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-0.5">
                            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={onlyMine}
                                    onChange={(event) => setOnlyMine(event.target.checked)}
                                    className="rounded border-slate-300 accent-indigo-600 focus:ring-indigo-500"
                                />
                                <span>Mes tickets</span>
                            </label>
                            <div className="flex items-center gap-1.5">
                                <select
                                    value={priorityFilter}
                                    onChange={(e) => setPriorityFilter(e.target.value as PriorityFilter)}
                                    className="text-xs font-medium py-1.5 px-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                                    aria-label="Filtrer par priorité"
                                >
                                    {PRIORITY_FILTERS.map((f) => (
                                        <option key={f.value} value={f.value}>{f.label}</option>
                                    ))}
                                </select>
                                <select
                                    value={categoryFilter}
                                    onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
                                    className="text-xs font-medium py-1.5 px-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                                    aria-label="Filtrer par catégorie"
                                >
                                    {CATEGORY_FILTERS.map((f) => (
                                        <option key={f.value} value={f.value}>{f.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {isLoading ? (
                            <LoadingState />
                        ) : error ? (
                            <EmptyState
                                variant="inline"
                                icon={AlertTriangle}
                                title="Chargement impossible"
                                description={error}
                                action={
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => {
                                            setIsLoading(true);
                                            void fetchTickets();
                                        }}
                                    >
                                        Réessayer
                                    </Button>
                                }
                            />
                        ) : tickets.length === 0 ? (
                            <EmptyState variant="inline" icon={LifeBuoy} title="Aucun ticket" />
                        ) : (
                            <ul className="divide-y divide-slate-100">
                                {tickets.map((ticket) => (
                                    <li key={ticket.id}>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedId(ticket.id);
                                                setActiveMobileTab("thread");
                                            }}
                                            aria-current={selectedId === ticket.id ? "true" : undefined}
                                            className={cn(
                                                "w-full text-left px-4 py-3 transition-colors",
                                                PRIORITY_ACCENT[ticket.priority],
                                                selectedId === ticket.id ? "bg-indigo-50/70" : "hover:bg-slate-50",
                                            )}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-xs font-semibold text-slate-400">
                                                    {formatTicketRef(ticket.number)}
                                                </span>
                                                <TicketPriorityBadge priority={ticket.priority} />
                                            </div>
                                            <p className="mt-1 text-sm font-medium text-slate-900 line-clamp-2">
                                                {ticket.title}
                                            </p>
                                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                                                <TicketStatusBadge status={ticket.status} />
                                                <TicketCategoryBadge category={ticket.category} />
                                            </div>
                                            <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500 min-w-0">
                                                <span className="truncate">{ticket.assignee?.name ?? "Non assigné"}</span>
                                                {ticket._count.comments > 0 && (
                                                    <span className="inline-flex items-center gap-1 shrink-0">
                                                        <MessageSquare className="w-3 h-3" />
                                                        {ticket._count.comments}
                                                    </span>
                                                )}
                                                {ticket._count.attachments > 0 && (
                                                    <span className="inline-flex items-center gap-1 shrink-0">
                                                        <Paperclip className="w-3 h-3" />
                                                        {ticket._count.attachments}
                                                    </span>
                                                )}
                                            </div>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                {/* Middle: thread */}
                <div className="flex flex-col min-h-0 bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden">
                    {isDetailLoading && !detail ? (
                        <LoadingState />
                    ) : !detail ? (
                        <EmptyState
                            variant="inline"
                            icon={LifeBuoy}
                            title="Sélectionnez un ticket"
                            description="Le fil de discussion et l'historique s'affichent ici."
                        />
                    ) : (
                        <>
                            <div className="flex items-center justify-between gap-3 px-5 py-4 bg-white border-b border-slate-200">
                                <div className="min-w-0">
                                    <p className="text-xs font-semibold text-slate-400">
                                        {formatTicketRef(detail.number)}
                                    </p>
                                    <h2 className="text-base font-semibold text-slate-900 truncate">{detail.title}</h2>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {/* Mobile / Tablet Tab switch (< xl) */}
                                    <div className="flex xl:hidden items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200 text-xs">
                                        <button
                                            type="button"
                                            onClick={() => setActiveMobileTab("thread")}
                                            className={cn(
                                                "px-2.5 py-1 rounded-md font-medium transition-colors",
                                                activeMobileTab === "thread"
                                                    ? "bg-white text-slate-900 shadow-2xs"
                                                    : "text-slate-600 hover:text-slate-900",
                                            )}
                                        >
                                            Discussion
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setActiveMobileTab("details")}
                                            className={cn(
                                                "px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5",
                                                activeMobileTab === "details"
                                                    ? "bg-white text-slate-900 shadow-2xs"
                                                    : "text-slate-600 hover:text-slate-900",
                                            )}
                                        >
                                            <span>Détails</span>
                                            {detail.releaseChecks?.some((c) => !c.checked) && (
                                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" aria-hidden />
                                            )}
                                        </button>
                                    </div>

                                    <TicketStatusBadge status={detail.status} />
                                    {isManager && (
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => {
                                                setEditing(detail);
                                                setIsFormOpen(true);
                                            }}
                                        >
                                            Modifier
                                        </Button>
                                    )}
                                </div>
                            </div>
                            <div className="flex-1 min-h-0 relative">
                                {/* On < xl, display SidePanel if activeMobileTab === "details" */}
                                <div className={cn("h-full", activeMobileTab === "details" ? "block xl:hidden" : "hidden")}>
                                    <TicketSidePanel
                                        ticket={detail}
                                        currentUserId={currentUserId}
                                        isManager={isManager}
                                        onRefresh={refreshAll}
                                    />
                                </div>
                                {/* Thread is visible when activeMobileTab === "thread" OR on >= xl */}
                                <div className={cn("h-full", activeMobileTab === "thread" ? "block" : "hidden xl:block")}>
                                    <TicketThread
                                        ticket={detail}
                                        currentUserId={currentUserId}
                                        canComment
                                        onRefresh={refreshAll}
                                    />
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Right: metadata + checklist (folds under the thread below xl) */}
                <div className="hidden xl:flex flex-col min-h-0 bg-white border border-slate-200 rounded-2xl overflow-hidden">
                    {detail ? (
                        <TicketSidePanel
                            ticket={detail}
                            currentUserId={currentUserId}
                            isManager={isManager}
                            onRefresh={refreshAll}
                        />
                    ) : (
                        <EmptyState variant="inline" icon={LifeBuoy} title="Aucun ticket sélectionné" />
                    )}
                </div>
            </div>

            {isManager && (
                <TicketFormModal
                    isOpen={isFormOpen}
                    onClose={() => setIsFormOpen(false)}
                    onSaved={refreshAll}
                    ticket={editing}
                    developers={developers}
                    clients={clients}
                />
            )}
        </div>
    );
}

export default TicketWorkspace;
