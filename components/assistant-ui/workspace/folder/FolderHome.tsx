"use client";

/**
 * Folder home of the Captain AI workspace, shown when no conversation is open.
 * Tabs (shadcn underline variant, sliding indicator): Conversations, Mémoire,
 * Fichiers, Tableau, Agent. The agency view (folderId null) keeps
 * Conversations (scope agency) and Mémoire (agency + user layers) only.
 */

import { useEffect, useRef } from "react";
import { Brain, FileText, FolderX, LayoutGrid, MessageSquare, type LucideIcon } from "lucide-react";
import { useFolderDetail } from "@/lib/assistant/client/folder-hooks";
import { FOLDER_TABS, resolveTab, tabCountLabel, visibleTabs, type FolderTabId } from "@/lib/assistant/client/folder-logic";
import { Badge } from "@/components/ui/shadcn/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { AiMark } from "@/components/ui/AiMark";
import { cn } from "@/lib/utils";
import { AgencyHeader, FolderHeader, FolderHeaderSkeleton, PulseDot } from "./FolderHeader";
import { ConversationsTab } from "./ConversationsTab";
import { MemoryTab } from "./MemoryTab";
import { FilesTab } from "./FilesTab";
import { BoardTab } from "./BoardTab";
import { AgentTab } from "./AgentTab";
import { EmptyState } from "./parts";

const TAB_ICON: Record<FolderTabId, LucideIcon> = {
    conversations: MessageSquare,
    memoire: Brain,
    fichiers: FileText,
    tableau: LayoutGrid,
    agent: AiMark,
};

export function FolderHome(props: {
    folderId: string | null /* null = Vue agence */;
    tab: string;
    onTabChange(tab: string): void;
    onOpenConversation(id: string): void;
    onStartConversation(opts: { folderId: string | null; clientId?: string | null; missionId?: string | null; firstMessage?: string }): void;
}) {
    const { folderId, tab, onTabChange, onOpenConversation, onStartConversation } = props;
    const isAgency = folderId === null;
    const active = resolveTab(tab ?? "", isAgency);
    const { data: detail, error, isLoading } = useFolderDetail(folderId);
    const listRef = useRef<HTMLDivElement>(null);

    // A hidden or unknown tab in the URL is replaced by the first visible one
    // (an empty tab already means the default, so the URL is left alone).
    useEffect(() => {
        if (tab && active !== tab) onTabChange(active);
    }, [active, tab, onTabChange]);

    // Phones: keep the active tab in view inside the horizontally scrolling bar.
    useEffect(() => {
        const el = listRef.current?.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
        el?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    }, [active]);

    if (!isAgency && error) {
        return (
            <div className="h-full overflow-y-auto">
                <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
                    <EmptyState
                        icon={FolderX}
                        title={error.status === 404 ? "Dossier introuvable" : "Dossier indisponible"}
                        hint={error.status === 404 ? "Il a peut-être été supprimé, ou tu n'y as pas accès." : error.message}
                    />
                </div>
            </div>
        );
    }

    const tabs = visibleTabs(isAgency);
    const counts: Partial<Record<FolderTabId, number>> = detail
        ? { conversations: detail.counts.conversations, memoire: detail.counts.memories, fichiers: detail.counts.files, tableau: detail.counts.pins }
        : {};
    const agentAlert = !!detail?.hasAgentActivity;

    return (
        // The home owns its scroll: the shell gives it a fixed-height, overflow-hidden slot.
        <div className="h-full overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
            <div className="mx-auto w-full max-w-5xl space-y-6 px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
                {isAgency ? (
                    <AgencyHeader />
                ) : detail ? (
                    <FolderHeader detail={detail} onTabChange={onTabChange} />
                ) : isLoading ? (
                    <FolderHeaderSkeleton />
                ) : null}

                <Tabs value={active} onValueChange={onTabChange} className="gap-5">
                    {/* The bar scrolls sideways on phones; its hairline spans the full width. */}
                    {/* py-1 / -my-1: room for the triggers' focus ring inside the clipping scroller. */}
                    <div className="-mx-4 -my-1 overflow-x-auto overflow-y-hidden px-4 py-1 [scrollbar-width:none] sm:-mx-1 sm:px-1 [&::-webkit-scrollbar]:hidden">
                        <TabsList ref={listRef} variant="underline" aria-label="Sections du dossier" className="w-full min-w-max justify-start">
                            {FOLDER_TABS.filter((t) => tabs.includes(t.id)).map((t) => {
                                const Icon = TAB_ICON[t.id];
                                const count = tabCountLabel(counts[t.id]);
                                const selected = t.id === active;
                                return (
                                    <TabsTrigger key={t.id} value={t.id} className="group/tab">
                                        <Icon
                                            className={cn(
                                                "transition-colors duration-150",
                                                t.id === "agent" ? "text-accent-600" : selected ? "text-ink-2" : "text-ink-4 group-hover/tab:text-ink-3",
                                            )}
                                            aria-hidden
                                        />
                                        {t.label}
                                        {count && (
                                            <Badge
                                                variant={selected ? "secondary" : "outline"}
                                                className="h-[18px] min-w-[18px] px-1.5 text-3xs tabular-nums"
                                                aria-label={`${count} élément${count === "1" ? "" : "s"}`}
                                            >
                                                {count}
                                            </Badge>
                                        )}
                                        {t.id === "agent" && agentAlert && (
                                            <>
                                                <PulseDot />
                                                <span className="sr-only">Activité à examiner</span>
                                            </>
                                        )}
                                    </TabsTrigger>
                                );
                            })}
                        </TabsList>
                    </div>

                    {tabs.map((id) => (
                        <TabsContent
                            key={`${folderId ?? "agency"}:${id}`}
                            value={id}
                            className="motion-safe:data-[state=active]:animate-in motion-safe:data-[state=active]:fade-in-0 motion-safe:data-[state=active]:slide-in-from-bottom-1 motion-safe:duration-200 motion-safe:ease-snappy"
                        >
                            {id === "conversations" && (
                                <ConversationsTab
                                    folderId={folderId}
                                    detail={detail ?? null}
                                    onOpenConversation={onOpenConversation}
                                    onStartConversation={onStartConversation}
                                />
                            )}
                            {id === "memoire" && (
                                <MemoryTab folderId={folderId} folderName={isAgency ? null : (detail?.name ?? "…")} onOpenConversation={onOpenConversation} />
                            )}
                            {id === "fichiers" && folderId && <FilesTab folderId={folderId} isClient={detail?.kind === "CLIENT"} />}
                            {id === "tableau" && folderId && <BoardTab folderId={folderId} onOpenConversation={onOpenConversation} />}
                            {id === "agent" && folderId && <AgentTab folderId={folderId} clientId={detail?.clientId ?? null} />}
                        </TabsContent>
                    ))}
                </Tabs>
            </div>
        </div>
    );
}
