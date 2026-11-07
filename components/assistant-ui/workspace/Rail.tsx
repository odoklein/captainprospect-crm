"use client";

/**
 * The workspace rail: brand + new chat, search (opens the command palette),
 * then Vue agence, Agent, and the « Épinglés », « Récentes », « Dossiers »
 * and « Clients » sections, with today's cost at the bottom.
 *
 * Sections fold (Collapsible) and remember it; conversation rows carry a
 * hover menu (rename, pin, share, move, PDF, delete); one indicator slides
 * under the active entry. Folded on desktop, the rail is a strip of icons
 * with tooltips; on mobile it lives in a left Sheet (the workspace's).
 */

import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
    ArrowDownAZ,
    Bot,
    Building2,
    ChevronRight,
    Clock3,
    FileDown,
    Folder,
    FolderInput,
    FolderPlus,
    Globe2,
    Loader2,
    Lock,
    MessageSquare,
    MoreHorizontal,
    PanelLeftClose,
    PanelLeftOpen,
    Pencil,
    Pin,
    PinOff,
    Plus,
    Search,
    SquarePen,
    Trash2,
    Users,
} from "lucide-react";
import { ASSISTANT_API, type ConversationCard, type ConversationsResponse, type FolderCard, type VirtualClientFolder } from "@/lib/assistant/api-contract";
import { apiGet } from "@/lib/assistant/client/fetcher";
import { useAgentOverview, useFolders, useThreadActions, useUsage } from "@/lib/assistant/client/thread-hooks";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/components/ui/recipes";
import { AiMark } from "@/components/ui/AiMark";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/shadcn/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/shadcn/collapsible";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import { Kbd } from "@/components/ui/shadcn/kbd";
import { ScrollArea } from "@/components/ui/shadcn/scroll-area";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/shadcn/tooltip";
import { DeleteConversationDialog, MoveConversationDialog } from "./thread/ConversationDialogs";
import { formatEuros, sortClients, type ClientSort } from "./thread/model";
import { usePdfExport } from "./thread/usePdfExport";

// ============================================
// localStorage-backed state (SSR-safe, synced across tabs)
// ============================================

const LOCAL_EVENT = "captain-ai:local-storage";

