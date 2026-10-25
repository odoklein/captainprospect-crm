"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
    ArrowDown,
    ArrowUp,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Download,
    ExternalLink,
    FileText,
    Inbox,
    MessageSquare,
    Paperclip,
    PhoneCall,
    RotateCcw,
    RotateCw,
    Search,
    Send,
    Target,
    User,
    Workflow,
    X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, Button, Callout, Chip, EmptyState, IconButton, Input, SegmentedControl, Select, Skeleton, useToast } from "@/components/ui";
import { FOCUS_RING } from "@/components/ui/recipes";
import { contactHref, formatDateTime, formatInt, formatWhen, inboxThreadHref } from "@/components/email/dashboard/format";

// ============================================
// SENT EMAILS — one table for both scopes:
//   manager → /api/manager/emails/sent (whole team, SDR filter, links into the hub)
//   sdr     → /api/sdr/emails/sent (my emails only)
// Filters live in the URL (?status=&mission=&sdr=&mailbox=&template=&sequence=&q=&from=&to=&page=)
// so a link from Analytics or the Vue d'ensemble lands on the right slice.
// Sent emails are history: no delete. Only FAILED emails can be resent.
// ============================================

type Scope = "manager" | "sdr";
type StatusKey = "ALL" | "SENT" | "OPENED" | "REPLIED" | "BOUNCED" | "FAILED" | "PENDING";

interface Option {
    id: string;
    label: string;
    hint?: string | null;
}

interface SentRow {
    id: string;
    subject: string;
    snippet: string | null;
    status: string;
    sentAt: string | null;
    createdAt: string;
    openCount: number;
    clickCount: number;
    firstOpenedAt: string | null;
    lastOpenedAt: string | null;
    toAddresses: string[];
    threadId: string;
    errorMessage: string | null;
    bounceType: string | null;
    tracked: boolean;
    replies: number;
    contact: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        email: string | null;
        company: { id: string; name: string; listId: string } | null;
    } | null;
    mission: { id: string; name: string; client: { id: string; name: string } | null } | null;
    sentBy: { id: string; name: string } | null;
    template: { id: string; name: string } | null;
    mailbox: { id: string; email: string };
    sequenceStep: { order: number; sequence: { id: string; name: string } } | null;
}

interface SentDetail extends SentRow {
    body: { html: string | null; text: string | null };
    ccAddresses: string[];
    from: { address: string; name: string | null };
    attachments: { id: string; filename: string; mimeType: string; size: number }[];
}

interface ListResponse {
    data: SentRow[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
    counts: Record<StatusKey, number>;
    options?: { missions: Option[]; senders: Option[]; mailboxes: Option[]; templates: Option[]; sequences: Option[] };
}

const STATUS_TABS: { value: StatusKey; label: string }[] = [
    { value: "ALL", label: "Tous" },
    { value: "SENT", label: "Envoyés" },
    { value: "OPENED", label: "Ouverts" },
    { value: "REPLIED", label: "Répondus" },
    { value: "BOUNCED", label: "Rebonds" },
    { value: "FAILED", label: "Échecs" },
    { value: "PENDING", label: "En attente" },
];

const FILTER_KEYS = ["status", "mission", "sdr", "mailbox", "template", "sequence", "q", "from", "to"] as const;

// ── Helpers ──────────────────────────────────────────────────────────

const TZ = "Europe/Paris";
const parisToday = () => new Date().toLocaleDateString("fr-CA", { timeZone: TZ });
function shiftDay(day: string, delta: number) {
    const [y, m, d] = day.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + delta, 12));
    return dt.toISOString().slice(0, 10);
}

type PeriodKey = "all" | "7" | "30" | "90" | "custom";
function periodOf(from: string | null, to: string | null): PeriodKey {
    if (!from && !to) return "all";
    const today = parisToday();
    if (to === today) {
        for (const n of [7, 30, 90] as const) if (from === shiftDay(today, -(n - 1))) return String(n) as PeriodKey;
    }
    return "custom";
}

