"use client";

// ============================================
// CLIENT PORTAL — "Emails envoyés" tab of /client/portal/emailing
// Emails the team sent for the client's missions, with opens/clicks,
// filters, pagination and a real CSV export (?format=csv, same filters).
// ============================================

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, MailOpen, MousePointerClick, Reply, RotateCcw, Search, Send } from "lucide-react";
import { Badge, Button, Callout, EmptyState, IconButton, Input, KpiCard, Select, Skeleton } from "@/components/ui";
import { FIELD_BASE } from "@/components/ui/recipes";
import { cn } from "@/lib/utils";

interface SentEmail {
    id: string;
    subject: string;
    toAddresses: string[];
    sentAt: string | null;
    openCount: number;
    clickCount: number;
    firstOpenedAt: string | null;
    lastOpenedAt: string | null;
    status: string;
    contact: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        email: string | null;
        company: { id: string; name: string } | null;
    } | null;
    mission: { id: string; name: string } | null;
    template: { id: string; name: string } | null;
    sentBy: { id: string; name: string | null } | null;
}

interface Stats {
    totalSent: number;
    totalOpened: number;
    totalClicked: number;
    totalReplied: number;
    totalBounced: number;
    openRate: number;
    clickRate: number;
    replyRate: number;
}

const STATUS: Record<string, { label: string; tone: "default" | "info" | "success" | "primary" | "accent" | "warning" | "danger" }> = {
    SENT: { label: "Envoyé", tone: "default" },
    DELIVERED: { label: "Délivré", tone: "info" },
    OPENED: { label: "Ouvert", tone: "success" },
    CLICKED: { label: "Cliqué", tone: "primary" },
    REPLIED: { label: "Répondu", tone: "accent" },
    BOUNCED: { label: "Rebond", tone: "warning" },
    FAILED: { label: "Échoué", tone: "danger" },
};