function readLocal(key: string): string | null {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function useLocalStorageState<T>(key: string, fallback: T): [T, (next: T) => void] {
    const raw = useSyncExternalStore(
        (onChange) => {
            const handler = (e: Event) => {
                if (e instanceof StorageEvent ? e.key === key : (e as CustomEvent<string>).detail === key) onChange();
            };
            window.addEventListener("storage", handler);
            window.addEventListener(LOCAL_EVENT, handler);
            return () => {
                window.removeEventListener("storage", handler);
                window.removeEventListener(LOCAL_EVENT, handler);
            };
        },
        () => readLocal(key),
        () => null,
    );
    const value = useMemo<T>(() => {
        if (raw === null) return fallback;
        try {
            return JSON.parse(raw) as T;
        } catch {
            return fallback;
        }
        // The fallback is a constant per call site.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [raw]);
    const set = useCallback(
        (next: T) => {
            try {
                window.localStorage.setItem(key, JSON.stringify(next));
            } catch {
                // Private mode: the choice lasts for the page only.
            }
            window.dispatchEvent(new CustomEvent(LOCAL_EVENT, { detail: key }));
        },
        [key],
    );
    return [value, set];
}

// ============================================
// Pieces
// ============================================

type SectionId = "pinned" | "recent" | "folders" | "clients";
const SECTIONS_DEFAULT: Record<SectionId, boolean> = { pinned: true, recent: true, folders: true, clients: true };
const CLIENTS_PREVIEW = 8;
const RECENT_KEY = `${ASSISTANT_API.conversations}?limit=12`;

const ROW = "group/item relative z-10 flex h-9 w-full min-w-0 items-center gap-2.5 rounded-xl px-2.5 text-left text-[13px] transition-[background-color,color] duration-200 ease-snappy";
const rowTone = (active?: boolean) => (active ? "font-semibold text-ink" : "text-ink-2 hover:bg-surface-3/70 hover:text-ink");

function RailIcon({ active, busy, children }: { active?: boolean; busy?: boolean; children: ReactNode }) {
    return (
        <span className={cn("flex size-4 shrink-0 items-center justify-center transition-colors duration-200 [&_svg]:size-4", active ? "text-ink" : "text-ink-4 group-hover/item:text-ink-3")}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : children}
        </span>
    );
}

function RailItem({
    icon,
    label,
    active,
    onClick,
    href,
    trailing,
    title,
    busy,
}: {
    icon: ReactNode;
    label: string;
    active?: boolean;
    onClick?: () => void;
    href?: string;
    trailing?: ReactNode;
    title?: string;
    busy?: boolean;
}) {
    const cls = cn(ROW, rowTone(active), FOCUS_RING);
    const body = (
        <>
            <RailIcon active={active} busy={busy}>
                {icon}
            </RailIcon>
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {trailing}
        </>
    );
    if (href) {
        return (
            <Link href={href} className={cls} data-rail-active={active ? "true" : undefined} title={title ?? label}>
                {body}
            </Link>
        );
    }
    return (
        <button type="button" onClick={onClick} className={cls} data-rail-active={active ? "true" : undefined} aria-current={active ? "page" : undefined} title={title ?? label}>
            {body}
        </button>
    );
}

function Section({
    id,
    label,
    count,
    open,
    onToggle,
    action,
    children,
}: {
    id: SectionId;
    label: string;
    count?: number;
    open: boolean;
    onToggle: (id: SectionId) => void;
    action?: ReactNode;
    children: ReactNode;
}) {
    return (
        <Collapsible open={open} onOpenChange={() => onToggle(id)} asChild>
            <section className="mt-4" aria-labelledby={`rail-section-${id}`}>
                <div className="flex h-7 items-center gap-1 pl-2.5 pr-1">
                    <CollapsibleTrigger asChild>
                        <button
                            id={`rail-section-${id}`}
                            type="button"
                            className={cn("flex min-w-0 flex-1 items-center gap-1 rounded-md text-[11px] font-semibold uppercase tracking-wider text-ink-4 transition-colors hover:text-ink-2", FOCUS_RING)}
                        >
                            <span className="truncate">{label}</span>
                            {count !== undefined && count > 0 && <span className="font-medium normal-case tracking-normal tabular-nums">{count}</span>}
                            <ChevronRight className={cn("size-3 shrink-0 transition-transform duration-200 ease-snappy", open && "rotate-90")} aria-hidden />
                        </button>
                    </CollapsibleTrigger>
                    {action}
                </div>
                <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                    <div className="space-y-0.5 pt-0.5">{children}</div>
                </CollapsibleContent>
            </section>
        </Collapsible>
    );
}

function SectionAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="icon-xs" onClick={onClick} aria-label={label} className="size-6 text-ink-4">
                    {children}
                </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
    );
}

// ============================================
// Conversation rows
// ============================================

type RowDialog = { kind: "move" | "delete"; card: ConversationCard } | null;

