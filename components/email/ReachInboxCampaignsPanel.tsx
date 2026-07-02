"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
    AlertTriangle,
    BarChart3,
    CheckCircle2,
    Inbox,
    KeyRound,
    Loader2,
    MailOpen,
    MousePointerClick,
    RefreshCw,
    Reply,
    Send,
    ShieldCheck,
    TrendingUp,
    Users,
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

interface DashboardData {
    connected: boolean;
    connection: {
        id: string;
        email: string;
        displayName: string | null;
        lastSyncAt: string | null;
        lastError: string | null;
        createdAt: string;
    } | null;
    summary: {
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
    };
    daily: Array<{
        date: string;
        sent: number;
        opened: number;
        replied: number;
        clicked: number;
        bounced: number;
    }>;
    campaigns: Campaign[];
    warmup: {
        warmupSent: number;
        inboxPlacement: number;
        spamPlacement: number;
        healthScore: number;
    } | null;
    errors: { mailboxEmail: string; message: string }[];
}

interface ReachInboxCampaignsPanelProps {
    variant: "manager" | "client";
    clientId?: string;
}

const ACTIVE_STATUSES = new Set(["ACTIVE", "RUNNING"]);

function dateDaysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().slice(0, 10);
}

function today(): string {
    return new Date().toISOString().slice(0, 10);
}

function pct(value: number): string {
    return `${value.toLocaleString("fr-FR")}%`;
}

function number(value: number): string {
    return value.toLocaleString("fr-FR");
}

function rate(part: number, total: number): string {
    if (!total) return "-";
    return pct(Math.round((part / total) * 1000) / 10);
}

function KpiCard({
    icon: Icon,
    label,
    value,
    helper,
}: {
    icon: typeof Send;
    label: string;
    value: string;
    helper?: string;
}) {
    return (
        <div className="rounded-[12px] border p-4" style={{ background: "var(--cp-raised)", borderColor: "var(--cp-border)" }}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--cp-ink-3)" }}>
                        {label}
                    </p>
                    <p className="mt-2 text-[24px] font-semibold tabular-nums leading-none" style={{ color: "var(--cp-ink)" }}>
                        {value}
                    </p>
                    {helper && (
                        <p className="mt-2 text-[12px]" style={{ color: "var(--cp-ink-3)" }}>
                            {helper}
                        </p>
                    )}
                </div>
                <div className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
                    style={{ background: "var(--cp-green-soft)", color: "var(--cp-green)" }}>
                    <Icon className="w-4 h-4" />
                </div>
            </div>
        </div>
    );
}

