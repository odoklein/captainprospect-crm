"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Drawer } from "@/components/ui/Drawer";
import { PlaybookImportWorkspace } from "@/components/manager/PlaybookImportWorkspace";
import { Upload } from "lucide-react";
import { Badge } from "@/components/ui";
import { ArrowRight, Building2, ChevronDown, ChevronRight, ChevronUp, CircleAlert, Clock, Folder, History, Loader2, Mic, Plus, RefreshCw, Search, Target } from "lucide-react";
import Link from "next/link";
import { ClientOnboardingModal } from "@/components/manager/ClientOnboardingModal";
import { ClientDrawer } from "@/components/drawers";
import { CLIENTS_QUERY_KEY, LEEXI_RECAPS_QUERY_KEY } from "@/lib/query-keys";
import "./workspace.css";

interface ClientMission {
    id: string;
    name: string;
    endDate: string | null;
    isActive: boolean;
    status: string;
}

type ClientStatus = "ACTIVE" | "PAUSED" | "STOPPED";

interface Client {
    id: string;
    name: string;
    industry?: string;
    email?: string;
    phone?: string;
    status: ClientStatus;
    createdAt: string;
    missions: ClientMission[];
    _count: {
        missions: number;
        users: number;
    };

}

interface LeexiRecapItem {
    id: string;
    title: string;
    date: string;
    duration: number;
    recapText: string;
    companyName: string;
}

interface LeexiMatchedGroup {
    clientId: string;
    clientName: string;
    recaps: LeexiRecapItem[];
}

interface LeexiRecapsData {
    matched: LeexiMatchedGroup[];
    unmatched: LeexiRecapItem[];
    totalRecaps: number;
    totalMatched: number;
    /** The saved Leexi key was refused and the server key answered. */
    warning?: string | null;
}

const STATUS = { ACTIVE: "Actif", PAUSED: "En pause", STOPPED: "Arrêté" } as const;
const CLIENT_FILTERS = [
    { id: "ALL", label: "Tous les clients", icon: Building2 },
    { id: "ATTENTION", label: "À suivre", icon: CircleAlert },
    { id: "ACTIVE", label: "Actifs", icon: Folder },
    { id: "PAUSED", label: "En pause", icon: Clock },
    { id: "STOPPED", label: "Arrêtés", icon: Folder },
] as const;

const WORKSPACE_CLIENTS_KEY = [...CLIENTS_QUERY_KEY, "workspace"] as const;

type Filter = (typeof CLIENT_FILTERS)[number]["id"];
type WorkspaceLocation = { client: string; mission?: string | null; tab?: string | null; espace?: string | null };