function ConversationRow({
    card,
    active,
    icon,
    exporting,
    onOpen,
    onRename,
    onTogglePin,
    onToggleShare,
    onMove,
    onExportPdf,
    onDelete,
}: {
    card: ConversationCard;
    active: boolean;
    icon: ReactNode;
    exporting: boolean;
    onOpen: () => void;
    onRename: (title: string) => void;
    onTogglePin: () => void;
    onToggleShare: () => void;
    onMove: () => void;
    onExportPdf: () => void;
    onDelete: () => void;
}) {
    const [renaming, setRenaming] = useState(false);
    const [draft, setDraft] = useState("");
    const doneRef = useRef(false);
    const fromMenuRef = useRef(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const title = card.title?.trim() || "Nouvelle conversation";

    const start = () => {
        doneRef.current = false;
        setDraft(card.title ?? "");
        setRenaming(true);
    };
    const end = (save: boolean) => {
        if (doneRef.current) return;
        doneRef.current = true;
        setRenaming(false);
        const next = draft.trim();
        if (save && next && next !== card.title) onRename(next);
    };

    if (renaming) {
        return (
            <div className="relative z-10 flex h-9 items-center gap-2.5 rounded-xl border border-primary-400 bg-surface px-2.5 shadow-2xs ring-4 ring-primary-500/12">
                <RailIcon>{icon}</RailIcon>
                <input
                    ref={inputRef}
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onFocus={(e) => e.currentTarget.select()}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            end(true);
                        } else if (e.key === "Escape") {
                            e.preventDefault();
                            e.stopPropagation();
                            end(false);
                        }
                    }}
                    onBlur={() => end(true)}
                    maxLength={120}
                    aria-label="Titre de la conversation"
                    className="min-w-0 flex-1 bg-transparent text-[13px] text-ink placeholder:text-ink-4 focus:outline-none"
                />
            </div>
        );
    }

    return (
        <div className={cn(ROW, "px-0", rowTone(active))} data-rail-active={active ? "true" : undefined}>
            <button
                type="button"
                onClick={onOpen}
                aria-current={active ? "page" : undefined}
                title={title}
                className={cn("flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-xl pl-2.5 text-left", FOCUS_RING)}
            >
                <RailIcon active={active}>{icon}</RailIcon>
                <span className="min-w-0 flex-1 truncate">{title}</span>
            </button>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Actions de « ${title} »`}
                        className="mr-1 size-6 text-ink-4 opacity-0 transition-opacity group-hover/item:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 max-md:opacity-100"
                    >
                        {exporting ? <Loader2 className="animate-spin" aria-hidden /> : <MoreHorizontal aria-hidden />}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="start"
                    side="right"
                    className="w-56"
                    onCloseAutoFocus={(e) => {
                        if (fromMenuRef.current) {
                            fromMenuRef.current = false;
                            e.preventDefault();
                            inputRef.current?.focus();
                        }
                    }}
                >
                    {card.isOwner && (
                        <DropdownMenuItem
                            onSelect={() => {
                                fromMenuRef.current = true;
                                start();
                            }}
                        >
                            <Pencil aria-hidden /> Renommer
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onSelect={onTogglePin}>
                        {card.pinnedAt ? <PinOff aria-hidden /> : <Pin aria-hidden />}
                        {card.pinnedAt ? "Désépingler" : "Épingler"}
                    </DropdownMenuItem>
                    {card.isOwner && (
                        <>
                            <DropdownMenuItem onSelect={onToggleShare}>
                                {card.visibility === "SHARED" ? <Lock aria-hidden /> : <Users aria-hidden />}
                                {card.visibility === "SHARED" ? "Rendre privée" : "Partager"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={onMove}>
                                <FolderInput aria-hidden /> Déplacer vers…
                            </DropdownMenuItem>
                        </>
                    )}
                    <DropdownMenuItem onSelect={onExportPdf} disabled={exporting}>
                        <FileDown aria-hidden /> Exporter en PDF
                    </DropdownMenuItem>
                    {card.isOwner && (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                                <Trash2 aria-hidden /> Supprimer
                            </DropdownMenuItem>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}

// ============================================
// Rail
// ============================================

export interface RailProps {
    /** `agency`, `folder:<id>` or `conv:<id>`. */
    activeKey: string;
    isMac: boolean;
    onNewChat: () => void;
    onOpenSearch: () => void;
    onOpenFolder: (folderId: string | null) => void;
    onOpenConversation: (id: string) => void;
    onCollapse: () => void;
    /** A conversation was deleted from the rail (the host leaves it if it is open). */
    onConversationDeleted?: (id: string, folderId: string | null) => void;
    /** Mobile Sheet: the collapse button closes it. */
    mobile?: boolean;
}

export const Rail = memo(function Rail({ activeKey, isMac, onNewChat, onOpenSearch, onOpenFolder, onOpenConversation, onCollapse, onConversationDeleted, mobile }: RailProps) {
    const toast = useToast();
    const actions = useThreadActions();
    const pdf = usePdfExport();
    const { data, isLoading } = useFolders();
    const { data: recentPage } = useSWR<ConversationsResponse>(RECENT_KEY, apiGet, { revalidateOnFocus: false, keepPreviousData: true, shouldRetryOnError: false });
    const { data: usage, error: usageError } = useUsage();
    const { data: overview, error: overviewError } = useAgentOverview();

    const [sections, setSections] = useLocalStorageState<Record<SectionId, boolean>>("captain-ai:rail:sections", SECTIONS_DEFAULT);
    const [clientSort, setClientSort] = useLocalStorageState<ClientSort>("captain-ai:rail:client-sort", "alpha");
    const [showAllClients, setShowAllClients] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState("");
    const [ensuring, setEnsuring] = useState<string | null>(null);
    const [dialog, setDialog] = useState<RowDialog>(null);

    const toggleSection = useCallback((id: SectionId) => setSections({ ...SECTIONS_DEFAULT, ...sections, [id]: !(sections[id] ?? true) }), [sections, setSections]);
    const isOpen = (id: SectionId) => sections[id] ?? true;

    const clients = useMemo(() => sortClients(data?.clients ?? [], clientSort), [data?.clients, clientSort]);
    const visibleClients = showAllClients ? clients : clients.slice(0, CLIENTS_PREVIEW);
    const pinned = useMemo(() => data?.pinnedConversations ?? [], [data?.pinnedConversations]);
    const general = useMemo(() => data?.general ?? [], [data?.general]);
    const pinnedIds = useMemo(() => new Set(pinned.map((c) => c.id)), [pinned]);
    // Récentes: the latest threads not already pinned above.
    const recent = useMemo(() => (recentPage?.items ?? []).filter((c) => !pinnedIds.has(c.id)).slice(0, 8), [recentPage, pinnedIds]);
    const clientFolderIds = useMemo(() => new Set((data?.clients ?? []).map((c) => c.folder?.id).filter((id): id is string => !!id)), [data?.clients]);

    const agentCount = overview && !overviewError ? overview.counts.pendingProposals + overview.counts.critical : 0;

    // ---- Sliding indicator ----------------------------------------------------------
    const contentRef = useRef<HTMLDivElement>(null);
    const indicatorRef = useRef<HTMLSpanElement>(null);
    const placedRef = useRef(false);
    useLayoutEffect(() => {
        const content = contentRef.current;
        const indicator = indicatorRef.current;
        if (!content || !indicator) return;
        const place = () => {
            const active = content.querySelector<HTMLElement>("[data-rail-active='true']");
            const visible = active && active.getClientRects().length > 0 && active.closest("[data-state='closed']") === null;
            if (!active || !visible) {
                indicator.style.opacity = "0";
                return;
            }
            const top = active.getBoundingClientRect().top - content.getBoundingClientRect().top;
            if (!placedRef.current) {
                indicator.style.transition = "none";
                indicator.style.transform = `translateY(${top}px)`;
                indicator.style.height = `${active.offsetHeight}px`;
                void indicator.offsetHeight;
                indicator.style.transition = "";
                placedRef.current = true;
            } else {
                indicator.style.transform = `translateY(${top}px)`;
                indicator.style.height = `${active.offsetHeight}px`;
            }
            indicator.style.opacity = "1";
        };
        place();
        const observer = new ResizeObserver(place);
        observer.observe(content);
        return () => observer.disconnect();
    }, [activeKey, data, recentPage, sections, clientSort, showAllClients]);

    // ---- Actions ----------------------------------------------------------------------

    const openClient = async (vc: VirtualClientFolder) => {
        if (vc.folder) {
            onOpenFolder(vc.folder.id);
            return;
        }
        setEnsuring(vc.clientId);
        try {
            const folder = await actions.ensureClientFolder(vc.clientId);
            onOpenFolder(folder.id);
        } catch (e) {
            toast.error(`Impossible d’ouvrir ${vc.name}`, e instanceof Error ? e.message : undefined);
        } finally {
            setEnsuring(null);
        }
    };

    // Enter, Échap and blur can all end one creation: only the first one counts.
    const createDoneRef = useRef(false);
    const startCreating = () => {
        createDoneRef.current = false;
        setCreating(true);
    };
    const cancelCreating = () => {
        createDoneRef.current = true;
        setCreating(false);
        setNewName("");
    };
    const submitFolder = async () => {
        if (createDoneRef.current) return;
        createDoneRef.current = true;
        const name = newName.trim();
        setCreating(false);
        setNewName("");
        if (!name) return;
        try {
            const folder = await actions.createFolder({ name });
            toast.success("Dossier créé", name);
            onOpenFolder(folder.id);
        } catch (e) {
            toast.error("Dossier non créé", e instanceof Error ? e.message : undefined);
        }
    };

    const patch = (id: string, body: Parameters<typeof actions.patchConversation>[1], success: string) =>
        actions
            .patchConversation(id, body)
            .then(() => toast.success(success))
            .catch((e: unknown) => toast.error("Modification non enregistrée", e instanceof Error ? e.message : undefined));

    const renderConversation = (c: ConversationCard, icon: ReactNode) => (
        <ConversationRow
            key={c.id}
            card={c}
            icon={icon}
            active={activeKey === `conv:${c.id}`}
            exporting={pdf.busyKey === c.id}
            onOpen={() => onOpenConversation(c.id)}
            onRename={(title) => void patch(c.id, { title }, "Conversation renommée")}
            onTogglePin={() => void patch(c.id, { pinned: !c.pinnedAt }, c.pinnedAt ? "Conversation désépinglée" : "Conversation épinglée")}
            onToggleShare={() =>
                void patch(
                    c.id,
                    { visibility: c.visibility === "SHARED" ? "PRIVATE" : "SHARED" },
                    c.visibility === "SHARED" ? "Conversation rendue privée" : "Partagée avec les managers",
                )
            }
            onMove={() => setDialog({ kind: "move", card: c })}
            onExportPdf={() => void pdf.exportPdf(c.id)}
            onDelete={() => setDialog({ kind: "delete", card: c })}
        />
    );

    const mod = isMac ? "⌘" : "Ctrl";

    return (
        <div className="flex h-full min-h-0 w-full flex-col bg-surface-2">
            {/* Brand + new chat */}
            <div className="flex h-14 shrink-0 items-center gap-1 px-3">
                <span className="mr-1 flex size-8 shrink-0 items-center justify-center rounded-xl bg-accent-600 text-accent-fg shadow-2xs">
                    <AiMark className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1 truncate font-display text-[15px] font-semibold tracking-tight text-ink">Captain AI</span>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button type="button" variant="ghost" size="icon-sm" onClick={onNewChat} aria-label="Nouvelle conversation" aria-keyshortcuts={isMac ? "Meta+Shift+O" : "Control+Shift+O"}>
                            <SquarePen aria-hidden />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="flex items-center gap-2">
                        Nouvelle conversation
                        <span className="flex gap-0.5">
                            <Kbd>{mod}</Kbd>
                            <Kbd>⇧</Kbd>
                            <Kbd>O</Kbd>
                        </span>
                    </TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button type="button" variant="ghost" size="icon-sm" onClick={onCollapse} aria-label={mobile ? "Fermer le panneau" : "Replier le panneau"}>
                            <PanelLeftClose aria-hidden />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{mobile ? "Fermer" : "Replier"}</TooltipContent>
                </Tooltip>
            </div>

            {/* Search → palette */}
            <div className="shrink-0 px-3 pb-2">
                <button
                    type="button"
                    onClick={onOpenSearch}
                    aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"}
                    className={cn(
                        "flex h-9 w-full items-center gap-2 rounded-xl border border-line bg-surface px-2.5 text-[13px] text-ink-4 shadow-2xs",
                        "transition-[border-color,color] duration-200 ease-snappy hover:border-line-strong hover:text-ink-3",
                        FOCUS_RING,
                    )}
                >
                    <Search className="size-4 shrink-0" aria-hidden />
                    <span className="flex-1 text-left">Rechercher</span>
                    <span className="flex gap-0.5" aria-hidden>
                        <Kbd>{mod}</Kbd>
                        <Kbd>K</Kbd>
                    </span>
                </button>
            </div>

            {/* Radix lays the viewport content out as a table: make it a block so long names truncate. */}
            <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
                <nav aria-label="Captain AI" className="px-2 pb-4">
                    <div ref={contentRef} className="relative">
                        <span
                            ref={indicatorRef}
                            aria-hidden
                            className="pointer-events-none absolute inset-x-0 top-0 z-0 rounded-xl border border-line bg-surface opacity-0 shadow-2xs transition-[transform,height,opacity] duration-300 ease-snappy"
                        />

                        <div className="space-y-0.5">
                            <RailItem icon={<Globe2 />} label="Vue agence" active={activeKey === "agency"} onClick={() => onOpenFolder(null)} />
                            <RailItem
                                icon={<Bot />}
                                label="Agent"
                                href="/manager/assistant/agent"
                                title={agentCount > 0 ? `Agent — ${agentCount} élément(s) à traiter` : "Agent"}
                                trailing={
                                    agentCount > 0 ? (
                                        <span
                                            className="inline-flex h-5 min-w-5 items-center justify-center rounded-chip bg-accent-600 px-1.5 text-[10.5px] font-bold tabular-nums text-accent-fg motion-safe:animate-ds-pop"
                                            aria-label={`${agentCount} à traiter`}
                                        >
                                            {agentCount > 99 ? "99+" : agentCount}
                                        </span>
                                    ) : null
                                }
                            />
                        </div>

                        {pinned.length > 0 && (
                            <Section id="pinned" label="Épinglés" count={pinned.length} open={isOpen("pinned")} onToggle={toggleSection}>
                                {pinned.map((c) => renderConversation(c, <Pin />))}
                            </Section>
                        )}

                        {recent.length > 0 && (
                            <Section id="recent" label="Récentes" open={isOpen("recent")} onToggle={toggleSection}>
                                {recent.map((c) => renderConversation(c, c.kind === "AGENT" ? <Bot /> : <MessageSquare />))}
                            </Section>
                        )}

                        <Section
                            id="folders"
                            label="Dossiers"
                            count={general.length}
                            open={isOpen("folders")}
                            onToggle={toggleSection}
                            action={
                                <SectionAction
                                    label="Nouveau dossier"
                                    onClick={() => {
                                        if (!isOpen("folders")) toggleSection("folders");
                                        startCreating();
                                    }}
                                >
                                    <Plus aria-hidden />
                                </SectionAction>
                            }
                        >
                            {isLoading && !data ? (
                                <RailSkeleton rows={3} />
                            ) : (
                                general.map((f: FolderCard) => (
                                    <RailItem
                                        key={f.id}
                                        icon={<Folder />}
                                        label={f.name}
                                        busy={f.id.startsWith("tmp-")}
                                        active={activeKey === `folder:${f.id}`}
                                        onClick={() => !f.id.startsWith("tmp-") && onOpenFolder(f.id)}
                                        trailing={f.hasAgentActivity ? <ActivityDot /> : null}
                                    />
                                ))
                            )}
                            {creating ? (
                                <div className="relative z-10 flex h-9 items-center gap-2.5 rounded-xl border border-primary-400 bg-surface px-2.5 shadow-2xs ring-4 ring-primary-500/12 motion-safe:animate-ds-pop">
                                    <FolderPlus className="size-4 shrink-0 text-ink-4" aria-hidden />
                                    <input
                                        autoFocus
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                void submitFolder();
                                            } else if (e.key === "Escape") {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                cancelCreating();
                                            }
                                        }}
                                        onBlur={() => void submitFolder()}
                                        maxLength={80}
                                        placeholder="Nom du dossier"
                                        aria-label="Nom du nouveau dossier"
                                        className="min-w-0 flex-1 bg-transparent text-[13px] text-ink placeholder:text-ink-4 focus:outline-none"
                                    />
                                </div>
                            ) : (
                                <RailItem icon={<FolderPlus />} label="Nouveau dossier" onClick={startCreating} />
                            )}
                        </Section>

                        <Section
                            id="clients"
                            label="Clients"
                            count={clients.length}
                            open={isOpen("clients")}
                            onToggle={toggleSection}
                            action={
                                <SectionAction
                                    label={clientSort === "alpha" ? "Ordre alphabétique — trier par activité récente" : "Plus récents d’abord — trier par ordre alphabétique"}
                                    onClick={() => setClientSort(clientSort === "alpha" ? "recent" : "alpha")}
                                >
                                    {clientSort === "alpha" ? <ArrowDownAZ aria-hidden /> : <Clock3 aria-hidden />}
                                </SectionAction>
                            }
                        >
                            {isLoading && !data ? (
                                <RailSkeleton rows={5} />
                            ) : clients.length === 0 ? (
                                <p className="px-2.5 py-2 text-[12px] text-ink-4">Aucun client pour l’instant.</p>
                            ) : (
                                <>
                                    {visibleClients.map((vc) => (
                                        <RailItem
                                            key={vc.clientId}
                                            icon={<Building2 />}
                                            label={vc.name}
                                            busy={ensuring === vc.clientId}
                                            active={vc.folder ? activeKey === `folder:${vc.folder.id}` : false}
                                            onClick={() => void openClient(vc)}
                                            trailing={vc.folder?.hasAgentActivity ? <ActivityDot /> : null}
                                        />
                                    ))}
                                    {clients.length > CLIENTS_PREVIEW && (
                                        <button
                                            type="button"
                                            onClick={() => setShowAllClients((v) => !v)}
                                            className={cn("relative z-10 flex h-8 w-full items-center rounded-xl px-2.5 text-[12.5px] font-medium text-ink-3 transition-colors hover:bg-surface-3/70 hover:text-ink", FOCUS_RING)}
                                        >
                                            {showAllClients ? "Afficher moins" : `Afficher les ${clients.length - CLIENTS_PREVIEW} autres`}
                                        </button>
                                    )}
                                </>
                            )}
                        </Section>

                        {data?.degraded && (
                            <p className="mx-2.5 mt-4 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-ink-4">
                                <MessageSquare className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                                Les dossiers ne sont pas encore activés sur cette instance.
                            </p>
                        )}
                    </div>
                </nav>
            </ScrollArea>

            {usage && !usageError && (
                <div className="shrink-0 border-t border-line-subtle px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] text-[11.5px] text-ink-3">
                    <div className="flex items-center justify-between gap-2">
                        <span>Coût aujourd’hui</span>
                        <span className="font-semibold tabular-nums text-ink-2">{formatEuros(usage.today.costEur)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-ink-4">
                        <span>Requêtes</span>
                        <span className="tabular-nums">{usage.today.requestCount.toLocaleString("fr-FR")}</span>
                    </div>
                </div>
            )}

            <MoveConversationDialog
                open={dialog?.kind === "move"}
                onOpenChange={(open) => !open && setDialog(null)}
                currentFolderId={dialog?.card.folderId ?? null}
                inClientFolder={dialog?.card.folderId ? clientFolderIds.has(dialog.card.folderId) : false}
                generalFolders={general}
                onMove={async (target) => {
                    if (!dialog) return;
                    await patch(dialog.card.id, { folderId: target }, `Déplacée vers ${target ? (general.find((f) => f.id === target)?.name ?? "le dossier") : "la vue agence"}`);
                }}
            />
            <DeleteConversationDialog
                open={dialog?.kind === "delete"}
                onOpenChange={(open) => !open && setDialog(null)}
                title={dialog?.card.title?.trim() || "Nouvelle conversation"}
                onConfirm={async () => {
                    if (!dialog) return;
                    const { id, folderId } = dialog.card;
                    try {
                        await actions.deleteConversation(id);
                        toast.success("Conversation supprimée");
                        onConversationDeleted?.(id, folderId);
                    } catch (e) {
                        toast.error("Suppression impossible", e instanceof Error ? e.message : undefined);
                    }
                }}
            />
        </div>
    );
});

// ============================================
// Folded rail (desktop): icons with tooltips
// ============================================

export const RailStrip = memo(function RailStrip({
    activeKey,
    isMac,
    onExpand,
    onNewChat,
    onOpenSearch,
    onOpenFolder,
}: {
    activeKey: string;
    isMac: boolean;
    onExpand: () => void;
    onNewChat: () => void;
    onOpenSearch: () => void;
    onOpenFolder: (folderId: string | null) => void;
}) {
    const { data: overview, error: overviewError } = useAgentOverview();
    const agentCount = overview && !overviewError ? overview.counts.pendingProposals + overview.counts.critical : 0;
    const mod = isMac ? "⌘" : "Ctrl";

    const item = (label: ReactNode, aria: string, icon: ReactNode, props: { onClick?: () => void; href?: string; active?: boolean; badge?: boolean }) => (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={aria}
                    aria-current={props.active ? "page" : undefined}
                    onClick={props.onClick}
                    asChild={!!props.href}
                    className={cn("relative", props.active && "bg-surface text-ink shadow-2xs ring-1 ring-line")}
                >
                    {props.href ? (
                        <Link href={props.href}>
                            {icon}
                            {props.badge && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-accent-500 ring-2 ring-surface-2" aria-hidden />}
                        </Link>
                    ) : (
                        icon
                    )}
                </Button>
            </TooltipTrigger>
            <TooltipContent side="right" className="flex items-center gap-2">
                {label}
            </TooltipContent>
        </Tooltip>
    );

    return (
        <div className="flex h-full w-full flex-col items-center gap-1 bg-surface-2 py-3">
            {item("Afficher le panneau", "Afficher le panneau", <PanelLeftOpen aria-hidden />, { onClick: onExpand })}
            {item(
                <>
                    Nouvelle conversation
                    <span className="flex gap-0.5">
                        <Kbd>{mod}</Kbd>
                        <Kbd>⇧</Kbd>
                        <Kbd>O</Kbd>
                    </span>
                </>,
                "Nouvelle conversation",
                <SquarePen aria-hidden />,
                { onClick: onNewChat },
            )}
            {item(
                <>
                    Rechercher
                    <span className="flex gap-0.5">
                        <Kbd>{mod}</Kbd>
                        <Kbd>K</Kbd>
                    </span>
                </>,
                "Rechercher",
                <Search aria-hidden />,
                { onClick: onOpenSearch },
            )}
            <div className="my-1 h-px w-6 bg-line" aria-hidden />
            {item("Vue agence", "Vue agence", <Globe2 aria-hidden />, { onClick: () => onOpenFolder(null), active: activeKey === "agency" })}
            {item(agentCount > 0 ? `Agent — ${agentCount} à traiter` : "Agent", "Agent", <Bot aria-hidden />, { href: "/manager/assistant/agent", badge: agentCount > 0 })}
        </div>
    );
});

function ActivityDot() {
    return (
        <span className="relative flex size-2 shrink-0" title="Activité de l’agent" aria-label="Activité de l’agent">
            <span className="absolute inset-0 rounded-full bg-accent-500 opacity-60 motion-safe:animate-ping" />
            <span className="relative size-2 rounded-full bg-accent-500" />
        </span>
    );
}

function RailSkeleton({ rows }: { rows: number }) {
    return (
        <div className="space-y-1.5 px-2.5 py-1" aria-hidden>
            {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="flex h-7 items-center gap-2.5">
                    <Skeleton className="size-4 rounded-md" />
                    <Skeleton className="h-3 rounded-chip" style={{ width: `${55 + ((i * 17) % 35)}%` }} />
                </div>
            ))}
        </div>
    );
}
