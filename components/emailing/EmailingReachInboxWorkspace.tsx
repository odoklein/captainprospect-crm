"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
    AlertTriangle,
    ArrowUpRight,
    CheckCircle2,
    ChevronDown,
    CircleDashed,
    Inbox,
    KeyRound,
    Link2,
    Loader2,
    MailOpen,
    MousePointerClick,
    RefreshCw,
    Reply,
    Send,
    ShieldCheck,
    Sparkles,
    TrendingUp,
    Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui";

type EmailingVariant = "manager" | "client";

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

interface DashboardResponse {
    connected: boolean;
    connection: {
        id: string;
        email: string;
        displayName: string | null;
        lastSyncAt: string | null;
    } | null;
    summary: EmailingSummary;
    daily: Array<{
        date: string;
        sent: number;
        opened: number;
        replied: number;
        clicked: number;
        bounced: number;
    }>;
    campaigns: Campaign[];
    errors: { mailboxEmail: string; message: string }[];
}

interface EmailingSummary {
    sent: number;
    opened: number;
    replied: number;
    clicked: number;
    bounced: number;
    leads: number;
    opportunities: number;
    positiveReplies: number;
    openRate: number;
    replyRate: number;
    clickRate: number;
    bounceRate: number;
}

const EMPTY_SUMMARY: EmailingSummary = {
    sent: 0,
    opened: 0,
    replied: 0,
    clicked: 0,
    bounced: 0,
    leads: 0,
    opportunities: 0,
    positiveReplies: 0,
    openRate: 0,
    replyRate: 0,
    clickRate: 0,
    bounceRate: 0,
};

const ACTIVE_STATUSES = new Set(["ACTIVE", "RUNNING"]);

function dateDaysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().slice(0, 10);
}

function today(): string {
    return new Date().toISOString().slice(0, 10);
}

function num(value: number): string {
    return value.toLocaleString("fr-FR");
}

function percent(value: number): string {
    return `${value.toLocaleString("fr-FR")}%`;
}

function rate(part: number, total: number): number {
    if (!total) return 0;
    return Math.round((part / total) * 1000) / 10;
}

function summarizeCampaigns(campaigns: Campaign[]): EmailingSummary {
    const base = campaigns.reduce(
        (acc, campaign) => {
            acc.sent += campaign.stats.sent;
            acc.opened += campaign.stats.opened;
            acc.replied += campaign.stats.replied;
            acc.clicked += campaign.stats.clicked;
            acc.bounced += campaign.stats.bounced;
            acc.leads += campaign.stats.leads;
            return acc;
        },
        { ...EMPTY_SUMMARY },
    );

    return {
        ...base,
        openRate: rate(base.opened, base.sent),
        replyRate: rate(base.replied, base.sent),
        clickRate: rate(base.clicked, base.sent),
        bounceRate: rate(base.bounced, base.sent),
    };
}