const personName = (c: SentRow["contact"]) => (c ? [c.firstName, c.lastName].filter(Boolean).join(" ").trim() : "");

function statusBadge(e: SentRow): { label: string; variant: "default" | "primary" | "success" | "warning" | "danger" | "info" } {
    if (e.status === "FAILED") return { label: "Échec", variant: "danger" };
    if (e.status === "BOUNCED") return { label: "Rebond", variant: "warning" };
    if (e.status === "QUEUED" || e.status === "SENDING") return { label: "En attente", variant: "default" };
    if (e.status === "REPLIED" || e.replies > 0) return { label: "Répondu", variant: "success" };
    if (e.status === "OPENED" || e.status === "CLICKED" || e.openCount > 0) return { label: e.clickCount > 0 ? "Cliqué" : "Ouvert", variant: "info" };
    return { label: "Envoyé", variant: "primary" };
}

/** Inert parse (DOMParser loads no image, runs no script) → plain text with line breaks. */
function htmlToText(html: string): string {
    const marked = html
        .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, "\n");
    const doc = new DOMParser().parseFromString(marked, "text/html");
    return (doc.body.textContent ?? "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

const formatSize = (b: number) => (b < 1024 ? `${b} o` : b < 1024 * 1024 ? `${Math.round(b / 1024)} Ko` : `${(b / 1024 / 1024).toFixed(1)} Mo`);

// ── View ─────────────────────────────────────────────────────────────

export interface SentEmailsViewProps {
    scope: Scope;
    title: string;
    description: string;
    /** Extra buttons in the title row (before Exporter). */
    actions?: ReactNode;
    emptyHint: { title: string; description: string; action?: ReactNode };
    /** Rendered around the content (EmailHubPage). */
    frame: (props: { actions: ReactNode; children: ReactNode }) => ReactNode;
}

export function SentEmailsView(props: SentEmailsViewProps) {
    return (
        <Suspense fallback={props.frame({ actions: null, children: <TableSkeletonBlock /> })}>
            <SentEmailsInner {...props} />
        </Suspense>
    );
}

function SentEmailsInner({ scope, actions, emptyHint, frame }: SentEmailsViewProps) {
    const router = useRouter();
    const pathname = usePathname();
    const sp = useSearchParams();
    const toast = useToast();
    const api = scope === "manager" ? "/api/manager/emails/sent" : "/api/sdr/emails/sent";

    const f = useMemo(() => {
        const get = (k: string) => sp.get(k) || null;
        const status = (get("status")?.toUpperCase() ?? "ALL") as StatusKey;
        return {
            status: STATUS_TABS.some((t) => t.value === status) ? status : ("ALL" as StatusKey),
            mission: get("mission"),
            sdr: scope === "manager" ? get("sdr") : null,
            mailbox: get("mailbox"),
            template: get("template"),
            sequence: get("sequence"),
            q: get("q"),
            from: get("from"),
            to: get("to"),
            page: Math.max(1, Number(get("page")) || 1),
            sort: (get("sort") === "subject" || get("sort") === "status" ? get("sort") : "sentAt") as "sentAt" | "subject" | "status",
            order: (get("order") === "asc" ? "asc" : "desc") as "asc" | "desc",
        };
    }, [sp, scope]);

    const setParams = useCallback(
        (patch: Record<string, string | null>, opts: { keepPage?: boolean } = {}) => {
            const next = new URLSearchParams(sp.toString());
            for (const [k, v] of Object.entries(patch)) {
                if (v === null || v === "" || (k === "status" && v === "ALL")) next.delete(k);
                else next.set(k, v);
            }
            if (!opts.keepPage && !("page" in patch)) next.delete("page");
            const qs = next.toString();
            router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        },
        [sp, router, pathname],
    );

    // Search box: local text, pushed to the URL after a pause.
    const [query, setQuery] = useState(f.q ?? "");
    // URL changed from outside (back button, Réinitialiser): adopt it (state adjusted during render).
    const [syncedQ, setSyncedQ] = useState(f.q);
    if (syncedQ !== f.q) {
        setSyncedQ(f.q);
        setQuery(f.q ?? "");
    }
    useEffect(() => {
        if ((f.q ?? "") === query.trim()) return;
        const t = setTimeout(() => setParams({ q: query.trim() || null }), 350);
        return () => clearTimeout(t);
    }, [query, f.q, setParams]);

    // Data
    const [res, setRes] = useState<ListResponse | null>(null);
    const [options, setOptions] = useState<ListResponse["options"] | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    // Each settled request records the key it answered; loading = latest key not settled yet.
    const [settled, setSettled] = useState<{ key: string; error: string | null } | null>(null);
    const optionsLoaded = useRef(false);

    const queryString = useMemo(() => {
        const p = new URLSearchParams();
        if (f.status !== "ALL") p.set("status", f.status);
        for (const k of ["mission", "sdr", "mailbox", "template", "sequence", "q", "from", "to"] as const) {
            const v = f[k];
            if (v) p.set(k, v);
        }
        p.set("sort", f.sort);
        p.set("order", f.order);
        return p.toString();
    }, [f]);

    const requestKey = `${queryString}|${f.page}|${reloadKey}`;
    useEffect(() => {
        let cancelled = false;
        const p = new URLSearchParams(queryString);
        p.set("page", String(f.page));
        p.set("limit", "25");
        if (!optionsLoaded.current) p.set("options", "1");
        fetch(`${api}?${p}`, { cache: "no-store" })
            .then(async (r) => {
                const json = await r.json().catch(() => null);
                if (!r.ok || !json?.success) throw new Error(json?.error || `Erreur ${r.status}`);
                return json as ListResponse;
            })
            .then((json) => {
                if (cancelled) return;
                setRes(json);
                if (json.options) {
                    setOptions(json.options);
                    optionsLoaded.current = true;
                }
                setSettled({ key: requestKey, error: null });
            })
            .catch((e: unknown) => {
                if (!cancelled) setSettled({ key: requestKey, error: e instanceof Error ? e.message : "Erreur de connexion" });
            });
        return () => {
            cancelled = true;
        };
    }, [api, queryString, f.page, requestKey]);
    const loading = settled?.key !== requestKey;
    const error = settled?.key === requestKey ? settled.error : null;

    // Expanded row, forgotten when the list changes.
    const listKey = `${queryString}|${f.page}`;
    const [expandedState, setExpandedState] = useState<{ key: string; id: string } | null>(null);
    const expanded = expandedState?.key === listKey ? expandedState.id : null;
    const setExpanded = (fn: (x: string | null) => string | null) => {
        const id = fn(expanded);
        setExpandedState(id ? { key: listKey, id } : null);
    };

    const period = periodOf(f.from, f.to);
    const setPeriod = (p: PeriodKey) => {
        const today = parisToday();
        if (p === "all") setParams({ from: null, to: null });
        else if (p === "custom") setParams({ from: f.from ?? shiftDay(today, -29), to: f.to ?? today });
        else setParams({ from: shiftDay(today, -(Number(p) - 1)), to: today });
    };

    const activeFilters = FILTER_KEYS.some((k) => (k === "status" ? f.status !== "ALL" : !!f[k]));
    const clearAll = () => {
        setQuery("");
        router.replace(pathname, { scroll: false });
    };

    const sortBy = (col: "sentAt" | "subject" | "status") =>
        setParams({ sort: col === "sentAt" ? null : col, order: f.sort === col && f.order === "desc" ? "asc" : null });

    const exportHref = `${api}?${queryString}&format=csv`;
    const total = res?.pagination.total ?? 0;

    const label = (list: Option[] | undefined, id: string | null) => list?.find((o) => o.id === id)?.label ?? "…";

    const headerActions = (
        <>
            {actions}
            <a
                href={exportHref}
                download
                onClick={() => toast.info("Export en cours", total > 10_000 ? "Seules les 10 000 lignes les plus récentes seront exportées." : `${formatInt(total)} email${total > 1 ? "s" : ""}, format CSV (Excel).`)}
                className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-line bg-surface px-3.5 text-[13px] font-semibold text-ink-2 shadow-2xs hover:border-line-strong hover:bg-surface-2 hover:text-ink",
                    FOCUS_RING,
                    total === 0 && "pointer-events-none opacity-50",
                )}
                aria-disabled={total === 0}
            >
                <Download className="size-4" aria-hidden /> Exporter CSV
            </a>
        </>
    );

    return frame({
        actions: headerActions,
        children: (
            <div className="space-y-4">
                {/* Status */}
                <div className="overflow-x-auto [scrollbar-width:none]">
                    <SegmentedControl
                        ariaLabel="Filtrer par statut"
                        value={f.status}
                        onChange={(v) => setParams({ status: v })}
                        options={STATUS_TABS.filter((t) => t.value !== "PENDING" || (res?.counts.PENDING ?? 0) > 0 || f.status === "PENDING").map((t) => ({
                            value: t.value,
                            label: t.label,
                            count: res ? res.counts[t.value] : undefined,
                            alert: t.value === "FAILED" && (res?.counts.FAILED ?? 0) > 0,
                        }))}
                    />
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2">
                    <div className="w-full sm:w-72">
                        <Input
                            size="sm"
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={scope === "manager" ? "Objet, contact, société, SDR…" : "Objet, contact, société…"}
                            icon={<Search className="size-4" />}
                            aria-label="Rechercher"
                        />
                    </div>
                    <SegmentedControl
                        ariaLabel="Période"
                        size="sm"
                        value={period}
                        onChange={setPeriod}
                        options={[
                            { value: "all", label: "Tout" },
                            { value: "7", label: "7 j" },
                            { value: "30", label: "30 j" },
                            { value: "90", label: "90 j" },
                            { value: "custom", label: "Dates" },
                        ]}
                    />
                    {period === "custom" && (
                        <div className="flex items-center gap-1.5">
                            <Input size="sm" type="date" aria-label="Du" value={f.from ?? ""} max={f.to ?? undefined} onChange={(e) => setParams({ from: e.target.value || null })} className="w-[150px]" />
                            <span className="text-xs text-ink-4">au</span>
                            <Input size="sm" type="date" aria-label="Au" value={f.to ?? ""} min={f.from ?? undefined} onChange={(e) => setParams({ to: e.target.value || null })} className="w-[150px]" />
                        </div>
                    )}
                    <div className="w-full sm:w-56">
                        <Select
                            searchable
                            placeholder="Toutes les missions"
                            value={f.mission ?? ""}
                            onChange={(v) => setParams({ mission: v || null })}
                            options={[{ value: "", label: "Toutes les missions" }, ...(options?.missions ?? []).map((m) => ({ value: m.id, label: m.hint ? `${m.label} · ${m.hint}` : m.label }))]}
                        />
                    </div>
                    {scope === "manager" && (
                        <div className="w-full sm:w-48">
                            <Select
                                searchable
                                placeholder="Tous les expéditeurs"
                                value={f.sdr ?? ""}
                                onChange={(v) => setParams({ sdr: v || null })}
                                options={[{ value: "", label: "Tous les expéditeurs" }, ...(options?.senders ?? []).map((u) => ({ value: u.id, label: u.label }))]}
                            />
                        </div>
                    )}
                    {f.mailbox && <Chip onRemove={() => setParams({ mailbox: null })}>Boîte : {label(options?.mailboxes, f.mailbox)}</Chip>}
                    {f.template && <Chip onRemove={() => setParams({ template: null })}>Template : {label(options?.templates, f.template)}</Chip>}
                    {f.sequence && <Chip onRemove={() => setParams({ sequence: null })}>Séquence : {label(options?.sequences, f.sequence)}</Chip>}
                    {activeFilters && (
                        <Button variant="ghost" size="sm" leftIcon={<X className="size-3.5" />} onClick={clearAll}>
                            Réinitialiser
                        </Button>
                    )}
                </div>

                {/* Table */}
                {error && !res ? (
                    <Callout
                        tone="danger"
                        title="Impossible de charger les emails"
                        action={<Button size="xs" variant="secondary" leftIcon={<RotateCw className="size-3.5" />} onClick={() => setReloadKey((k) => k + 1)}>Réessayer</Button>}
                    >
                        {error}
                    </Callout>
                ) : !res ? (
                    <TableSkeletonBlock />
                ) : res.data.length === 0 && !loading ? (
                    activeFilters ? (
                        <EmptyState
                            icon={Search}
                            title="Aucun email ne correspond à ces filtres"
                            description="Élargissez la période ou retirez un filtre."
                            action={<Button variant="secondary" size="sm" onClick={clearAll}>Réinitialiser les filtres</Button>}
                        />
                    ) : (
                        <EmptyState icon={Send} title={emptyHint.title} description={emptyHint.description} action={emptyHint.action} />
                    )
                ) : (
                    <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
                        {error && (
                            <Callout tone="warning" className="m-3" title="Liste peut-être obsolète" action={<Button size="xs" variant="secondary" onClick={() => setReloadKey((k) => k + 1)}>Réessayer</Button>}>
                                {error}
                            </Callout>
                        )}
                        <div className={cn("max-h-[calc(100vh-320px)] min-h-[240px] overflow-auto", loading && "opacity-60")} aria-busy={loading || undefined}>
                            <table className="w-full min-w-[860px] border-separate border-spacing-0 text-left text-[13px]">
                                <thead className="sticky top-0 z-10 bg-surface-2">
                                    <tr className="text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3">
                                        <SortTh label="Date" col="sentAt" f={f} onSort={sortBy} className="w-[120px] pl-4" />
                                        <th scope="col" className="border-b border-line px-3 py-2.5">Destinataire</th>
                                        <SortTh label="Objet" col="subject" f={f} onSort={sortBy} />
                                        <th scope="col" className="border-b border-line px-3 py-2.5">Mission</th>
                                        {scope === "manager" && <th scope="col" className="border-b border-line px-3 py-2.5">Envoyé par</th>}
                                        <SortTh label="Statut" col="status" f={f} onSort={sortBy} className="w-[110px]" />
                                        <th scope="col" className="w-[110px] border-b border-line px-3 py-2.5 text-right">Suivi</th>
                                        <th scope="col" className="w-10 border-b border-line pr-3"><span className="sr-only">Détails</span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {res.data.map((e) => (
                                        <Fragment key={e.id}>
                                            <SentTableRow
                                                e={e}
                                                scope={scope}
                                                open={expanded === e.id}
                                                onToggle={() => setExpanded((x) => (x === e.id ? null : e.id))}
                                            />
                                            {expanded === e.id && (
                                                <tr>
                                                    <td colSpan={scope === "manager" ? 8 : 7} className="border-b border-line bg-surface-2 p-0">
                                                        <SentDetailPanel id={e.id} api={api} scope={scope} onResent={() => setReloadKey((k) => k + 1)} />
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <Pager
                            page={res.pagination.page}
                            totalPages={res.pagination.totalPages}
                            total={res.pagination.total}
                            limit={res.pagination.limit}
                            onPage={(p) => setParams({ page: p > 1 ? String(p) : null }, { keepPage: true })}
                        />
                    </div>
                )}
            </div>
        ),
    });
}

// ── Pieces ───────────────────────────────────────────────────────────

function TableSkeletonBlock() {
    return (
        <div className="space-y-2 rounded-card border border-line bg-surface p-4 shadow-card" aria-busy aria-label="Chargement des emails">
            {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
            ))}
        </div>
    );
}

function SortTh({
    label,
    col,
    f,
    onSort,
    className,
}: {
    label: string;
    col: "sentAt" | "subject" | "status";
    f: { sort: string; order: "asc" | "desc" };
    onSort: (c: "sentAt" | "subject" | "status") => void;
    className?: string;
}) {
    const active = f.sort === col;
    return (
        <th scope="col" aria-sort={active ? (f.order === "asc" ? "ascending" : "descending") : "none"} className={cn("border-b border-line px-3 py-2.5", className)}>
            <button type="button" onClick={() => onSort(col)} className={cn("inline-flex items-center gap-1 rounded uppercase", FOCUS_RING, active ? "text-ink" : "hover:text-ink")}>
                {label}
                {active && (f.order === "asc" ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />)}
            </button>
        </th>
    );
}

function SentTableRow({ e, scope, open, onToggle }: { e: SentRow; scope: Scope; open: boolean; onToggle: () => void }) {
    const b = statusBadge(e);
    const name = personName(e.contact);
    const to = e.contact?.email || e.toAddresses[0] || "—";
    const onKeyDown = (ev: KeyboardEvent<HTMLTableRowElement>) => {
        if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            onToggle();
        } else if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
            ev.preventDefault();
            const rows = Array.from(ev.currentTarget.closest("tbody")?.querySelectorAll<HTMLTableRowElement>("tr[data-row]") ?? []);
            const i = rows.indexOf(ev.currentTarget);
            rows[ev.key === "ArrowDown" ? Math.min(rows.length - 1, i + 1) : Math.max(0, i - 1)]?.focus();
        }
    };
    const cell = "border-b border-line-subtle px-3 py-2.5 align-top";
    return (
        <tr
            data-row
            tabIndex={0}
            aria-expanded={open}
            onClick={onToggle}
            onKeyDown={onKeyDown}
            className={cn("cursor-pointer outline-none hover:bg-surface-2 focus-visible:bg-primary-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus", open && "bg-surface-2")}
        >
            <td className={cn(cell, "pl-4 whitespace-nowrap tabular-nums text-ink-2")}>
                <time dateTime={e.sentAt ?? e.createdAt} title={formatDateTime(e.sentAt ?? e.createdAt)}>{formatWhen(e.sentAt ?? e.createdAt)}</time>
            </td>
            <td className={cn(cell, "max-w-[220px]")}>
                <p className="truncate font-semibold text-ink">{name || to}</p>
                <p className="truncate text-xs text-ink-3">{[e.contact?.company?.name, name ? to : null].filter(Boolean).join(" · ") || " "}</p>
            </td>
            <td className={cn(cell, "max-w-[320px]")}>
                <p className="truncate text-ink">{e.subject || "(sans objet)"}</p>
                {(e.sequenceStep || e.template) && (
                    <p className="truncate text-xs text-ink-3">
                        {e.sequenceStep ? `${e.sequenceStep.sequence.name} · étape ${e.sequenceStep.order + 1}` : `Template ${e.template?.name}`}
                    </p>
                )}
            </td>
            <td className={cn(cell, "max-w-[180px]")}>
                <p className="truncate text-ink-2">{e.mission?.name ?? "—"}</p>
                {e.mission?.client && <p className="truncate text-xs text-ink-3">{e.mission.client.name}</p>}
            </td>
            {scope === "manager" && <td className={cn(cell, "max-w-[150px] truncate text-ink-2")}>{e.sentBy?.name ?? "Automatique"}</td>}
            <td className={cell}>
                <Badge size="sm" variant={b.variant} dot>{b.label}</Badge>
            </td>
            <td className={cn(cell, "whitespace-nowrap text-right tabular-nums text-xs text-ink-3")}>
                {e.tracked ? (
                    <span title="Ouvertures · clics">
                        <span className={cn(e.openCount > 0 && "font-semibold text-ink")}>{e.openCount}</span> ouv. · {e.clickCount} clic{e.clickCount > 1 ? "s" : ""}
                    </span>
                ) : (
                    <span title="Pas de pixel de suivi sur cet email">non suivi</span>
                )}
                {e.replies > 0 && <p className="font-semibold text-success">{e.replies} réponse{e.replies > 1 ? "s" : ""}</p>}
            </td>
            <td className={cn(cell, "pr-3 text-ink-4")}>
                <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
            </td>
        </tr>
    );
}

