"use client";

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Drawer } from "@/components/ui/Drawer";
import { PlaybookImportWorkspace } from "@/components/manager/PlaybookImportWorkspace";
import {
    ArrowRight, Building2, ChevronDown, ChevronRight, ChevronUp, CircleAlert, Clock, Folder,
    History, Loader2, Mic, MoreHorizontal, Plus, RefreshCw, Search, Upload,
} from "lucide-react";
import { ClientOnboardingModal } from "@/components/manager/ClientOnboardingModal";
import { ClientDrawer } from "@/components/drawers";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/shadcn/dropdown-menu";
import { CLIENTS_QUERY_KEY, LEEXI_RECAPS_QUERY_KEY } from "@/lib/query-keys";
import { collectAttention } from "@/lib/manager/attention";
import { InboxItem, type WorkspaceClient, type WorkspaceClientStatus as ClientStatus, type WorkspaceLocation } from "@/components/manager/workspace/InboxItem";
import { requestFocus, useFocusRequest } from "@/components/manager/workspace/focus";
import { buildWorkspaceSearch, normalizeStoredLocation, parseWorkspace } from "@/components/manager/workspace/url";
import "./workspace.css";

interface LeexiRecapItem {
    id: string;
    title: string;
    date: string;
    duration: number;
    recapText: string;
    companyName: string;
}

interface LeexiRecapsData {
    matched: { clientId: string; clientName: string; recaps: LeexiRecapItem[] }[];
    unmatched: LeexiRecapItem[];
    totalRecaps: number;
    totalMatched: number;
    /** The saved Leexi key was refused and the server key answered. */
    warning?: string | null;
}