function searchText(value: string) {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function getAttention(client: Client) {
    if (client.status !== "ACTIVE") return null;
    const missions = client.missions ?? [];
    const draft = missions.find((mission) => mission.status === "DRAFT");
    if (draft) return { mission: draft, label: "Lancement à préparer", tab: "lancement" };
    const ending = missions.filter((mission) => {
        if (mission.status !== "ACTIVE" || !mission.endDate) return false;
        const days = Math.ceil((Date.parse(mission.endDate) - Date.now()) / 86_400_000);
        return days >= 0 && days <= 14;
    }).sort((a, b) => (a.endDate ?? "").localeCompare(b.endDate ?? ""))[0];
    if (ending) return { mission: ending, label: "Fin dans les 14 jours", tab: "general" };
    return null;
}

async function fetchClientsApi(): Promise<Client[]> {
    const clients: Client[] = [];
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
    const [showLeexiSection, setShowLeexiSection] = useState(false);
    const [expandedRecapId, setExpandedRecapId] = useState<string | null>(null);
    const [recent, setRecent] = useState<WorkspaceLocation | null>(null);

    const clientParam = searchParams.get("client");
    const missionParam = searchParams.get("mission");
    const missionTab = searchParams.get("tab") ?? "general";
    const clientTab = searchParams.get("espace") ?? "missions";
    const recentKey = session?.user?.id ? `cp:client-workspace:${session.user.id}` : null;

    function navigate(next: WorkspaceLocation | null) {
        const params = new URLSearchParams(window.location.search);
        for (const key of ["client", "mission", "tab", "espace"] as const) {
            const value = next?.[key];
            if (value) params.set(key, value);
            else params.delete(key);
        }
        const url = params.size ? `${pathname}?${params}` : pathname;
        if (url === window.location.pathname + window.location.search) return;
        window.history.pushState(null, "", url);
        document.querySelector(".cw-app-canvas")?.scrollTo({ top: 0 });
    }

    const { data: clients = [], isLoading, refetch: refetchClients, error: clientsError } = useQuery({
        queryKey: WORKSPACE_CLIENTS_KEY,
        queryFn: fetchClientsApi,
    });

    const { data: leexiData, isLoading: isLoadingLeexi, refetch: refetchLeexi, error: leexiErrorQuery } = useQuery({
        queryKey: LEEXI_RECAPS_QUERY_KEY,
        queryFn: fetchLeexiRecapsApi,
        retry: false,
        staleTime: 2 * 60 * 1000,
    });
    const leexiError = leexiErrorQuery?.message;

    useEffect(() => {
        if (!recentKey) return;
        try {
            if (clientParam) {
                const location = { client: clientParam, mission: missionParam, tab: missionTab, espace: clientTab };
                setRecent(location);
                window.localStorage.setItem(recentKey, JSON.stringify(location));
            } else {
                setRecent(JSON.parse(window.localStorage.getItem(recentKey) ?? "null"));
            }
        } catch {
            // Recent navigation is optional when browser storage is unavailable.
        }
    }, [recentKey, clientParam, missionParam, missionTab, clientTab]);

    const selectedClient = clients.find((client) => client.id === clientParam);
    const recentClient = clients.find((client) => client.id === recent?.client);
    const recentMission = recentClient?.missions?.find((mission) => mission.id === recent?.mission);
    const attention = clients.flatMap((client) => {
        const next = getAttention(client);
        return next ? [{ client, ...next }] : [];
    });
    const counts = {
        ALL: clients.length,
        ATTENTION: attention.length,
        ACTIVE: clients.filter((client) => client.status === "ACTIVE").length,
        PAUSED: clients.filter((client) => client.status === "PAUSED").length,
        STOPPED: clients.filter((client) => client.status === "STOPPED").length,
    };
    const query = searchText(searchQuery.trim());
    const filtered = clients.filter((client) => {
        const matchesScope = filter === "ALL" || (filter === "ATTENTION" ? Boolean(getAttention(client)) : client.status === filter);
        return matchesScope && searchText(`${client.name} ${client.industry ?? ""}`).includes(query);
    });

    function handleOnboardingSuccess() {
        queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
        queryClient.invalidateQueries({ queryKey: LEEXI_RECAPS_QUERY_KEY });
    }

    function handleCreateFromRecap(leexiCallId: string) {
        setInitialLeexiCallId(leexiCallId);
        setShowOnboardingModal(true);
    }

    if (isLoading || clientsError) {
        return <div className="cw-loading">
            {isLoading ? <><Loader2 className="animate-spin" /> Chargement des clients…</> : (
                <><p>{clientsError?.message}</p><button className="cw-button" onClick={() => refetchClients()}><RefreshCw /> Réessayer</button></>
            )}
        </div>;
    }

    return (
        <>
            {selectedClient ? (
                <ClientDrawer
                    key={selectedClient.id}
                    isOpen
                    client={selectedClient}
                    onClose={() => navigate(null)}
                    clientTab={clientTab}
                    onClientTabChange={(espace) => navigate({ client: selectedClient.id, espace })}
                    openMissionId={missionParam}
                    onOpenMission={(mission, tab) => navigate({ client: selectedClient.id, mission, tab: mission ? tab : null, espace: mission ? clientTab : "missions" })}
                    missionTab={missionTab}
                    onMissionTabChange={(tab) => navigate({ client: selectedClient.id, mission: missionParam, tab, espace: clientTab })}
                    onUpdate={(updated) => queryClient.setQueryData<Client[]>(WORKSPACE_CLIENTS_KEY, (previous) =>
                        previous?.map((client) => client.id === updated.id ? { ...client, ...updated, status: updated.status ?? client.status } : client)
                    )}
                    onDelete={() => { navigate(null); handleOnboardingSuccess(); }}
                />
            ) : (
                <div className="cw-shell">
                    <aside className="cw-tree">
                        <div className="cw-tree-title"><Building2 /> Espace clients</div>
                        <nav aria-label="Filtres du portefeuille">
                            {CLIENT_FILTERS.map(({ id, label, icon: Icon }) => (
                                <button key={id} className="cw-tree-link" aria-pressed={filter === id} onClick={() => setFilter(id)}>
                                    <Icon /><span>{label}</span><small>{counts[id]}</small>
                                </button>
                            ))}
                        </nav>
                    </aside>
                    <div className="cw-work">
                        <div className="cw-crumb"><span>Portefeuille</span><ChevronRight /><strong>Clients</strong></div>
                        <div className="cw-content">
                            <header className="cw-pagehead">
                                <div><h1>Clients</h1><p>Suivez vos clients, leurs missions et les prochains lancements.</p></div>
                                <div className="cw-actions">
                                    <button className="cw-button" onClick={() => setShowPlaybookImport(true)}><Upload /> Importer un playbook</button>
                                    <button className="cw-button cw-primary" onClick={() => setShowOnboardingModal(true)}><Plus /> Nouveau client</button>
                                </div>
                            </header>
                            <div className="cw-columns">
                                <section className="cw-panel cw-directory" aria-label="Annuaire clients">
                                    <header className="cw-panel-toolbar">
                                        <div><h2>{CLIENT_FILTERS.find((item) => item.id === filter)?.label}</h2><small>{filtered.length} client{filtered.length > 1 ? "s" : ""}</small></div>
                                        <label className="cw-search"><Search /><input type="search" aria-label="Rechercher un client" placeholder="Rechercher un client…" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} /></label>
                                    </header>
                                    {filtered.length ? (
                                        <div className="cw-table-scroll">
                                            <table className="cw-table">
                                                <thead><tr><th>Client</th><th>Statut</th><th>Missions</th><th>À suivre</th><th><span className="sr-only">Ouvrir</span></th></tr></thead>
                                                <tbody>
                                                    {filtered.map((client) => {
                                                        const next = getAttention(client);
                                                        const active = client.missions?.filter((mission) => mission.status === "ACTIVE").length ?? 0;
                                                        return (
                                                            <tr key={client.id} onClick={() => navigate({ client: client.id })}>
                                                                <td><button className="cw-record" onClick={(event) => { event.stopPropagation(); navigate({ client: client.id }); }}>
                                                                    <span className="cw-monogram">{client.name[0]?.toUpperCase() || "?"}</span>
                                                                    <span><strong>{client.name}</strong><small>{client.industry || "Secteur non renseigné"}</small></span>
                                                                </button></td>
                                                                <td><span className="cw-pill" data-tone={client.status === "ACTIVE" ? "green" : "neutral"}><i />{STATUS[client.status] ?? STATUS.ACTIVE}</span></td>
                                                                <td><strong className="cw-figures">{client._count.missions}</strong>{active > 0 && <small className="cw-subline">{active} en cours</small>}</td>
                                                                <td>{next ? <span className="cw-attention-label"><span />{next.label}</span> : <span className="cw-muted">—</span>}</td>
                                                                <td><ChevronRight className="cw-row-arrow" /></td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : <div className="cw-empty"><Building2 /><strong>{query || filter !== "ALL" ? "Aucun résultat" : "Aucun client"}</strong><p>{query || filter !== "ALL" ? "Essayez une autre recherche ou changez de filtre." : "Ajoutez un client pour créer sa première mission."}</p></div>}
                                </section>
                                <aside className="cw-context" aria-label="Suivi du portefeuille">
                                    {recent && recentClient && (
                                        <section className="cw-panel cw-resume">
                                            <div className="cw-side-heading"><History /><h2>Reprendre</h2></div>
                                            <p>{recentClient.name}</p>
                                            <strong>{recentMission?.name ?? (recent.espace === "onboarding" ? "Intégration client" : "Espace client")}</strong>
                                            <button className="cw-text-button" onClick={() => navigate(recent.mission && !recentMission ? { client: recentClient.id } : recent)}>
                                                Reprendre ici <ArrowRight />
                                            </button>
                                        </section>
                                    )}
                                    <section className="cw-panel cw-side">
                                        <div className="cw-side-heading"><CircleAlert /><h2>À suivre</h2><span className="cw-count">{attention.length}</span></div>
                                        {attention.length ? attention.slice(0, 3).map(({ client, mission, label, tab }) => (
                                            <button className="cw-side-row" key={client.id} onClick={() => navigate({ client: client.id, mission: mission.id, tab })}>
                                                <span className="cw-side-icon"><Target /></span><span><strong>{mission.name}</strong><small>{client.name} · {label}</small></span><ChevronRight />
                                            </button>
                                        )) : <p className="cw-side-note">Aucun lancement ni fin de mission à suivre.</p>}
                                        {attention.length > 3 && <button className="cw-text-button" onClick={() => setFilter("ATTENTION")}>Voir tous les clients à suivre <ArrowRight /></button>}
                                    </section>
                                </aside>
                            </div>

            {/* Leexi Recaps Section */}
            {leexiData && leexiData.totalRecaps > 0 && (
                <div className="bg-white border border-accent-200 rounded-2xl overflow-hidden">
                    <button
                        onClick={() => setShowLeexiSection(!showLeexiSection)}
                        className="w-full flex items-center justify-between px-6 py-4 hover:bg-accent-50/50 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-accent-100 flex items-center justify-center">
                                <Mic className="w-5 h-5 text-accent-600" />
                            </div>
                            <div className="text-left">
                                <h3 className="text-sm font-semibold text-slate-900">
                                    Récapitulatifs Leexi
                                </h3>
                                <p className="text-xs text-slate-500">
                                    {leexiData.totalMatched} associé{leexiData.totalMatched > 1 ? "s" : ""} · {leexiData.unmatched.length} non associé{leexiData.unmatched.length > 1 ? "s" : ""}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="bg-accent-50 text-accent-700 border-accent-200 text-xs">
                                {leexiData.totalRecaps} recap{leexiData.totalRecaps > 1 ? "s" : ""}
                            </Badge>
                            {showLeexiSection ? (
                                <ChevronUp className="w-4 h-4 text-slate-400" />
                            ) : (
                                <ChevronDown className="w-4 h-4 text-slate-400" />
                            )}
                        </div>
                    </button>

                    {showLeexiSection && (
                        <div className="border-t border-accent-100 px-6 py-4 space-y-3 max-h-80 overflow-y-auto">
                            {leexiData.matched.map((group) => (
                                <div key={group.clientId} className="space-y-2">
                                    {group.recaps.map((recap) => (
                                        <div
                                            key={recap.id}
                                            className="p-3 bg-accent-50/50 border border-accent-100 rounded-xl"
                                        >
                                            <div
                                                className="flex items-center justify-between cursor-pointer"
                                                onClick={() => setExpandedRecapId(expandedRecapId === recap.id ? null : recap.id)}
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <Mic className="w-3.5 h-3.5 text-accent-500 flex-shrink-0" />
                                                    <span className="text-sm font-medium text-slate-900 truncate">
                                                        {recap.title}
                                                    </span>
                                                    <Badge variant="outline" className="text-[10px] bg-white border-accent-200 text-accent-600 flex-shrink-0">
                                                        {group.clientName}
                                                    </Badge>
                                                </div>
                                                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        {recap.date ? new Date(recap.date).toLocaleDateString("fr-FR") : ""}
                                                    </span>
                                                    {expandedRecapId === recap.id ? (
                                                        <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                                                    ) : (
                                                        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                                                    )}
                                                </div>
                                            </div>
                                            {expandedRecapId === recap.id && (
                                                <p className="mt-2 text-xs text-slate-600 whitespace-pre-line border-t border-accent-100 pt-2">
                                                    {recap.recapText.slice(0, 800)}
                                                    {recap.recapText.length > 800 && "..."}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ))}

                            {leexiData.unmatched.length > 0 && (
                                <div className="pt-2 border-t border-accent-100">
                                    <p className="text-xs font-medium text-slate-500 mb-2">
                                        Non associés ({leexiData.unmatched.length})
                                    </p>
                                    {leexiData.unmatched.slice(0, 5).map((recap) => (
                                        <div
                                            key={recap.id}
                                            className="p-3 bg-slate-50 border border-slate-100 rounded-xl mb-2"
                                        >
                                            <div
                                                className="flex items-center justify-between cursor-pointer"
                                                onClick={() => setExpandedRecapId(expandedRecapId === recap.id ? null : recap.id)}
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <Mic className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                                                    <span className="text-sm font-medium text-slate-700 truncate">
                                                        {recap.title}
                                                    </span>
                                                    {recap.companyName && (
                                                        <span className="text-[10px] text-slate-400">
                                                            ({recap.companyName})
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleCreateFromRecap(recap.id);
                                                        }}
                                                        className="text-[10px] font-medium px-2 py-0.5 bg-primary-50 text-primary-600 border border-primary-200 rounded-md hover:bg-primary-100 transition-colors"
                                                    >
                                                        Créer client
                                                    </button>
                                                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        {recap.date ? new Date(recap.date).toLocaleDateString("fr-FR") : ""}
                                                    </span>
                                                    {expandedRecapId === recap.id ? (
                                                        <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                                                    ) : (
                                                        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                                                    )}
                                                </div>
                                            </div>
                                            {expandedRecapId === recap.id && (
                                                <div className="mt-2 border-t border-slate-100 pt-2 space-y-2">
                                                    <p className="text-xs text-slate-600 whitespace-pre-line">
                                                        {recap.recapText.slice(0, 800)}
                                                        {recap.recapText.length > 800 && "..."}
                                                    </p>
                                                    <button
                                                        onClick={() => handleCreateFromRecap(recap.id)}
                                                        className="flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
                                                    >
                                                        <Plus className="w-3.5 h-3.5" />
                                                        Créer le client depuis cet appel
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {isLoadingLeexi && !leexiData && (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Chargement des récapitulatifs Leexi...
                </div>
            )}

            {leexiError && (
                <div className="text-xs text-red-500 flex items-center gap-1">
                    Leexi: {leexiError}
                </div>
            )}

            {leexiData?.warning && (
                <div className="text-xs text-amber-700 flex items-center gap-1">
                    Leexi : {leexiData.warning}
                </div>
            )}


                        </div>
                    </div>
                </div>
            )}

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

export default function ClientsPage() {
    return <Suspense fallback={null}><ClientsPageInner /></Suspense>;
}
