"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
    Rows3,
    Columns3,
    Inbox,
    UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Input, EmptyState, LoadingState, useToast } from "@/components/ui";
import { TicketStatusBadge, TicketPriorityBadge, TicketCategoryBadge } from "./TicketBadges";
import { TicketThread } from "./TicketThread";
import { TicketSidePanel } from "./TicketSidePanel";
import { TicketFormModal } from "./TicketFormModal";
import { TicketValidationModal } from "./TicketValidationModal";
import { TicketDrawer } from "./TicketDrawer";
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
    USER_ROLE_LABELS,
    formatTicketRef,
} from "@/lib/tickets/constants";

interface TicketWorkspaceProps {
    currentUserId: string;
    isManager: boolean;
    developers: { id: string; name: string }[];
    clients: { id: string; name: string }[];
    defaultOnlyMine?: boolean;
}

/**
 * The first four are views, not statuses: "PENDING_VALIDATION" maps to
 * ?validation=PENDING, "UNASSIGNED" / "URGENT" to open tickets with no owner /
 * URGENT priority — the same definitions as the dashboard counters.
 */
type StatusFilter = "ALL" | "OPEN" | "PENDING_VALIDATION" | "UNASSIGNED" | "URGENT" | TicketStatus;

const OPEN_STATUSES = "NEW,TODO,IN_PROGRESS,BLOCKED,TESTING";

/** "Tous" really means all: the API hides PENDING requests unless asked for them. */
const ALL_VALIDATIONS = "NOT_REQUIRED,PENDING,ACCEPTED,REJECTED";
type PriorityFilter = "ALL" | TaskPriority;
type CategoryFilter = "ALL" | TicketCategory;

/**
 * Two different questions, so two different controls. "Which pile am I in"
 * (scope) is a segmented control; "which lifecycle state" is a chip row. They
 * used to be nine identical pills in one line, which read as one flat list of
 * equal options and buried the validation queue at position two.
 */
const SCOPE_FILTERS: { value: StatusFilter; label: string; count?: keyof TicketDashboardCounts; tone?: string }[] = [
    { value: "ALL", label: "Toutes les demandes" },
    { value: "PENDING_VALIDATION", label: "À valider", count: "pendingValidation", tone: "bg-amber-500" },
    { value: "UNASSIGNED", label: "Non assignés", count: "unassigned", tone: "bg-sky-500" },
    { value: "URGENT", label: "Urgents", count: "urgent", tone: "bg-red-500" },
    { value: "OPEN", label: "Ouverts" },
];

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
    { value: "NEW", label: TICKET_STATUS_LABELS.NEW },
    { value: "TODO", label: TICKET_STATUS_LABELS.TODO },
    { value: "IN_PROGRESS", label: TICKET_STATUS_LABELS.IN_PROGRESS },
    { value: "BLOCKED", label: TICKET_STATUS_LABELS.BLOCKED },
    { value: "TESTING", label: TICKET_STATUS_LABELS.TESTING },
    { value: "COMPLETED", label: TICKET_STATUS_LABELS.COMPLETED },
];

/** Teams that can file a request, for the "qui demande" filter. */
const REQUESTER_FILTERS: { value: string; label: string }[] = [
    { value: "ALL", label: "Tous les demandeurs" },
    { value: "SDR,BUSINESS_DEVELOPER,BOOKER", label: "Équipe sales" },
    { value: "MANAGER", label: "Manager" },
    { value: "DEVELOPER", label: "Développeur" },
];

/** Colour-codes the requester's team so a row is placeable at a glance. */
const REQUESTER_ROLE_TONE: Record<string, string> = {
    SDR: "bg-sky-100 text-sky-700",
    BUSINESS_DEVELOPER: "bg-teal-100 text-teal-700",
    BOOKER: "bg-cyan-100 text-cyan-700",
    MANAGER: "bg-slate-200 text-slate-700",
    DEVELOPER: "bg-violet-100 text-violet-700",
};

/** Ages a ticket so a three-week-old NEW stops looking like this morning's. */
function ageLabel(iso: string): { label: string; tone: string } {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    if (days <= 0) return { label: "auj.", tone: "text-slate-400" };
    if (days === 1) return { label: "1 j", tone: "text-slate-400" };
    if (days < 7) return { label: `${days} j`, tone: "text-slate-500" };
    if (days < 30) return { label: `${Math.floor(days / 7)} sem`, tone: "text-amber-600" };
    return { label: `${Math.floor(days / 30)} mois`, tone: "font-semibold text-red-600" };
}

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

