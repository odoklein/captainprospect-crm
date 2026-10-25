"use client";

// Shared building blocks of the ReachInbox workspace (manager hub, client
// portal, client page embed). Read-only stats: nothing here edits a campaign.

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, KeyRound, Search, ShieldCheck } from "lucide-react";
import { Badge, Button, Input, Select, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { FIELD_BASE } from "@/components/ui/recipes";
import type { Campaign, CampaignStats, DailyPoint } from "./reachinbox-types";

// ---------- formatting ----------

export function num(value: number | null | undefined): string {
    return (value ?? 0).toLocaleString("fr-FR");
}

export function pct(value: number | null | undefined): string {
    return `${(Math.round((value ?? 0) * 10) / 10).toLocaleString("fr-FR")} %`;
}

export function rate(part: number, total: number): number {
    if (!total) return 0;
    return Math.round((part / total) * 1000) / 10;
}

/** Prefer the rate ReachInbox reports; recompute over contacted leads only as fallback. */
export function statRate(explicit: number | undefined, part: number, stats: CampaignStats): number {
    if (typeof explicit === "number" && explicit > 0) return explicit;
    return rate(part, stats.leads || stats.sent);
}

export function isoDaysAgo(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toLocaleDateString("en-CA");
}

export function isoToday(): string {
    return new Date().toLocaleDateString("en-CA");
}

export function freshness(date: Date | null): string | null {
    if (!date) return null;
    return `Données du ${date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} à ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

const ACTIVE = new Set(["ACTIVE", "RUNNING"]);

export function isActiveCampaign(c: Campaign): boolean {
    return ACTIVE.has(c.status.toUpperCase());
}

const STATUS_LABEL: Record<string, { label: string; tone: "success" | "warning" | "default" | "info" }> = {
    ACTIVE: { label: "Active", tone: "success" },
    RUNNING: { label: "Active", tone: "success" },
    PAUSED: { label: "En pause", tone: "warning" },
    COMPLETED: { label: "Terminée", tone: "info" },
    DRAFT: { label: "Brouillon", tone: "default" },
    STOPPED: { label: "Arrêtée", tone: "default" },
};

export function CampaignStatus({ status }: { status: string }) {
    const cfg = STATUS_LABEL[status.toUpperCase()] ?? { label: status.toLowerCase(), tone: "default" as const };
    return (
        <Badge size="sm" variant={cfg.tone} dot>
            {cfg.label}
        </Badge>
    );
}

export function summarizeCampaigns(campaigns: Campaign[]) {
    const s = campaigns.reduce(
        (acc, c) => {
            acc.sent += c.stats.sent;
            acc.opened += c.stats.opened;
            acc.replied += c.stats.replied;
            acc.clicked += c.stats.clicked;
            acc.bounced += c.stats.bounced;
            acc.leads += c.stats.leads;
            return acc;
        },
        { sent: 0, opened: 0, replied: 0, clicked: 0, bounced: 0, leads: 0 },
    );
    const base = s.leads || s.sent;
    return { ...s, openRate: rate(s.opened, base), replyRate: rate(s.replied, base), clickRate: rate(s.clicked, base), bounceRate: rate(s.bounced, base) };
}

// ---------- small stat tile (secondary metrics) ----------

export function StatTile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "danger" }) {
    return (
        <div className="rounded-panel border border-line bg-surface px-4 py-3">
            <p className="text-[11px] font-medium text-ink-3">{label}</p>
            <p className={cn("mt-1 text-lg font-semibold tabular-nums text-ink", tone === "danger" && "text-danger-ink")}>{value}</p>
            {hint && <p className="mt-0.5 truncate text-[11px] text-ink-4">{hint}</p>}
        </div>
    );
}

export function Panel({ title, description, action, children, className }: { title: string; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
    return (
        <section className={cn("rounded-panel border border-line bg-surface", className)}>
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line-subtle px-4 py-3">
                <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-ink">{title}</h2>
                    {description && <p className="mt-0.5 text-xs text-ink-3">{description}</p>}
                </div>
                {action}
            </header>
            {children}
        </section>
    );
}

// ---------- daily volume bars ----------

export function TrendBars({ daily }: { daily: DailyPoint[] }) {
    const points = daily.slice(-31);
    const max = Math.max(1, ...points.map((p) => p.sent));
    if (points.length === 0 || points.every((p) => p.sent === 0)) {
        return <p className="px-4 py-12 text-center text-sm text-ink-3">Aucun envoi sur la période.</p>;
    }
    return (
        <div className="px-4 pb-3 pt-5">
            <div className="flex h-40 items-end gap-1">
                {points.map((p) => (
                    <div key={p.date} className="group relative flex h-full min-w-0 flex-1 items-end">
                        <div
                            className="w-full rounded-t-[4px] bg-primary-600 transition-colors group-hover:bg-primary-700"
                            style={{ height: `${Math.max(p.sent ? 4 : 1, (p.sent / max) * 100)}%` }}
                            title={`${new Date(p.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} : ${num(p.sent)} envoyés, ${num(p.opened)} ouverts, ${num(p.replied)} réponses`}
                        />
                    </div>
                ))}
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-ink-4">
                <span>{new Date(points[0].date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
                <span>{new Date(points[points.length - 1].date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
            </div>
        </div>
    );
}

// ---------- connect form (API key) ----------

export function ConnectForm({ onConnected, compact }: { onConnected: () => void; compact?: boolean }) {
    const toast = useToast();
    const [apiKey, setApiKey] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);
        try {
            const res = await fetch("/api/email/reachinbox/connect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ apiKey: apiKey.trim() }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.success) throw new Error(json.error || "Clé API refusée par ReachInbox");
            setApiKey("");
            toast.success("ReachInbox connecté", "Les statistiques sont disponibles.");
            onConnected();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Clé API refusée par ReachInbox");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={submit} className={cn("space-y-3", !compact && "rounded-panel border border-line bg-surface-2 p-4")}>
            <Input
                label="Clé API ReachInbox"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Collez la clé API"
                autoComplete="off"
                icon={<KeyRound className="size-4" />}
                error={error ?? undefined}
                hint="Dans ReachInbox : Settings › Integrations › API. La clé est stockée chiffrée."
            />
            <Button type="submit" fullWidth isLoading={isSubmitting} disabled={apiKey.trim().length < 12} leftIcon={<ShieldCheck className="size-4" />}>
                Vérifier et connecter
            </Button>
        </form>
    );
}

// ---------- campaign table ----------

type SortKey = "name" | "status" | "leads" | "sent" | "open" | "reply" | "click" | "bounce";

function metric(c: Campaign, key: SortKey): number | string {
    switch (key) {
        case "name": return c.name.toLowerCase();
        case "status": return isActiveCampaign(c) ? 0 : 1;
        case "leads": return c.stats.leads;
        case "sent": return c.stats.sent;
        case "open": return statRate(c.stats.openRate, c.stats.opened, c.stats);
        case "reply": return statRate(c.stats.replyRate, c.stats.replied, c.stats);
        case "click": return statRate(c.stats.clickRate, c.stats.clicked, c.stats);
        case "bounce": return statRate(c.stats.bounceRate, c.stats.bounced, c.stats);
    }
}

interface CampaignTableProps {
    campaigns: Campaign[];
    /** Manager: link each campaign to a client. */
    clients?: { id: string; name: string }[];
    onLink?: (campaign: Campaign, clientId: string) => void;
    linkingId?: string | null;
    /** Show the linked client as a link to its page (manager). */
    showClient?: boolean;
    onOpen?: (campaign: Campaign) => void;
    emptyText: string;
    toolbar?: boolean;
}

export function CampaignTable({ campaigns, clients, onLink, linkingId, showClient, onOpen, emptyText, toolbar = true }: CampaignTableProps) {
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState<"all" | "active" | "unlinked">("all");
    const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "sent", dir: "desc" });

    const rows = useMemo(() => {
        const q = query.trim().toLowerCase();
        const filtered = campaigns.filter((c) => {
            if (filter === "active" && !isActiveCampaign(c)) return false;
            if (filter === "unlinked" && c.client) return false;
            if (q && !`${c.name} ${c.client?.name ?? ""} ${c.mailboxEmail ?? ""}`.toLowerCase().includes(q)) return false;
            return true;
        });
        return filtered.sort((a, b) => {
            const va = metric(a, sort.key);
            const vb = metric(b, sort.key);
            const cmp = typeof va === "string" ? va.localeCompare(String(vb), "fr") : va - (vb as number);
            return sort.dir === "asc" ? cmp : -cmp;
        });
    }, [campaigns, query, filter, sort]);

    const header = (key: SortKey, label: string, align: "left" | "right" = "right") => {
        const active = sort.key === key;
        const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
        return (
            <th className={cn("px-3 py-2.5 font-semibold", align === "right" ? "text-right" : "text-left")} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                <button
                    type="button"
                    onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }))}
                    className={cn("inline-flex items-center gap-1 hover:text-ink", active && "text-ink")}
                >
                    {label}
                    <Icon className="size-3" aria-hidden />
                </button>
            </th>
        );
    };

    const linkable = Boolean(onLink && clients);
    const unlinkedCount = campaigns.filter((c) => !c.client).length;

    return (
        <div>
            {toolbar && campaigns.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-b border-line-subtle px-4 py-3">
                    <div className="w-full sm:w-64">
                        <Input size="sm" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher une campagne…" icon={<Search className="size-4" />} aria-label="Rechercher une campagne" />
                    </div>
                    <Select
                        className="w-48"
                        value={filter}
                        onChange={(v) => setFilter(v as typeof filter)}
                        options={[
                            { value: "all", label: `Toutes (${campaigns.length})` },
                            { value: "active", label: `Actives (${campaigns.filter(isActiveCampaign).length})` },
                            ...(linkable ? [{ value: "unlinked", label: `Sans client (${unlinkedCount})` }] : []),
                        ]}
                    />
                </div>
            )}
            {rows.length === 0 ? (
                <p className="px-4 py-12 text-center text-sm text-ink-3">{campaigns.length === 0 ? emptyText : "Aucune campagne ne correspond."}</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-sm">
                        <thead className="bg-surface-2 text-[11px] uppercase tracking-wide text-ink-3">
                            <tr>
                                {header("name", "Campagne", "left")}
                                {header("status", "Statut", "left")}
                                {header("leads", "Leads")}
                                {header("sent", "Envoyés")}
                                {header("open", "Ouverture")}
                                {header("reply", "Réponse")}
                                {header("click", "Clic")}
                                {header("bounce", "Rebond")}
                                {(linkable || showClient) && <th className="px-3 py-2.5 text-left font-semibold">Client</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((c) => {
                                const bounce = statRate(c.stats.bounceRate, c.stats.bounced, c.stats);
                                return (
                                    <tr
                                        key={c.id}
                                        onClick={onOpen ? () => onOpen(c) : undefined}
                                        className={cn("border-t border-line-subtle", onOpen && "cursor-pointer hover:bg-surface-2")}
                                    >
                                        <td className="max-w-[320px] px-3 py-2.5">
                                            <p className="truncate font-semibold text-ink">{c.name}</p>
                                            {c.mailboxEmail && <p className="truncate text-[11px] text-ink-3">{c.mailboxEmail}</p>}
                                        </td>
                                        <td className="px-3 py-2.5"><CampaignStatus status={c.status} /></td>
                                        <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{num(c.stats.leads)}</td>
                                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-ink">{num(c.stats.sent)}</td>
                                        <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{pct(statRate(c.stats.openRate, c.stats.opened, c.stats))}</td>
                                        <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{pct(statRate(c.stats.replyRate, c.stats.replied, c.stats))}</td>
                                        <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{pct(statRate(c.stats.clickRate, c.stats.clicked, c.stats))}</td>
                                        <td className={cn("px-3 py-2.5 text-right tabular-nums", bounce >= 5 ? "font-semibold text-danger-ink" : "text-ink-2")}>{pct(bounce)}</td>
                                        {linkable ? (
                                            <td className="w-56 px-3 py-2" onClick={(e) => e.stopPropagation()}>
                                                {/* Native select: a custom dropdown would be clipped by the scrolling table. */}
                                                <select
                                                    aria-label={`Client lié à ${c.name}`}
                                                    value={c.client?.id ?? ""}
                                                    onChange={(e) => onLink?.(c, e.target.value)}
                                                    disabled={linkingId === c.id}
                                                    className={cn(FIELD_BASE, "h-8 px-2.5 text-[13px]", !c.client && "text-ink-3")}
                                                >
                                                    <option value="">Non liée</option>
                                                    {(clients ?? []).map((cl) => (
                                                        <option key={cl.id} value={cl.id}>{cl.name}</option>
                                                    ))}
                                                </select>
                                                {c.client && (
                                                    <Link href={`/manager/clients/${c.client.id}`} className="mt-1 inline-block text-[11px] font-medium text-link hover:underline">
                                                        Fiche client
                                                    </Link>
                                                )}
                                            </td>
                                        ) : showClient ? (
                                            <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                                                {c.client ? (
                                                    <Link href={`/manager/clients/${c.client.id}`} className="text-sm font-medium text-link hover:underline">{c.client.name}</Link>
                                                ) : (
                                                    <span className="text-xs text-ink-4">Non liée</span>
                                                )}
                                            </td>
                                        ) : null}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
