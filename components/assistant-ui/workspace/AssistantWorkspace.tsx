"use client";

/**
 * Captain AI workspace: conversation, decision desk, client overview and operations.
 *
 * URL state (nuqs): `?view=<captain|pilotage|client|operations>&folder=…&c=…&run=…`.
 * Opening /manager/assistant lands on the agency folder home, never on a
 * thread. Starting a conversation = POST conversations, then the first
 * message streams into the seeded thread — no refetch of the rail.
 *
 * A single thread stays mounted while changing full/docked layouts; the stream,
 * composer and attachments do not restart. Explicit work scope and conversation
 * scope are independent, so expansion cannot change a queue's client filter.
 * The rail is a docked column from md up
 * (folds to a strip of icons, remembered) and a left Sheet below.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSWRConfig } from "swr";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { ArrowLeft, BrainCircuit, Maximize2, PanelLeftOpen, SquarePen, X } from "lucide-react";
import { ASSISTANT_API, type FolderCard } from "@/lib/assistant/api-contract";
import { useFolders, useThread, useThreadActions } from "@/lib/assistant/client/thread-hooks";
import { refreshAgent } from "@/lib/agent/client/hooks";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/shadcn/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/shadcn/sheet";
import { TooltipProvider } from "@/components/ui/shadcn/tooltip";
import { FolderHome } from "./folder/FolderHome";
import { CommandPalette } from "./CommandPalette";
import { useIsMac } from "./Composer";
import { Rail, RailStrip, useLocalStorageState } from "./Rail";
import { Thread, type DraftScope, type StartRequest } from "./thread/Thread";
import { useChatStream } from "./useChatStream";
import { canKeepContextualThread, resolveWorkspaceView, WORKSPACE_VIEWS, type WorkspaceView } from "./workspace-state";
import { useBrand } from "@/lib/brand/client";

export const WORKSPACE_TABS = ["conversations", "memoire", "fichiers", "tableau", "agent"] as const;
export type WorkspaceTab = (typeof WORKSPACE_TABS)[number];

const NEW = "new";
const AGENCY = "agency";
const WIDE_QUERY = "(min-width: 1280px)";
const subscribeWide = (notify: () => void) => {
    const query = window.matchMedia(WIDE_QUERY);
    query.addEventListener("change", notify);
    return () => query.removeEventListener("change", notify);
};

export function AssistantWorkspace() {
    return (
        <NuqsAdapter>
            <TooltipProvider>
                <WorkspaceShell />
            </TooltipProvider>
        </NuqsAdapter>
    );
}

function WorkspaceShell() {
    const brand = useBrand();
    const toast = useToast();
    const actions = useThreadActions();
    const { mutate } = useSWRConfig();
    const stream = useChatStream();
    const isMac = useIsMac();
    const { data: folders } = useFolders();

    const [query, setQuery] = useQueryStates(
        {
            folder: parseAsString,
            c: parseAsString,
            tab: parseAsStringLiteral(WORKSPACE_TABS).withDefault("conversations"),
            view: parseAsStringLiteral(WORKSPACE_VIEWS),
            run: parseAsString,
        },
        { history: "push" },
    );
    const folderParam = query.folder && query.folder !== AGENCY ? query.folder : null;
    const conversationId = query.c && query.c !== NEW ? query.c : null;
    const view = resolveWorkspaceView(query.view, query.c, folderParam);
    const fullConversation = view === "captain";
    const returnView = useRef<WorkspaceView>(folderParam ? "client" : "pilotage");
    useEffect(() => { if (!fullConversation) returnView.current = view; }, [fullConversation, view]);
    const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE_QUERY).matches, () => false);
    const [dockEnabled, setDockEnabled] = useLocalStorageState<boolean>("captain-ai:discussion-dock", true);
    const [mobileDiscussion, setMobileDiscussion] = useState(false);
    const showDiscussion = fullConversation || (wide ? dockEnabled : mobileDiscussion);
    const { data: activeThread } = useThread(conversationId);

    const [railCollapsed, setRailCollapsed] = useLocalStorageState<boolean>("captain-ai:rail:collapsed", false);
    const [mobileRail, setMobileRail] = useState(false);
    const [paletteOpen, setPaletteOpen] = useState(false);

    // ---- Folder lookups -------------------------------------------------------------

    const folderById = useMemo(() => {
        const map = new Map<string, FolderCard>();
        for (const f of folders?.general ?? []) map.set(f.id, f);
        for (const c of folders?.clients ?? []) if (c.folder) map.set(c.folder.id, c.folder);
        return map;
    }, [folders]);
    const generalFolders = folders?.general ?? [];

    const draftScope: DraftScope = useMemo(() => {
        const folder = folderParam ? folderById.get(folderParam) : undefined;
        return {
            folderId: folderParam,
            folderName: folder?.name ?? (folderParam ? "Dossier" : "Pilotage"),
            folderKind: folder?.kind ?? (folderParam ? "GENERAL" : "AGENCY"),
            clientId: folder?.clientId ?? null,
        };
    }, [folderParam, folderById]);

    const activeKey = fullConversation ? "captain" : view === "operations" ? "operations" : folderParam ? `folder:${folderParam}` : "agency";

    // ---- Navigation --------------------------------------------------------------------

    const closeMobile = useCallback(() => setMobileRail(false), []);

    const openFolder = useCallback(
        (folderId: string | null) => {
            const currentThreadFolder = activeThread ? activeThread.conversation.folderId : folderParam;
            void setQuery({ folder: folderId ?? AGENCY, c: canKeepContextualThread(currentThreadFolder, folderId) ? query.c : null, tab: null, view: folderId ? "client" : "pilotage", run: null });
            setMobileDiscussion(false);
            closeMobile();
        },
        [setQuery, closeMobile, activeThread, folderParam, query.c],
    );

    const openConversation = useCallback(
        (id: string) => {
            const known = actions.getThread(id)?.conversation.folderId;
            const pinnedCard = folders?.pinnedConversations.find((c) => c.id === id);
            const folderId = known !== undefined ? known : (pinnedCard?.folderId ?? undefined);
            void setQuery({ c: id, view: "captain", ...(folderId !== undefined ? { folder: folderId ?? AGENCY } : {}) });
            closeMobile();
        },
        [actions, folders, setQuery, closeMobile],
    );

    const newConversation = useCallback(() => {
        void setQuery({ c: NEW, view: "captain", folder: activeThread ? activeThread.conversation.folderId ?? AGENCY : folderParam ?? AGENCY });
        closeMobile();
    }, [setQuery, closeMobile, activeThread, folderParam]);

    const creatingRef = useRef(false);
    const startConversation = useCallback(
        async (opts: { folderId: string | null; clientId?: string | null; missionId?: string | null; firstMessage?: string; deep?: boolean; attachments?: StartRequest["attachments"] }) => {
            if (creatingRef.current) return false;
            if (stream.sendingFor && opts.firstMessage) {
                toast.warning("Une réponse est déjà en cours", "Attendez la fin de la réponse ou arrêtez-la.");
                return false;
            }
            creatingRef.current = true;
            try {
                const card = await actions.createConversation({
                    folderId: opts.folderId,
                    clientId: opts.folderId ? null : (opts.clientId ?? null),
                    missionId: opts.missionId ?? null,
                });
                // Send first: the optimistic question is in the seeded thread and the
                // stream is marked live before the thread mounts, so its open-time
                // refresh cannot race the first message.
                if (opts.firstMessage?.trim()) {
                    void stream.send({ conversationId: card.id, text: opts.firstMessage, deep: opts.deep ?? false, attachments: opts.attachments });
                }
                // The folder the manager started from wins: the thread was created in it.
                await setQuery({ c: card.id, view, ...(fullConversation ? { folder: card.folderId ?? opts.folderId ?? AGENCY } : {}) });
                setDockEnabled(true);
                setMobileDiscussion(true);
                return true;
            } catch (e) {
                toast.error("Conversation non créée", e instanceof Error ? e.message : undefined);
                return false;
            } finally {
                creatingRef.current = false;
            }
        },
        [actions, setQuery, stream, toast, view, fullConversation, setDockEnabled],
    );

    const onDraftStart = useCallback(
        (request: StartRequest) =>
            startConversation({
                folderId: draftScope.folderId,
                clientId: draftScope.clientId,
                firstMessage: request.text,
                deep: request.deep,
                attachments: request.attachments,
            }),
        [startConversation, draftScope],
    );

    // Legacy thread URLs resolve their scope. Explicit layouts keep the work scope:
    // expanding a client discussion must not change an agency queue behind it.
    const currentFolder = query.folder ?? AGENCY;
    const onResolveFolder = useCallback(
        (folderId: string | null) => {
            const expected = folderId ?? AGENCY;
            if (!query.view && fullConversation && currentFolder !== expected) void setQuery({ folder: expected }, { history: "replace" });
        },
        [currentFolder, setQuery, fullConversation, query.view],
    );

    // ---- Global shortcuts ----------------------------------------------------------------

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const mod = e.metaKey || e.ctrlKey;
            if (!mod) return;
            const key = e.key.toLowerCase();
            if (key === "k" && !e.shiftKey) {
                e.preventDefault();
                setPaletteOpen((v) => !v);
            } else if (key === "o" && e.shiftKey) {
                e.preventDefault();
                newConversation();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [newConversation]);

    // ---- Layout ---------------------------------------------------------------------------

    // Below md the rail is a Sheet; from md up the folded rail keeps its own expand button.
    const railToggle = (
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => setMobileRail(true)} aria-label={`Afficher le panneau ${brand.assistantName}`} className="md:hidden">
            <PanelLeftOpen aria-hidden />
        </Button>
    );

    const openSearch = useCallback(() => {
        setPaletteOpen(true);
        closeMobile();
    }, [closeMobile]);

    const onConversationDeleted = useCallback(
        (id: string, folderId: string | null) => {
            if (id === conversationId) openFolder(folderId);
        },
        [conversationId, openFolder],
    );

    const openCaptain = () => { void setQuery({ view: "captain", c: query.c ?? NEW }); closeMobile(); };
    const openDiscussion = () => { setDockEnabled(true); setMobileDiscussion(true); };
    const discussConversation = (id: string) => { void setQuery({ c: id, view }); openDiscussion(); };
    const closeDiscussion = useCallback(() => {
        if (wide) setDockEnabled(false);
        setMobileDiscussion(false);
        requestAnimationFrame(() => document.querySelector<HTMLButtonElement>("[data-captain-discussion-toggle]")?.focus());
    }, [wide, setDockEnabled]);
    useEffect(() => {
        if (fullConversation || wide || !mobileDiscussion) return;
        const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented) closeDiscussion(); };
        window.addEventListener("keydown", onEscape);
        return () => window.removeEventListener("keydown", onEscape);
    }, [fullConversation, wide, mobileDiscussion, closeDiscussion]);
    const onDataChanged = () => { refreshAgent(); void mutate(key => typeof key === "string" && key.startsWith(ASSISTANT_API.folders)); };

    const railProps = {
        activeKey,
        isMac,
        onNewChat: newConversation,
        onOpenCaptain: openCaptain,
        onOpenOperations: () => { void setQuery({ view: "operations" }); closeMobile(); },
        onOpenSearch: openSearch,
        onOpenFolder: openFolder,
        onOpenConversation: openConversation,
        onConversationDeleted,
    };

    return (
        <div className="relative flex h-full min-h-0 w-full overflow-hidden bg-canvas">
            {/* Docked rail (md+): full, or folded to a strip of icons */}
            <aside
                aria-label={`Navigation ${brand.assistantName}`}
                className={cn(
                    "hidden h-full shrink-0 overflow-hidden border-r border-line bg-surface-2 md:block",
                    "motion-safe:transition-[width] motion-safe:duration-200 ease-snappy",
                    railCollapsed ? "w-14" : "w-[248px]",
                )}
            >
                {railCollapsed ? (
                    <RailStrip
                        activeKey={activeKey}
                        isMac={isMac}
                        onExpand={() => setRailCollapsed(false)}
                        onNewChat={newConversation}
                        onOpenCaptain={openCaptain}
                        onOpenOperations={railProps.onOpenOperations}
                        onOpenSearch={openSearch}
                        onOpenFolder={openFolder}
                    />
                ) : (
                    <div className="h-full w-[248px]">
                        <Rail {...railProps} onCollapse={() => setRailCollapsed(true)} />
                    </div>
                )}
            </aside>

            {/* Rail as a left Sheet (< md) */}
            <Sheet open={mobileRail} onOpenChange={setMobileRail}>
                <SheetContent side="left" showCloseButton={false} className="w-[min(300px,86vw)] gap-0 bg-surface-2 p-0 pt-[env(safe-area-inset-top)] md:hidden">
                    <SheetTitle className="sr-only">Navigation {brand.assistantName}</SheetTitle>
                    <SheetDescription className="sr-only">Dossiers, clients et conversations.</SheetDescription>
                    <Rail {...railProps} mobile onCollapse={closeMobile} />
                </SheetContent>
            </Sheet>

            <main className="relative flex min-h-0 min-w-0 flex-1 bg-canvas">
                <div className={cn("min-h-0 min-w-0 flex-1", fullConversation || (!wide && showDiscussion) ? "hidden" : "flex flex-col")}>
                    <FolderHome
                        key={folderParam ?? AGENCY}
                        folderId={folderParam}
                        leading={railToggle}
                        onOpenSearch={openSearch}
                        tab={query.tab}
                        view={fullConversation ? (folderParam ? "client" : "pilotage") : view}
                        selectedRunId={query.run}
                        onSelectRun={run => void setQuery({ run }, { history: "replace" })}
                        onDiscussConversation={discussConversation}
                        onOpenDiscussion={openDiscussion}
                        onTabChange={tab => void setQuery({ tab: (WORKSPACE_TABS as readonly string[]).includes(tab) ? (tab as WorkspaceTab) : null }, { history: "replace" })}
                        onOpenConversation={openConversation}
                        onStartConversation={startConversation}
                        onOpenFolder={openFolder}
                    />
                </div>
                {/* One persistent thread: expanding/reducing it never remounts its composer or files. */}
                <div data-captain-thread data-conversation-id={conversationId ?? "new"} className={cn("min-h-0 min-w-0 flex-col bg-surface", !showDiscussion ? "hidden" : "flex", fullConversation ? "flex-1" : wide ? cn("w-[clamp(340px,27vw,420px)] shrink-0 border-line", view === "operations" ? "order-first border-r" : "border-l") : "absolute inset-0 z-30")}>
                    {!fullConversation && <header className="flex min-h-16 shrink-0 items-center gap-2 border-b border-line-subtle px-3">
                        {!wide && <Button size="icon-sm" variant="ghost" aria-label="Revenir au travail" onClick={closeDiscussion}><ArrowLeft aria-hidden /></Button>}
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-600"><BrainCircuit className="size-4" aria-hidden /></span>
                        <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold text-ink">{brand.assistantName}</h2><p className="truncate text-[11px] text-ink-3">{activeThread?.conversation.folder?.name || draftScope.folderName}</p></div>
                        <Button size="icon-sm" variant="ghost" aria-label="Ouvrir la conversation en grand" onClick={openCaptain}><Maximize2 aria-hidden /></Button>
                        <Button size="icon-sm" variant="ghost" aria-label="Nouvelle conversation" onClick={newConversation}><SquarePen aria-hidden /></Button>
                        {wide && <Button size="icon-sm" variant="ghost" aria-label="Replier la discussion" onClick={closeDiscussion}><X aria-hidden /></Button>}
                    </header>}
                    <Thread
                        key={conversationId ?? `${NEW}:${folderParam ?? AGENCY}`}
                        conversationId={conversationId}
                        stream={stream}
                        draft={!conversationId ? draftScope : null}
                        onStart={onDraftStart}
                        onOpenConversation={openConversation}
                        onOpenFolder={openFolder}
                        onDeleted={(folderId) => openFolder(folderId)}
                        onResolveFolder={onResolveFolder}
                        onDataChanged={onDataChanged}
                        generalFolders={generalFolders}
                        leading={railToggle}
                        compact={!fullConversation}
                        inspector={fullConversation}
                        trailing={fullConversation ? <Button size="icon-sm" variant="ghost" aria-label="Retrouver le travail et garder la discussion ouverte" onClick={() => { void setQuery({ view: returnView.current }); setDockEnabled(true); }}><ArrowLeft aria-hidden /></Button> : undefined}
                        isMac={isMac}
                    />
                </div>
            </main>

            <CommandPalette
                open={paletteOpen}
                onOpenChange={setPaletteOpen}
                onOpenConversation={(id) => {
                    setPaletteOpen(false);
                    openConversation(id);
                }}
                onOpenFolder={(id) => {
                    setPaletteOpen(false);
                    openFolder(id);
                }}
                onNewConversation={() => {
                    setPaletteOpen(false);
                    newConversation();
                }}
            />
        </div>
    );
}
