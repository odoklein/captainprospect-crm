"use client";

/**
 * Captain AI workspace: rail + (folder home | thread) + command palette.
 *
 * URL state (nuqs): `?folder=<folderId|agency>&c=<conversationId|new>&tab=<…>`.
 * Opening /manager/assistant lands on the agency folder home, never on a
 * thread. Starting a conversation = POST conversations, then the first
 * message streams into the seeded thread — no refetch of the rail.
 *
 * The streaming hook lives here, above the threads, so moving around does
 * not cut an answer being written. The rail is a docked column from md up
 * (folds to a strip of icons, remembered) and a left Sheet below.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { PanelLeftOpen } from "lucide-react";
import type { FolderCard } from "@/lib/assistant/api-contract";
import { useFolders, useThreadActions } from "@/lib/assistant/client/thread-hooks";
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

export const WORKSPACE_TABS = ["conversations", "memoire", "fichiers", "tableau", "agent"] as const;
export type WorkspaceTab = (typeof WORKSPACE_TABS)[number];

const NEW = "new";
const AGENCY = "agency";

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
    const toast = useToast();
    const actions = useThreadActions();
    const stream = useChatStream();
    const isMac = useIsMac();
    const { data: folders } = useFolders();

    const [query, setQuery] = useQueryStates(
        {
            folder: parseAsString,
            c: parseAsString,
            tab: parseAsStringLiteral(WORKSPACE_TABS).withDefault("conversations"),
        },
        { history: "push" },
    );
    const folderParam = query.folder && query.folder !== AGENCY ? query.folder : null;
    const conversationId = query.c && query.c !== NEW ? query.c : null;
    const isDraft = query.c === NEW;

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
            folderName: folder?.name ?? (folderParam ? "Dossier" : "Vue agence"),
            folderKind: folder?.kind ?? (folderParam ? "GENERAL" : "AGENCY"),
            clientId: folder?.clientId ?? null,
        };
    }, [folderParam, folderById]);

    const pinnedIds = useMemo(() => new Set((folders?.pinnedConversations ?? []).map((c) => c.id)), [folders]);
    const activeKey = conversationId && pinnedIds.has(conversationId) ? `conv:${conversationId}` : folderParam ? `folder:${folderParam}` : "agency";

    // ---- Navigation --------------------------------------------------------------------

    const closeMobile = useCallback(() => setMobileRail(false), []);

    const openFolder = useCallback(
        (folderId: string | null) => {
            void setQuery({ folder: folderId ?? AGENCY, c: null, tab: null });
            closeMobile();
        },
        [setQuery, closeMobile],
    );

    const openConversation = useCallback(
        (id: string) => {
            const known = actions.getThread(id)?.conversation.folderId;
            const pinnedCard = folders?.pinnedConversations.find((c) => c.id === id);
            const folderId = known !== undefined ? known : (pinnedCard?.folderId ?? undefined);
            void setQuery({ c: id, ...(folderId !== undefined ? { folder: folderId ?? AGENCY } : {}) });
            closeMobile();
        },
        [actions, folders, setQuery, closeMobile],
    );

    const newConversation = useCallback(() => {
        void setQuery({ c: NEW });
        closeMobile();
    }, [setQuery, closeMobile]);

    const startConversation = useCallback(
        async (opts: { folderId: string | null; clientId?: string | null; missionId?: string | null; firstMessage?: string; deep?: boolean; attachments?: StartRequest["attachments"] }) => {
            if (stream.sendingFor && opts.firstMessage) {
                toast.warning("Une réponse est déjà en cours", "Attendez la fin de la réponse ou arrêtez-la.");
                return;
            }
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
                await setQuery({ c: card.id, folder: card.folderId ?? opts.folderId ?? AGENCY });
            } catch (e) {
                toast.error("Conversation non créée", e instanceof Error ? e.message : undefined);
            }
        },
        [actions, setQuery, stream, toast],
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

    // Opened thread: keep the rail's folder in step with where the thread lives.
    const currentFolder = query.folder ?? AGENCY;
    const onResolveFolder = useCallback(
        (folderId: string | null) => {
            const expected = folderId ?? AGENCY;
            if (currentFolder !== expected) void setQuery({ folder: expected }, { history: "replace" });
        },
        [currentFolder, setQuery],
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
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => setMobileRail(true)} aria-label="Afficher le panneau Captain AI" className="md:hidden">
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

    const railProps = {
        activeKey,
        isMac,
        onNewChat: newConversation,
        onOpenSearch: openSearch,
        onOpenFolder: openFolder,
        onOpenConversation: openConversation,
        onConversationDeleted,
    };

    return (
        <div className="relative flex h-full min-h-0 w-full overflow-hidden bg-canvas">
            {/* Docked rail (md+): full, or folded to a strip of icons */}
            <aside
                aria-label="Navigation Captain AI"
                className={cn(
                    "hidden h-full shrink-0 overflow-hidden border-r border-line bg-surface-2 md:block",
                    "transition-[width] duration-300 ease-snappy",
                    railCollapsed ? "w-14" : "w-[272px]",
                )}
            >
                {railCollapsed ? (
                    <RailStrip
                        activeKey={activeKey}
                        isMac={isMac}
                        onExpand={() => setRailCollapsed(false)}
                        onNewChat={newConversation}
                        onOpenSearch={openSearch}
                        onOpenFolder={openFolder}
                    />
                ) : (
                    <div className="h-full w-[272px]">
                        <Rail {...railProps} onCollapse={() => setRailCollapsed(true)} />
                    </div>
                )}
            </aside>

            {/* Rail as a left Sheet (< md) */}
            <Sheet open={mobileRail} onOpenChange={setMobileRail}>
                <SheetContent side="left" showCloseButton={false} className="w-[min(300px,86vw)] gap-0 bg-surface-2 p-0 pt-[env(safe-area-inset-top)] md:hidden">
                    <SheetTitle className="sr-only">Navigation Captain AI</SheetTitle>
                    <SheetDescription className="sr-only">Dossiers, clients et conversations.</SheetDescription>
                    <Rail {...railProps} mobile onCollapse={closeMobile} />
                </SheetContent>
            </Sheet>

            <main className="flex min-w-0 flex-1 flex-col bg-surface">
                {conversationId || isDraft ? (
                    <Thread
                        key={conversationId ?? `${NEW}:${folderParam ?? AGENCY}`}
                        conversationId={conversationId}
                        stream={stream}
                        draft={isDraft ? draftScope : null}
                        onStart={onDraftStart}
                        onOpenConversation={openConversation}
                        onOpenFolder={openFolder}
                        onDeleted={(folderId) => openFolder(folderId)}
                        onResolveFolder={onResolveFolder}
                        generalFolders={generalFolders}
                        leading={railToggle}
                        isMac={isMac}
                    />
                ) : (
                    <div className="flex min-h-0 flex-1 flex-col">
                        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line-subtle px-3 md:hidden">
                            {railToggle}
                            <span className="truncate text-[13.5px] font-semibold text-ink">
                                {folderParam ? (folderById.get(folderParam)?.name ?? "Dossier") : "Vue agence"}
                            </span>
                        </div>
                        <div className="min-h-0 flex-1 overflow-hidden">
                            <FolderHome
                                key={folderParam ?? AGENCY}
                                folderId={folderParam}
                                tab={query.tab}
                                onTabChange={(tab) => void setQuery({ tab: (WORKSPACE_TABS as readonly string[]).includes(tab) ? (tab as WorkspaceTab) : null }, { history: "replace" })}
                                onOpenConversation={openConversation}
                                onStartConversation={(opts) => void startConversation(opts)}
                            />
                        </div>
                    </div>
                )}
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
