"use client";

/**
 * Conversations tab: starter questions, the « Nouvelle conversation »
 * composer, and the folder's threads (search, infinite scroll).
 */

import { useEffect, useId, useRef, useState } from "react";
import { ArrowUp, Lock, MessageSquare, Pin, Search, Users, X } from "lucide-react";
import type { ConversationCard, FolderDetail } from "@/lib/assistant/api-contract";
import { useFolderConversations } from "@/lib/assistant/client/folder-hooks";
import { CARD, CARD_HOVER, EmptyBlock, FOCUS, Initials, SECONDARY_BUTTON, SelectField, Shimmer, relativeTime } from "@/components/accueil/AccueilUI";
import { AiMark } from "@/components/ui/AiMark";
import { Kbd } from "@/components/ui/Kbd";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";
import { starterQuestions } from "./logic";

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
    const activeMissions = detail?.missions ?? [];
    const [missionId, setMissionId] = useState<string>("");
    const [q, setQ] = useState("");
    const [debounced, setDebounced] = useState("");

    useEffect(() => {
        const id = setTimeout(() => setDebounced(q), 250);
        return () => clearTimeout(id);
    }, [q]);

    const start = (firstMessage?: string) =>
        onStartConversation({
            folderId,
            clientId: detail?.clientId ?? null,
            missionId: isClient && missionId ? missionId : null,
            firstMessage: firstMessage?.trim() || undefined,
        });

    const starters = starterQuestions(folderId === null ? "AGENCY" : (detail?.kind ?? "GENERAL"), detail?.starterQuestions);

    return (
        <div className="space-y-6">
            <Composer
                placeholder={
                    folderId === null
                        ? "Pose une question sur l'agence…"
                        : isClient
                          ? `Pose une question sur ${detail?.name ?? "ce client"}…`
                          : `Pose une question dans « ${detail?.name ?? "ce dossier"} »…`
                }
                missions={isClient ? activeMissions : []}
                missionId={missionId}
                onMissionChange={setMissionId}
                onSend={(text) => start(text)}
            />

            <section aria-labelledby="starters-title">
                <h2 id="starters-title" className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-4">
                    <AiMark className="h-3.5 w-3.5 text-accent-600" aria-hidden />
                    Pour commencer
                </h2>
                <div className="grid gap-2.5 sm:grid-cols-2">
                    {starters.map((s, i) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => start(s)}
                            style={{ animationDelay: `${Math.min(i, 7) * 30}ms` }}
                            className={cn(
                                CARD,
                                CARD_HOVER,
                                FOCUS,
                                "group flex items-start gap-3 rounded-2xl p-3.5 text-left motion-safe:animate-ds-enter",
                            )}
                        >
                            <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-accent-50 text-accent-700 transition-colors group-hover:bg-accent-100">
                                <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                            </span>
                            <span className="text-[13px] font-semibold leading-snug text-ink-2 group-hover:text-ink">{s}</span>
                            <ArrowUp className="ml-auto mt-0.5 h-3.5 w-3.5 flex-shrink-0 rotate-45 text-ink-4 opacity-0 transition-[opacity,transform] duration-200 ease-[var(--ease-snappy)] group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden />
                        </button>
                    ))}
                </div>
            </section>

            <ConversationList folderId={folderId} q={debounced} rawQ={q} onQChange={setQ} onOpen={onOpenConversation} onStart={() => start()} />
        </div>
    );
}

// ============================================
// Composer
// ============================================

