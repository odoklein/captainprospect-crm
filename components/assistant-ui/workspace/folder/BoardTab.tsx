"use client";

/**
 * Tableau tab: the charts pinned to the folder, as a responsive grid of
 * Cards. Each card redraws its stored visual, can be refreshed with the same
 * query, renamed inline, reordered (menu Monter / Descendre) and removed
 * (deferred delete with an undo toast).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, MessageSquare, MoreHorizontal, Pencil, Pin, RefreshCw, Trash2 } from "lucide-react";
import type { PinItem } from "@/lib/assistant/api-contract";
import type { StoredVisual } from "@/lib/assistant/visuals/spec";
import { usePins } from "@/lib/assistant/client/folder-hooks";
import { WIDE_VISUALS, cleanTitle, movePin, pinVisual, restorePin } from "@/lib/assistant/client/folder-logic";
import { relativeTime } from "@/components/accueil/AccueilUI";
import { Button } from "@/components/ui/shadcn/button";
import { Card } from "@/components/ui/shadcn/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/shadcn/tooltip";
import { FOCUS_RING } from "@/components/ui/recipes";
import { useToast } from "@/components/ui/Toast";
import { VisualView } from "@/components/assistant-ui/visuals/VisualView";
import { cn } from "@/lib/utils";
import { ENTER, EmptyState, ErrorState, InlineTitleInput, stagger } from "./parts";

const UNDO_MS = 6000;

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
                        void setLocal((list) => restorePin(list, pin));
                    },
                },
            });
        },
        [destroy, reload, setLocal, toast],
    );

    if (error) return <ErrorState title="Impossible de charger le tableau" message={error.message} onRetry={() => void reload()} />;

    if (isLoading || !pins) {
        return (
            <div className="grid gap-4 lg:grid-cols-2" aria-busy="true" aria-label="Chargement du tableau">
                {[0, 1].map((i) => (
                    <Card key={i} className="gap-4 p-5">
                        <div className="flex items-center gap-3">
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-4 w-1/2 rounded-md" />
                                <Skeleton className="h-3 w-1/3 rounded-md" />
                            </div>
                            <Skeleton className="h-8 w-28 rounded-[10px]" />
                        </div>
                        <Skeleton className="h-52 rounded-panel" />
                    </Card>
                ))}
            </div>
        );
    }

    if (pins.length === 0) {
        return (
            <EmptyState
                icon={Pin}
                tone="primary"
                title="Ton tableau est vide"
                hint={
                    <>
                        Dans une conversation, survole un graphique et clique sur l&apos;épingle en haut à droite : il apparaît ici, et
                        « Actualiser » le recalcule avec les données du moment.
                    </>
                }
            />
        );
    }

    return (
        <ul className="grid gap-4 lg:grid-cols-2" aria-label="Graphiques épinglés">
            {pins.map((pin, i) => {
                const visual = pinVisual<StoredVisual>(pin);
                return (
                    <li key={pin.id} className={cn("min-w-0", ENTER, visual && WIDE_VISUALS.has(visual.spec.kind) && "lg:col-span-2")} style={stagger(i)}>
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
    const [editing, setEditing] = useState(false);
    const keepFocus = useRef(false);
    const displayTitle = pin.title || visual?.spec.title || "Graphique";
    const conversationId = pin.conversationId;

    return (
        <Card
            aria-label={displayTitle}
            role="article"
            className="cp-viz h-full gap-0 p-5 transition-[border-color,box-shadow] duration-200 ease-snappy hover:border-line-strong hover:shadow-raised"
        >
            <header className="mb-4 flex items-start gap-2">
                <div className="min-w-0 flex-1">
                    {editing ? (
                        <InlineTitleInput
                            initial={displayTitle}
                            maxLength={120}
                            label="Titre du graphique"
                            className="-mx-2 h-8 text-sm font-semibold"
                            onSave={(value) => {
                                const next = cleanTitle(value, pin.title);
                                if (next) onRename(next);
                            }}
                            onDone={() => setEditing(false)}
                        />
                    ) : (
                        <button
                            type="button"
                            onClick={() => setEditing(true)}
                            className={cn(
                                "group -mx-2 inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-0.5 text-left text-sm font-semibold text-ink transition-colors duration-150 hover:bg-surface-3",
                                FOCUS_RING,
                            )}
                            aria-label={`Renommer « ${displayTitle} »`}
                        >
                            <span className="truncate">{displayTitle}</span>
                            <Pencil className="size-3 shrink-0 text-ink-4 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
                        </button>
                    )}
                    <p className="mt-0.5 truncate text-xs text-ink-4" aria-live="polite">
                        {refreshing ? "Actualisation…" : pin.refreshedAt ? `Actualisé ${relativeTime(pin.refreshedAt)}` : `Épinglé ${relativeTime(pin.createdAt)}`}
                        {visual?.spec.subtitle ? ` · ${visual.spec.subtitle}` : ""}
                    </p>
                </div>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing} aria-label="Actualiser le graphique">
                            <RefreshCw className={cn(refreshing && "motion-safe:animate-spin")} aria-hidden />
                            <span className="hidden sm:inline">{refreshing ? "Actualisation" : "Actualiser"}</span>
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Recalculer avec les données du moment</TooltipContent>
                </Tooltip>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label="Plus d'actions">
                            <MoreHorizontal aria-hidden />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        align="end"
                        className="w-56"
                        onCloseAutoFocus={(e) => {
                            if (keepFocus.current) {
                                e.preventDefault();
                                keepFocus.current = false;
                            }
                        }}
                    >
                        <DropdownMenuItem
                            onSelect={() => {
                                keepFocus.current = true;
                                setEditing(true);
                            }}
                        >
                            <Pencil aria-hidden />
                            Renommer
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={first} onSelect={() => onMove(-1)}>
                            <ArrowUp aria-hidden />
                            Monter
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={last} onSelect={() => onMove(1)}>
                            <ArrowDown aria-hidden />
                            Descendre
                        </DropdownMenuItem>
                        {conversationId && (
                            <DropdownMenuItem onSelect={() => onOpenConversation(conversationId)}>
                                <MessageSquare aria-hidden />
                                Ouvrir la conversation
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={onRemove}>
                            <Trash2 aria-hidden />
                            Retirer du tableau
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </header>

            {refreshError && (
                <p
                    role="alert"
                    className="mb-4 flex items-start gap-2 rounded-control border border-warning-line bg-warning-soft px-3 py-2 text-xs font-medium text-warning-ink motion-safe:animate-ds-pop"
                >
                    <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
                    <span className="flex-1">Actualisation impossible : {refreshError} Les données affichées sont celles de la dernière réussite.</span>
                    <Button variant="link" size="xs" className="h-auto px-0 text-warning-ink" onClick={onRefresh} disabled={refreshing}>
                        Réessayer
                    </Button>
                </p>
            )}

            <div
                className={cn("relative min-w-0 flex-1 transition-[opacity,filter] duration-300 ease-snappy", refreshing && "opacity-50 motion-safe:blur-[1px]")}
                aria-busy={refreshing || undefined}
            >
                {visual ? (
                    <VisualView spec={visual.spec} />
                ) : (
                    <p className="rounded-panel border border-dashed border-line bg-surface-2 px-4 py-8 text-center text-xs text-ink-3">Ce visuel ne peut pas être affiché.</p>
                )}
            </div>

            {(pin.question || conversationId) && (
                <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line-subtle pt-3">
                    {pin.question ? (
                        <p className="min-w-0 flex-1 truncate text-xs italic text-ink-3" title={pin.question}>
                            « {pin.question} »
                        </p>
                    ) : (
                        <span />
                    )}
                    {conversationId && (
                        <Button variant="ghost" size="xs" onClick={() => onOpenConversation(conversationId)}>
                            <MessageSquare aria-hidden />
                            Ouvrir la conversation
                        </Button>
                    )}
                </footer>
            )}
        </Card>
    );
}