/**
 * Notifications link to `/manager/tickets?validation=PENDING&ticket=<id>`
 * (see lib/tickets/notifications.ts). The board used to ignore the query
 * string entirely, so an alert dropped the manager on the default "Ouverts"
 * view — where a pending request is filtered out by the API and so invisible.
 */
function readDeepLink(): { status: StatusFilter | null; ticketId: string | null } {
    if (typeof window === "undefined") return { status: null, ticketId: null };
    const params = new URLSearchParams(window.location.search);
    const validation = params.get("validation");
    return {
        status: validation === "PENDING" ? "PENDING_VALIDATION" : null,
        ticketId: params.get("ticket"),
    };
}

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
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
    const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("ALL");
    const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("ALL");
    const [onlyMine, setOnlyMine] = useState(defaultOnlyMine);
    const [requesterFilter, setRequesterFilter] = useState("ALL");
    const [activeMobileTab, setActiveMobileTab] = useState<"thread" | "details">("thread");
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editing, setEditing] = useState<TicketDetail | null>(null);
    const [isValidationOpen, setIsValidationOpen] = useState(false);
    /** "table" is the default: Jeff works from the whole board at once, not one
        ticket at a time. The split layout stays for reading a long thread. */
    const [viewMode, setViewMode] = useState<"table" | "split">("table");
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    /** The ticket the notification pointed at, kept for the selection guard below. */
    const deepLinkedIdRef = useRef<string | null>(null);

    const fetchTickets = useCallback(async (opts?: { silent?: boolean }) => {
        const params = new URLSearchParams();
        if (statusFilter === "ALL") {
            params.set("validation", ALL_VALIDATIONS);
        } else if (statusFilter === "PENDING_VALIDATION") {
            // The queue the sales team's requests land in — see TC-0032.
            params.set("validation", "PENDING");
        } else if (statusFilter === "OPEN" || statusFilter === "UNASSIGNED" || statusFilter === "URGENT") {
            params.set("status", OPEN_STATUSES);
        } else {
            params.set("status", statusFilter);
        }
        if (statusFilter === "URGENT") params.set("priority", "URGENT");
        else if (priorityFilter !== "ALL") params.set("priority", priorityFilter);
        if (categoryFilter !== "ALL") params.set("category", categoryFilter);
        if (requesterFilter !== "ALL") params.set("requesterRole", requesterFilter);
        // Sales-team requests arrive PENDING and unassigned: hiding them here made
        // "Non assignés" look empty. Rejected ones are closed, so they stay out.
        if (statusFilter === "UNASSIGNED") params.set("validation", "NOT_REQUIRED,PENDING,ACCEPTED");
        if (statusFilter === "UNASSIGNED") params.set("assigneeId", "unassigned");
        else if (onlyMine) params.set("assigneeId", currentUserId);
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
            // Background refreshes fail quietly — the last good list stays on screen.
            if (opts?.silent) return [];
            setError(message);
            toast.error(message);
            return [];
        } finally {
            setIsLoading(false);
        }
    }, [statusFilter, priorityFilter, categoryFilter, requesterFilter, onlyMine, search, currentUserId, toast]);

    const fetchCounts = useCallback(async () => {
        try {
            const response = await fetch("/api/tickets/dashboard");
            const result = await response.json();
            if (response.ok && result.success) setCounts(result.data);
        } catch {
            // Counters are decorative — a failure here must not block the board.
        }
    }, []);

    const fetchDetail = useCallback(async (ticketId: string, opts?: { silent?: boolean }) => {
        if (!opts?.silent) setIsDetailLoading(true);
        try {
            const response = await fetch(`/api/tickets/${ticketId}`);
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.error || "Ticket introuvable");
            }
            // A background refresh must not clobber the detail of a ticket the
            // user has since switched away from.
            setDetail((prev) => (opts?.silent && prev && prev.id !== ticketId ? prev : result.data));
        } catch {
            if (!opts?.silent) setDetail(null);
        } finally {
            if (!opts?.silent) setIsDetailLoading(false);
        }
    }, []);

    // Refetch the list when the actual filters change — deliberately NOT keyed on
    // the `fetchTickets` identity. That callback closes over the toast context,
    // whose identity churns every time any toast appears, which would otherwise
    // turn a single failing request into a refetch + error-toast storm.
    useEffect(() => {
        fetchTickets();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [statusFilter, priorityFilter, categoryFilter, requesterFilter, onlyMine, search, currentUserId]);

    // Dashboard counters are global and don't depend on the filters.
    useEffect(() => {
        fetchCounts();
    }, [fetchCounts]);

    // Live board: comments and new requests from others used to need a page
    // reload. Refresh quietly every 30 s and whenever the tab regains focus.
    const liveRefreshRef = useRef<() => void>(() => {});
    liveRefreshRef.current = () => {
        if (document.visibilityState !== "visible") return;
        void fetchTickets({ silent: true });
        void fetchCounts();
        if (selectedId) void fetchDetail(selectedId, { silent: true });
    };
    useEffect(() => {
        const tick = () => liveRefreshRef.current();
        const interval = window.setInterval(tick, 30_000);
        window.addEventListener("focus", tick);
        document.addEventListener("visibilitychange", tick);
        return () => {
            window.clearInterval(interval);
            window.removeEventListener("focus", tick);
            document.removeEventListener("visibilitychange", tick);
        };
    }, []);

    // Follow the notification's deep link once, after mount: reading
    // window.location during render would desync the server-rendered markup.
    useEffect(() => {
        const { status, ticketId } = readDeepLink();
        if (status) setStatusFilter(status);
        if (ticketId) {
            deepLinkedIdRef.current = ticketId;
            setSelectedId(ticketId);
            setIsDrawerOpen(true);
        }
    }, []);

    useEffect(() => {
        if (selectedId) fetchDetail(selectedId);
        else setDetail(null);
    }, [selectedId, fetchDetail]);

    // Keep selection in sync with the current ticket list (first load, filter switch, search)
    useEffect(() => {
        if (tickets.length > 0) {
            if (!selectedId || !tickets.some((t) => t.id === selectedId)) {
                // A deep-linked ticket is read straight from its own endpoint, so
                // it stays selected even when the current filter excludes it —
                // silently swapping it for tickets[0] would show the wrong one.
                if (selectedId && selectedId === deepLinkedIdRef.current) return;
                setSelectedId(tickets[0].id);
            }
        } else if (!selectedId || selectedId !== deepLinkedIdRef.current) {
            setSelectedId(null);
        }
    }, [tickets, selectedId]);

    const refreshAll = useCallback(async () => {
        await Promise.all([fetchTickets(), fetchCounts()]);
        if (selectedId) await fetchDetail(selectedId);
    }, [fetchTickets, fetchCounts, fetchDetail, selectedId]);

    /**
     * Counters a manager can act on come first. The old set reported the board's
     * state (urgent / blocked / active / overdue) but never asked anything of the
     * person reading it — so requests sat unvalidated and triaged tickets sat
     * unowned. Each tile is a filter, because a number you cannot click is a
     * dead end.
     */
    const statCards = useMemo(
        () => [
            {
                label: "À valider",
                value: counts?.pendingValidation ?? 0,
                icon: Inbox,
                iconBg: "bg-amber-100",
                iconColor: "text-amber-600",
                onClick: () => setStatusFilter("PENDING_VALIDATION"),
            },
            {
                label: "Non assignés",
                value: counts?.unassigned ?? 0,
                icon: UserPlus,
                iconBg: "bg-sky-100",
                iconColor: "text-sky-600",
                onClick: () => { setStatusFilter("UNASSIGNED"); setOnlyMine(false); },
            },
            {
                label: "Urgents",
                value: counts?.urgent ?? 0,
                icon: AlertTriangle,
                iconBg: "bg-red-100",
                iconColor: "text-red-600",
                onClick: () => { setStatusFilter("URGENT"); setPriorityFilter("ALL"); },
            },
            {
                label: "Bloqués",
                value: counts?.blocked ?? 0,
                icon: Ban,
                iconBg: "bg-orange-100",
                iconColor: "text-orange-600",
                onClick: () => setStatusFilter("BLOCKED"),
            },
            {
                label: "En retard",
                value: counts?.overdue ?? 0,
                icon: CalendarClock,
                iconBg: "bg-amber-100",
                iconColor: "text-amber-600",
                onClick: () => setStatusFilter("OPEN"),
            },
        ],
        [counts],
    );

    const scopeControl = (
        <div className="inline-flex flex-wrap rounded-xl border border-slate-200 bg-slate-50 p-0.5">
            {SCOPE_FILTERS.map((filter) => {
                const count = filter.count ? counts?.[filter.count] ?? 0 : 0;
                return (
                    <button
                        key={filter.value}
                        type="button"
                        onClick={() => {
                            setStatusFilter(filter.value);
                            // Those views are defined by owner / priority; a leftover
                            // "Mes tickets" or priority select would silently narrow them.
                            if (filter.value === "UNASSIGNED") setOnlyMine(false);
                            if (filter.value === "URGENT") setPriorityFilter("ALL");
                        }}
                        aria-pressed={statusFilter === filter.value}
                        className={cn(
                            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                            statusFilter === filter.value
                                ? "bg-white text-slate-900 shadow-sm"
                                : "text-slate-500 hover:text-slate-800",
                        )}
                    >
                        {filter.label}
                        {count > 0 && (
                            <span className={cn("rounded-full px-1.5 text-[10px] font-bold text-white", filter.tone)}>
                                {count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );

    const emptyCopy: { title: string; description: string } =
        statusFilter === "PENDING_VALIDATION"
            ? { title: "Aucune demande à valider", description: "Les demandes déposées par l'équipe sales arriveront ici." }
            : statusFilter === "UNASSIGNED"
            ? { title: "Tout est assigné", description: "Aucun ticket ouvert n'attend de responsable." }
            : statusFilter === "URGENT"
            ? { title: "Aucun ticket urgent", description: "Aucun ticket ouvert n'est marqué urgent." }
            : { title: "Aucun ticket", description: "Aucun ticket ne correspond à ces filtres." };

    return (
        <div className="flex h-full min-h-0 flex-col gap-3 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Support technique</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Bugs, améliorations et demandes de fonctionnalités, centralisés.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5">
                        {([
                            { id: "table" as const, label: "Tableau", icon: Rows3 },
                            { id: "split" as const, label: "Colonnes", icon: Columns3 },
                        ]).map((v) => (
                            <button
                                key={v.id}
                                type="button"
                                onClick={() => setViewMode(v.id)}
                                aria-pressed={viewMode === v.id}
                                className={cn(
                                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                                    viewMode === v.id
                                        ? "bg-slate-900 text-white"
                                        : "text-slate-600 hover:bg-slate-50",
                                )}
                            >
                                <v.icon className="h-3.5 w-3.5" />
                                {v.label}
                            </button>
                        ))}
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
            </div>

            {/* A compact strip, not five tall cards: every pixel of chrome above
                the table is a row you cannot see. Same information, one line. */}
            <div className="flex flex-wrap gap-2">
                {statCards.map(({ onClick, label, value, icon: Icon, iconBg, iconColor }) => (
                    <button
                        key={label}
                        type="button"
                        onClick={onClick}
                        aria-label={`Filtrer : ${label} (${value})`}
                        className={cn(
                            "inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 transition-colors",
                            "border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40",
                            "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                            value === 0 && "opacity-60",
                        )}
                    >
                        <span className={cn("flex h-6 w-6 items-center justify-center rounded-lg", iconBg)}>
                            <Icon className={cn("h-3.5 w-3.5", iconColor)} />
                        </span>
                        <span className="text-lg font-bold leading-none tabular-nums text-slate-900">{value}</span>
                        <span className="text-xs font-medium text-slate-500">{label}</span>
                    </button>
                ))}
            </div>

            {/* The queue TC-0032 was about. A banner rather than a filter pill:
                a request waiting on a ruling is an inbox item, and the previous
                design hid it behind a chip nobody had a reason to click. */}
            {isManager && statusFilter !== "PENDING_VALIDATION" && (counts?.pendingValidation ?? 0) > 0 && (
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <Inbox className="h-5 w-5 shrink-0 text-amber-600" />
                    <p className="text-sm text-amber-900">
                        <span className="font-semibold">
                            {counts?.pendingValidation} demande{(counts?.pendingValidation ?? 0) > 1 ? "s" : ""}
                        </span>{" "}
                        de l&apos;équipe sales {(counts?.pendingValidation ?? 0) > 1 ? "attendent" : "attend"} votre validation.
                    </p>
                    <Button
                        size="sm"
                        className="ml-auto"
                        onClick={() => setStatusFilter("PENDING_VALIDATION")}
                    >
                        Traiter
                    </Button>
                </div>
            )}

            {/* Table-view filter bar. The split view carries its own in the left
                column, so rendering this there would duplicate every control. */}
            {viewMode === "table" && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3">
                <div className="min-w-[220px] flex-1">
                    <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Rechercher un ticket…"
                        icon={<Search className="w-4 h-4 text-slate-400" />}
                    />
                </div>
                {/* Scope: which pile. Visually distinct from the status chips
                    below, because they answer different questions. */}
                {scopeControl}

                <div className="flex flex-wrap items-center gap-1.5">
                    {STATUS_FILTERS.map((filter) => (
                        <button
                            key={filter.value}
                            type="button"
                            onClick={() => setStatusFilter(filter.value)}
                            className={cn(
                                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                                statusFilter === filter.value
                                    ? "border-slate-900 bg-slate-900 text-white"
                                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                            )}
                        >
                            {filter.label}
                        </button>
                    ))}
                </div>
                <select
                    value={requesterFilter}
                    onChange={(e) => setRequesterFilter(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-medium text-slate-600 focus:border-indigo-500 focus:outline-none"
                    aria-label="Filtrer par demandeur"
                >
                    {REQUESTER_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
                <select
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value as PriorityFilter)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-medium text-slate-600 focus:border-indigo-500 focus:outline-none"
                    aria-label="Filtrer par priorité"
                >
                    {PRIORITY_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
                <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-medium text-slate-600 focus:border-indigo-500 focus:outline-none"
                    aria-label="Filtrer par catégorie"
                >
                    {CATEGORY_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
                <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-slate-600">
                    <input
                        type="checkbox"
                        checked={onlyMine}
                        onChange={(event) => setOnlyMine(event.target.checked)}
                        className="rounded border-slate-300 accent-indigo-600"
                    />
                    <span>Mes tickets</span>
                </label>
                <span className="ml-auto text-xs text-slate-500">
                    {tickets.length} ticket{tickets.length > 1 ? "s" : ""}
                </span>
            </div>
            )}

            {viewMode === "table" ? (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    {isLoading ? (
                        <LoadingState />
                    ) : error ? (
                        <EmptyState
                            variant="inline"
                            icon={AlertTriangle}
                            title="Chargement impossible"
                            description={error}
                            action={
                                <Button size="sm" variant="secondary" onClick={() => { setIsLoading(true); void fetchTickets(); }}>
                                    Réessayer
                                </Button>
                            }
                        />
                    ) : tickets.length === 0 ? (
                        <EmptyState
                            variant="inline"
                            icon={statusFilter === "PENDING_VALIDATION" ? Inbox : LifeBuoy}
                            title={emptyCopy.title}
                            description={emptyCopy.description}
                        />
                    ) : (
                        <div className="min-h-0 flex-1 overflow-auto">
                            <table className="w-full min-w-[1180px] text-sm">
                                {/* Sticky: scrolling 200 rows without column
                                    headers is guesswork by row 20. */}
                                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-left shadow-[0_1px_0_0_rgb(226_232_240)]">
                                    <tr className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                        <th className="px-3 py-2.5">Réf</th>
                                        <th className="px-3 py-2.5">Titre</th>
                                        <th className="px-3 py-2.5">Statut</th>
                                        <th className="px-3 py-2.5">Priorité</th>
                                        <th className="px-3 py-2.5">Catégorie</th>
                                        <th className="px-3 py-2.5">Demandeur</th>
                                        <th className="px-3 py-2.5">Assigné</th>
                                        <th className="px-3 py-2.5">Client</th>
                                        <th className="px-3 py-2.5">Âge</th>
                                        <th className="px-3 py-2.5">Échéance</th>
                                        <th className="px-3 py-2.5 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {tickets.map((ticket) => {
                                        const overdue = ticket.dueDate
                                            && ticket.status !== "COMPLETED"
                                            && new Date(ticket.dueDate) < new Date();
                                        return (
                                            <tr
                                                key={ticket.id}
                                                onClick={() => { setSelectedId(ticket.id); setIsDrawerOpen(true); }}
                                                className={cn(
                                                    "cursor-pointer transition-colors hover:bg-slate-50",
                                                    PRIORITY_ACCENT[ticket.priority],
                                                )}
                                            >
                                                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-slate-400">
                                                    {formatTicketRef(ticket.number)}
                                                </td>
                                                <td className="px-3 py-2.5">
                                                    <p className="max-w-[26rem] truncate font-medium text-slate-900">{ticket.title}</p>
                                                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
                                                        {ticket.validation === "PENDING" && (
                                                            <span className="rounded-full bg-amber-100 px-1.5 font-semibold text-amber-800">À valider</span>
                                                        )}
                                                        {ticket._count.comments > 0 && (
                                                            <span className="inline-flex items-center gap-0.5">
                                                                <MessageSquare className="h-3 w-3" />{ticket._count.comments}
                                                            </span>
                                                        )}
                                                        {ticket._count.attachments > 0 && (
                                                            <span className="inline-flex items-center gap-0.5">
                                                                <Paperclip className="h-3 w-3" />{ticket._count.attachments}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2.5"><TicketStatusBadge status={ticket.status} /></td>
                                                <td className="px-3 py-2.5"><TicketPriorityBadge priority={ticket.priority} /></td>
                                                <td className="px-3 py-2.5"><TicketCategoryBadge category={ticket.category} /></td>
                                                <td className="whitespace-nowrap px-3 py-2.5">
                                                    <span className="text-slate-700">{ticket.requester.name}</span>
                                                    {ticket.requester.role && (
                                                        <span className={cn(
                                                            "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                                                            REQUESTER_ROLE_TONE[ticket.requester.role] ?? "bg-slate-100 text-slate-600",
                                                        )}>
                                                            {USER_ROLE_LABELS[ticket.requester.role]}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                                                    {ticket.assignee?.name ?? (
                                                        <span className="inline-flex items-center gap-1 text-sky-600">
                                                            <UserPlus className="h-3 w-3" />À assigner
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                                                    {ticket.client?.name ?? <span className="text-slate-300">—</span>}
                                                </td>
                                                <td className={cn("whitespace-nowrap px-3 py-2.5 text-xs", ageLabel(ticket.createdAt).tone)}>
                                                    {ageLabel(ticket.createdAt).label}
                                                </td>
                                                <td className={cn(
                                                    "whitespace-nowrap px-3 py-2.5 text-xs",
                                                    overdue ? "font-semibold text-red-600" : "text-slate-500",
                                                )}>
                                                    {ticket.dueDate
                                                        ? new Date(ticket.dueDate).toLocaleDateString("fr-FR")
                                                        : <span className="text-slate-300">—</span>}
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                                                    {/* The row itself opens the drawer; this is the explicit
                                                        affordance for it, and every action lives in there. */}
                                                    <Button
                                                        size="sm"
                                                        variant="secondary"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            setSelectedId(ticket.id);
                                                            setIsDrawerOpen(true);
                                                        }}
                                                    >
                                                        Ouvrir
                                                    </Button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            ) : (
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_320px]">
                {/* Left: ticket list */}
                <div className="flex flex-col min-h-0 bg-white border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="p-4 space-y-3 border-b border-slate-200">
                        <Input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Rechercher un ticket…"
                            icon={<Search className="w-4 h-4 text-slate-400" />}
                        />
                        {scopeControl}
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
                            <EmptyState variant="inline" icon={LifeBuoy} title={emptyCopy.title} description={emptyCopy.description} />
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
                                    {detail.validation === "PENDING" && (
                                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                                            À valider
                                        </span>
                                    )}
                                    {isManager && detail.validation === "PENDING" && (
                                        <Button size="sm" onClick={() => setIsValidationOpen(true)}>
                                            Valider la demande
                                        </Button>
                                    )}
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
            )}

            <TicketDrawer
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                ticket={detail}
                isLoading={isDetailLoading}
                currentUserId={currentUserId}
                isManager={isManager}
                onRefresh={refreshAll}
                onEdit={(t) => {
                    setEditing(t);
                    setIsFormOpen(true);
                }}
                onValidate={() => setIsValidationOpen(true)}
                onDeleted={() => {
                    setIsDrawerOpen(false);
                    setSelectedId(null);
                    void refreshAll();
                }}
            />

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

            {isManager && (
                <TicketValidationModal
                    isOpen={isValidationOpen}
                    onClose={() => setIsValidationOpen(false)}
                    onDecided={refreshAll}
                    ticket={detail}
                    developers={developers}
                />
            )}
        </div>
    );
}

export default TicketWorkspace;