function Composer({
    placeholder,
    missions,
    missionId,
    onMissionChange,
    onSend,
}: {
    placeholder: string;
    missions: Array<{ id: string; name: string }>;
    missionId: string;
    onMissionChange(id: string): void;
    onSend(text: string): void;
}) {
    const [text, setText] = useState("");
    const ref = useRef<HTMLTextAreaElement>(null);
    const id = useId();

    // Auto-grow up to ~8 lines.
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }, [text]);

    const send = () => {
        const value = text.trim();
        if (!value) {
            ref.current?.focus();
            return;
        }
        onSend(value);
        setText("");
    };

    return (
        <section
            aria-label="Nouvelle conversation"
            className={cn(CARD, "rounded-2xl p-1.5 transition-[border-color,box-shadow] duration-200 focus-within:border-primary-300 focus-within:shadow-raised")}
        >
            <label htmlFor={id} className="sr-only">
                Nouvelle conversation
            </label>
            <textarea
                id={id}
                ref={ref}
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
                className="block max-h-[200px] min-h-[56px] w-full resize-none bg-transparent px-3 py-2.5 text-sm leading-relaxed text-ink outline-none placeholder:text-ink-4"
            />
            <div className="flex flex-wrap items-center gap-2 px-1.5 pb-1">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-ink-3">
                    <MessageSquare className="h-3.5 w-3.5 text-ink-4" aria-hidden />
                    Nouvelle conversation
                </span>
                {missions.length > 0 && (
                    <SelectField value={missionId} onChange={onMissionChange} ariaLabel="Mission" className="w-full min-w-0 sm:w-56">
                        <option value="">Toutes les missions</option>
                        {missions.map((m) => (
                            <option key={m.id} value={m.id}>
                                {m.name}
                            </option>
                        ))}
                    </SelectField>
                )}
                <span className="ml-auto hidden items-center gap-1 text-[11px] text-ink-4 sm:inline-flex">
                    <Kbd>Entrée</Kbd> envoyer · <Kbd>Maj</Kbd>+<Kbd>Entrée</Kbd> ligne
                </span>
                <button
                    type="button"
                    onClick={send}
                    disabled={!text.trim()}
                    aria-label="Envoyer"
                    className={cn(
                        "ml-auto inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-fg shadow-primary sm:ml-0",
                        "transition-[background-color,transform,opacity] duration-150 ease-[var(--ease-snappy)] hover:bg-primary-hover active:scale-95 disabled:opacity-40",
                        FOCUS,
                    )}
                >
                    <ArrowUp className="h-4 w-4" aria-hidden />
                </button>
            </div>
        </section>
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

    return (
        <section aria-labelledby="threads-title" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="threads-title" className="text-[11px] font-bold uppercase tracking-wider text-ink-4">
                    {folderId === null ? "Conversations de l'agence" : "Conversations du dossier"}
                </h2>
                <div className="relative w-full sm:w-64">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-4" aria-hidden />
                    <input
                        type="search"
                        value={rawQ}
                        onChange={(e) => onQChange(e.target.value)}
                        onKeyDown={(e) => e.key === "Escape" && rawQ && (e.preventDefault(), onQChange(""))}
                        placeholder="Rechercher dans le dossier"
                        aria-label="Rechercher une conversation"
                        className={cn(
                            "h-9 w-full rounded-xl border border-line bg-surface pl-8 pr-8 text-xs font-semibold text-ink shadow-2xs placeholder:font-medium placeholder:text-ink-4",
                            "transition-[border-color,box-shadow] duration-150 hover:border-line-strong focus:border-primary-400 focus:outline-none focus:ring-4 focus:ring-primary-500/12 [&::-webkit-search-cancel-button]:hidden",
                        )}
                    />
                    {rawQ && (
                        <button
                            type="button"
                            onClick={() => onQChange("")}
                            aria-label="Effacer la recherche"
                            className={cn("absolute right-1.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-ink-4 hover:bg-surface-3 hover:text-ink-2", FOCUS)}
                        >
                            <X className="h-3.5 w-3.5" aria-hidden />
                        </button>
                    )}
                </div>
            </div>

            {degraded && (
                <p className="rounded-xl border border-warning-line bg-warning-soft px-3 py-2 text-[11px] font-semibold text-warning-ink">
                    L&apos;historique n&apos;est pas encore disponible sur cette instance.
                </p>
            )}

            {error ? (
                <div className="flex flex-col items-center gap-3 py-6">
                    <EmptyBlock compact icon={MessageSquare} tone="rose" title="Impossible de charger les conversations" hint={error.message} />
                    <button type="button" className={SECONDARY_BUTTON} onClick={() => void reload()}>
                        Réessayer
                    </button>
                </div>
            ) : isLoading ? (
                <ul className="space-y-2" aria-busy="true" aria-label="Chargement des conversations">
                    {Array.from({ length: 4 }, (_, i) => (
                        <li key={i}>
                            <Shimmer className="h-[72px]" style={{ animationDelay: `${i * 80}ms` }} />
                        </li>
                    ))}
                </ul>
            ) : items.length === 0 ? (
                searching ? (
                    <EmptyBlock compact icon={Search} tone="slate" title={`Aucun résultat pour « ${q.trim()} »`} hint="Essaie un autre mot, ou cherche partout avec Ctrl K." />
                ) : (
                    <div className="space-y-3 text-center">
                        <EmptyBlock
                            icon={MessageSquare}
                            tone="indigo"
                            title="Aucune conversation pour l'instant"
                            hint="Pose une première question : elle restera rangée ici avec ses réponses, ses sources et ses graphiques."
                        />
                        <button type="button" className={SECONDARY_BUTTON} onClick={onStart}>
                            Démarrer une conversation
                        </button>
                    </div>
                )
            ) : (
                <ul className="space-y-2">
                    {items.map((c, i) => (
                        <li key={c.id} className="motion-safe:animate-ds-enter" style={{ animationDelay: `${Math.min(i % 30, 7) * 30}ms` }}>
                            <ConversationRow conversation={c} onOpen={onOpen} />
                        </li>
                    ))}
                </ul>
            )}

            {hasMore && !error && (
                <div ref={sentinel} className="flex justify-center pt-1">
                    <button type="button" className={SECONDARY_BUTTON} onClick={loadMore} disabled={isLoadingMore}>
                        {isLoadingMore ? <Spinner className="h-3.5 w-3.5" label="Chargement" /> : null}
                        {isLoadingMore ? "Chargement…" : "Afficher plus"}
                    </button>
                </div>
            )}
        </section>
    );
}

