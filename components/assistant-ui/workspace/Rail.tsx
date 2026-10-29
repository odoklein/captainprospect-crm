"use client";

/**
 * The workspace rail: brand + new chat, search (opens the command palette),
 * then Vue agence, Agent, and the « Épinglés », « Dossiers » and « Clients »
 * sections, with today's cost at the bottom.
 *
 * One indicator slides under the active entry (measured, not re-rendered),
 * sections fold and remember it, the client list sorts A–Z or by activity.
 */

import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import {
    ArrowDownAZ,
    Bot,
    Building2,
    ChevronDown,
    Clock3,
    Folder,
    FolderPlus,
    Globe2,
    Loader2,
    MessageSquare,
    PanelLeftClose,
    Pin,
    Plus,
    Search,
    SquarePen,
} from "lucide-react";
import type { FolderCard, VirtualClientFolder } from "@/lib/assistant/api-contract";
import { useAgentOverview, useFolders, useThreadActions, useUsage } from "@/lib/assistant/client/thread-hooks";
import { cn } from "@/lib/utils";
import { FOCUS, Shimmer } from "@/components/accueil/AccueilUI";
import { AiMark } from "@/components/ui/AiMark";
import { Kbd } from "@/components/ui/Kbd";
import { Tooltip } from "@/components/ui/Tooltip";
import { useToast } from "@/components/ui/Toast";
import { formatEuros, sortClients, type ClientSort } from "./thread/model";

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

type SectionId = "pinned" | "folders" | "clients";
const SECTIONS_DEFAULT: Record<SectionId, boolean> = { pinned: true, folders: true, clients: true };
const CLIENTS_PREVIEW = 8;