function OnboardingCard({ onConnected }: { onConnected: () => void }) {
    const { error: showError, success } = useToast();
    const [apiKey, setApiKey] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setIsSubmitting(true);
        try {
            const res = await fetch("/api/email/reachinbox/connect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ apiKey }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) {
                throw new Error(json.error || "Impossible de connecter ReachInbox");
            }
            setApiKey("");
            success("ReachInbox connecte", "Les statistiques sont maintenant disponibles.");
            onConnected();
        } catch (err) {
            showError("Connexion impossible", err instanceof Error ? err.message : "Cle API invalide");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="cpds-card p-6 overflow-hidden" style={{ fontFamily: "var(--cp-font)" }}>
            <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
                <div>
                    <div className="w-11 h-11 rounded-[12px] flex items-center justify-center"
                        style={{ background: "var(--cp-green)", color: "var(--cp-on-inverse)" }}>
                        <KeyRound className="w-5 h-5" />
                    </div>
                    <h2 className="mt-5 text-[24px] font-semibold tracking-tight" style={{ color: "var(--cp-ink)" }}>
                        Connecter ReachInbox
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: "var(--cp-ink-3)" }}>
                        Ajoutez uniquement la cle API ReachInbox. Captain Prospect l'utilise cote serveur pour lire les statistiques
                        et afficher le dashboard manager. Aucune creation, modification, pause ou lancement de campagne n'est expose ici.
                    </p>
                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                        {[
                            ["1", "Coller la cle API"],
                            ["2", "Validation ReachInbox"],
                            ["3", "Dashboard stats"],
                        ].map(([step, label]) => (
                            <div key={step} className="rounded-[10px] border px-3 py-3"
                                style={{ borderColor: "var(--cp-border)", background: "var(--cp-sunken)" }}>
                                <span className="text-[11px] font-semibold" style={{ color: "var(--cp-green)" }}>Etape {step}</span>
                                <p className="mt-1 text-[13px] font-semibold" style={{ color: "var(--cp-ink)" }}>{label}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="rounded-[12px] border p-4"
                    style={{ background: "var(--cp-raised)", borderColor: "var(--cp-border)" }}>
                    <label htmlFor="reachinbox-api-key" className="text-[12px] font-semibold" style={{ color: "var(--cp-ink)" }}>
                        Cle API ReachInbox
                    </label>
                    <input
                        id="reachinbox-api-key"
                        type="password"
                        value={apiKey}
                        onChange={(event) => setApiKey(event.target.value)}
                        placeholder="ri_..."
                        className="mt-2 w-full h-11 rounded-[10px] border px-3 text-sm outline-none"
                        style={{ borderColor: "var(--cp-border)", color: "var(--cp-ink)", background: "var(--cp-canvas)" }}
                        autoComplete="off"
                    />
                    <p className="mt-2 text-[11px]" style={{ color: "var(--cp-ink-3)" }}>
                        ReachInbox Dashboard puis Settings, Integrations, API.
                    </p>
                    <button
                        type="submit"
                        disabled={isSubmitting || apiKey.trim().length < 12}
                        className="mt-4 h-10 w-full rounded-[10px] inline-flex items-center justify-center gap-2 text-[13px] font-semibold transition-all disabled:opacity-50"
                        style={{ background: "var(--cp-green)", color: "var(--cp-on-inverse)" }}
                    >
                        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                        Connecter et charger les stats
                    </button>
                </form>
            </div>
        </div>
    );
}

function TrendBars({ daily }: { daily: DashboardData["daily"] }) {
    const points = daily.slice(-14);
    const max = Math.max(...points.map((point) => point.sent), 1);

    return (
        <div className="rounded-[12px] border p-4" style={{ background: "var(--cp-raised)", borderColor: "var(--cp-border)" }}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" style={{ color: "var(--cp-green)" }} />
                    <h3 className="text-sm font-semibold" style={{ color: "var(--cp-ink)" }}>Tendance d'envoi</h3>
                </div>
                <span className="text-[11px]" style={{ color: "var(--cp-ink-3)" }}>14 derniers points</span>
            </div>
            {points.length === 0 ? (
                <p className="py-10 text-center text-sm" style={{ color: "var(--cp-ink-3)" }}>
                    Aucune donnee journaliere retournee par ReachInbox.
                </p>
            ) : (
                <div className="mt-5 flex h-40 items-end gap-2">
                    {points.map((point) => (
                        <div key={point.date} className="flex-1 min-w-0">
                            <div className="rounded-t-[6px]" title={`${point.date}: ${point.sent} envoyes`}
                                style={{
                                    height: `${Math.max(8, (point.sent / max) * 140)}px`,
                                    background: "var(--cp-green)",
                                }}
                            />
                            <p className="mt-2 truncate text-center text-[10px]" style={{ color: "var(--cp-ink-3)" }}>
                                {point.date.slice(5)}
                            </p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function CampaignTable({ campaigns }: { campaigns: Campaign[] }) {
    const visible = campaigns.slice(0, 12);

    return (
        <div className="rounded-[12px] border overflow-hidden" style={{ background: "var(--cp-raised)", borderColor: "var(--cp-border)" }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--cp-border)" }}>
                <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" style={{ color: "var(--cp-green)" }} />
                    <h3 className="text-sm font-semibold" style={{ color: "var(--cp-ink)" }}>Campagnes lues depuis ReachInbox</h3>
                </div>
                <span className="text-[11px]" style={{ color: "var(--cp-ink-3)" }}>{campaigns.length} campagnes</span>
            </div>

            {visible.length === 0 ? (
                <p className="py-10 text-center text-sm" style={{ color: "var(--cp-ink-3)" }}>
                    Aucune campagne ReachInbox trouvee pour cette cle.
                </p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead style={{ background: "var(--cp-sunken)" }}>
                            <tr className="text-left text-[11px] uppercase tracking-wide" style={{ color: "var(--cp-ink-3)" }}>
                                <th className="px-4 py-3 font-semibold">Campagne</th>
                                <th className="px-4 py-3 font-semibold">Statut</th>
                                <th className="px-4 py-3 font-semibold">Leads</th>
                                <th className="px-4 py-3 font-semibold">Envoyes</th>
                                <th className="px-4 py-3 font-semibold">Ouverture</th>
                                <th className="px-4 py-3 font-semibold">Reponse</th>
                                <th className="px-4 py-3 font-semibold">Rebonds</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map((campaign) => (
                                <tr key={campaign.id} style={{ borderTop: "1px solid var(--cp-border)" }}>
                                    <td className="px-4 py-3">
                                        <p className="font-semibold max-w-[280px] truncate" style={{ color: "var(--cp-ink)" }}>{campaign.name}</p>
                                        {campaign.mailboxEmail && (
                                            <p className="text-[11px]" style={{ color: "var(--cp-ink-3)" }}>{campaign.mailboxEmail}</p>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={cn("inline-flex h-6 items-center rounded-full px-2 text-[11px] font-semibold",
                                            ACTIVE_STATUSES.has(campaign.status) ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>
                                            {campaign.status.toLowerCase()}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 tabular-nums" style={{ color: "var(--cp-ink-2)" }}>{number(campaign.stats.leads)}</td>
                                    <td className="px-4 py-3 tabular-nums font-semibold" style={{ color: "var(--cp-ink)" }}>{number(campaign.stats.sent)}</td>
                                    <td className="px-4 py-3 tabular-nums" style={{ color: "var(--cp-ink-2)" }}>{rate(campaign.stats.opened, campaign.stats.sent)}</td>
                                    <td className="px-4 py-3 tabular-nums" style={{ color: "var(--cp-ink-2)" }}>{rate(campaign.stats.replied, campaign.stats.sent)}</td>
                                    <td className="px-4 py-3 tabular-nums" style={{ color: campaign.stats.bounced > 0 ? "var(--cp-danger)" : "var(--cp-ink-2)" }}>
                                        {number(campaign.stats.bounced)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function ManagerReachInboxDashboard() {
    const { error: showError } = useToast();
    const [data, setData] = useState<DashboardData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [startDate, setStartDate] = useState(dateDaysAgo(30));
    const [endDate, setEndDate] = useState(today());

    const fetchDashboard = useCallback(async (refresh = false) => {
        if (refresh) setIsRefreshing(true);
        else setIsLoading(true);
        try {
            const params = new URLSearchParams({ startDate, endDate });
            const res = await fetch(`/api/email/reachinbox/dashboard?${params.toString()}`);
            const json = await res.json();
            if (!res.ok || !json.success) {
                throw new Error(json.error || "Impossible de charger ReachInbox");
            }
            setData(json.data);
        } catch (err) {
            showError("Erreur ReachInbox", err instanceof Error ? err.message : "Chargement impossible");
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [endDate, showError, startDate]);

    useEffect(() => {
        fetchDashboard();
    }, [fetchDashboard]);

    const activeCampaigns = useMemo(() => {
        return data?.campaigns.filter((campaign) => ACTIVE_STATUSES.has(campaign.status)).length ?? 0;
    }, [data]);

    if (isLoading || !data) {
        return (
            <div className="cpds-card flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--cp-green)" }} />
            </div>
        );
    }

    if (!data.connected) {
        return <OnboardingCard onConnected={() => fetchDashboard(true)} />;
    }

    return (
        <div className="space-y-5" style={{ fontFamily: "var(--cp-font)" }}>
            <div className="cpds-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-[12px] flex items-center justify-center"
                            style={{ background: "var(--cp-green)", color: "var(--cp-on-inverse)" }}>
                            <CheckCircle2 className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-[18px] font-semibold" style={{ color: "var(--cp-ink)" }}>
                                Dashboard ReachInbox
                            </h2>
                            <p className="text-[12px]" style={{ color: "var(--cp-ink-3)" }}>
                                Connecte avec {data.connection?.email}. Lecture seule depuis l'API ReachInbox.
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)}
                            className="h-9 rounded-[10px] border px-3 text-[12px]"
                            style={{ borderColor: "var(--cp-border)", background: "var(--cp-raised)", color: "var(--cp-ink)" }} />
                        <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)}
                            className="h-9 rounded-[10px] border px-3 text-[12px]"
                            style={{ borderColor: "var(--cp-border)", background: "var(--cp-raised)", color: "var(--cp-ink)" }} />
                        <button type="button" onClick={() => fetchDashboard(true)} disabled={isRefreshing}
                            className="h-9 px-3 rounded-[10px] inline-flex items-center gap-2 text-[12px] font-semibold disabled:opacity-50"
                            style={{ background: "var(--cp-green)", color: "var(--cp-on-inverse)" }}>
                            <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
                            Actualiser
                        </button>
                    </div>
                </div>
            </div>

            {data.errors.length > 0 && (
                <div className="rounded-[12px] border px-4 py-3 flex items-start gap-3"
                    style={{ borderColor: "var(--cp-border)", background: "var(--cp-warn-soft)", color: "var(--cp-warn)" }}>
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <div className="text-[12px]">
                        {data.errors.map((entry, index) => (
                            <p key={`${entry.mailboxEmail}-${index}`}>
                                <span className="font-semibold">{entry.mailboxEmail}</span>: {entry.message}
                            </p>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard icon={Send} label="Emails envoyes" value={number(data.summary.sent)} helper={`${activeCampaigns} campagnes actives`} />
                <KpiCard icon={MailOpen} label="Taux ouverture" value={pct(data.summary.openRate)} helper={`${number(data.summary.opened)} ouvertures`} />
                <KpiCard icon={Reply} label="Taux reponse" value={pct(data.summary.replyRate)} helper={`${number(data.summary.replied)} reponses`} />
                <KpiCard icon={AlertTriangle} label="Taux rebond" value={pct(data.summary.bounceRate)} helper={`${number(data.summary.bounced)} rebonds`} />
                <KpiCard icon={Users} label="Leads" value={number(data.summary.leads)} helper="Depuis ReachInbox" />
                <KpiCard icon={MousePointerClick} label="Taux clic" value={pct(data.summary.clickRate)} helper={`${number(data.summary.clicked)} clics`} />
                <KpiCard icon={Reply} label="Reponses positives" value={number(data.summary.positiveReplies)} helper="Si retourne par l'API" />
                <KpiCard icon={TrendingUp} label="Opportunites" value={number(data.summary.opportunities)} helper="Si retourne par l'API" />
            </div>

            <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
                <TrendBars daily={data.daily} />
                <div className="rounded-[12px] border p-4" style={{ background: "var(--cp-raised)", borderColor: "var(--cp-border)" }}>
                    <div className="flex items-center gap-2">
                        <Inbox className="w-4 h-4" style={{ color: "var(--cp-green)" }} />
                        <h3 className="text-sm font-semibold" style={{ color: "var(--cp-ink)" }}>Warmup et inbox</h3>
                    </div>
                    {data.warmup ? (
                        <div className="mt-4 space-y-3">
                            <KpiCard icon={Send} label="Warmup envoyes" value={number(data.warmup.warmupSent)} />
                            <KpiCard icon={Inbox} label="Inbox placement" value={pct(data.warmup.inboxPlacement)} />
                            <KpiCard icon={AlertTriangle} label="Spam placement" value={pct(data.warmup.spamPlacement)} />
                            <KpiCard icon={ShieldCheck} label="Health score" value={number(data.warmup.healthScore)} />
                        </div>
                    ) : (
                        <p className="py-10 text-center text-sm" style={{ color: "var(--cp-ink-3)" }}>
                            Donnees warmup non disponibles pour cette cle.
                        </p>
                    )}
                </div>
            </div>

            <CampaignTable campaigns={data.campaigns} />
        </div>
    );
}

function ClientReachInboxCampaigns({ clientId }: { clientId?: string }) {
    const { error: showError } = useToast();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const url = clientId
                    ? `/api/email/reachinbox/campaigns?clientId=${clientId}`
                    : "/api/client/reachinbox-campaigns";
                const res = await fetch(url);
                const json = await res.json();
                if (!json.success) throw new Error(json.error || "Chargement impossible");
                setCampaigns(json.data?.campaigns ?? []);
            } catch (err) {
                showError("Erreur ReachInbox", err instanceof Error ? err.message : "Chargement impossible");
            } finally {
                setIsLoading(false);
            }
        })();
    }, [clientId, showError]);

    if (isLoading) {
        return (
            <div className="cpds-card flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--cp-green)" }} />
            </div>
        );
    }

    return <CampaignTable campaigns={campaigns} />;
}

export function ReachInboxCampaignsPanel({ variant, clientId }: ReachInboxCampaignsPanelProps) {
    if (variant === "manager" && !clientId) {
        return <ManagerReachInboxDashboard />;
    }

    return <ClientReachInboxCampaigns clientId={clientId} />;
}

export default ReachInboxCampaignsPanel;
