"use client";

// ============================================
// REACHINBOX WORKSPACE — the one ReachInbox stats view.
//   variant="manager"            /manager/emails/campaigns: connect / change key,
//                                period KPIs, warmup, campaigns (search, sort,
//                                link to a client), per-campaign drill-down.
//   variant="manager" clientId   embed on /manager/clients/[id]: that client's
//                                linked campaigns only.
//   variant="client"             /client/portal/emailing: campaigns the manager
//                                linked to the logged-in client.
// Read-only: nothing here creates, edits, pauses or launches a campaign.
// No browser cache: what is shown is what was fetched, with its time.
// ============================================

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
    AlertTriangle,
    ArrowUpRight,
    KeyRound,
    Megaphone,
    MailOpen,
    RefreshCw,
    Reply,
    Send,
} from "lucide-react";
import {
    Button,
    Callout,
    Drawer,
    EmptyState,
    KpiCard,
    Modal,
    SegmentedControl,
    Skeleton,
    useToast,
} from "@/components/ui";
import { FIELD_BASE } from "@/components/ui/recipes";
import { cn } from "@/lib/utils";
import type { Campaign, CampaignAnalytics, DashboardData } from "./reachinbox-types";
import {
    CampaignStatus,
    CampaignTable,
    ConnectForm,
    Panel,
    StatTile,
    TrendBars,
    freshness,
    isActiveCampaign,
    isoDaysAgo,
    isoToday,
    num,
    pct,
    summarizeCampaigns,
} from "./reachinbox-ui";

type Preset = "7" | "30" | "90" | "custom";

interface Props {
    variant: "manager" | "client";
    clientId?: string;
}

export function ReachInboxWorkspace({ variant, clientId }: Props) {
    if (variant === "client") return <ClientCampaigns />;
    if (clientId) return <ClientPageEmbed clientId={clientId} />;
    return <ManagerWorkspace />;
}

export default ReachInboxWorkspace;

// ============================================
// MANAGER (hub)
// ============================================