function Pager({ page, totalPages, total, limit, onPage }: { page: number; totalPages: number; total: number; limit: number; onPage: (p: number) => void }) {
    const start = total === 0 ? 0 : (page - 1) * limit + 1;
    const end = Math.min(total, page * limit);
    return (
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-xs text-ink-3">
            <span className="tabular-nums">
                {formatInt(start)}–{formatInt(end)} sur {formatInt(total)} email{total > 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-1">
                <IconButton icon={ChevronLeft} label="Page précédente" size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)} />
                <span className="px-1 tabular-nums">
                    {page} / {totalPages}
                </span>
                <IconButton icon={ChevronRight} label="Page suivante" size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => onPage(page + 1)} />
            </div>
        </div>
    );
}

function SentDetailPanel({ id, api, scope, onResent }: { id: string; api: string; scope: Scope; onResent: () => void }) {
    const toast = useToast();
    const [d, setD] = useState<SentDetail | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);
    const [resending, setResending] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetch(`${api}/${id}`, { cache: "no-store" })
            .then(async (r) => {
                const json = await r.json().catch(() => null);
                if (!r.ok || !json?.success) throw new Error(json?.error || `Erreur ${r.status}`);
                return json.data as SentDetail;
            })
            .then((x) => !cancelled && setD(x))
            .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Erreur de connexion"));
        return () => {
            cancelled = true;
        };
    }, [api, id, attempt]);

    const text = useMemo(() => {
        if (!d) return "";
        if (d.body.text?.trim()) return d.body.text.trim();
        if (d.body.html) return htmlToText(d.body.html);
        return d.snippet ?? "";
    }, [d]);

    const resend = async () => {
        setResending(true);
        try {
            const r = await fetch(scope === "manager" ? api : `${api}/batch`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "resend", emailIds: [id] }),
            });
            const json = await r.json().catch(() => null);
            if (!r.ok || !json?.success) throw new Error(json?.error || `Erreur ${r.status}`);
            const result = json.data as { sent: number; results: { ok: boolean; error?: string }[] };
            if (result.sent > 0) {
                toast.success("Email renvoyé", "Un nouvel envoi a été créé ; l'échec reste dans l'historique.");
                onResent();
            } else {
                toast.error("Renvoi impossible", result.results[0]?.error || "L'email n'est plus en échec.");
            }
        } catch (e) {
            toast.error("Renvoi impossible", e instanceof Error ? e.message : undefined);
        } finally {
            setResending(false);
        }
    };

    if (error) {
        return (
            <div className="p-4">
                <Callout tone="danger" title="Impossible d'afficher cet email" action={<Button size="xs" variant="secondary" onClick={() => { setError(null); setAttempt((a) => a + 1); }}>Réessayer</Button>}>
                    {error}
                </Callout>
            </div>
        );
    }
    if (!d) {
        return (
            <div className="space-y-2 p-4" aria-busy>
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-24 w-full" />
            </div>
        );
    }

    const cHref = contactHref(d.contact ? { id: d.contact.id, companyId: d.contact.company?.id, listId: d.contact.company?.listId } : null, scope);
    const links: { href: string; icon: typeof Inbox; label: string }[] = [
        { href: inboxThreadHref(d.threadId, scope), icon: MessageSquare, label: d.replies > 0 ? `Ouvrir la conversation (${d.replies} réponse${d.replies > 1 ? "s" : ""})` : "Ouvrir la conversation" },
        ...(cHref && d.contact ? [{ href: cHref, icon: User, label: personName(d.contact) || "Fiche contact" }] : []),
        ...(scope === "manager" && d.mission ? [{ href: `/manager/missions/${d.mission.id}`, icon: Target, label: `Mission ${d.mission.name}` }] : []),
        ...(scope === "manager" && d.template ? [{ href: `/manager/emails/templates?template=${d.template.id}`, icon: FileText, label: `Template ${d.template.name}` }] : []),
        ...(scope === "manager" && d.sequenceStep ? [{ href: `/manager/emails/sequences/${d.sequenceStep.sequence.id}`, icon: Workflow, label: `Séquence ${d.sequenceStep.sequence.name}` }] : []),
    ];

    const meta: [string, ReactNode][] = [
        ["De", d.from.name ? `${d.from.name} <${d.from.address}>` : d.from.address],
        ["À", d.toAddresses.join(", ") || "—"],
        ...(d.ccAddresses.length ? ([["Cc", d.ccAddresses.join(", ")]] as [string, ReactNode][]) : []),
        ["Envoyé le", formatDateTime(d.sentAt ?? d.createdAt)],
        ["Suivi", d.tracked ? (d.firstOpenedAt ? `Ouvert ${d.openCount} fois, la première ${formatDateTime(d.firstOpenedAt)}` : "Pas encore ouvert") : "Désactivé pour cet email"],
    ];

    return (
        <div className="grid gap-4 p-4 lg:grid-cols-[1fr_280px]">
            <div className="min-w-0 space-y-3">
                {(d.status === "FAILED" || d.status === "BOUNCED") && (
                    <Callout
                        tone={d.status === "FAILED" ? "danger" : "warning"}
                        title={d.status === "FAILED" ? "L'envoi a échoué" : `Rebond${d.bounceType ? (d.bounceType === "hard" ? " définitif" : " temporaire") : ""}`}
                        action={
                            d.status === "FAILED" ? (
                                <Button size="xs" variant="secondary" leftIcon={<RotateCcw className="size-3.5" />} isLoading={resending} onClick={resend}>
                                    Renvoyer
                                </Button>
                            ) : undefined
                        }
                    >
                        {d.errorMessage || (d.status === "BOUNCED" ? "L'adresse a refusé le message : vérifiez-la avant de réessayer." : "Aucun détail fourni par le serveur d'envoi.")}
                    </Callout>
                )}
                <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[88px_1fr]">
                    {meta.map(([k, v]) => (
                        <Fragment key={k}>
                            <dt className="font-semibold text-ink-3">{k}</dt>
                            <dd className="min-w-0 break-words text-ink-2">{v}</dd>
                        </Fragment>
                    ))}
                </dl>
                <div className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-panel border border-line bg-surface p-4 text-[13px] leading-relaxed text-ink">
                    {text || <span className="text-ink-4">Corps du message vide.</span>}
                </div>
                {d.attachments.length > 0 && (
                    <ul className="flex flex-wrap gap-2">
                        {d.attachments.map((a) => (
                            <li key={a.id} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs text-ink-2">
                                <Paperclip className="size-3.5 text-ink-4" aria-hidden />
                                {a.filename} <span className="text-ink-4">{formatSize(a.size)}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <nav aria-label="Liens" className="space-y-1">
                <p className="mb-1 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3">Aller à</p>
                {links.map((l) => (
                    <Link key={l.href} href={l.href} className={cn("flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium text-ink-2 hover:bg-surface hover:text-ink", FOCUS_RING)}>
                        <l.icon className="size-4 shrink-0 text-ink-4" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{l.label}</span>
                        <ExternalLink className="size-3.5 shrink-0 text-ink-4" aria-hidden />
                    </Link>
                ))}
                {scope === "sdr" && (
                    <Link href="/sdr/action" className={cn("flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium text-ink-2 hover:bg-surface hover:text-ink", FOCUS_RING)}>
                        <PhoneCall className="size-4 shrink-0 text-ink-4" aria-hidden />
                        <span className="flex-1">Écran d&apos;appel</span>
                    </Link>
                )}
            </nav>
        </div>
    );
}

export default SentEmailsView;
