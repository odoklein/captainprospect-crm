"use client";

/**
 * Conversations tab: the « Nouvelle conversation » composer (mission picker
 * for CLIENT folders), starter questions, and the folder's threads (search,
 * infinite scroll, row menu: Ouvrir, Renommer, Épingler, Exporter en PDF).
 */

import { useEffect, useId, useRef, useState } from "react";
import { ArrowUp, ArrowUpRight, Download, Lock, MessageSquare, MoreHorizontal, Pencil, Pin, PinOff, Search, SquarePen, Users, X } from "lucide-react";
import type { ConversationCard, FolderDetail } from "@/lib/assistant/api-contract";
import { useFolderConversations } from "@/lib/assistant/client/folder-hooks";
import { useThreadActions } from "@/lib/assistant/client/thread-hooks";
import { downloadConversationPdf } from "@/lib/assistant/client/export";
import { ALL_MISSIONS, cleanTitle, initialsOf, missionIdFromSelect, starterQuestions } from "@/lib/assistant/client/folder-logic";
import { relativeTime } from "@/components/accueil/AccueilUI";
import { Avatar, AvatarFallback } from "@/components/ui/shadcn/avatar";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Card } from "@/components/ui/shadcn/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import { Input } from "@/components/ui/shadcn/input";
import { Kbd } from "@/components/ui/shadcn/kbd";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { FOCUS_RING } from "@/components/ui/recipes";
import { useToast } from "@/components/ui/Toast";
import { AiMark } from "@/components/ui/AiMark";
import { cn } from "@/lib/utils";
import { DegradedNotice, ENTER, EmptyState, ErrorState, InlineTitleInput, SectionTitle, Spinner, stagger } from "./parts";

type StartOpts = { folderId: string | null; clientId?: string | null; missionId?: string | null; firstMessage?: string };

export function ConversationsTab({
    folderId,
    detail,
    onOpenConversation,
    onStartConversation,
}: {
    folderId: string | null;
    detail: FolderDetail | null;
    onOpenConversation(id: string): void;
    onStartConversation(opts: StartOpts): void;
}) {
    const isClient = detail?.kind === "CLIENT";
    const missions = isClient ? (detail?.missions ?? []) : [];
    const [mission, setMission] = useState<string>(ALL_MISSIONS);
    const [q, setQ] = useState("");
    const [debounced, setDebounced] = useState("");
    const composerRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const id = setTimeout(() => setDebounced(q), 250);
        return () => clearTimeout(id);
    }, [q]);

    const start = (firstMessage?: string) =>
        onStartConversation({
            folderId,
            clientId: detail?.clientId ?? null,
            missionId: isClient ? missionIdFromSelect(mission) : null,
            firstMessage: firstMessage?.trim() || undefined,
        });

    const starters = starterQuestions(folderId === null ? "AGENCY" : (detail?.kind ?? "GENERAL"), detail?.starterQuestions);

    return (
        <div className="@container space-y-8">
            <Composer
                textareaRef={composerRef}
                placeholder={
                    folderId === null
                        ? "Pose une question sur l'agence…"
                        : isClient
                          ? `Pose une question sur ${detail?.name ?? "ce client"}…`
                          : `Pose une question dans « ${detail?.name ?? "ce dossier"} »…`
                }
                missions={missions}
                mission={mission}
                onMissionChange={setMission}
                onSend={(text) => start(text)}
            />

            <section aria-labelledby="starters-title" className="space-y-3">
                <SectionTitle id="starters-title">
                    <AiMark className="size-3.5 text-accent-600" aria-hidden />
                    Pour commencer
                </SectionTitle>
                <div className="grid gap-2.5 @lg:grid-cols-2 @4xl:grid-cols-4">
                    {starters.map((s, i) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => start(s)}
                            style={stagger(i)}
                            className={cn(
                                "group flex min-h-[76px] items-start gap-3 rounded-panel border border-line bg-surface p-3.5 text-left shadow-2xs",
                                "transition-[border-color,box-shadow,transform] duration-200 ease-snappy hover:-translate-y-px hover:border-line-strong hover:shadow-raised active:translate-y-0",
                                "motion-reduce:hover:translate-y-0",
                                ENTER,
                                FOCUS_RING,
                            )}
                        >
                            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg border border-accent-200 bg-accent-soft text-accent-soft-ink" aria-hidden>
                                <MessageSquare className="size-3.5" />
                            </span>
                            <span className="flex-1 text-[13px] font-medium leading-snug text-ink-2 transition-colors group-hover:text-ink">{s}</span>
                            <ArrowUpRight
                                className="mt-0.5 size-3.5 shrink-0 text-ink-4 opacity-0 transition-[opacity,transform] duration-200 ease-snappy group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100 group-focus-visible:opacity-100"
                                aria-hidden
                            />
                        </button>
                    ))}
                </div>
            </section>

            <ConversationList
                folderId={folderId}
                q={debounced}
                rawQ={q}
                onQChange={setQ}
                onOpen={onOpenConversation}
                onStart={() => composerRef.current?.focus()}
            />
        </div>
    );
}

