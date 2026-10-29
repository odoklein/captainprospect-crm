"use client";

/**
 * Folder home of the Captain AI workspace, shown when no conversation is open.
 * Tabs: Conversations, Mémoire, Fichiers, Tableau, Agent. The agency view
 * (folderId null) keeps Conversations (scope agency) and Mémoire (agency +
 * user layers) only.
 */

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Brain, FileText, FolderX, LayoutGrid, MessageSquare, type LucideIcon } from "lucide-react";
import { useFolderDetail } from "@/lib/assistant/client/folder-hooks";
import { EmptyBlock, FOCUS } from "@/components/accueil/AccueilUI";
import { AiMark } from "@/components/ui/AiMark";
import { cn } from "@/lib/utils";
import { AgencyHeader, FolderHeader, FolderHeaderSkeleton } from "./FolderHeader";
import { ConversationsTab } from "./ConversationsTab";
import { MemoryTab } from "./MemoryTab";
import { FilesTab } from "./FilesTab";
import { BoardTab } from "./BoardTab";
import { AgentTab } from "./AgentTab";
import { FOLDER_TABS, resolveTab, visibleTabs, type FolderTabId } from "./logic";

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

    // A hidden or unknown tab in the URL is replaced by the first visible one
    // (an empty tab already means the default, so the URL is left alone).
    useEffect(() => {
        if (tab && active !== tab) onTabChange(active);
    }, [active, tab, onTabChange]);

    const counts: Partial<Record<FolderTabId, number>> = detail
        ? { conversations: detail.counts.conversations, memoire: detail.counts.memories, fichiers: detail.counts.files, tableau: detail.counts.pins }
        : {};

    if (!isAgency && error) {
        return (
            <div className="h-full overflow-y-auto">
                <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
                    <EmptyBlock
                        icon={FolderX}
                        tone="slate"
                        title={error.status === 404 ? "Dossier introuvable" : "Dossier indisponible"}
                        hint={error.status === 404 ? "Il a peut-être été supprimé, ou tu n'y as pas accès." : error.message}
                    />
                </div>
            </div>
        );
    }

    const panelId = `folder-panel-${active}`;

    return (
        // The home owns its scroll: the shell gives it a fixed-height, overflow-hidden slot.
        <div className="h-full overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
        <div className="mx-auto w-full max-w-5xl space-y-5 px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
            {isAgency ? (
                <AgencyHeader />
            ) : detail ? (
                <FolderHeader detail={detail} onTabChange={onTabChange} />
            ) : isLoading ? (
                <FolderHeaderSkeleton />
            ) : null}

            <TabBar
                tabs={visibleTabs(isAgency)}
                active={active}
                counts={counts}
                agentAlert={!!detail?.hasAgentActivity}
                onChange={onTabChange}
            />

            <div
                key={`${folderId ?? "agency"}:${active}`}
                id={panelId}
                role="tabpanel"
                aria-labelledby={`folder-tab-${active}`}
                tabIndex={-1}
                className="outline-none motion-safe:animate-ds-enter"
            >
                {active === "conversations" && (
                    <ConversationsTab
                        folderId={folderId}
                        detail={detail ?? null}
                        onOpenConversation={onOpenConversation}
                        onStartConversation={onStartConversation}
                    />
                )}
                {active === "memoire" && <MemoryTab folderId={folderId} folderName={isAgency ? null : (detail?.name ?? "…")} onOpenConversation={onOpenConversation} />}
                {active === "fichiers" && folderId && <FilesTab folderId={folderId} isClient={detail?.kind === "CLIENT"} />}
                {active === "tableau" && folderId && <BoardTab folderId={folderId} onOpenConversation={onOpenConversation} />}
                {active === "agent" && folderId && <AgentTab folderId={folderId} clientId={detail?.clientId ?? null} />}
            </div>
        </div>
        </div>
    );
}

// ============================================
// Tab bar: scrolls horizontally on phones, sliding indicator, arrow keys
// ============================================

function TabBar({
    tabs,
    active,
    counts,
    agentAlert,
    onChange,
}: {
    tabs: FolderTabId[];
    active: FolderTabId;
    counts: Partial<Record<FolderTabId, number>>;
    agentAlert: boolean;
    onChange(tab: FolderTabId): void;
}) {
    const listRef = useRef<HTMLDivElement>(null);
    const refs = useRef<Partial<Record<FolderTabId, HTMLButtonElement | null>>>({});
    const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

    useLayoutEffect(() => {
        const measure = () => {
            const el = refs.current[active];
            if (!el) return;
            setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
        };
        measure();
        const el = refs.current[active];
        el?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
        const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
        if (ro && listRef.current) ro.observe(listRef.current);
        return () => ro?.disconnect();
    }, [active, tabs.length, counts.conversations, counts.memoire, counts.fichiers, counts.tableau]);

    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        const i = tabs.indexOf(active);
        let next: FolderTabId | null = null;
        if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
        else if (e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
        else if (e.key === "Home") next = tabs[0];
        else if (e.key === "End") next = tabs[tabs.length - 1];
        if (!next) return;
        e.preventDefault();
        onChange(next);
        refs.current[next]?.focus();
    };

    return (
        <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
            <div
                ref={listRef}
                role="tablist"
                aria-label="Sections du dossier"
                onKeyDown={onKeyDown}
                className="relative inline-flex min-w-max items-center gap-1 rounded-xl border border-line bg-surface-3 p-1"
            >
                {indicator && (
                    <span
                        aria-hidden
                        className="absolute bottom-1 top-1 rounded-lg bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.08),0_0_0_1px_rgba(15,23,42,0.04)] transition-[transform,width] duration-300 ease-[var(--ease-snappy)] motion-reduce:transition-none"
                        style={{ width: indicator.width, transform: `translateX(${indicator.left - 4}px)`, left: 4 }}
                    />
                )}
                {FOLDER_TABS.filter((t) => tabs.includes(t.id)).map((t) => {
                    const selected = t.id === active;
                    const Icon = TAB_ICON[t.id];
                    const count = counts[t.id];
                    return (
                        <button
                            key={t.id}
                            ref={(el) => {
                                refs.current[t.id] = el;
                            }}
                            id={`folder-tab-${t.id}`}
                            type="button"
                            role="tab"
                            aria-selected={selected}
                            aria-controls={`folder-panel-${t.id}`}
                            tabIndex={selected ? 0 : -1}
                            onClick={() => onChange(t.id)}
                            className={cn(
                                "relative z-10 inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-bold",
                                "transition-colors duration-150 ease-[var(--ease-snappy)]",
                                FOCUS,
                                "focus-visible:ring-offset-surface-3",
                                selected ? "text-ink" : "text-ink-3 hover:text-ink",
                                !indicator && selected && "bg-surface shadow-sm",
                            )}
                        >
                            <Icon className={cn("h-3.5 w-3.5", t.id === "agent" ? "text-accent-600" : selected ? "text-ink-2" : "text-ink-4")} aria-hidden />
                            {t.label}
                            {count !== undefined && count > 0 && (
                                <span className={cn("rounded-full px-1.5 text-[10px] font-black tabular-nums", selected ? "bg-surface-3 text-ink-2" : "bg-surface/70 text-ink-3")}>
                                    {count > 999 ? "999+" : count}
                                </span>
                            )}
                            {t.id === "agent" && agentAlert && <span className="h-1.5 w-1.5 rounded-full bg-accent-500 motion-safe:animate-pulse" aria-label="Activité à examiner" />}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
