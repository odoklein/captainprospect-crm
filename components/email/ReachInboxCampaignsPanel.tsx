"use client";

// ============================================
// REACHINBOX CAMPAIGNS PANEL
// Shared section displaying ReachInbox campaigns with live stats.
// variant="manager": full view with client-link dropdowns
//   (optionally scoped to one client via clientId — client detail page)
// variant="client": read-only view of the logged-in client's campaigns
// Styled with the Captain Prospect tokens (--cp-* / .cpds-*).
// ============================================

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    Megaphone, RefreshCw, Send, MailOpen, Reply, AlertTriangle,
    Users, Loader2, Inbox, MousePointerClick, Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui";

interface CampaignStats {
    sent: number;
    opened: number;
    replied: number;
    clicked: number;
    bounced: number;
    leads: number;
}

interface Campaign {
    id: string;
    name: string;
    status: string;
    createdAt: string | null;
    stats: CampaignStats;
    mailboxId?: string;
    mailboxEmail?: string;
    client?: { id: string; name: string } | null;
}

interface ClientOption {
    id: string;
    name: string;
}

interface ReachInboxCampaignsPanelProps {
    variant: "manager" | "client";
    /** manager variant only: restrict the view to campaigns linked to this client */
    clientId?: string;
}

const STATUS_CHIP: Record<string, { label: string; bg: string; fg: string }> = {
    ACTIVE: { label: "Active", bg: "var(--cp-success-soft)", fg: "var(--cp-success)" },
    RUNNING: { label: "Active", bg: "var(--cp-success-soft)", fg: "var(--cp-success)" },
    PAUSED: { label: "En pause", bg: "var(--cp-warn-soft)", fg: "var(--cp-warn)" },
    STOPPED: { label: "Arrêtée", bg: "var(--cp-neutral-soft)", fg: "var(--cp-ink-3)" },
    COMPLETED: { label: "Terminée", bg: "var(--cp-info-soft)", fg: "var(--cp-info)" },
    DRAFT: { label: "Brouillon", bg: "var(--cp-neutral-soft)", fg: "var(--cp-ink-3)" },
};

const ACTIVE_STATUSES = new Set(["ACTIVE", "RUNNING"]);

function pct(part: number, total: number): string {
    if (!total) return "—";
    return `${Math.round((part / total) * 1000) / 10}%`;
}

function StatusChip({ status }: { status: string }) {
    const cfg = STATUS_CHIP[status] ?? { label: status.toLowerCase(), bg: "var(--cp-neutral-soft)", fg: "var(--cp-ink-3)" };
    return (
        <span className="cpds-chip capitalize" style={{ background: cfg.bg, color: cfg.fg }}>
            {cfg.label}
        </span>
    );
}

function KpiCell({ icon: Icon, label, value }: { icon: typeof Send; label: string; value: string | number }) {
    return (
        <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
                style={{ background: "var(--cp-green-soft)", color: "var(--cp-green)" }}>
                <Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
                <p className="text-[20px] font-semibold leading-none tabular-nums" style={{ color: "var(--cp-ink)" }}>{value}</p>
                <p className="text-[11px] font-medium mt-1 truncate" style={{ color: "var(--cp-ink-3)" }}>{label}</p>
            </div>
        </div>
    );
}