const STATUS = { ACTIVE: "Actif", PAUSED: "En pause", STOPPED: "Arrêté" } as const;
const FILTERS = [
    { id: "ALL", label: "Tous les clients", icon: Building2 },
    { id: "ATTENTION", label: "À traiter", icon: CircleAlert },
    { id: "ACTIVE", label: "Actifs", icon: Folder },
    { id: "PAUSED", label: "En pause", icon: Clock },
    { id: "STOPPED", label: "Arrêtés", icon: Folder },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

const WORKSPACE_CLIENTS_KEY = [...CLIENTS_QUERY_KEY, "workspace"] as const;
const INBOX_PREVIEW = 6;

function searchText(value: string) {
    return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

async function fetchClientsApi(): Promise<WorkspaceClient[]> {
    const clients: WorkspaceClient[] = [];
    let page = 1;
    while (true) {
        const res = await fetch(`/api/clients?view=workspace&page=${page}&limit=100`);
        const json = await res.json();
        if (!json.success) throw new Error(json.error || "Impossible de charger les clients");
        clients.push(...json.data);
        if (!json.pagination?.hasMore) return clients;
        page += 1;
    }
}

async function fetchLeexiRecapsApi(): Promise<LeexiRecapsData | null> {
    const res = await fetch("/api/leexi/recaps");
    const json = await res.json();
    if (json.success) return json.data;
    if (res.status !== 503) throw new Error(json.error || "Erreur Leexi");
    return null;
}

function clientAttention(client: WorkspaceClient) {
    return collectAttention([client])[0] ?? null;
}

function ClientsPageInner() {
    const queryClient = useQueryClient();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { data: session } = useSession();
    const [searchQuery, setSearchQuery] = useState("");
    const [filter, setFilter] = useState<Filter>("ALL");
    const [showOnboardingModal, setShowOnboardingModal] = useState(false);
    const [initialLeexiCallId, setInitialLeexiCallId] = useState<string>();
    const [showPlaybookImport, setShowPlaybookImport] = useState(false);
    const [importBusy, setImportBusy] = useState(false);
    const [showLeexi, setShowLeexi] = useState(false);
    const [expandedRecapId, setExpandedRecapId] = useState<string | null>(null);
    const directoryScroll = useRef(0);
    const directoryRef = useRef<HTMLElement>(null);

    const { client: clientParam, mission: missionParam, page: pageParam, tab: missionTab, espace: clientTab } = parseWorkspace(searchParams);
    const recentKey = session?.user?.id ? `cp:client-workspace:${session.user.id}` : null;

    useLayoutEffect(() => {
        const canvas = document.querySelector<HTMLElement>(".cw-app-canvas");
        if (!canvas) return;
        if (!clientParam) {
            canvas.scrollTop = directoryScroll.current;
            const remember = () => { directoryScroll.current = canvas.scrollTop; };
            canvas.addEventListener("scroll", remember, { passive: true });
            return () => canvas.removeEventListener("scroll", remember);
        }
        // A new place starts at the top. Mission panels (?tab=) open over the page and leave it where it is.
        canvas.scrollTop = 0;
    }, [clientParam, missionParam, clientTab, pageParam]);

    /** Moves inside the workspace without a page load; `focus` names what takes focus next. */
    function navigate(next: WorkspaceLocation | null, focus?: string) {
        const search = buildWorkspaceSearch(next, window.location.search);
        const url = search ? `${pathname}?${search}` : pathname;
        if (url === window.location.pathname + window.location.search) return;
        if (!clientParam) directoryScroll.current = document.querySelector(".cw-app-canvas")?.scrollTop ?? 0;
        // A drawer panel or the launch checklist takes focus itself; anything else lands on the new heading.
        const ownsFocus = Boolean(next?.tab && next.tab !== "general");
        requestFocus(focus ?? (ownsFocus ? null : next ? "heading" : clientParam ? `client:${clientParam}` : null));
        window.history.pushState(null, "", url);
    }

    const { data: clients = [], isLoading, refetch: refetchClients, error: clientsError } = useQuery({
        queryKey: WORKSPACE_CLIENTS_KEY,
        queryFn: fetchClientsApi,
    });

    const { data: leexiData, isLoading: isLoadingLeexi, error: leexiErrorQuery } = useQuery({
        queryKey: LEEXI_RECAPS_QUERY_KEY,
        queryFn: fetchLeexiRecapsApi,
        retry: false,
        staleTime: 2 * 60 * 1000,
    });

    // Remember where the manager was, to offer « Reprendre » on the directory.
    useEffect(() => {
        if (!recentKey || !clientParam) return;
        try {
            window.localStorage.setItem(recentKey, JSON.stringify({ client: clientParam, mission: missionParam, tab: missionTab, espace: clientTab, page: pageParam }));
        } catch {
            // Recent navigation is optional when browser storage is unavailable.
        }
    }, [recentKey, clientParam, missionParam, missionTab, clientTab, pageParam]);
    const recent = useMemo<WorkspaceLocation | null>(() => {
        if (!recentKey || clientParam || typeof window === "undefined") return null;
        try {
            return normalizeStoredLocation(JSON.parse(window.localStorage.getItem(recentKey) ?? "null"));
        } catch {
            return null;
        }
    }, [recentKey, clientParam]);

    useFocusRequest(clientParam, isLoading, filter);

    const selectedClient = clients.find((client) => client.id === clientParam);
    const recentClient = clients.find((client) => client.id === recent?.client);
    const recentMission = recentClient?.missions?.find((mission) => mission.id === recent?.mission);
    const attention = collectAttention(clients);
    const counts: Record<Filter, number> = {
        ALL: clients.length,
        ATTENTION: new Set(attention.map((item) => item.clientId)).size,
        ACTIVE: clients.filter((client) => client.status === "ACTIVE").length,
        PAUSED: clients.filter((client) => client.status === "PAUSED").length,
        STOPPED: clients.filter((client) => client.status === "STOPPED").length,
    };
    const runningMissions = clients.reduce((total, client) => total + client.missions.filter((mission) => mission.status === "ACTIVE").length, 0);
    const draftMissions = clients.reduce((total, client) => total + client.missions.filter((mission) => mission.status === "DRAFT").length, 0);
    const query = searchText(searchQuery.trim());
    const filtered = clients.filter((client) => {
        const inScope = filter === "ALL" || (filter === "ATTENTION" ? Boolean(clientAttention(client)) : client.status === filter);
        return inScope && searchText(`${client.name} ${client.industry ?? ""}`).includes(query);
    });

    function handleOnboardingSuccess() {
        queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
        queryClient.invalidateQueries({ queryKey: LEEXI_RECAPS_QUERY_KEY });
    }

    function handleCreateFromRecap(leexiCallId: string) {
        setShowLeexi(false);
        setInitialLeexiCallId(leexiCallId);
        setShowOnboardingModal(true);
    }

    function showAllAttention() {
        setFilter("ATTENTION");
        setSearchQuery("");
        requestFocus("directory");
        directoryRef.current?.scrollIntoView({ block: "start" });
    }

    if (isLoading || clientsError) {
        return <div className="cw-loading" role={clientsError ? "alert" : "status"}>
            {isLoading ? <><Loader2 className="animate-spin" /> Chargement des clients…</> : (
                <><p>{clientsError?.message}</p><button className="cw-button" onClick={() => refetchClients()}><RefreshCw /> Réessayer</button></>
            )}
        </div>;
    }

    const leexiCount = leexiData?.totalRecaps ?? 0;

    return (
        <>
            {selectedClient ? (
                <ClientDrawer
                    key={selectedClient.id}
                    isOpen
                    client={selectedClient}
                    allClients={clients}
                    onNavigate={navigate}
                    onClose={() => navigate(null)}
                    clientTab={clientTab}
                    onClientTabChange={(espace) => navigate({ client: selectedClient.id, espace })}
                    openMissionId={missionParam}
                    openPageId={pageParam}
                    onOpenMission={(mission, tab) => navigate(
                        { client: selectedClient.id, mission, tab: mission ? tab : null, espace: mission ? clientTab : "missions" },
                        mission ? undefined : missionParam ? `mission:${missionParam}` : undefined,
                    )}
                    missionTab={missionTab}
                    onMissionTabChange={(tab) => {
                        const params = new URLSearchParams(window.location.search);
                        if (tab === "general") params.delete("tab"); else params.set("tab", tab);
                        // Panels open over the mission page: no new history entry, no focus jump.
                        window.history.replaceState(null, "", `${pathname}?${params}`);
                    }}
                    onUpdate={(updated) => queryClient.setQueryData<WorkspaceClient[]>(WORKSPACE_CLIENTS_KEY, (previous) =>
                        previous?.map((client) => client.id === updated.id ? { ...client, ...updated, status: (updated.status ?? client.status) as ClientStatus } : client)
                    )}
                    onDelete={() => { navigate(null); handleOnboardingSuccess(); }}
                />
            ) : (
                <div className="cw-shell">
                    <aside className="cw-tree" aria-label="Portefeuille clients">
                        <div className="cw-tree-group"><span>Portefeuille</span></div>
                        <nav aria-label="Filtres du portefeuille">
                            {FILTERS.map(({ id, label, icon: Icon }) => (
                                <button key={id} className="cw-tree-link" aria-pressed={filter === id} onClick={() => setFilter(id)}>
                                    <Icon /><span>{label}</span><small>{counts[id]}</small>
                                </button>
                            ))}
                        </nav>
                        {recent && recentClient && <>
                            <div className="cw-tree-group"><span>Reprendre</span></div>
                            <nav aria-label="Dernier emplacement">
                                <button className="cw-tree-link" onClick={() => navigate(recent.mission && !recentMission ? { client: recentClient.id } : recent)} title={`${recentClient.name}${recentMission ? ` › ${recentMission.name}` : ""}`}>
                                    <History /><span>{recentMission?.name ?? recentClient.name}</span>
                                </button>
                            </nav>
                        </>}
                    </aside>
                    <div className="cw-work">
                        <nav className="cw-crumb" aria-label="Fil d’Ariane">
                            <div className="cw-crumb-trail"><span className="cw-crumb-current" aria-current="page"><span>Clients</span></span></div>
                            <div className="cw-crumb-actions">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild><button className="cw-button cw-quiet cw-icon-button" aria-label="Plus d’actions"><MoreHorizontal /></button></DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-60">
                                        <DropdownMenuItem onSelect={() => setShowPlaybookImport(true)}><Upload />Importer un playbook</DropdownMenuItem>
                                        {leexiCount > 0 && <DropdownMenuItem onSelect={() => setShowLeexi(true)}><Mic />Appels Leexi ({leexiCount})</DropdownMenuItem>}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                                <button className="cw-button cw-primary" onClick={() => setShowOnboardingModal(true)}><Plus /> Nouveau client</button>
                            </div>
                        </nav>
                        <div className="cw-layout">
                            <main className="cw-doc" data-width="wide">
                                <header className="cw-doc-head">
                                    <h1 className="cw-doc-title" tabIndex={-1} data-focus-key="heading">Clients</h1>
                                    <p className="cw-doc-lede">{counts.ACTIVE} client{counts.ACTIVE > 1 ? "s" : ""} actif{counts.ACTIVE > 1 ? "s" : ""} · {runningMissions} mission{runningMissions > 1 ? "s" : ""} en cours · {draftMissions} en préparation</p>
                                </header>

                                <section className="cw-section" aria-labelledby="cw-inbox-title">
                                    <div className="cw-section-head">
                                        <h2 id="cw-inbox-title">À traiter <small>{attention.length}</small></h2>
                                    </div>
                                    {attention.length ? (
                                        <div className="cw-inbox">
                                            {attention.slice(0, INBOX_PREVIEW).map((item) => <InboxItem key={item.mission.id} item={item} onOpen={navigate} />)}
                                            {attention.length > INBOX_PREVIEW && <div className="cw-inbox-foot">
                                                <span>{attention.length - INBOX_PREVIEW} autre{attention.length - INBOX_PREVIEW > 1 ? "s" : ""} point{attention.length - INBOX_PREVIEW > 1 ? "s" : ""}</span>
                                                <button className="cw-text-button" onClick={showAllAttention}>Voir les clients concernés <ArrowRight /></button>
                                            </div>}
                                        </div>
                                    ) : <p className="cw-empty-line"><span>Rien à traiter : aucun lancement bloqué, aucune mission sans équipe ni fin proche.</span></p>}
                                </section>

                                <section className="cw-section cw-directory" ref={directoryRef} aria-labelledby="cw-directory-title">
                                    <div className="cw-section-head">
                                        <h2 id="cw-directory-title" tabIndex={-1} data-focus-key="directory">{FILTERS.find((item) => item.id === filter)?.label} <small>{filtered.length}</small></h2>
                                        <label className="cw-search"><Search /><input type="search" aria-label="Rechercher un client" placeholder="Rechercher un client…" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} /></label>
                                    </div>
                                    {filtered.length ? (
                                        <div className="cw-table-scroll">
                                            <table className="cw-table">
                                                <thead><tr><th>Client</th><th>Statut</th><th>Missions</th><th>À traiter</th><th><span className="sr-only">Ouvrir</span></th></tr></thead>
                                                <tbody>
                                                    {filtered.map((client) => {
                                                        const next = clientAttention(client);
                                                        const active = client.missions?.filter((mission) => mission.status === "ACTIVE").length ?? 0;
                                                        return (
                                                            <tr key={client.id} onClick={() => navigate({ client: client.id })}>
                                                                <td><button className="cw-record" data-focus-key={`client:${client.id}`} title={client.name} onClick={(event) => { event.stopPropagation(); navigate({ client: client.id }); }}>
                                                                    <span className="cw-monogram">{client.name[0]?.toUpperCase() || "?"}</span>
                                                                    <span><strong>{client.name}</strong><small>{client.industry || "Secteur non renseigné"}</small></span>
                                                                </button></td>
                                                                <td><span className="cw-pill" data-tone={client.status === "ACTIVE" ? "success" : client.status === "PAUSED" ? "warning" : undefined}><i />{STATUS[client.status] ?? STATUS.ACTIVE}</span></td>
                                                                <td><strong className="cw-figures">{client._count.missions}</strong>{active > 0 && <small className="cw-subline">{active} en cours</small>}</td>
                                                                <td>{next ? <span className="cw-attention-label" title={`${next.mission.name} · ${next.detail}`}><span />{next.label}</span> : <span className="cw-muted">—</span>}</td>
                                                                <td><ChevronRight className="cw-row-arrow" aria-hidden /></td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : <div className="cw-empty"><Building2 /><strong>{query || filter !== "ALL" ? "Aucun résultat" : "Aucun client"}</strong><p>{query || filter !== "ALL" ? "Essayez une autre recherche ou changez de filtre." : "Ajoutez un client pour créer sa première mission."}</p></div>}
                                </section>
                            </main>

                            <aside className="cw-rail" aria-label="Portefeuille">
                                {recent && recentClient && <section className="cw-rail-section">
                                    <h2 className="cw-rail-title">Reprendre</h2>
                                    <button className="cw-shortcut" onClick={() => navigate(recent.mission && !recentMission ? { client: recentClient.id } : recent)}>
                                        <History /><span>{recentMission ? `${recentClient.name} › ${recentMission.name}` : recentClient.name}</span><ArrowRight />
                                    </button>
                                </section>}
                                <section className="cw-rail-section">
                                    <h2 className="cw-rail-title">Portefeuille</h2>
                                    <dl className="cw-props">
                                        <div><dt>Clients actifs</dt><dd className="cw-figures">{counts.ACTIVE}</dd></div>
                                        <div><dt>Missions en cours</dt><dd className="cw-figures">{runningMissions}</dd></div>
                                        <div><dt>En préparation</dt><dd className="cw-figures">{draftMissions}</dd></div>
                                        <div><dt>Points à traiter</dt><dd className="cw-figures">{attention.filter((item) => item.tone !== "success").length}</dd></div>
                                    </dl>
                                </section>
                                {(leexiCount > 0 || isLoadingLeexi || leexiErrorQuery || leexiData?.warning) && <section className="cw-rail-section">
                                    <h2 className="cw-rail-title">Appels Leexi {leexiCount > 0 && <small>{leexiCount}</small>}</h2>
                                    {isLoadingLeexi && !leexiData && <p className="cw-hint" role="status">Chargement des récapitulatifs…</p>}
                                    {leexiErrorQuery && <p className="cw-hint" role="alert">Leexi indisponible : {leexiErrorQuery.message}</p>}
                                    {leexiData?.warning && <p className="cw-hint">{leexiData.warning}</p>}
                                    {leexiCount > 0 && <>
                                        <p className="cw-hint"><strong>{leexiData!.unmatched.length}</strong> appel{leexiData!.unmatched.length > 1 ? "s" : ""} sans client : créez le client depuis l’appel.</p>
                                        <button className="cw-shortcut" onClick={() => setShowLeexi(true)}><Mic /><span>Voir les récapitulatifs</span><ChevronRight /></button>
                                    </>}
                                </section>}
                            </aside>
                        </div>
                    </div>
                </div>
            )}

            <Drawer isOpen={showLeexi} onClose={() => setShowLeexi(false)} title="Récapitulatifs Leexi" description={`${leexiData?.totalMatched ?? 0} associé(s) · ${leexiData?.unmatched.length ?? 0} sans client`} size="lg" bodyClassName="p-4 sm:p-5">
                {leexiData && <div className="space-y-2">
                    {leexiData.unmatched.length > 0 && <p className="px-1 pb-1 text-xs font-semibold text-ink-3">Sans client</p>}
                    {leexiData.unmatched.map((recap) => (
                        <RecapRow key={recap.id} recap={recap} expanded={expandedRecapId === recap.id} onToggle={() => setExpandedRecapId(expandedRecapId === recap.id ? null : recap.id)}
                            action={<button className="cw-button" data-size="sm" onClick={() => handleCreateFromRecap(recap.id)}><Plus /> Créer le client</button>} />
                    ))}
                    {leexiData.matched.length > 0 && <p className="px-1 pb-1 pt-3 text-xs font-semibold text-ink-3">Associés à un client</p>}
                    {leexiData.matched.flatMap((group) => group.recaps.map((recap) => (
                        <RecapRow key={recap.id} recap={recap} expanded={expandedRecapId === recap.id} onToggle={() => setExpandedRecapId(expandedRecapId === recap.id ? null : recap.id)}
                            action={<button className="cw-button" data-size="sm" onClick={() => { setShowLeexi(false); navigate({ client: group.clientId }); }}>{group.clientName}</button>} />
                    )))}
                </div>}
            </Drawer>

            <Drawer isOpen={showPlaybookImport} onClose={() => { if (!importBusy) setShowPlaybookImport(false); }} title="Importer un playbook" description="Document → vérification → dossier client" size="xl" bodyClassName="p-0" closeOnOverlay={false} closeOnEscape={!importBusy} showCloseButton={!importBusy}>
                {showPlaybookImport && <PlaybookImportWorkspace onBusyChange={setImportBusy} onCancel={() => setShowPlaybookImport(false)} onImported={async (clientId) => {
                    await refetchClients();
                    setShowPlaybookImport(false);
                    navigate({ client: clientId, espace: "missions" });
                }} />}
            </Drawer>
            <ClientOnboardingModal
                isOpen={showOnboardingModal}
                onClose={() => { setShowOnboardingModal(false); setInitialLeexiCallId(undefined); }}
                onSuccess={handleOnboardingSuccess}
                onOpenClient={(client) => {
                    setShowOnboardingModal(false);
                    setInitialLeexiCallId(undefined);
                    navigate({ client, espace: "onboarding" });
                }}
                initialLeexiCallId={initialLeexiCallId}
            />
        </>
    );
}

function RecapRow({ recap, expanded, onToggle, action }: { recap: LeexiRecapItem; expanded: boolean; onToggle: () => void; action: React.ReactNode }) {
    return (
        <div className="rounded-xl border border-line bg-surface">
            <div className="flex items-center gap-2 p-3">
                <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={onToggle} aria-expanded={expanded}>
                    <Mic className="h-3.5 w-3.5 shrink-0 text-ink-3" />
                    <span className="truncate text-sm font-medium text-ink">{recap.title}</span>
                    {recap.companyName && <span className="truncate text-xs text-ink-3">{recap.companyName}</span>}
                    <span className="ml-auto shrink-0 text-xs text-ink-3">{recap.date ? new Date(recap.date).toLocaleDateString("fr-FR") : ""}</span>
                    {expanded ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-ink-4" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-4" />}
                </button>
                {action}
            </div>
            {expanded && <p className="whitespace-pre-line border-t border-line-subtle px-3 py-2 text-xs leading-5 text-ink-2">
                {recap.recapText.slice(0, 800)}{recap.recapText.length > 800 && "…"}
            </p>}
        </div>
    );
}

export default function ClientsPage() {
    return <Suspense fallback={null}><ClientsPageInner /></Suspense>;
}