// ============================================
// Composer
// ============================================

function Composer({
    textareaRef,
    placeholder,
    missions,
    mission,
    onMissionChange,
    onSend,
}: {
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    placeholder: string;
    missions: Array<{ id: string; name: string }>;
    mission: string;
    onMissionChange(id: string): void;
    onSend(text: string): void;
}) {
    const [text, setText] = useState("");
    const id = useId();

    const send = () => {
        const value = text.trim();
        if (!value) {
            textareaRef.current?.focus();
            return;
        }
        onSend(value);
        setText("");
    };

    return (
        <Card
            role="group"
            aria-label="Nouvelle conversation"
            className={cn(
                "gap-0 p-2 transition-[border-color,box-shadow] duration-200 ease-snappy",
                "focus-within:border-primary-400 focus-within:shadow-raised focus-within:ring-4 focus-within:ring-primary-500/10",
            )}
        >
            <label htmlFor={id} className="sr-only">
                Nouvelle conversation
            </label>
            <Textarea
                id={id}
                ref={textareaRef}
                rows={2}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        send();
                    }
                }}
                placeholder={placeholder}
                className="max-h-[200px] min-h-[60px] border-0 bg-transparent px-3 py-2.5 text-[15px] shadow-none hover:border-0 focus-visible:ring-0"
            />
            <div className="flex flex-wrap items-center gap-2 px-1.5 pb-0.5 pt-1">
                {missions.length > 0 ? (
                    <Select value={mission} onValueChange={onMissionChange}>
                        <SelectTrigger size="sm" aria-label="Mission" className="max-w-full min-w-0 sm:w-60">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL_MISSIONS}>Toutes les missions</SelectItem>
                            {missions.map((m) => (
                                <SelectItem key={m.id} value={m.id}>
                                    {m.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : (
                    <span className="inline-flex items-center gap-1.5 px-1.5 text-xs font-medium text-ink-3">
                        <SquarePen className="size-3.5 text-ink-4" aria-hidden />
                        Nouvelle conversation
                    </span>
                )}
                <span className="ml-auto hidden items-center gap-1 text-xs text-ink-4 sm:inline-flex">
                    <Kbd>Entrée</Kbd> envoyer · <Kbd>Maj</Kbd>
                    <Kbd>Entrée</Kbd> ligne
                </span>
                <Button size="icon" onClick={send} disabled={!text.trim()} aria-label="Envoyer" className="ml-auto sm:ml-0">
                    <ArrowUp aria-hidden />
                </Button>
            </div>
        </Card>
    );
}

// ============================================
// List
// ============================================

function ConversationList({
    folderId,
    q,
    rawQ,
    onQChange,
    onOpen,
    onStart,
}: {
    folderId: string | null;
    q: string;
    rawQ: string;
    onQChange(q: string): void;
    onOpen(id: string): void;
    onStart(): void;
}) {
    const { items, error, isLoading, isLoadingMore, hasMore, degraded, loadMore, reload } = useFolderConversations(folderId, q);
    const actions = useThreadActions();
    const toast = useToast();
    const sentinel = useRef<HTMLDivElement>(null);
    const loadMoreRef = useRef(loadMore);
    useEffect(() => {
        loadMoreRef.current = loadMore;
    });

    useEffect(() => {
        const el = sentinel.current;
        if (!el || !hasMore || typeof IntersectionObserver === "undefined") return;
        const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && loadMoreRef.current(), { rootMargin: "320px 0px" });
        io.observe(el);
        return () => io.disconnect();
    }, [hasMore, items.length]);

    const searching = q.trim().length > 0;
    const typing = rawQ.trim() !== q.trim();

    const rename = (c: ConversationCard, title: string) =>
        actions.patchConversation(c.id, { title }).catch((e: Error) => toast.error("Renommage impossible", e.message));
    const togglePin = (c: ConversationCard) =>
        actions
            .patchConversation(c.id, { pinned: !c.pinnedAt })
            .then(() => toast.success(c.pinnedAt ? "Conversation désépinglée" : "Conversation épinglée"))
            .catch((e: Error) => toast.error("Épinglage impossible", e.message));
    const exportPdf = async (c: ConversationCard) => {
        try {
            await downloadConversationPdf(c.id);
        } catch (e) {
            toast.error("Export PDF impossible", (e as Error).message);
        }
    };

    return (
        <section aria-labelledby="threads-title" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <SectionTitle id="threads-title">{folderId === null ? "Conversations de l'agence" : "Conversations du dossier"}</SectionTitle>
                <div className="relative w-full sm:w-72">
                    {typing ? (
                        <Spinner className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" />
                    ) : (
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" aria-hidden />
                    )}
                    <Input
                        type="search"
                        value={rawQ}
                        onChange={(e) => onQChange(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Escape" && rawQ) {
                                e.preventDefault();
                                onQChange("");
                            }
                        }}
                        placeholder="Rechercher dans le dossier"
                        aria-label="Rechercher une conversation"
                        className="h-8 rounded-[10px] pl-8 pr-8 text-[13px] [&::-webkit-search-cancel-button]:hidden"
                    />
                    {rawQ && (
                        <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => onQChange("")}
                            aria-label="Effacer la recherche"
                            className="absolute right-0.5 top-1/2 size-7 -translate-y-1/2"
                        >
                            <X aria-hidden />
                        </Button>
                    )}
                </div>
            </div>

            {degraded && <DegradedNotice>L&apos;historique n&apos;est pas encore disponible sur cette instance.</DegradedNotice>}

            {error ? (
                <ErrorState title="Impossible de charger les conversations" message={error.message} onRetry={() => void reload()} />
            ) : isLoading ? (
                <ul className="space-y-2" aria-busy="true" aria-label="Chargement des conversations">
                    {Array.from({ length: 4 }, (_, i) => (
                        <li key={i} className="flex items-start gap-3 rounded-panel border border-line bg-surface p-3.5">
                            <Skeleton className="size-8 rounded-[10px]" />
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-3.5 rounded-md" style={{ width: `${60 - i * 8}%` }} />
                                <Skeleton className="h-3 w-4/5 rounded-md" />
                                <Skeleton className="h-4 w-32 rounded-chip" />
                            </div>
                        </li>
                    ))}
                </ul>
            ) : items.length === 0 ? (
                searching ? (
                    <EmptyState compact icon={Search} title={`Aucun résultat pour « ${q.trim()} »`} hint="Essaie un autre mot, ou cherche partout avec Ctrl K." />
                ) : (
                    <EmptyState
                        icon={MessageSquare}
                        tone="primary"
                        title="Aucune conversation pour l'instant"
                        hint="Pose une première question : elle restera rangée ici avec ses réponses, ses sources et ses graphiques."
                        action={
                            <Button variant="outline" size="sm" onClick={onStart}>
                                <SquarePen aria-hidden />
                                Démarrer une conversation
                            </Button>
                        }
                    />
                )
            ) : (
                <ul className="space-y-2" aria-label="Conversations">
                    {items.map((c, i) => (
                        <li key={c.id} className={ENTER} style={stagger(i % 30)}>
                            <ConversationRow
                                conversation={c}
                                onOpen={onOpen}
                                onRename={(title) => void rename(c, title)}
                                onTogglePin={() => void togglePin(c)}
                                onExport={() => void exportPdf(c)}
                            />
                        </li>
                    ))}
                </ul>
            )}

            {hasMore && !error && (
                <div ref={sentinel} className="flex justify-center pt-1">
                    <Button variant="outline" size="sm" onClick={loadMore} disabled={isLoadingMore}>
                        {isLoadingMore && <Spinner />}
                        {isLoadingMore ? "Chargement…" : "Afficher plus"}
                    </Button>
                </div>
            )}
        </section>
    );
}