function ConversationRow({ conversation: c, onOpen }: { conversation: ConversationCard; onOpen(id: string): void }) {
    const when = c.lastMessageAt ?? c.createdAt;
    const sharedByOther = c.visibility === "SHARED" && !c.isOwner && !!c.ownerName;
    return (
        <button
            type="button"
            onClick={() => onOpen(c.id)}
            className={cn(CARD, CARD_HOVER, FOCUS, "group flex w-full items-start gap-3 rounded-2xl p-3.5 text-left")}
        >
            {sharedByOther ? (
                <span title={`Partagée par ${c.ownerName}`}>
                    <Initials name={c.ownerName ?? "?"} size="sm" />
                </span>
            ) : (
                <span
                    aria-hidden
                    className={cn(
                        "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border",
                        c.kind === "AGENT" ? "border-accent-200 bg-accent-50 text-accent-700" : "border-line bg-surface-2 text-ink-3",
                    )}
                >
                    {c.kind === "AGENT" ? <AiMark className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
                </span>
            )}
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                    {c.pinnedAt && <Pin className="h-3 w-3 flex-shrink-0 text-ink-4" aria-label="Épinglée" />}
                    <span className="truncate text-[13px] font-extrabold text-ink group-hover:text-ink">{c.title || "Sans titre"}</span>
                </span>
                {c.preview && <span className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink-3">{c.preview}</span>}
                <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {c.missionName && <MetaChip>{c.missionName}</MetaChip>}
                    {c.kind === "AGENT" && (
                        <MetaChip tone="violet">
                            <AiMark className="h-3 w-3" aria-hidden />
                            Agent
                        </MetaChip>
                    )}
                    {c.visibility === "SHARED" ? (
                        <MetaChip>
                            <Users className="h-3 w-3" aria-hidden />
                            {sharedByOther ? `Partagée par ${c.ownerName}` : "Partagée"}
                        </MetaChip>
                    ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-ink-4">
                            <Lock className="h-3 w-3" aria-hidden />
                            Privée
                        </span>
                    )}
                    <span className="text-[10px] font-semibold text-ink-4">
                        {c.messageCount} message{c.messageCount > 1 ? "s" : ""}
                    </span>
                </span>
            </span>
            <time dateTime={when} className="flex-shrink-0 whitespace-nowrap pt-0.5 text-[11px] font-semibold text-ink-4">
                {relativeTime(when)}
            </time>
        </button>
    );
}

function MetaChip({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "violet" }) {
    return (
        <span
            className={cn(
                "inline-flex h-5 max-w-[220px] items-center gap-1 truncate rounded-full border px-2 text-[10px] font-bold",
                tone === "violet" ? "border-accent-200 bg-accent-50 text-accent-700" : "border-line bg-surface-2 text-ink-2",
            )}
        >
            {children}
        </span>
    );
}