function formatDate(d: string | null) {
    if (!d) return "—";
    return new Date(d).toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function recipient(e: SentEmail): string {
    if (e.contact) {
        const name = [e.contact.firstName, e.contact.lastName].filter(Boolean).join(" ");
        return name || e.contact.email || e.toAddresses[0] || "—";
    }
    return e.toAddresses[0] || "—";
}

type SortKey = "sentAt" | "subject" | "status" | "openCount" | "clickCount";

export function ClientSentEmails() {
    const [emails, setEmails] = useState<SentEmail[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [missions, setMissions] = useState<{ id: string; name: string }[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const [searchInput, setSearchInput] = useState("");
    const [filters, setFilters] = useState({ search: "", missionId: "", status: "", hasOpened: "", dateFrom: "", dateTo: "" });
    const [sort, setSort] = useState<{ by: SortKey; order: "asc" | "desc" }>({ by: "sentAt", order: "desc" });
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(25);
    const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });

    // Debounced search
    useEffect(() => {
        const t = setTimeout(() => {
            setFilters((f) => (f.search === searchInput.trim() ? f : { ...f, search: searchInput.trim() }));
            setPage(1);
        }, 350);
        return () => clearTimeout(t);
    }, [searchInput]);

    useEffect(() => {
        fetch("/api/missions?limit=200")
            .then((r) => r.json())
            .then((j) => {
                if (j.success && Array.isArray(j.data)) setMissions(j.data.map((m: { id: string; name: string }) => ({ id: m.id, name: m.name })));
            })
            .catch(() => setMissions([]));
    }, []);

    const filterParams = useMemo(() => {
        const p = new URLSearchParams();
        for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
        p.set("sortBy", sort.by);
        p.set("sortOrder", sort.order);
        return p;
    }, [filters, sort]);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        const params = new URLSearchParams(filterParams);
        params.set("page", String(page));
        params.set("limit", String(limit));
        params.set("includeStats", "true");
        try {
            const res = await fetch(`/api/client/sent-emails?${params}`);
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.success) throw new Error(json.error || "Chargement impossible");
            setEmails(json.data.emails ?? []);
            setStats(json.data.stats ?? null);
            setPagination({ total: json.data.pagination?.total ?? 0, totalPages: json.data.pagination?.totalPages ?? 0 });
        } catch (err) {
            setError(err instanceof Error ? err.message : "Chargement impossible");
        } finally {
            setIsLoading(false);
        }
    }, [filterParams, page, limit]);

    useEffect(() => {
        load();
    }, [load]);

    const setFilter = (key: keyof typeof filters, value: string) => {
        setFilters((f) => ({ ...f, [key]: value }));
        setPage(1);
    };

    const hasFilters = Object.values(filters).some(Boolean);
    const reset = () => {
        setSearchInput("");
        setFilters({ search: "", missionId: "", status: "", hasOpened: "", dateFrom: "", dateTo: "" });
        setPage(1);
    };

    const toggleSort = (by: SortKey) => {
        setSort((s) => ({ by, order: s.by === by && s.order === "desc" ? "asc" : "desc" }));
        setPage(1);
    };

    const exportHref = `/api/client/sent-emails?${new URLSearchParams([...filterParams.entries(), ["format", "csv"]])}`;

    const SortHeader = ({ by, label, align = "left" }: { by: SortKey; label: string; align?: "left" | "center" }) => {
        const active = sort.by === by;
        const Icon = !active ? ArrowUpDown : sort.order === "asc" ? ArrowUp : ArrowDown;
        return (
            <th className={cn("px-4 py-2.5 font-semibold", align === "center" ? "text-center" : "text-left")} aria-sort={active ? (sort.order === "asc" ? "ascending" : "descending") : undefined}>
                <button type="button" onClick={() => toggleSort(by)} className={cn("inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink", active && "text-ink")}>
                    {label}
                    <Icon className="size-3" aria-hidden />
                </button>
            </th>
        );
    };

    const from = pagination.total === 0 ? 0 : (page - 1) * limit + 1;
    const to = Math.min(page * limit, pagination.total);

    return (
        <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard label="Emails envoyés" value={stats ? stats.totalSent.toLocaleString("fr-FR") : "—"} icon={Send} loading={!stats && isLoading} />
                <KpiCard label="Ouverts" value={stats ? `${stats.openRate} %` : "—"} icon={MailOpen} tone="info" hint={stats ? `${stats.totalOpened.toLocaleString("fr-FR")} emails` : undefined} loading={!stats && isLoading} />
                <KpiCard label="Cliqués" value={stats ? `${stats.clickRate} %` : "—"} icon={MousePointerClick} tone="accent" hint={stats ? `${stats.totalClicked.toLocaleString("fr-FR")} emails` : undefined} loading={!stats && isLoading} />
                <KpiCard label="Répondus" value={stats ? `${stats.replyRate} %` : "—"} icon={Reply} tone="success" hint={stats ? `${stats.totalReplied.toLocaleString("fr-FR")} réponses` : undefined} loading={!stats && isLoading} />
            </div>

            <section className="rounded-panel border border-line bg-surface">
                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2 border-b border-line-subtle px-4 py-3">
                    <div className="w-full sm:w-72">
                        <Input size="sm" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Objet, destinataire, société…" icon={<Search className="size-4" />} aria-label="Rechercher" />
                    </div>
                    {missions.length > 1 && (
                        <Select
                            className="w-52"
                            value={filters.missionId}
                            onChange={(v) => setFilter("missionId", v)}
                            options={[{ value: "", label: "Toutes les missions" }, ...missions.map((m) => ({ value: m.id, label: m.name }))]}
                        />
                    )}
                    <Select
                        className="w-40"
                        value={filters.status}
                        onChange={(v) => setFilter("status", v)}
                        options={[
                            { value: "", label: "Tous les statuts" },
                            { value: "SENT", label: "Envoyé" },
                            { value: "OPENED", label: "Ouvert (ou plus)" },
                            { value: "CLICKED", label: "Cliqué" },
                            { value: "REPLIED", label: "Répondu" },
                            { value: "BOUNCED", label: "Rebond" },
                        ]}
                    />
                    <Select
                        className="w-40"
                        value={filters.hasOpened}
                        onChange={(v) => setFilter("hasOpened", v)}
                        options={[
                            { value: "", label: "Ouverts ou non" },
                            { value: "true", label: "Ouverts" },
                            { value: "false", label: "Non ouverts" },
                        ]}
                    />
                    <div className="flex items-center gap-1.5">
                        <input type="date" aria-label="Envoyés depuis le" value={filters.dateFrom} max={filters.dateTo || undefined} onChange={(e) => setFilter("dateFrom", e.target.value)} className={cn(FIELD_BASE, "h-9 w-auto px-2.5 text-[13px]")} />
                        <span className="text-xs text-ink-3">au</span>
                        <input type="date" aria-label="Envoyés jusqu'au" value={filters.dateTo} min={filters.dateFrom || undefined} onChange={(e) => setFilter("dateTo", e.target.value)} className={cn(FIELD_BASE, "h-9 w-auto px-2.5 text-[13px]")} />
                    </div>
                    {hasFilters && (
                        <Button size="sm" variant="ghost" leftIcon={<RotateCcw className="size-3.5" />} onClick={reset}>
                            Réinitialiser
                        </Button>
                    )}
                    <a
                        href={exportHref}
                        download
                        aria-disabled={pagination.total === 0}
                        className={cn(
                            "ml-auto inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-line bg-surface px-3.5 text-[13px] font-semibold text-ink-2 shadow-2xs transition-colors hover:border-line-strong hover:bg-surface-2 hover:text-ink",
                            pagination.total === 0 && "pointer-events-none opacity-50",
                        )}
                        title={pagination.total > 5000 ? "Export limité aux 5 000 premiers emails" : undefined}
                    >
                        <Download className="size-4" aria-hidden />
                        Exporter (CSV)
                    </a>
                </div>

                {error ? (
                    <div className="p-4">
                        <Callout tone="danger" title="Les emails n'ont pas pu être chargés" action={<Button size="sm" variant="secondary" onClick={load}>Réessayer</Button>}>
                            {error}
                        </Callout>
                    </div>
                ) : isLoading && emails.length === 0 ? (
                    <div className="space-y-2 p-4">
                        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11 rounded-control" />)}
                    </div>
                ) : emails.length === 0 ? (
                    <EmptyState
                        variant="inline"
                        icon={Send}
                        title={hasFilters ? "Aucun email ne correspond" : "Aucun email envoyé pour l'instant"}
                        description={hasFilters ? "Modifiez ou réinitialisez les filtres." : "Les emails envoyés par l'équipe pour vos missions apparaîtront ici, avec leurs ouvertures et leurs clics."}
                        action={hasFilters ? <Button size="sm" variant="secondary" onClick={reset}>Réinitialiser les filtres</Button> : undefined}
                    />
                ) : (
                    <>
                        <div className={cn("overflow-x-auto transition-opacity", isLoading && "opacity-60")}>
                            <table className="w-full min-w-[760px] text-sm">
                                <thead className="bg-surface-2 text-[11px] text-ink-3">
                                    <tr>
                                        <SortHeader by="subject" label="Destinataire / objet" />
                                        <th className="px-4 py-2.5 text-left font-semibold uppercase tracking-wide">Mission</th>
                                        <SortHeader by="status" label="Statut" />
                                        <SortHeader by="sentAt" label="Envoyé le" />
                                        <SortHeader by="openCount" label="Ouv." align="center" />
                                        <SortHeader by="clickCount" label="Clics" align="center" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {emails.map((e) => {
                                        const st = STATUS[e.status] ?? { label: e.status, tone: "default" as const };
                                        const open = expandedId === e.id;
                                        return (
                                            <Fragment key={e.id}>
                                                <tr
                                                    onClick={() => setExpandedId(open ? null : e.id)}
                                                    aria-expanded={open}
                                                    className={cn("cursor-pointer border-t border-line-subtle hover:bg-surface-2", open && "bg-surface-2")}
                                                >
                                                    <td className="max-w-[300px] px-4 py-2.5">
                                                        <p className="truncate font-semibold text-ink">{recipient(e)}</p>
                                                        <p className="truncate text-xs text-ink-3">
                                                            {e.contact?.company?.name && <span className="text-ink-2">{e.contact.company.name} · </span>}
                                                            {e.subject || "Sans objet"}
                                                        </p>
                                                    </td>
                                                    <td className="max-w-[180px] truncate px-4 py-2.5 text-xs text-ink-2">{e.mission?.name ?? "—"}</td>
                                                    <td className="px-4 py-2.5"><Badge size="sm" variant={st.tone}>{st.label}</Badge></td>
                                                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-ink-2">{formatDate(e.sentAt)}</td>
                                                    <td className={cn("px-4 py-2.5 text-center tabular-nums", e.openCount > 0 ? "font-semibold text-success-ink" : "text-ink-4")}>{e.openCount || "—"}</td>
                                                    <td className={cn("px-4 py-2.5 text-center tabular-nums", e.clickCount > 0 ? "font-semibold text-primary-700" : "text-ink-4")}>{e.clickCount || "—"}</td>
                                                </tr>
                                                {open && (
                                                    <tr className="bg-surface-2">
                                                        <td colSpan={6} className="px-4 pb-4 pt-1">
                                                            <dl className="grid gap-x-6 gap-y-2 rounded-panel border border-line bg-surface p-4 text-xs sm:grid-cols-2">
                                                                <div><dt className="text-ink-3">Objet</dt><dd className="text-ink">{e.subject || "Sans objet"}</dd></div>
                                                                <div><dt className="text-ink-3">Adresse</dt><dd className="text-ink">{e.toAddresses.join(", ") || e.contact?.email || "—"}</dd></div>
                                                                {e.sentBy?.name && <div><dt className="text-ink-3">Envoyé par</dt><dd className="text-ink">{e.sentBy.name}</dd></div>}
                                                                {e.template && <div><dt className="text-ink-3">Modèle</dt><dd className="text-ink">{e.template.name}</dd></div>}
                                                                <div><dt className="text-ink-3">Première ouverture</dt><dd className="text-ink">{formatDate(e.firstOpenedAt)}</dd></div>
                                                                {e.openCount > 1 && <div><dt className="text-ink-3">Dernière ouverture</dt><dd className="text-ink">{formatDate(e.lastOpenedAt)}</dd></div>}
                                                            </dl>
                                                        </td>
                                                    </tr>
                                                )}
                                            </Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle px-4 py-3">
                            <div className="flex items-center gap-3 text-xs text-ink-3">
                                <span className="tabular-nums">{from}–{to} sur {pagination.total.toLocaleString("fr-FR")}</span>
                                <Select
                                    className="w-32"
                                    value={String(limit)}
                                    onChange={(v) => { setLimit(Number(v)); setPage(1); }}
                                    options={[10, 25, 50, 100].map((n) => ({ value: String(n), label: `${n} par page` }))}
                                />
                            </div>
                            <div className="flex items-center gap-1">
                                <IconButton icon={ChevronLeft} label="Page précédente" size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} />
                                <span className="px-2 text-xs tabular-nums text-ink-2">Page {page} / {Math.max(1, pagination.totalPages)}</span>
                                <IconButton icon={ChevronRight} label="Page suivante" size="sm" variant="outline" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)} />
                            </div>
                        </div>
                    </>
                )}
            </section>
        </div>
    );
}

export default ClientSentEmails;