export function ReachInboxCampaignsPanel({ variant, clientId }: ReachInboxCampaignsPanelProps) {
    const { error: showError, success } = useToast();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [apiErrors, setApiErrors] = useState<{ mailboxEmail: string; message: string }[]>([]);
    const [clients, setClients] = useState<ClientOption[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [statusFilter, setStatusFilter] = useState<"all" | "active">("active");
    const [clientFilter, setClientFilter] = useState<string>("");
    const [linkingId, setLinkingId] = useState<string | null>(null);

    const isManager = variant === "manager";

    const fetchCampaigns = useCallback(async (refresh = false) => {
        if (refresh) setIsRefreshing(true);
        else setIsLoading(true);
        try {
            const url = isManager
                ? `/api/email/reachinbox/campaigns${clientId ? `?clientId=${clientId}` : ""}`
                : "/api/client/reachinbox-campaigns";
            const res = await fetch(url);
            const json = await res.json();
            if (json.success) {
                setCampaigns(json.data?.campaigns ?? []);
                setApiErrors(json.data?.errors ?? []);
            } else {
                showError("Erreur", json.error || "Impossible de charger les campagnes ReachInbox");
            }
        } catch {
            showError("Erreur réseau", "Impossible de contacter le serveur");
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [isManager, clientId, showError]);

    useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

    // Manager (unscoped): load clients for the link dropdowns
    useEffect(() => {
        if (!isManager || clientId) return;
        (async () => {
            try {
                const res = await fetch("/api/clients?limit=200");
                const json = await res.json();
                if (json.success && Array.isArray(json.data)) {
                    setClients(json.data.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
                }
            } catch { /* dropdown stays empty */ }
        })();
    }, [isManager, clientId]);

    const handleLinkChange = async (campaign: Campaign, newClientId: string) => {
        setLinkingId(campaign.id);
        const previous = campaign.client ?? null;
        // Optimistic update
        setCampaigns((prev) => prev.map((c) => c.id === campaign.id
            ? { ...c, client: newClientId ? { id: newClientId, name: clients.find((cl) => cl.id === newClientId)?.name ?? "…" } : null }
            : c));
        try {
            const res = await fetch("/api/email/reachinbox/campaigns/link", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    campaignId: campaign.id,
                    campaignName: campaign.name,
                    mailboxId: campaign.mailboxId ?? null,
                    clientId: newClientId || null,
                }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || "Erreur lors de la liaison");
            success(newClientId ? "Campagne liée" : "Liaison retirée",
                newClientId ? `« ${campaign.name} » → ${json.data?.clientName ?? ""}` : campaign.name);
        } catch (err) {
            // Roll back
            setCampaigns((prev) => prev.map((c) => c.id === campaign.id ? { ...c, client: previous } : c));
            showError("Erreur", (err as Error).message);
        } finally {
            setLinkingId(null);
        }
    };

    const visibleCampaigns = useMemo(() => {
        return campaigns.filter((c) => {
            if (statusFilter === "active" && !ACTIVE_STATUSES.has(c.status)) return false;
            if (clientFilter === "__unlinked" && c.client) return false;
            if (clientFilter && clientFilter !== "__unlinked" && c.client?.id !== clientFilter) return false;
            return true;
        });
    }, [campaigns, statusFilter, clientFilter]);

    const totals = useMemo(() => {
        const t = { active: 0, sent: 0, opened: 0, replied: 0, bounced: 0 };
        for (const c of visibleCampaigns) {
            if (ACTIVE_STATUSES.has(c.status)) t.active += 1;
            t.sent += c.stats.sent;
            t.opened += c.stats.opened;
            t.replied += c.stats.replied;
            t.bounced += c.stats.bounced;
        }
        return t;
    }, [visibleCampaigns]);

    const thClass = "px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap";

    return (
        <div className="cpds-card overflow-hidden" style={{ fontFamily: "var(--cp-font)" }}>
            {/* ── Header ── */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                style={{ borderBottom: "1px solid var(--cp-border)" }}>
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-[10px] flex items-center justify-center"
                        style={{ background: "var(--cp-green)", color: "var(--cp-on-inverse)" }}>
                        <Megaphone className="w-4 h-4" />
                    </div>
                    <div>
                        <h2 className="text-[15px] font-semibold leading-tight" style={{ color: "var(--cp-ink)" }}>
                            Campagnes ReachInbox
                        </h2>
                        <p className="text-[11px] mt-0.5" style={{ color: "var(--cp-ink-3)" }}>
                            Statistiques en direct depuis ReachInbox
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Status filter */}
                    <div className="flex items-center p-0.5 rounded-[10px]"
                        style={{ background: "var(--cp-sunken)", border: "1px solid var(--cp-border)" }}>
                        {([["active", "Actives"], ["all", "Toutes"]] as const).map(([value, label]) => (
                            <button key={value} type="button" onClick={() => setStatusFilter(value)}
                                className={cn("px-3 h-7 rounded-[8px] text-[12px] font-semibold transition-all", statusFilter === value ? "shadow-sm" : "hover:opacity-75")}
                                style={statusFilter === value
                                    ? { background: "var(--cp-raised)", color: "var(--cp-ink)" }
                                    : { color: "var(--cp-ink-3)" }}>
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* Client filter (manager, unscoped) */}
                    {isManager && !clientId && clients.length > 0 && (
                        <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}
                            className="h-8 px-2.5 pr-7 rounded-[10px] text-[12px] font-medium focus:outline-none cursor-pointer"
                            style={{ background: "var(--cp-raised)", border: "1px solid var(--cp-border)", color: clientFilter ? "var(--cp-ink)" : "var(--cp-ink-3)" }}>
                            <option value="">Tous les clients</option>
                            <option value="__unlinked">Non liées</option>
                            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    )}

                    <button type="button" onClick={() => fetchCampaigns(true)} disabled={isRefreshing}
                        className="w-8 h-8 rounded-[10px] flex items-center justify-center transition-colors hover:opacity-70 disabled:opacity-40"
                        style={{ background: "var(--cp-raised)", border: "1px solid var(--cp-border)", color: "var(--cp-ink-2)" }}
                        title="Actualiser">
                        <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
                    </button>
                </div>
            </div>

            {/* ── API warnings ── */}
            {apiErrors.length > 0 && (
                <div className="flex items-start gap-2.5 px-5 py-3"
                    style={{ background: "var(--cp-warn-soft)", borderBottom: "1px solid var(--cp-border)" }}>
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--cp-warn)" }} />
                    <div className="text-[12px]" style={{ color: "var(--cp-warn)" }}>
                        {apiErrors.map((e, i) => (
                            <p key={i}><span className="font-semibold">{e.mailboxEmail}</span> : {e.message}</p>
                        ))}
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="flex items-center justify-center py-14">
                    <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--cp-green)" }} />
                </div>
            ) : campaigns.length === 0 ? (
                <div className="py-12 px-6 text-center">
                    <div className="mx-auto mb-3 w-12 h-12 rounded-[12px] flex items-center justify-center"
                        style={{ background: "var(--cp-sunken)" }}>
                        <Inbox className="w-5 h-5" style={{ color: "var(--cp-ink-3)" }} />
                    </div>
                    <p className="text-sm font-semibold" style={{ color: "var(--cp-ink)" }}>
                        {isManager ? "Aucune campagne ReachInbox" : "Aucune campagne pour le moment"}
                    </p>
                    <p className="mt-1 text-xs max-w-sm mx-auto" style={{ color: "var(--cp-ink-3)" }}>
                        {isManager
                            ? "Connectez une boîte ReachInbox (clé API) pour voir les campagnes ici."
                            : "Les campagnes email menées pour vous apparaîtront ici."}
                    </p>
                    {isManager && !clientId && (
                        <Link href="/manager/emails/mailboxes"
                            className="inline-flex items-center gap-2 mt-4 h-9 px-4 rounded-[10px] text-[12px] font-semibold transition-all hover:brightness-110"
                            style={{ background: "var(--cp-green)", color: "var(--cp-on-inverse)" }}>
                            <Link2 className="w-3.5 h-3.5" />
                            Connecter ReachInbox
                        </Link>
                    )}
                </div>
            ) : (
                <>
                    {/* ── KPI strip ── */}
                    <div className="grid grid-cols-2 md:grid-cols-5"
                        style={{ borderBottom: "1px solid var(--cp-border)" }}>
                        <KpiCell icon={Megaphone} label="Campagnes actives" value={totals.active} />
                        <KpiCell icon={Send} label="Emails envoyés" value={totals.sent.toLocaleString("fr-FR")} />
                        <KpiCell icon={MailOpen} label="Taux d'ouverture" value={pct(totals.opened, totals.sent)} />
                        <KpiCell icon={Reply} label="Taux de réponse" value={pct(totals.replied, totals.sent)} />
                        <KpiCell icon={AlertTriangle} label="Rebonds" value={totals.bounced.toLocaleString("fr-FR")} />
                    </div>

                    {/* ── Campaign table ── */}
                    {visibleCampaigns.length === 0 ? (
                        <p className="text-center text-sm py-10" style={{ color: "var(--cp-ink-3)" }}>
                            Aucune campagne ne correspond aux filtres.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead style={{ background: "var(--cp-sunken)" }}>
                                    <tr style={{ color: "var(--cp-ink-3)" }}>
                                        <th className={thClass}>Campagne</th>
                                        <th className={thClass}>Statut</th>
                                        <th className={thClass}>Leads</th>
                                        <th className={thClass}>Envoyés</th>
                                        <th className={thClass}>Ouverts</th>
                                        <th className={thClass}>Réponses</th>
                                        <th className={thClass}>Clics</th>
                                        <th className={thClass}>Rebonds</th>
                                        {isManager && !clientId && <th className={thClass}>Client lié</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {visibleCampaigns.map((campaign) => (
                                        <tr key={campaign.id} style={{ borderTop: "1px solid var(--cp-border)" }}
                                            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--cp-sunken)"; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}>
                                            <td className="px-4 py-3">
                                                <p className="font-semibold truncate max-w-[240px]" style={{ color: "var(--cp-ink)" }}>{campaign.name}</p>
                                                {campaign.mailboxEmail && (
                                                    <p className="text-[11px] truncate" style={{ color: "var(--cp-ink-3)" }}>{campaign.mailboxEmail}</p>
                                                )}
                                            </td>
                                            <td className="px-4 py-3"><StatusChip status={campaign.status} /></td>
                                            <td className="px-4 py-3 tabular-nums" style={{ color: "var(--cp-ink-2)" }}>
                                                <span className="inline-flex items-center gap-1.5">
                                                    <Users className="w-3 h-3" style={{ color: "var(--cp-ink-3)" }} />
                                                    {campaign.stats.leads.toLocaleString("fr-FR")}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 tabular-nums font-semibold" style={{ color: "var(--cp-ink)" }}>
                                                {campaign.stats.sent.toLocaleString("fr-FR")}
                                            </td>
                                            <td className="px-4 py-3 tabular-nums" style={{ color: "var(--cp-ink-2)" }}>
                                                {campaign.stats.opened.toLocaleString("fr-FR")}
                                                <span className="ml-1.5 text-[11px] font-semibold" style={{ color: "var(--cp-green)" }}>
                                                    {pct(campaign.stats.opened, campaign.stats.sent)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 tabular-nums" style={{ color: "var(--cp-ink-2)" }}>
                                                {campaign.stats.replied.toLocaleString("fr-FR")}
                                                <span className="ml-1.5 text-[11px] font-semibold" style={{ color: "var(--cp-green)" }}>
                                                    {pct(campaign.stats.replied, campaign.stats.sent)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 tabular-nums" style={{ color: "var(--cp-ink-2)" }}>
                                                <span className="inline-flex items-center gap-1.5">
                                                    <MousePointerClick className="w-3 h-3" style={{ color: "var(--cp-ink-3)" }} />
                                                    {campaign.stats.clicked.toLocaleString("fr-FR")}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 tabular-nums"
                                                style={{ color: campaign.stats.bounced > 0 ? "var(--cp-danger)" : "var(--cp-ink-2)" }}>
                                                {campaign.stats.bounced.toLocaleString("fr-FR")}
                                                <span className="ml-1.5 text-[11px]" style={{ color: "var(--cp-ink-3)" }}>
                                                    {pct(campaign.stats.bounced, campaign.stats.sent)}
                                                </span>
                                            </td>
                                            {isManager && !clientId && (
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-1.5">
                                                        {linkingId === campaign.id && (
                                                            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" style={{ color: "var(--cp-green)" }} />
                                                        )}
                                                        <select
                                                            value={campaign.client?.id ?? ""}
                                                            disabled={linkingId === campaign.id}
                                                            onChange={(e) => handleLinkChange(campaign, e.target.value)}
                                                            className="h-8 px-2 pr-6 rounded-[8px] text-[12px] font-medium focus:outline-none cursor-pointer disabled:opacity-50 max-w-[180px]"
                                                            style={{
                                                                background: campaign.client ? "var(--cp-green-soft)" : "var(--cp-raised)",
                                                                border: `1px solid ${campaign.client ? "var(--cp-green)" : "var(--cp-border)"}`,
                                                                color: campaign.client ? "var(--cp-green)" : "var(--cp-ink-3)",
                                                            }}>
                                                            <option value="">Non liée</option>
                                                            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                        </select>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export default ReachInboxCampaignsPanel;