function ManagerWorkspace() {
    const toast = useToast();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [range, setRange] = useState({ start: isoDaysAgo(30), end: isoToday() });
    const [draft, setDraft] = useState(range);
    const [preset, setPreset] = useState<Preset>("30");

    const [dashboard, setDashboard] = useState<DashboardData | null>(null);
    const [dashError, setDashError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

    const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
    const [campaignErrors, setCampaignErrors] = useState<{ mailboxEmail: string; message: string }[]>([]);
    const [campaignError, setCampaignError] = useState<string | null>(null);
    const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
    const [linkingId, setLinkingId] = useState<string | null>(null);

    const [selected, setSelected] = useState<Campaign | null>(null);
    const [keyOpen, setKeyOpen] = useState(searchParams.get("connect") === "1");

    // ?connect=1 comes from "Ajouter une boîte mail › ReachInbox": open once, then clean the URL.
    useEffect(() => {
        if (searchParams.get("connect") === "1") router.replace(pathname, { scroll: false });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadDashboard = useCallback(async (r: { start: string; end: string }, refresh = false) => {
        if (refresh) setIsRefreshing(true);
        setDashError(null);
        try {
            const params = new URLSearchParams({ startDate: r.start, endDate: r.end, includeCampaigns: "false" });
            const res = await fetch(`/api/email/reachinbox/dashboard?${params}`);
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.success) throw new Error(json.error || "ReachInbox ne répond pas");
            setDashboard(json.data);
            setFetchedAt(new Date());
        } catch (err) {
            setDashError(err instanceof Error ? err.message : "ReachInbox ne répond pas");
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    const loadCampaigns = useCallback(async () => {
        setCampaignError(null);
        try {
            const res = await fetch("/api/email/reachinbox/campaigns");
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.success) throw new Error(json.error || "Campagnes indisponibles");
            setCampaigns(json.data?.campaigns ?? []);
            setCampaignErrors(json.data?.errors ?? []);
        } catch (err) {
            setCampaignError(err instanceof Error ? err.message : "Campagnes indisponibles");
            setCampaigns((prev) => prev ?? []);
        }
    }, []);

    useEffect(() => {
        loadDashboard(range);
    }, [loadDashboard, range]);

    const connected = dashboard?.connected ?? false;

    useEffect(() => {
        if (!connected) return;
        loadCampaigns();
        (async () => {
            try {
                const res = await fetch("/api/clients?limit=500");
                const json = await res.json();
                const rows = Array.isArray(json.data) ? json.data : [];
                setClients(
                    rows
                        .map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))
                        .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "fr")),
                );
            } catch {
                setClients([]);
            }
        })();
    }, [connected, loadCampaigns]);

    const refreshAll = () => {
        loadDashboard(range, true);
        loadCampaigns();
    };

    const applyPreset = (p: Preset) => {
        setPreset(p);
        if (p === "custom") return;
        const next = { start: isoDaysAgo(Number(p)), end: isoToday() };
        setDraft(next);
        setRange(next);
    };

    const applyDraft = () => {
        if (!draft.start || !draft.end || draft.start > draft.end) {
            toast.error("Période invalide", "La date de début doit précéder la date de fin.");
            return;
        }
        setPreset("custom");
        setRange(draft);
    };

    const handleLink = async (campaign: Campaign, nextClientId: string) => {
        const previous = campaign.client ?? null;
        const nextClient = clients.find((c) => c.id === nextClientId) ?? null;
        setLinkingId(campaign.id);
        setCampaigns((prev) => prev?.map((c) => (c.id === campaign.id ? { ...c, client: nextClient } : c)) ?? prev);
        try {
            const res = await fetch("/api/email/reachinbox/campaigns/link", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ campaignId: campaign.id, campaignName: campaign.name, mailboxId: campaign.mailboxId ?? null, clientId: nextClientId || null }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.success) throw new Error(json.error || "Liaison impossible");
            toast.success(nextClient ? `Campagne liée à ${nextClient.name}` : "Liaison retirée", nextClient ? "Elle apparaît dans son portail client." : campaign.name);
        } catch (err) {
            setCampaigns((prev) => prev?.map((c) => (c.id === campaign.id ? { ...c, client: previous } : c)) ?? prev);
            toast.error("Liaison impossible", err instanceof Error ? err.message : undefined);
        } finally {
            setLinkingId(null);
        }
    };

    const errors = useMemo(() => {
        const all = [...(dashboard?.errors ?? []), ...campaignErrors];
        const seen = new Set<string>();
        return all.filter((e) => {
            const k = `${e.mailboxEmail}|${e.message}`;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        });
    }, [dashboard, campaignErrors]);

    const header = (
        <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
            <div className="min-w-0">
                <h1 className="text-xl font-bold tracking-tight text-ink">Campagnes</h1>
                <p className="mt-0.5 max-w-2xl text-[13px] text-ink-3">
                    Statistiques des campagnes ReachInbox, en lecture seule. Liez une campagne à un client pour qu&apos;il la voie dans son portail.
                </p>
            </div>
            {connected && (
                <div className="flex flex-wrap items-center gap-2">
                    {fetchedAt && <span className="text-xs text-ink-3">{freshness(fetchedAt)}</span>}
                    <Button variant="secondary" size="sm" leftIcon={<KeyRound className="size-3.5" />} onClick={() => setKeyOpen(true)}>
                        Clé API
                    </Button>
                    <Button variant="secondary" size="sm" leftIcon={<RefreshCw className={cn("size-3.5", isRefreshing && "motion-safe:animate-spin")} />} onClick={refreshAll} disabled={isRefreshing}>
                        Actualiser
                    </Button>
                </div>
            )}
        </div>
    );

    if (isLoading) {
        return (
            <>
                {header}
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[118px] rounded-card" />)}
                </div>
                <Skeleton className="mt-4 h-72 rounded-panel" />
            </>
        );
    }

    if (dashError && !dashboard) {
        return (
            <>
                {header}
                <Callout
                    tone="danger"
                    title="Impossible de joindre ReachInbox"
                    action={<Button size="sm" variant="secondary" onClick={() => loadDashboard(range, true)} isLoading={isRefreshing}>Réessayer</Button>}
                >
                    {dashError}
                </Callout>
            </>
        );
    }

    if (!connected) {
        return (
            <>
                {header}
                <div className="grid gap-6 rounded-card border border-line bg-surface p-6 lg:grid-cols-[1fr_400px]">
                    <div>
                        <span className="flex size-11 items-center justify-center rounded-control border border-line bg-surface-3 text-ink-2">
                            <Megaphone className="size-5" aria-hidden />
                        </span>
                        <h2 className="mt-4 text-lg font-semibold tracking-tight text-ink">Connecter ReachInbox</h2>
                        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-3">
                            Collez la clé API du compte ReachInbox. Le CRM l&apos;utilise côté serveur pour lire les campagnes et leurs statistiques ;
                            les campagnes restent gérées dans ReachInbox.
                        </p>
                        <ol className="mt-4 space-y-1.5 text-sm text-ink-2">
                            <li>1. Dans ReachInbox, ouvrez Settings › Integrations › API et copiez la clé.</li>
                            <li>2. Collez-la ici : elle est vérifiée auprès de ReachInbox puis stockée chiffrée.</li>
                            <li>3. Liez chaque campagne à son client pour la publier dans son portail.</li>
                        </ol>
                    </div>
                    <ConnectForm onConnected={() => loadDashboard(range, true)} />
                </div>
            </>
        );
    }

    const s = dashboard!.summary;
    const activeCount = campaigns?.filter(isActiveCampaign).length ?? 0;
    const linkedCount = campaigns?.filter((c) => c.client).length ?? 0;
    const conn = dashboard!.connection;

    return (
        <>
            {header}

            {(errors.length > 0 || dashError) && (
                <Callout
                    tone="danger"
                    className="mb-4"
                    title={`Lecture ReachInbox en erreur${conn ? ` (${conn.email})` : ""}`}
                    action={<Button size="sm" variant="secondary" onClick={refreshAll} isLoading={isRefreshing}>Réessayer</Button>}
                >
                    {dashError && <p>{dashError}</p>}
                    {errors.map((e, i) => (
                        <p key={i} className="break-words">{e.message}</p>
                    ))}
                    <p className="mt-1 text-xs">
                        Les chiffres affichés peuvent être incomplets. Si l&apos;erreur persiste, vérifiez la clé API.
                        {conn?.lastSyncAt && ` Dernière lecture réussie : ${new Date(conn.lastSyncAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}.`}
                    </p>
                </Callout>
            )}

            {/* Period */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
                <SegmentedControl<Preset>
                    ariaLabel="Période"
                    value={preset}
                    onChange={applyPreset}
                    options={[
                        { value: "7", label: "7 jours" },
                        { value: "30", label: "30 jours" },
                        { value: "90", label: "90 jours" },
                        { value: "custom", label: "Personnalisée" },
                    ]}
                />
                {preset === "custom" && (
                    <div className="flex flex-wrap items-center gap-2">
                        <input type="date" aria-label="Du" value={draft.start} max={draft.end} onChange={(e) => setDraft({ ...draft, start: e.target.value })} className={cn(FIELD_BASE, "h-8 w-auto px-2.5 text-[13px]")} />
                        <span className="text-xs text-ink-3">au</span>
                        <input type="date" aria-label="Au" value={draft.end} min={draft.start} max={isoToday()} onChange={(e) => setDraft({ ...draft, end: e.target.value })} className={cn(FIELD_BASE, "h-8 w-auto px-2.5 text-[13px]")} />
                        <Button size="sm" onClick={applyDraft} disabled={draft.start === range.start && draft.end === range.end}>
                            Appliquer
                        </Button>
                    </div>
                )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard label="Emails envoyés" value={num(s.sent)} icon={Send} hint={`${num(s.leads)} leads contactés`} />
                <KpiCard label="Ouverture" value={pct(s.openRate)} icon={MailOpen} tone="info" hint={`${num(s.opened)} ouvertures`} />
                <KpiCard label="Réponse" value={pct(s.replyRate)} icon={Reply} tone="success" hint={`${num(s.replied)} réponses · ${num(s.positiveReplies)} positives`} />
                <KpiCard label="Opportunités" value={num(s.opportunities)} icon={ArrowUpRight} tone="accent" hint={s.opportunitiesRate ? `${pct(s.opportunitiesRate)} des leads` : "Selon ReachInbox"} />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatTile label="Clics" value={pct(s.clickRate)} hint={`${num(s.clicked)} clics`} />
                <StatTile label="Rebonds" value={pct(s.bounceRate)} hint={`${num(s.bounced)} rebonds`} tone={s.bounceRate >= 5 ? "danger" : undefined} />
                <StatTile label="Réponses négatives" value={num(s.negativeReplies ?? 0)} hint={`${num(s.automaticLeadReplies ?? 0)} réponses automatiques`} />
                <StatTile label="Campagnes actives" value={campaigns ? num(activeCount) : "—"} hint={campaigns ? `${linkedCount} liée${linkedCount > 1 ? "s" : ""} à un client` : undefined} />
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                <Panel title="Envois par jour" description="Sur la période choisie.">
                    <TrendBars daily={dashboard!.daily} />
                </Panel>
                <Panel title="Délivrabilité (warmup)" description="Comptes d'envoi ReachInbox.">
                    {dashboard!.warmup ? (
                        <dl className="grid grid-cols-2 gap-2 p-4">
                            <StatTile label="Emails de warmup" value={num(dashboard!.warmup.warmupSent)} />
                            <StatTile label="Score de santé" value={num(dashboard!.warmup.healthScore)} />
                            <StatTile label="Boîte de réception" value={pct(dashboard!.warmup.inboxPlacement)} />
                            <StatTile label="Spam" value={pct(dashboard!.warmup.spamPlacement)} tone={dashboard!.warmup.spamPlacement >= 10 ? "danger" : undefined} />
                        </dl>
                    ) : (
                        <p className="px-4 py-10 text-center text-sm text-ink-3">Pas de données de warmup pour ce compte.</p>
                    )}
                </Panel>
            </div>

            <Panel
                className="mt-4"
                title="Campagnes"
                description="Statistiques cumulées depuis le lancement de chaque campagne. Cliquez une ligne pour le détail sur la période."
            >
                {campaignError && (
                    <div className="px-4 pt-3">
                        <Callout tone="danger" action={<Button size="sm" variant="secondary" onClick={loadCampaigns}>Réessayer</Button>}>
                            {campaignError}
                        </Callout>
                    </div>
                )}
                {campaigns === null ? (
                    <div className="space-y-2 p-4">
                        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-control" />)}
                    </div>
                ) : (
                    <CampaignTable
                        campaigns={campaigns}
                        clients={clients}
                        onLink={handleLink}
                        linkingId={linkingId}
                        onOpen={setSelected}
                        emptyText="Aucune campagne sur ce compte ReachInbox."
                    />
                )}
            </Panel>

            <p className="mt-3 text-[11px] text-ink-4">
                Lecture seule : les campagnes se créent, se lancent et se mettent en pause dans ReachInbox.
            </p>

            <CampaignDrawer campaign={selected} range={range} onClose={() => setSelected(null)} />

            <Modal isOpen={keyOpen} onClose={() => setKeyOpen(false)} title={connected ? "Changer la clé API ReachInbox" : "Connecter ReachInbox"} description={conn ? `Compte actuel : ${conn.email}` : undefined} size="sm">
                <ConnectForm
                    compact
                    onConnected={() => {
                        setKeyOpen(false);
                        refreshAll();
                    }}
                />
            </Modal>
        </>
    );
}

// ============================================
// CAMPAIGN DRILL-DOWN
// ============================================

function CampaignDrawer({ campaign, range, onClose }: { campaign: Campaign | null; range: { start: string; end: string }; onClose: () => void }) {
    const [data, setData] = useState<CampaignAnalytics | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const load = useCallback(async () => {
        if (!campaign) return;
        setIsLoading(true);
        setError(null);
        setData(null);
        try {
            const params = new URLSearchParams({ startDate: range.start, endDate: range.end });
            const res = await fetch(`/api/email/reachinbox/campaigns/${encodeURIComponent(campaign.id)}/analytics?${params}`);
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.success) throw new Error(json.error || "Détail indisponible");
            setData(json.data);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Détail indisponible");
        } finally {
            setIsLoading(false);
        }
    }, [campaign, range]);

    useEffect(() => {
        load();
    }, [load]);

    if (!campaign) return null;
    const period = `du ${new Date(range.start).toLocaleDateString("fr-FR")} au ${new Date(range.end).toLocaleDateString("fr-FR")}`;

    return (
        <Drawer isOpen onClose={onClose} size="lg" title={campaign.name} description={`Détail ${period}`}>
            <div className="mb-4 flex flex-wrap items-center gap-2">
                <CampaignStatus status={campaign.status} />
                {campaign.client ? (
                    <Link href={`/manager/clients/${campaign.client.id}`} className="text-sm font-medium text-link hover:underline">
                        {campaign.client.name}
                    </Link>
                ) : (
                    <span className="text-xs text-ink-3">Liée à aucun client</span>
                )}
                {campaign.mailboxEmail && <span className="text-xs text-ink-4">· {campaign.mailboxEmail}</span>}
            </div>

            {isLoading ? (
                <div className="grid grid-cols-2 gap-2">
                    {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[72px] rounded-panel" />)}
                </div>
            ) : error ? (
                <Callout tone="danger" title="Détail indisponible" action={<Button size="sm" variant="secondary" onClick={load}>Réessayer</Button>}>
                    {error}
                </Callout>
            ) : data ? (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                        <StatTile label="Envoyés" value={num(data.sent)} hint={`${num(data.sequenceStartedCount || data.leads)} leads contactés`} />
                        <StatTile label="Ouvertures uniques" value={num(data.uniqueEmailOpenedCount || data.opened)} hint={pct(data.openRate)} />
                        <StatTile label="Réponses uniques" value={num(data.uniqueRepliesCount || data.replied)} hint={pct(data.replyRate)} />
                        <StatTile label="Clics uniques" value={num(data.uniqueLinkClickedCount || data.clicked)} hint={pct(data.clickRate)} />
                        <StatTile label="Réponses positives" value={num(data.positiveReplies)} />
                        <StatTile label="Réponses négatives" value={num(data.negativeReplies ?? 0)} />
                        <StatTile label="Réponses automatiques" value={num(data.automaticLeadReplies ?? 0)} hint="Absences, répondeurs" />
                        <StatTile label="Opportunités" value={num(data.opportunities)} hint={data.campaignOpportunityRate ? pct(data.campaignOpportunityRate) : undefined} />
                        <StatTile label="Rebonds" value={num(data.bounced)} hint={pct(data.bounceRate)} tone={data.bounceRate >= 5 ? "danger" : undefined} />
                        <StatTile label="Étapes de séquence" value={num(data.campaignStepAnalyticsResult?.length ?? 0)} hint={data.subsequencesStepAnalyticsResults?.length ? `${data.subsequencesStepAnalyticsResults.length} sous-séquences` : undefined} />
                    </div>
                    <Panel title="Envois par jour">
                        <TrendBars daily={data.daily ?? []} />
                    </Panel>
                </div>
            ) : null}
        </Drawer>
    );
}

// ============================================
// CLIENT PAGE EMBED (manager, /manager/clients/[id])
// ============================================

function ClientPageEmbed({ clientId }: { clientId: string }) {
    const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setError(null);
        try {
            const res = await fetch(`/api/email/reachinbox/campaigns?clientId=${encodeURIComponent(clientId)}`);
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.success) throw new Error(json.error || "Campagnes indisponibles");
            setCampaigns(json.data?.campaigns ?? []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Campagnes indisponibles");
            setCampaigns((prev) => prev ?? []);
        }
    }, [clientId]);

    useEffect(() => {
        load();
    }, [load]);

    return (
        <Panel
            title="Campagnes emailing (ReachInbox)"
            description="Campagnes liées à ce client, visibles dans son portail."
            action={
                <Link href="/manager/emails/campaigns" className="text-xs font-semibold text-link hover:underline">
                    Gérer les liaisons
                </Link>
            }
        >
            {error && (
                <div className="px-4 pt-3">
                    <Callout tone="danger" action={<Button size="sm" variant="secondary" onClick={load}>Réessayer</Button>}>{error}</Callout>
                </div>
            )}
            {campaigns === null ? (
                <div className="space-y-2 p-4">
                    <Skeleton className="h-10 rounded-control" />
                    <Skeleton className="h-10 rounded-control" />
                </div>
            ) : (
                <CampaignTable
                    campaigns={campaigns}
                    toolbar={campaigns.length > 5}
                    emptyText="Aucune campagne liée. Liez-en une depuis Email › Campagnes."
                />
            )}
        </Panel>
    );
}