function RailItem({
    icon,
    label,
    active,
    onClick,
    href,
    trailing,
    title,
    busy,
    index = 0,
}: {
    icon: ReactNode;
    label: string;
    active?: boolean;
    onClick?: () => void;
    href?: string;
    trailing?: ReactNode;
    title?: string;
    busy?: boolean;
    index?: number;
}) {
    const cls = cn(
        "group/item relative z-10 flex h-9 w-full min-w-0 items-center gap-2.5 rounded-xl px-2.5 text-left text-[13px] motion-safe:animate-ds-enter",
        "transition-[background-color,color] duration-200 ease-[var(--ease-snappy)]",
        active ? "font-semibold text-ink" : "text-ink-2 hover:bg-surface-3/70 hover:text-ink",
        FOCUS,
    );
    const body = (
        <>
            <span className={cn("flex size-4 shrink-0 items-center justify-center transition-colors duration-200", active ? "text-ink" : "text-ink-4 group-hover/item:text-ink-3")}>
                {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : icon}
            </span>
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {trailing}
        </>
    );
    const style = { animationDelay: `${Math.min(index, 8) * 30}ms` };
    if (href) {
        return (
            <Link href={href} className={cls} data-rail-active={active ? "true" : undefined} title={title ?? label} style={style}>
                {body}
            </Link>
        );
    }
    return (
        <button
            type="button"
            onClick={onClick}
            className={cls}
            data-rail-active={active ? "true" : undefined}
            aria-current={active ? "page" : undefined}
            title={title ?? label}
            style={style}
        >
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
        <section className="mt-4" aria-labelledby={`rail-section-${id}`}>
            <div className="group/sec flex h-7 items-center gap-1 pl-2.5 pr-1">
                <button
                    id={`rail-section-${id}`}
                    type="button"
                    onClick={() => onToggle(id)}
                    aria-expanded={open}
                    className={cn("flex min-w-0 flex-1 items-center gap-1 rounded-md text-[11px] font-semibold uppercase tracking-wider text-ink-4 transition-colors hover:text-ink-2", FOCUS)}
                >
                    <span className="truncate">{label}</span>
                    {count !== undefined && count > 0 && <span className="font-medium tabular-nums normal-case tracking-normal">{count}</span>}
                    <ChevronDown className={cn("size-3 shrink-0 transition-transform duration-200 ease-[var(--ease-snappy)]", !open && "-rotate-90")} aria-hidden />
                </button>
                {action}
            </div>
            <div className={cn("grid transition-[grid-template-rows,opacity] duration-200 ease-[var(--ease-snappy)]", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                <div className="min-h-0 overflow-hidden" inert={!open}>
                    <div className="space-y-0.5 pt-0.5">{children}</div>
                </div>
            </div>
        </section>
    );
}

const SECTION_ACTION = "inline-flex size-6 shrink-0 items-center justify-center rounded-md text-ink-4 transition-[background-color,color] duration-150 hover:bg-surface-3 hover:text-ink";

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
    /** Mobile drawer: the collapse button closes it. */
    mobile?: boolean;
}

export const Rail = memo(function Rail({ activeKey, isMac, onNewChat, onOpenSearch, onOpenFolder, onOpenConversation, onCollapse, mobile }: RailProps) {
    const toast = useToast();
    const actions = useThreadActions();
    const { data, isLoading } = useFolders();
    const { data: usage, error: usageError } = useUsage();
    const { data: overview, error: overviewError } = useAgentOverview();

    const [sections, setSections] = useLocalStorageState<Record<SectionId, boolean>>("captain-ai:rail:sections", SECTIONS_DEFAULT);
    const [clientSort, setClientSort] = useLocalStorageState<ClientSort>("captain-ai:rail:client-sort", "alpha");
    const [showAllClients, setShowAllClients] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState("");
    const [ensuring, setEnsuring] = useState<string | null>(null);

    const toggleSection = useCallback((id: SectionId) => setSections({ ...SECTIONS_DEFAULT, ...sections, [id]: !(sections[id] ?? true) }), [sections, setSections]);
    const isOpen = (id: SectionId) => sections[id] ?? true;

    const clients = useMemo(() => sortClients(data?.clients ?? [], clientSort), [data?.clients, clientSort]);
    const visibleClients = showAllClients ? clients : clients.slice(0, CLIENTS_PREVIEW);
    const pinned = data?.pinnedConversations ?? [];
    const general = data?.general ?? [];

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
            const visible = active && active.getClientRects().length > 0 && active.closest("[inert]") === null;
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
    }, [activeKey, data, sections, clientSort, showAllClients]);

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

    const mod = isMac ? "⌘" : "Ctrl";

    return (
        <div className="flex h-full min-h-0 w-full flex-col bg-surface-2">
            {/* Brand + new chat */}
            <div className="flex h-14 shrink-0 items-center gap-2 px-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-accent-600 text-accent-fg shadow-xs">
                    <AiMark className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1 truncate font-display text-[15px] font-semibold tracking-tight text-ink">Captain AI</span>
                <Tooltip
                    position="bottom"
                    content={
                        <span className="flex items-center gap-2 text-xs">
                            Nouvelle conversation
                            <span className="flex gap-0.5">
                                <Kbd className="border-white/20 bg-white/10 text-white">{mod}</Kbd>
                                <Kbd className="border-white/20 bg-white/10 text-white">⇧</Kbd>
                                <Kbd className="border-white/20 bg-white/10 text-white">O</Kbd>
                            </span>
                        </span>
                    }
                >
                    <button
                        type="button"
                        onClick={onNewChat}
                        aria-label="Nouvelle conversation"
                        aria-keyshortcuts={isMac ? "Meta+Shift+O" : "Control+Shift+O"}
                        className={cn("inline-flex size-8 items-center justify-center rounded-lg text-ink-3 transition-[background-color,color] duration-150 hover:bg-surface-3 hover:text-ink", FOCUS)}
                    >
                        <SquarePen className="size-4" aria-hidden />
                    </button>
                </Tooltip>
                <button
                    type="button"
                    onClick={onCollapse}
                    aria-label={mobile ? "Fermer le panneau" : "Replier le panneau"}
                    title={mobile ? "Fermer" : "Replier"}
                    className={cn("inline-flex size-8 items-center justify-center rounded-lg text-ink-3 transition-[background-color,color] duration-150 hover:bg-surface-3 hover:text-ink", FOCUS)}
                >
                    <PanelLeftClose className="size-4" aria-hidden />
                </button>
            </div>

            {/* Search → palette */}
            <div className="shrink-0 px-3 pb-2">
                <button
                    type="button"
                    onClick={onOpenSearch}
                    aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"}
                    className={cn(
                        "flex h-9 w-full items-center gap-2 rounded-xl border border-line bg-surface px-2.5 text-[13px] text-ink-4 shadow-2xs",
                        "transition-[border-color,color] duration-200 ease-[var(--ease-snappy)] hover:border-line-strong hover:text-ink-3",
                        FOCUS,
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

            <nav aria-label="Captain AI" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4 [scrollbar-width:thin]">
                <div ref={contentRef} className="relative">
                    <span
                        ref={indicatorRef}
                        aria-hidden
                        className="pointer-events-none absolute inset-x-0 top-0 z-0 rounded-xl border border-line bg-surface opacity-0 shadow-xs transition-[transform,height,opacity] duration-300 ease-[var(--ease-snappy)]"
                    />

                    <div className="space-y-0.5">
                        <RailItem icon={<Globe2 className="size-4" />} label="Vue agence" active={activeKey === "agency"} onClick={() => onOpenFolder(null)} />
                        <RailItem
                            icon={<Bot className="size-4" />}
                            label="Agent"
                            href="/manager/assistant/agent"
                            title={agentCount > 0 ? `Agent — ${agentCount} élément(s) à traiter` : "Agent"}
                            trailing={
                                agentCount > 0 ? (
                                    <span
                                        className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-600 px-1.5 text-[10.5px] font-bold tabular-nums text-accent-fg motion-safe:animate-ds-pop"
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
                            {pinned.map((c, i) => (
                                <RailItem
                                    key={c.id}
                                    index={i}
                                    icon={<Pin className="size-3.5" />}
                                    label={c.title || "Nouvelle conversation"}
                                    active={activeKey === `conv:${c.id}`}
                                    onClick={() => onOpenConversation(c.id)}
                                />
                            ))}
                        </Section>
                    )}

                    <Section
                        id="folders"
                        label="Dossiers"
                        count={general.length}
                        open={isOpen("folders")}
                        onToggle={toggleSection}
                        action={
                            <button
                                type="button"
                                onClick={() => {
                                    if (!isOpen("folders")) toggleSection("folders");
                                    startCreating();
                                }}
                                aria-label="Nouveau dossier"
                                title="Nouveau dossier"
                                className={cn(SECTION_ACTION, FOCUS)}
                            >
                                <Plus className="size-3.5" aria-hidden />
                            </button>
                        }
                    >
                        {isLoading && !data ? (
                            <RailSkeleton rows={3} />
                        ) : (
                            general.map((f: FolderCard, i) => (
                                <RailItem
                                    key={f.id}
                                    index={i}
                                    icon={<Folder className="size-4" />}
                                    label={f.name}
                                    busy={f.id.startsWith("tmp-")}
                                    active={activeKey === `folder:${f.id}`}
                                    onClick={() => !f.id.startsWith("tmp-") && onOpenFolder(f.id)}
                                    trailing={f.hasAgentActivity ? <ActivityDot /> : null}
                                />
                            ))
                        )}
                        {creating ? (
                            <div className="relative z-10 flex h-9 items-center gap-2.5 rounded-xl border border-primary-300 bg-surface px-2.5 shadow-2xs ring-4 ring-primary-500/10 motion-safe:animate-ds-pop">
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
                            <RailItem icon={<FolderPlus className="size-4" />} label="Nouveau dossier" onClick={startCreating} />
                        )}
                    </Section>

                    <Section
                        id="clients"
                        label="Clients"
                        count={clients.length}
                        open={isOpen("clients")}
                        onToggle={toggleSection}
                        action={
                            <button
                                type="button"
                                onClick={() => setClientSort(clientSort === "alpha" ? "recent" : "alpha")}
                                aria-label={clientSort === "alpha" ? "Trier par activité récente" : "Trier par ordre alphabétique"}
                                title={clientSort === "alpha" ? "Ordre alphabétique — cliquer pour les plus récents" : "Plus récents d’abord — cliquer pour l’ordre alphabétique"}
                                className={cn(SECTION_ACTION, FOCUS)}
                            >
                                {clientSort === "alpha" ? <ArrowDownAZ className="size-3.5" aria-hidden /> : <Clock3 className="size-3.5" aria-hidden />}
                            </button>
                        }
                    >
                        {isLoading && !data ? (
                            <RailSkeleton rows={5} />
                        ) : clients.length === 0 ? (
                            <p className="px-2.5 py-2 text-[12px] text-ink-4">Aucun client pour l’instant.</p>
                        ) : (
                            <>
                                {visibleClients.map((vc, i) => (
                                    <RailItem
                                        key={vc.clientId}
                                        index={i}
                                        icon={<Building2 className="size-4" />}
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
                                        className={cn("relative z-10 flex h-8 w-full items-center rounded-xl px-2.5 text-[12.5px] font-medium text-ink-3 transition-colors hover:bg-surface-3/70 hover:text-ink", FOCUS)}
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

            {usage && !usageError && (
                <div className="shrink-0 border-t border-line-subtle px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] text-[11.5px] text-ink-3">
                    <div className="flex items-center justify-between gap-2">
                        <span>Coût aujourd’hui</span>
                        <span key={usage.today.costEur} className="font-semibold tabular-nums text-ink-2 motion-safe:animate-ds-enter">
                            {formatEuros(usage.today.costEur)}
                        </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-ink-4">
                        <span>Requêtes</span>
                        <span className="tabular-nums">{usage.today.requestCount.toLocaleString("fr-FR")}</span>
                    </div>
                </div>
            )}
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
                    <Shimmer className="size-4 rounded-md" />
                    <Shimmer className="h-3 rounded-full" style={{ width: `${55 + ((i * 17) % 35)}%` }} />
                </div>
            ))}
        </div>
    );
}