function ConversationRow({
    conversation: c,
    onOpen,
    onRename,
    onTogglePin,
    onExport,
}: {
    conversation: ConversationCard;
    onOpen(id: string): void;
    onRename(title: string): void;
    onTogglePin(): void;
    onExport(): void;
}) {
    const [editing, setEditing] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    // « Renommer » from the menu: the closing menu must not pull focus back to its trigger.
    const keepFocus = useRef(false);
    const when = c.lastMessageAt ?? c.createdAt;
    const sharedByOther = c.visibility === "SHARED" && !c.isOwner && !!c.ownerName;
    const title = c.title || "Sans titre";

    const leading = sharedByOther ? (
        <Avatar className="size-8" title={`Partagée par ${c.ownerName}`}>
            <AvatarFallback className="text-2xs">{initialsOf(c.ownerName)}</AvatarFallback>
        </Avatar>
    ) : (
        <span
            aria-hidden
            className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-[10px] border",
                c.kind === "AGENT" ? "border-accent-200 bg-accent-soft text-accent-soft-ink" : "border-line bg-surface-2 text-ink-3",
            )}
        >
            {c.kind === "AGENT" ? <AiMark className="size-4" /> : <MessageSquare className="size-4" />}
        </span>
    );

    const meta = (
        <span className="mt-2 flex flex-wrap items-center gap-1.5">
            {c.missionName && (
                <Badge variant="secondary" className="max-w-[220px] justify-start">
                    <span className="truncate">{c.missionName}</span>
                </Badge>
            )}
            {c.kind === "AGENT" && (
                <Badge variant="ai">
                    <AiMark aria-hidden />
                    Agent
                </Badge>
            )}
            {c.visibility === "SHARED" ? (
                <Badge variant="outline">
                    <Users aria-hidden />
                    {sharedByOther ? `Partagée par ${c.ownerName}` : "Partagée"}
                </Badge>
            ) : (
                <span className="inline-flex items-center gap-1 text-2xs text-ink-4">
                    <Lock className="size-3" aria-hidden />
                    Privée
                </span>
            )}
            <span className="text-2xs text-ink-4">
                {c.messageCount} message{c.messageCount > 1 ? "s" : ""}
            </span>
        </span>
    );

    return (
        <div
            data-menu-open={menuOpen || undefined}
            className={cn(
                "group relative flex items-start gap-3 rounded-panel border border-line bg-surface p-3.5 shadow-2xs",
                "transition-[border-color,box-shadow] duration-200 ease-snappy hover:border-line-strong hover:shadow-raised data-[menu-open]:border-line-strong",
            )}
        >
            {leading}
            <div className="min-w-0 flex-1">
                {editing ? (
                    <InlineTitleInput
                        initial={title}
                        maxLength={120}
                        label="Titre de la conversation"
                        className="-mx-2 h-7 text-[13.5px] font-semibold"
                        onSave={(value) => {
                            const next = cleanTitle(value, c.title);
                            if (next) onRename(next);
                        }}
                        onDone={() => setEditing(false)}
                    />
                ) : (
                    // The whole card opens the thread; the menu sits above this layer.
                    <button
                        type="button"
                        onClick={() => onOpen(c.id)}
                        className={cn("block w-full text-left after:absolute after:inset-0 after:rounded-panel after:content-['']", FOCUS_RING, "focus-visible:ring-offset-0")}
                    >
                        <span className="flex items-center gap-1.5">
                            {c.pinnedAt && <Pin className="size-3 shrink-0 fill-current text-ink-4" aria-label="Épinglée" />}
                            <span className="truncate text-[13.5px] font-semibold text-ink">{title}</span>
                        </span>
                    </button>
                )}
                {c.preview && <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink-3">{c.preview}</p>}
                {meta}
            </div>
            <div className="relative z-10 flex shrink-0 items-center gap-1">
                <time dateTime={when} className="whitespace-nowrap pt-1 text-xs text-ink-4">
                    {relativeTime(when)}
                </time>
                <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Actions pour « ${title} »`}
                            className="sm:opacity-0 sm:transition-opacity sm:group-focus-within:opacity-100 sm:group-hover:opacity-100 sm:data-[state=open]:opacity-100"
                        >
                            <MoreHorizontal aria-hidden />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        align="end"
                        className="w-52"
                        onCloseAutoFocus={(e) => {
                            if (keepFocus.current) {
                                e.preventDefault();
                                keepFocus.current = false;
                            }
                        }}
                    >
                        <DropdownMenuItem onSelect={() => onOpen(c.id)}>
                            <ArrowUpRight aria-hidden />
                            Ouvrir
                        </DropdownMenuItem>
                        {c.isOwner && (
                            <DropdownMenuItem
                                onSelect={() => {
                                    keepFocus.current = true;
                                    setEditing(true);
                                }}
                            >
                                <Pencil aria-hidden />
                                Renommer
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onSelect={onTogglePin}>
                            {c.pinnedAt ? <PinOff aria-hidden /> : <Pin aria-hidden />}
                            {c.pinnedAt ? "Désépingler" : "Épingler"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={onExport}>
                            <Download aria-hidden />
                            Exporter en PDF
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
}