// ============================================
// CLIENT PORTAL
// ============================================

function ClientCampaigns() {
    const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

    const load = useCallback(async (refresh = false) => {
        if (refresh) setIsRefreshing(true);
        setError(null);
        try {
            const res = await fetch("/api/client/reachinbox-campaigns");
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.success) throw new Error(json.error || "Statistiques indisponibles");
            setCampaigns(json.data?.campaigns ?? []);
            setFetchedAt(new Date());
        } catch (err) {
            setError(err instanceof Error ? err.message : "Statistiques indisponibles");
            setCampaigns((prev) => prev ?? []);
        } finally {
            setIsRefreshing(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const summary = useMemo(() => summarizeCampaigns(campaigns ?? []), [campaigns]);
    const active = campaigns?.filter(isActiveCampaign).length ?? 0;

    if (campaigns === null) {
        return (
            <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[118px] rounded-card" />)}
                </div>
                <Skeleton className="h-60 rounded-panel" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-ink-3">{fetchedAt ? freshness(fetchedAt) : ""}</p>
                <Button size="sm" variant="secondary" leftIcon={<RefreshCw className={cn("size-3.5", isRefreshing && "motion-safe:animate-spin")} />} onClick={() => load(true)} disabled={isRefreshing}>
                    Actualiser
                </Button>
            </div>

            {error && (
                <Callout tone="danger" title="Statistiques indisponibles" action={<Button size="sm" variant="secondary" onClick={() => load(true)}>Réessayer</Button>}>
                    {error}
                </Callout>
            )}

            {campaigns.length === 0 && !error ? (
                <EmptyState
                    icon={Megaphone}
                    title="Aucune campagne emailing pour l'instant"
                    description="Vos campagnes apparaissent ici dès que votre chargé de compte les rattache à votre espace."
                />
            ) : campaigns.length > 0 ? (
                <>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <KpiCard label="Emails envoyés" value={num(summary.sent)} icon={Send} hint={`${active} campagne${active > 1 ? "s" : ""} active${active > 1 ? "s" : ""}`} />
                        <KpiCard label="Ouverture" value={pct(summary.openRate)} icon={MailOpen} tone="info" hint={`${num(summary.opened)} ouvertures`} />
                        <KpiCard label="Réponse" value={pct(summary.replyRate)} icon={Reply} tone="success" hint={`${num(summary.replied)} réponses`} />
                        <KpiCard label="Rebond" value={pct(summary.bounceRate)} icon={AlertTriangle} tone="warning" hint={`${num(summary.bounced)} rebonds`} />
                    </div>
                    <Panel title="Vos campagnes" description="Statistiques cumulées depuis le lancement de chaque campagne.">
                        <CampaignTable campaigns={campaigns} toolbar={campaigns.length > 5} emptyText="" />
                    </Panel>
                </>
            ) : null}
        </div>
    );
}