function HeaderShell({
    variant,
    connectedEmail,
    onRefresh,
    isRefreshing,
}: {
    variant: EmailingVariant;
    connectedEmail?: string | null;
    onRefresh?: () => void;
    isRefreshing?: boolean;
}) {
    return (
        <div className="relative overflow-hidden rounded-[22px] border bg-[#0b1220] p-6 text-white shadow-xl shadow-slate-200/70">
            <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_70%_30%,rgba(52,211,153,0.28),transparent_35%),radial-gradient(circle_at_40%_80%,rgba(59,130,246,0.24),transparent_38%)]" />
            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[12px] font-semibold text-emerald-100">
                        <Sparkles className="h-3.5 w-3.5" />
                        Emailing ReachInbox
                    </div>
                    <h1 className="mt-4 text-[30px] font-semibold tracking-tight md:text-[36px]">
                        {variant === "manager" ? "Pilotage emailing client" : "Vos performances emailing"}
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                        {variant === "manager"
                            ? "Lecture seule des campagnes ReachInbox. La seule action disponible est de lier une campagne a un client pour lui afficher ses stats dans le portail."
                            : "Statistiques des campagnes emailing que votre manager a explicitement liees a votre espace client."}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    {connectedEmail && (
                        <div className="rounded-[14px] border border-white/15 bg-white/10 px-4 py-3">
                            <p className="text-[11px] font-semibold uppercase text-slate-400">Source</p>
                            <p className="mt-1 text-sm font-semibold">{connectedEmail}</p>
                        </div>
                    )}
                    {onRefresh && (
                        <button
                            type="button"
                            onClick={onRefresh}
                            disabled={isRefreshing}
                            className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-emerald-50 disabled:opacity-60"
                        >
                            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
                            Actualiser
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

function MetricCard({
    label,
    value,
    sub,
    icon: Icon,
}: {
    label: string;
    value: string;
    sub: string;
    icon: typeof Send;
}) {
    return (
        <div className="rounded-[16px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                    <p className="mt-2 text-[26px] font-semibold leading-none tracking-tight text-slate-950">{value}</p>
                    <p className="mt-2 text-[12px] text-slate-500">{sub}</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-emerald-50 text-emerald-700">
                    <Icon className="h-4 w-4" />
                </div>
            </div>
        </div>
    );
}

function ConnectReachInboxCard({ onConnected }: { onConnected: () => void }) {
    const { error: showError, success } = useToast();
    const [apiKey, setApiKey] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setIsSubmitting(true);
        try {
            const response = await fetch("/api/email/reachinbox/connect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ apiKey }),
            });
            const json = await response.json();
            if (!response.ok || !json.success) throw new Error(json.error || "Cle API invalide");
            success("ReachInbox connecte", "Les campagnes peuvent maintenant etre lues.");
            setApiKey("");
            onConnected();
        } catch (error) {
            showError("Connexion impossible", error instanceof Error ? error.message : "Cle API invalide");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
                <div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-emerald-50 text-emerald-700">
                        <KeyRound className="h-5 w-5" />
                    </div>
                    <h2 className="mt-5 text-[24px] font-semibold tracking-tight text-slate-950">
                        Connecter ReachInbox pour la page Emailing
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                        Cette connexion sert uniquement a lire les statistiques des campagnes. Les campagnes restent gerees
                        dans ReachInbox, pas dans Captain Prospect.
                    </p>
                    <div className="mt-5 grid gap-3 md:grid-cols-3">
                        {[
                            ["Lecture API", "Stats, campagnes, taux"],
                            ["Zero edition", "Aucun controle de campagne"],
                            ["Portail client", "Visible apres liaison"],
                        ].map(([title, body]) => (
                            <div key={title} className="rounded-[14px] border border-slate-200 bg-slate-50 p-3">
                                <p className="text-sm font-semibold text-slate-950">{title}</p>
                                <p className="mt-1 text-[12px] text-slate-500">{body}</p>
                            </div>
                        ))}
                    </div>
                </div>
                <form onSubmit={handleSubmit} className="rounded-[16px] border border-slate-200 bg-slate-50 p-4">
                    <label htmlFor="reachinbox-key" className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">
                        Cle API ReachInbox
                    </label>
                    <input
                        id="reachinbox-key"
                        type="password"
                        value={apiKey}
                        onChange={(event) => setApiKey(event.target.value)}
                        placeholder="Coller la cle API"
                        className="mt-2 h-11 w-full rounded-[12px] border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                    />
                    <button
                        type="submit"
                        disabled={isSubmitting || apiKey.trim().length < 12}
                        className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                    >
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                        Connecter
                    </button>
                </form>
            </div>
        </div>
    );
}

function TrendPanel({ daily }: { daily: DashboardResponse["daily"] }) {
    const points = daily.slice(-16);
    const max = Math.max(...points.map((point) => point.sent), 1);

    return (
        <div className="rounded-[18px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h2 className="text-base font-semibold text-slate-950">Volume emailing</h2>
                    <p className="mt-1 text-sm text-slate-500">Derniers points journaliers renvoyes par ReachInbox.</p>
                </div>
                <TrendingUp className="h-5 w-5 text-emerald-600" />
            </div>
            {points.length === 0 ? (
                <div className="mt-4 flex h-48 items-center justify-center rounded-[14px] bg-slate-50 text-sm text-slate-500">
                    Aucune serie journaliere disponible.
                </div>
            ) : (
                <div className="mt-6 flex h-52 items-end gap-2">
                    {points.map((point) => (
                        <div key={point.date} className="flex min-w-0 flex-1 flex-col items-center">
                            <div className="w-full rounded-t-[8px] bg-emerald-600"
                                style={{ height: `${Math.max(8, (point.sent / max) * 180)}px` }}
                                title={`${point.date}: ${point.sent} emails envoyes`}
                            />
                            <span className="mt-2 max-w-full truncate text-[10px] text-slate-400">{point.date.slice(5)}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function CampaignTable({
    campaigns,
    clients,
    canLink,
    onLink,
    linkingId,
}: {
    campaigns: Campaign[];
    clients?: ClientOption[];
    canLink: boolean;
    onLink?: (campaign: Campaign, clientId: string) => void;
    linkingId?: string | null;
}) {
    return (
        <div className="overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 className="text-base font-semibold text-slate-950">Campagnes ReachInbox</h2>
                    <p className="mt-1 text-sm text-slate-500">
                        Apercu lecture seule. Aucun parametre ReachInbox n'est modifiable ici.
                    </p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[12px] font-semibold text-slate-600">
                    <CircleDashed className="h-3.5 w-3.5" />
                    {campaigns.length} campagnes
                </div>
            </div>

            {campaigns.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                    <Inbox className="h-8 w-8 text-slate-300" />
                    <p className="mt-3 text-sm font-semibold text-slate-900">Aucune campagne a afficher</p>
                    <p className="mt-1 max-w-sm text-sm text-slate-500">
                        {canLink
                            ? "Connectez ReachInbox ou actualisez la page pour lire les campagnes."
                            : "Le manager doit lier une campagne emailing a votre client."}
                    </p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                            <tr>
                                <th className="px-5 py-3 font-semibold">Campagne</th>
                                <th className="px-5 py-3 font-semibold">Statut</th>
                                <th className="px-5 py-3 font-semibold">Leads</th>
                                <th className="px-5 py-3 font-semibold">Envoyes</th>
                                <th className="px-5 py-3 font-semibold">Ouverture</th>
                                <th className="px-5 py-3 font-semibold">Reponse</th>
                                <th className="px-5 py-3 font-semibold">Clic</th>
                                <th className="px-5 py-3 font-semibold">Rebond</th>
                                {canLink && <th className="px-5 py-3 font-semibold">Client</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {campaigns.map((campaign) => (
                                <tr key={campaign.id} className="hover:bg-slate-50/70">
                                    <td className="px-5 py-4">
                                        <p className="max-w-[320px] truncate font-semibold text-slate-950">{campaign.name}</p>
                                        <p className="mt-1 text-[12px] text-slate-500">{campaign.mailboxEmail || campaign.createdAt || "ReachInbox"}</p>
                                    </td>
                                    <td className="px-5 py-4">
                                        <span className={cn(
                                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize",
                                            ACTIVE_STATUSES.has(campaign.status)
                                                ? "bg-emerald-50 text-emerald-700"
                                                : "bg-slate-100 text-slate-600",
                                        )}>
                                            <span className={cn("h-1.5 w-1.5 rounded-full", ACTIVE_STATUSES.has(campaign.status) ? "bg-emerald-500" : "bg-slate-400")} />
                                            {campaign.status.toLowerCase()}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4 tabular-nums text-slate-700">{num(campaign.stats.leads)}</td>
                                    <td className="px-5 py-4 tabular-nums font-semibold text-slate-950">{num(campaign.stats.sent)}</td>
                                    <td className="px-5 py-4 tabular-nums text-slate-700">{percent(rate(campaign.stats.opened, campaign.stats.sent))}</td>
                                    <td className="px-5 py-4 tabular-nums text-slate-700">{percent(rate(campaign.stats.replied, campaign.stats.sent))}</td>
                                    <td className="px-5 py-4 tabular-nums text-slate-700">{percent(rate(campaign.stats.clicked, campaign.stats.sent))}</td>
                                    <td className="px-5 py-4 tabular-nums text-slate-700">{percent(rate(campaign.stats.bounced, campaign.stats.sent))}</td>
                                    {canLink && (
                                        <td className="px-5 py-4">
                                            <div className="relative min-w-[220px]">
                                                {linkingId === campaign.id ? (
                                                    <Loader2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-emerald-600" />
                                                ) : (
                                                    <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                                )}
                                                <select
                                                    value={campaign.client?.id ?? ""}
                                                    disabled={linkingId === campaign.id}
                                                    onChange={(event) => onLink?.(campaign, event.target.value)}
                                                    className="h-10 w-full appearance-none rounded-[12px] border border-slate-200 bg-white pl-9 pr-9 text-sm font-medium text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 disabled:opacity-60"
                                                >
                                                    <option value="">Non liee</option>
                                                    {(clients ?? []).map((client) => (
                                                        <option key={client.id} value={client.id}>{client.name}</option>
                                                    ))}
                                                </select>
                                                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function ManagerEmailingPage() {
    const { error: showError, success } = useToast();
    const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
    const [clients, setClients] = useState<ClientOption[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [linkingId, setLinkingId] = useState<string | null>(null);
    const [showConnectionSettings, setShowConnectionSettings] = useState(false);
    const [startDate, setStartDate] = useState(dateDaysAgo(30));
    const [endDate, setEndDate] = useState(today());

    const fetchDashboard = useCallback(async (refresh = false) => {
        if (refresh) setIsRefreshing(true);
        else setIsLoading(true);
        try {
            const params = new URLSearchParams({ startDate, endDate });
            const response = await fetch(`/api/email/reachinbox/dashboard?${params.toString()}`);
            const json = await response.json();
            if (!response.ok || !json.success) throw new Error(json.error || "Chargement impossible");
            setDashboard(json.data);
        } catch (error) {
            showError("ReachInbox", error instanceof Error ? error.message : "Chargement impossible");
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [endDate, showError, startDate]);

    useEffect(() => {
        fetchDashboard();
    }, [fetchDashboard]);

    useEffect(() => {
        (async () => {
            try {
                const response = await fetch("/api/clients?limit=300");
                const json = await response.json();
                const rows = Array.isArray(json.data) ? json.data : [];
                setClients(rows.map((client: { id: string; name: string }) => ({ id: client.id, name: client.name })));
            } catch {
                setClients([]);
            }
        })();
    }, []);

    const handleLink = async (campaign: Campaign, clientId: string) => {
        setLinkingId(campaign.id);
        const previous = campaign.client ?? null;
        const nextClient = clients.find((client) => client.id === clientId) ?? null;
        setDashboard((current) => current
            ? {
                ...current,
                campaigns: current.campaigns.map((item) => item.id === campaign.id
                    ? { ...item, client: nextClient ? { id: nextClient.id, name: nextClient.name } : null }
                    : item),
            }
            : current);

        try {
            const response = await fetch("/api/email/reachinbox/campaigns/link", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    campaignId: campaign.id,
                    campaignName: campaign.name,
                    mailboxId: campaign.mailboxId ?? null,
                    clientId: clientId || null,
                }),
            });
            const json = await response.json();
            if (!response.ok || !json.success) throw new Error(json.error || "Liaison impossible");
            success(clientId ? "Campagne liee" : "Liaison retiree", campaign.name);
        } catch (error) {
            setDashboard((current) => current
                ? {
                    ...current,
                    campaigns: current.campaigns.map((item) => item.id === campaign.id ? { ...item, client: previous } : item),
                }
                : current);
            showError("Liaison impossible", error instanceof Error ? error.message : "Erreur inconnue");
        } finally {
            setLinkingId(null);
        }
    };

    if (isLoading) {
        return (
            <div className="flex min-h-[520px] items-center justify-center">
                <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
            </div>
        );
    }

    if (!dashboard?.connected) {
        return (
            <div className="space-y-6">
                <HeaderShell variant="manager" />
                <ConnectReachInboxCard onConnected={() => fetchDashboard(true)} />
            </div>
        );
    }

    const activeCampaigns = dashboard.campaigns.filter((campaign) => ACTIVE_STATUSES.has(campaign.status)).length;
    const linkedCampaigns = dashboard.campaigns.filter((campaign) => campaign.client).length;

    return (
        <div className="space-y-6">
            <HeaderShell
                variant="manager"
                connectedEmail={dashboard.connection?.email}
                onRefresh={() => fetchDashboard(true)}
                isRefreshing={isRefreshing}
            />

            <div className="flex flex-wrap items-center gap-3 rounded-[18px] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    Lecture seule ReachInbox
                </div>
                <div className="h-5 w-px bg-slate-200" />
                <label className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Periode</label>
                <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)}
                    className="h-9 rounded-[10px] border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-emerald-500" />
                <span className="text-slate-300">to</span>
                <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)}
                    className="h-9 rounded-[10px] border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-emerald-500" />
                <div className="ml-auto flex items-center gap-2">
                    <span className="hidden text-[12px] text-slate-500 md:inline">
                        Cle active: {dashboard.connection?.email ?? "ReachInbox"}
                    </span>
                    <button
                        type="button"
                        onClick={() => setShowConnectionSettings((value) => !value)}
                        className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700"
                    >
                        <KeyRound className="h-3.5 w-3.5" />
                        {showConnectionSettings ? "Masquer la cle" : "Changer la cle API"}
                    </button>
                </div>
            </div>

            {showConnectionSettings && (
                <ConnectReachInboxCard onConnected={() => {
                    setShowConnectionSettings(false);
                    fetchDashboard(true);
                }} />
            )}

            {dashboard.errors.length > 0 && (
                <div className="rounded-[16px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                            {dashboard.errors.map((entry, index) => (
                                <p key={`${entry.mailboxEmail}-${index}`}>
                                    <span className="font-semibold">{entry.mailboxEmail}</span>: {entry.message}
                                </p>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard icon={Send} label="Envoyes" value={num(dashboard.summary.sent)} sub={`${activeCampaigns} campagnes actives`} />
                <MetricCard icon={MailOpen} label="Ouverture" value={percent(dashboard.summary.openRate)} sub={`${num(dashboard.summary.opened)} ouvertures`} />
                <MetricCard icon={Reply} label="Reponse" value={percent(dashboard.summary.replyRate)} sub={`${num(dashboard.summary.replied)} reponses`} />
                <MetricCard icon={Link2} label="Liees clients" value={num(linkedCampaigns)} sub="Visibles cote portail client" />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
                <TrendPanel daily={dashboard.daily} />
                <div className="rounded-[18px] border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="text-base font-semibold text-slate-950">Qualite emailing</h2>
                    <div className="mt-5 space-y-3">
                        <MetricCard icon={MousePointerClick} label="Clic" value={percent(dashboard.summary.clickRate)} sub={`${num(dashboard.summary.clicked)} clics`} />
                        <MetricCard icon={AlertTriangle} label="Rebond" value={percent(dashboard.summary.bounceRate)} sub={`${num(dashboard.summary.bounced)} rebonds`} />
                    </div>
                </div>
            </div>

            <CampaignTable
                campaigns={dashboard.campaigns}
                clients={clients}
                canLink
                onLink={handleLink}
                linkingId={linkingId}
            />
        </div>
    );
}

function ClientEmailingPage() {
    const { error: showError } = useToast();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const fetchCampaigns = useCallback(async (refresh = false) => {
        if (refresh) setIsRefreshing(true);
        else setIsLoading(true);
        try {
            const response = await fetch("/api/client/reachinbox-campaigns");
            const json = await response.json();
            if (!response.ok || !json.success) throw new Error(json.error || "Chargement impossible");
            setCampaigns(json.data?.campaigns ?? []);
        } catch (error) {
            showError("Emailing", error instanceof Error ? error.message : "Chargement impossible");
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [showError]);

    useEffect(() => {
        fetchCampaigns();
    }, [fetchCampaigns]);

    const summary = useMemo(() => summarizeCampaigns(campaigns), [campaigns]);
    const activeCampaigns = campaigns.filter((campaign) => ACTIVE_STATUSES.has(campaign.status)).length;

    if (isLoading) {
        return (
            <div className="flex min-h-[520px] items-center justify-center">
                <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <HeaderShell
                variant="client"
                onRefresh={() => fetchCampaigns(true)}
                isRefreshing={isRefreshing}
            />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard icon={Send} label="Envoyes" value={num(summary.sent)} sub={`${activeCampaigns} campagnes actives`} />
                <MetricCard icon={MailOpen} label="Ouverture" value={percent(summary.openRate)} sub={`${num(summary.opened)} ouvertures`} />
                <MetricCard icon={Reply} label="Reponse" value={percent(summary.replyRate)} sub={`${num(summary.replied)} reponses`} />
                <MetricCard icon={ArrowUpRight} label="Opportunites" value={num(summary.opportunities)} sub="Si retourne par ReachInbox" />
            </div>
            <CampaignTable campaigns={campaigns} canLink={false} />
        </div>
    );
}

export function EmailingReachInboxWorkspace({ variant }: { variant: EmailingVariant }) {
    return (
        <main className="min-h-full bg-slate-50 p-5 md:p-7">
            <div className="mx-auto max-w-[1500px]">
                {variant === "manager" ? <ManagerEmailingPage /> : <ClientEmailingPage />}
            </div>
        </main>
    );
}

export default EmailingReachInboxWorkspace;
