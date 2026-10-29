"use client";

/**
 * Tableau tab: the charts pinned to the folder. Each card redraws its stored
 * visual, can be refreshed with the same query, renamed, reordered (menu
 * Monter / Descendre) and removed (with undo).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, LayoutGrid, MessageSquare, MoreHorizontal, Pencil, Pin, RefreshCw, Trash2 } from "lucide-react";
import type { PinItem } from "@/lib/assistant/api-contract";
import type { StoredVisual } from "@/lib/assistant/visuals/spec";
import { usePins } from "@/lib/assistant/client/folder-hooks";
import { CARD, EmptyBlock, FOCUS, SECONDARY_BUTTON, Shimmer, relativeTime } from "@/components/accueil/AccueilUI";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { useToast } from "@/components/ui/Toast";
import { VisualView } from "@/components/assistant-ui/visuals/VisualView";
import { cn } from "@/lib/utils";
import { movePin, pinVisual, sortPins } from "./logic";

const UNDO_MS = 6000;
const WIDE = new Set(["table", "kpi_row", "heatmap"]);

export function BoardTab({ folderId, onOpenConversation }: { folderId: string; onOpenConversation(id: string): void }) {
    const { pins, error, isLoading, setLocal, patch, persistOrder, destroy, refresh, reload } = usePins(folderId);
    const toast = useToast();
    const [refreshing, setRefreshing] = useState<Set<string>>(() => new Set());
    const [refreshErrors, setRefreshErrors] = useState<Record<string, string>>({});
    const pendingDeletes = useRef(new Map<string, ReturnType<typeof setTimeout>>());

    // Removals are deferred for the undo window; leaving the tab commits them.
    const destroyRef = useRef(destroy);
    useEffect(() => {
        destroyRef.current = destroy;
    }, [destroy]);
    useEffect(() => {
        const pending = pendingDeletes.current;
        return () => {
            pending.forEach((timer, id) => {
                clearTimeout(timer);
                void destroyRef.current(id).catch(() => undefined);
            });
            pending.clear();
        };
    }, []);

    const onRefresh = async (pin: PinItem) => {
        setRefreshing((s) => new Set(s).add(pin.id));
        setRefreshErrors((errs) => {
            const next = { ...errs };
            delete next[pin.id];
            return next;
        });
        try {
            const next = await refresh(pin.id);
            if (next?.refreshError) setRefreshErrors((e) => ({ ...e, [pin.id]: next.refreshError as string }));
        } catch (e) {
            setRefreshErrors((errs) => ({ ...errs, [pin.id]: (e as Error).message }));
        } finally {
            setRefreshing((s) => {
                const n = new Set(s);
                n.delete(pin.id);
                return n;
            });
        }
    };

    const onMove = (pin: PinItem, dir: -1 | 1) => {
        const result = movePin(pins ?? [], pin.id, dir);
        if (!result) return;
        void setLocal(() => result.pins);
        persistOrder(result.patches).catch((e: Error) => toast.error("Réorganisation impossible", e.message));
    };

    const onRename = (pin: PinItem, title: string) => patch(pin.id, { title }).catch((e: Error) => toast.error("Renommage impossible", e.message));

    const onRemove = useCallback(
        (pin: PinItem) => {
            void setLocal((list) => list.filter((p) => p.id !== pin.id));
            const timer = setTimeout(() => {
                pendingDeletes.current.delete(pin.id);
                destroy(pin.id).catch((e: Error) => {
                    toast.error("Retrait impossible", e.message);
                    void reload();
                });
            }, UNDO_MS);
            pendingDeletes.current.set(pin.id, timer);
            toast.addToast({
                type: "info",
                title: "Retiré du tableau",
                message: pin.title,
                duration: UNDO_MS,
                action: {
                    label: "Annuler",
                    onClick: () => {
                        const t = pendingDeletes.current.get(pin.id);
                        if (t) clearTimeout(t);
                        pendingDeletes.current.delete(pin.id);
                        void setLocal((list) => sortPins([...list.filter((p) => p.id !== pin.id), pin]));
                    },
                },
            });
        },
        [destroy, reload, setLocal, toast],
    );

    if (error) {
        return (
            <div className="flex flex-col items-center gap-3">
                <EmptyBlock compact icon={LayoutGrid} tone="rose" title="Impossible de charger le tableau" hint={error.message} />
                <button type="button" className={SECONDARY_BUTTON} onClick={() => void reload()}>
                    Réessayer
                </button>
            </div>
        );
    }

    if (isLoading || !pins) {
        return (
            <div className="grid gap-4 lg:grid-cols-2" aria-busy="true" aria-label="Chargement du tableau">
                {[0, 1].map((i) => (
                    <Shimmer key={i} className="h-72" />
                ))}
            </div>
        );
    }

    if (pins.length === 0) {
        return (
            <EmptyBlock
                icon={Pin}
                tone="indigo"
                title="Ton tableau est vide"
                hint="Dans une conversation, survole un graphique et clique sur l'épingle en haut à droite : il apparaît ici et peut être actualisé à tout moment."
            />
        );
    }

    return (
        <ul className="grid gap-4 lg:grid-cols-2" aria-label="Graphiques épinglés">
            {pins.map((pin, i) => {
                const visual = pinVisual<StoredVisual>(pin);
                return (
                    <li
                        key={pin.id}
                        className={cn("min-w-0 motion-safe:animate-ds-enter", visual && WIDE.has(visual.spec.kind) && "lg:col-span-2")}
                        style={{ animationDelay: `${Math.min(i, 7) * 30}ms` }}
                    >
                        <PinCard
                            pin={pin}
                            visual={visual}
                            first={i === 0}
                            last={i === pins.length - 1}
                            refreshing={refreshing.has(pin.id)}
                            refreshError={refreshErrors[pin.id] ?? pin.refreshError}
                            onRefresh={() => void onRefresh(pin)}
                            onMove={(dir) => onMove(pin, dir)}
                            onRename={(t) => void onRename(pin, t)}
                            onRemove={() => onRemove(pin)}
                            onOpenConversation={onOpenConversation}
                        />
                    </li>
                );
            })}
        </ul>
    );
}

function PinCard({
    pin,
    visual,
    first,
    last,
    refreshing,
    refreshError,
    onRefresh,
    onMove,
    onRename,
    onRemove,
    onOpenConversation,
}: {
    pin: PinItem;
    visual: StoredVisual | null;
    first: boolean;
    last: boolean;
    refreshing: boolean;
    refreshError: string | null;
    onRefresh(): void;
    onMove(dir: -1 | 1): void;
    onRename(title: string): void;
    onRemove(): void;
    onOpenConversation(id: string): void;
}) {
    const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
    const [editing, setEditing] = useState(false);
    const [title, setTitle] = useState(pin.title);
    const inputRef = useRef<HTMLInputElement>(null);
    const menuButton = useRef<HTMLButtonElement>(null);
    const displayTitle = pin.title || visual?.spec.title || "Graphique";

    useEffect(() => {
        if (editing) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [editing]);

    const commit = () => {
        const next = title.trim();
        setEditing(false);
        if (next && next !== pin.title) onRename(next.slice(0, 120));
        else setTitle(pin.title);
    };

    const conversationId = pin.conversationId;
    const closeMenu = useCallback(() => {
        setMenu(null);
    }, []);

    return (
        <article className={cn(CARD, "cp-viz flex h-full flex-col rounded-2xl p-4 transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-raised")} aria-label={displayTitle}>
            <header className="mb-3 flex items-start gap-2">
                <div className="min-w-0 flex-1">
                    {editing ? (
                        <input
                            ref={inputRef}
                            value={title}
                            maxLength={120}
                            aria-label="Titre du graphique"
                            onChange={(e) => setTitle(e.target.value)}
                            onBlur={commit}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    commit();
                                } else if (e.key === "Escape") {
                                    e.preventDefault();
                                    setTitle(pin.title);
                                    setEditing(false);
                                }
                            }}
                            className="-mx-1 w-full rounded-md border border-primary-300 bg-surface px-1 text-sm font-extrabold text-ink outline-none ring-4 ring-primary-500/12"
                        />
                    ) : (
                        <button
                            type="button"
                            onClick={() => {
                                setTitle(pin.title || displayTitle);
                                setEditing(true);
                            }}
                            className={cn("group -mx-1 inline-flex max-w-full items-center gap-1.5 rounded-md px-1 text-left text-sm font-extrabold text-ink hover:bg-surface-3/70", FOCUS)}
                            aria-label={`Renommer « ${displayTitle} »`}
                        >
                            <span className="truncate">{displayTitle}</span>
                            <Pencil className="h-3 w-3 flex-shrink-0 text-ink-4 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
                        </button>
                    )}
                    <p className="mt-0.5 truncate text-[11px] font-semibold text-ink-4">
                        {refreshing ? "Actualisation…" : pin.refreshedAt ? `Actualisé ${relativeTime(pin.refreshedAt)}` : `Épinglé ${relativeTime(pin.createdAt)}`}
                        {visual?.spec.subtitle ? ` · ${visual.spec.subtitle}` : ""}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onRefresh}
                    disabled={refreshing}
                    className={cn(SECONDARY_BUTTON, "h-8 px-2.5")}
                    aria-label="Actualiser le graphique"
                    title="Actualiser avec les données du moment"
                >
                    <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "motion-safe:animate-spin")} aria-hidden />
                    <span className="hidden sm:inline">Actualiser</span>
                </button>
                <button
                    ref={menuButton}
                    type="button"
                    aria-label="Plus d'actions"
                    aria-haspopup="menu"
                    aria-expanded={!!menu}
                    onClick={() => {
                        const r = menuButton.current?.getBoundingClientRect();
                        setMenu(menu ? null : r ? { x: r.right - 200, y: r.bottom + 6 } : { x: 0, y: 0 });
                    }}
                    className={cn("inline-flex h-8 w-8 items-center justify-center rounded-xl border border-line bg-surface text-ink-3 shadow-2xs transition-colors hover:border-line-strong hover:text-ink", FOCUS)}
                >
                    <MoreHorizontal className="h-4 w-4" aria-hidden />
                </button>
            </header>

            {refreshError && (
                <p role="alert" className="mb-3 flex items-start gap-1.5 rounded-xl border border-warning-line bg-warning-soft px-3 py-2 text-[11px] font-semibold text-warning-ink motion-safe:animate-ds-pop">
                    <AlertTriangle className="mt-px h-3.5 w-3.5 flex-shrink-0" aria-hidden />
                    <span>Actualisation impossible : {refreshError} Les données affichées sont celles de la dernière réussite.</span>
                </p>
            )}

            <div className={cn("min-w-0 flex-1 transition-opacity duration-300", refreshing && "opacity-50")} aria-busy={refreshing || undefined}>
                {visual ? (
                    <VisualView spec={visual.spec} />
                ) : (
                    <p className="rounded-xl border border-dashed border-line bg-surface-2/60 px-4 py-8 text-center text-xs text-ink-3">Ce visuel ne peut pas être affiché.</p>
                )}
            </div>

            {(pin.question || conversationId) && (
                <footer className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line-subtle pt-2.5">
                    {pin.question ? <p className="min-w-0 flex-1 truncate text-[11px] italic text-ink-3" title={pin.question}>« {pin.question} »</p> : <span />}
                    {conversationId && (
                        <button
                            type="button"
                            onClick={() => onOpenConversation(conversationId)}
                            className={cn("inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] font-bold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink", FOCUS)}
                        >
                            <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                            Ouvrir la conversation
                        </button>
                    )}
                </footer>
            )}

            <ContextMenu
                position={menu}
                onClose={closeMenu}
                items={[
                    { label: "Renommer", icon: <Pencil className="h-4 w-4" />, onClick: () => { setTitle(pin.title || displayTitle); setEditing(true); } },
                    { label: "Monter", icon: <ArrowUp className="h-4 w-4" />, onClick: () => onMove(-1), disabled: first },
                    { label: "Descendre", icon: <ArrowDown className="h-4 w-4" />, onClick: () => onMove(1), disabled: last },
                    ...(conversationId
                        ? [{ label: "Ouvrir la conversation", icon: <MessageSquare className="h-4 w-4" />, onClick: () => onOpenConversation(conversationId) }]
                        : []),
                    { label: "Retirer du tableau", icon: <Trash2 className="h-4 w-4" />, onClick: onRemove, variant: "danger" as const, divider: true },
                ]}
            />
        </article>
    );
}
