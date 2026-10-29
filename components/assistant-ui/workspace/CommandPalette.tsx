"use client";

/**
 * Ctrl/Cmd + K palette of the Captain AI workspace: actions, folders (fuzzy,
 * accent-insensitive, local), conversations and files (server search,
 * debounced), recent items when the query is empty. Combobox + listbox
 * semantics: focus stays in the input, ↑/↓ move the active option,
 * Entrée opens it, Échap closes.
 */

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Clock, CornerDownLeft, FileText, Globe, MessageSquare, Plus, Search, X } from "lucide-react";
import type { FolderKind } from "@/lib/assistant/api-contract";
import { SEARCH_MIN_CHARS, ensureClientFolder, useAssistantSearch, useFolderList } from "@/lib/assistant/client/folder-hooks";
import { AiMark } from "@/components/ui/AiMark";
import { Kbd } from "@/components/ui/Kbd";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { FolderGlyph } from "./folder/FolderHeader";
import { fuzzyMatch, parseRecent, pushRecent, rankItems, splitHighlight, type Range, type RecentItem } from "./CommandPaletteRank";

const RECENT_KEY = "captain-ai:palette-recent";
const AGENT_PATH = "/manager/assistant/agent";

export function CommandPalette(props: {
    open: boolean;
    onOpenChange(open: boolean): void;
    onOpenConversation(id: string): void;
    onOpenFolder(folderId: string | null): void;
    onNewConversation(): void;
}) {
    // The Ctrl/Cmd + K binding itself lives in the workspace shell (AssistantWorkspace),
    // which toggles `open`; Ctrl/Cmd + K typed inside the palette bubbles to it and closes.
    const { open } = props;
    if (!open || typeof document === "undefined") return null;
    return createPortal(<PaletteDialog {...props} />, document.body);
}

// ============================================
// Items
// ============================================

type GroupId = "recent" | "actions" | "folders" | "conversations" | "files";

interface PaletteItem {
    key: string;
    label: string;
    ranges: Range[];
    sublabel?: string;
    icon: ReactNode;
    recent?: RecentItem;
    run(): void;
}

interface FolderCandidate {
    id: string | null;
    clientId: string | null;
    kind: FolderKind;
    name: string;
    color: string | null;
    icon: string | null;
}

const GROUP_LABEL: Record<GroupId, string> = {
    recent: "Récents",
    actions: "Actions",
    folders: "Dossiers",
    conversations: "Conversations",
    files: "Fichiers",
};

function readRecent(): RecentItem[] {
    try {
        return parseRecent(window.localStorage.getItem(RECENT_KEY));
    } catch {
        return [];
    }
}

function writeRecent(item: RecentItem) {
    try {
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(pushRecent(readRecent(), item)));
    } catch {
        // Private mode / blocked storage: recents are a convenience.
    }
}

function PaletteDialog({
    onOpenChange,
    onOpenConversation,
    onOpenFolder,
    onNewConversation,
}: {
    onOpenChange(open: boolean): void;
    onOpenConversation(id: string): void;
    onOpenFolder(folderId: string | null): void;
    onNewConversation(): void;
}) {
    const router = useRouter();
    const toast = useToast();
    const uid = useId();
    const listId = `${uid}-list`;
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const [query, setQuery] = useState("");
    const [debounced, setDebounced] = useState("");
    const [active, setActive] = useState(0);
    const [recent] = useState<RecentItem[]>(readRecent);
    const [isMac] = useState(() => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));

    const { data: folderList } = useFolderList();
    const search = useAssistantSearch(debounced);

    useEffect(() => {
        const id = setTimeout(() => setDebounced(query), 200);
        return () => clearTimeout(id);
    }, [query]);

    // Focus in, scroll lock, focus back to the trigger on close.
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        const overflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        inputRef.current?.focus();
        return () => {
            document.body.style.overflow = overflow;
            previous?.focus?.();
        };
    }, []);

    const close = () => onOpenChange(false);

    const folderCandidates = useMemo<FolderCandidate[]>(() => {
        const out: FolderCandidate[] = [];
        const seen = new Set<string>();
        for (const f of folderList?.general ?? []) {
            seen.add(f.id);
            out.push({ id: f.id, clientId: null, kind: "GENERAL", name: f.name, color: f.color, icon: f.icon });
        }
        for (const c of folderList?.clients ?? []) {
            if (c.folder) seen.add(c.folder.id);
            out.push({ id: c.folder?.id ?? null, clientId: c.clientId, kind: "CLIENT", name: c.folder?.name ?? c.name, color: c.folder?.color ?? null, icon: c.folder?.icon ?? null });
        }
        for (const f of search.data?.folders ?? []) {
            if (seen.has(f.id)) continue;
            seen.add(f.id);
            out.push({ id: f.id, clientId: f.clientId, kind: f.kind, name: f.name, color: null, icon: null });
        }
        return out;
    }, [folderList, search.data]);

    const folderNames = useMemo(() => {
        const m = new Map<string, string>();
        for (const f of folderCandidates) if (f.id) m.set(f.id, f.name);
        return m;
    }, [folderCandidates]);

    const openFolder = (f: { id: string | null; clientId: string | null; name: string }) => {
        if (f.id) {
            onOpenFolder(f.id);
            return;
        }
        if (!f.clientId) return;
        ensureClientFolder(f.clientId)
            .then((card) => onOpenFolder(card.id))
            .catch((e: Error) => toast.error(`Impossible d'ouvrir « ${f.name} »`, e.message));
    };

    const q = query.trim();
    const searching = q.length >= SEARCH_MIN_CHARS;
    const searchPending = searching && (debounced.trim() !== q || (search.isValidating && !search.data));

    const sections = useMemo(() => {
        const out: Array<{ id: GroupId; items: PaletteItem[] }> = [];
        const actions: Array<{ key: string; label: string; keywords: string; icon: ReactNode; run(): void }> = [
            { key: "new", label: "Nouvelle conversation", keywords: "nouveau chat question demander", icon: <Plus className="h-4 w-4" />, run: onNewConversation },
            { key: "agency", label: "Vue agence", keywords: "agence accueil general tout", icon: <Globe className="h-4 w-4" />, run: () => onOpenFolder(null) },
            { key: "agent", label: "Agent", keywords: "agent veille automatisation surveillance rapports", icon: <AiMark className="h-4 w-4 text-accent-600" />, run: () => router.push(AGENT_PATH) },
        ];

        if (!q) {
            if (recent.length) {
                out.push({
                    id: "recent",
                    items: recent.map((r) => ({
                        key: `recent:${r.kind}:${r.id}`,
                        label: r.label,
                        ranges: [],
                        sublabel: r.kind === "conversation" ? "Conversation" : r.kind === "file" ? "Fichier" : "Dossier",
                        icon:
                            r.kind === "conversation" ? (
                                <MessageSquare className="h-4 w-4" />
                            ) : r.kind === "file" ? (
                                <FileText className="h-4 w-4" />
                            ) : (
                                <Clock className="h-4 w-4" />
                            ),
                        recent: r,
                        run: () => {
                            if (r.kind === "conversation") onOpenConversation(r.id);
                            else if (r.kind === "file") onOpenFolder(r.folderId);
                            else openFolder({ id: r.id.startsWith("client:") ? null : r.id, clientId: r.clientId ?? null, name: r.label });
                        },
                    })),
                });
            }
            out.push({ id: "actions", items: actions.map((a) => ({ key: `action:${a.key}`, label: a.label, ranges: [], icon: a.icon, run: a.run })) });
            return out;
        }

        const actionHits = rankItems(q, actions, (a) => a.label, 3)
            .map(({ item, hit }) => ({ key: `action:${item.key}`, label: item.label, ranges: hit.ranges, icon: item.icon, run: item.run }))
            .concat(
                // A keyword hit without a label hit still surfaces the action, unhighlighted.
                actions
                    .filter((a) => !fuzzyMatch(q, a.label) && (fuzzyMatch(q, a.keywords)?.score ?? 0) >= 600)
                    .map((a) => ({ key: `action:${a.key}`, label: a.label, ranges: [], icon: a.icon, run: a.run })),
            );
        if (actionHits.length) out.push({ id: "actions", items: actionHits });

        const folderHits = rankItems(q, folderCandidates, (f) => f.name, 6);
        if (folderHits.length) {
            out.push({
                id: "folders",
                items: folderHits.map(({ item: f, hit }) => {
                    const recentItem: RecentItem = { kind: "folder", id: f.id ?? `client:${f.clientId}`, label: f.name, folderId: f.id, clientId: f.clientId };
                    return {
                        key: `folder:${f.id ?? `client:${f.clientId}`}`,
                        label: f.name,
                        ranges: hit.ranges,
                        sublabel: f.kind === "CLIENT" ? "Dossier client" : "Dossier",
                        icon: <FolderGlyph kind={f.kind} icon={f.icon} color={f.color} name={f.name} size="xs" />,
                        recent: recentItem,
                        run: () => openFolder(f),
                    };
                }),
            });
        }

        if (searching && search.data) {
            const convs = search.data.conversations.slice(0, 8);
            if (convs.length) {
                out.push({
                    id: "conversations",
                    items: convs.map((c) => ({
                        key: `conversation:${c.id}`,
                        label: c.title || "Sans titre",
                        ranges: fuzzyMatch(q, c.title)?.ranges ?? [],
                        sublabel: [c.folderId ? folderNames.get(c.folderId) : "Vue agence", c.snippet].filter(Boolean).join(" · "),
                        icon: <MessageSquare className="h-4 w-4" />,
                        recent: { kind: "conversation", id: c.id, label: c.title || "Sans titre", folderId: c.folderId },
                        run: () => onOpenConversation(c.id),
                    })),
                });
            }
            const files = search.data.files.slice(0, 6);
            if (files.length) {
                out.push({
                    id: "files",
                    items: files.map((f) => ({
                        key: `file:${f.fileId}`,
                        label: f.name,
                        ranges: fuzzyMatch(q, f.name)?.ranges ?? [],
                        sublabel: [folderNames.get(f.folderId), f.snippet].filter(Boolean).join(" · "),
                        icon: <FileText className="h-4 w-4" />,
                        recent: { kind: "file", id: f.fileId, label: f.name, folderId: f.folderId },
                        run: () => onOpenFolder(f.folderId),
                    })),
                });
            }
        }
        return out;
        // openFolder closes over stable props and toast; recomputing on them is not needed.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q, searching, search.data, folderCandidates, folderNames, recent, onNewConversation, onOpenFolder, onOpenConversation, router]);

    const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);
    const activeIndex = flat.length === 0 ? -1 : Math.min(active, flat.length - 1);
    const activeItem = activeIndex >= 0 ? flat[activeIndex] : null;
    const optionId = (key: string) => `${uid}-opt-${key.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

    useEffect(() => {
        if (!activeItem) return;
        const el = document.getElementById(optionId(activeItem.key));
        el?.scrollIntoView({ block: "nearest" });
        // optionId is derived from uid only.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeItem]);

    const choose = (item: PaletteItem) => {
        if (item.recent) writeRecent(item.recent);
        close();
        item.run();
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown" || (e.key === "n" && e.ctrlKey)) {
            e.preventDefault();
            if (flat.length) setActive((activeIndex + 1) % flat.length);
        } else if (e.key === "ArrowUp" || (e.key === "p" && e.ctrlKey)) {
            e.preventDefault();
            if (flat.length) setActive((activeIndex - 1 + flat.length) % flat.length);
        } else if (e.key === "Home" && e.ctrlKey) {
            e.preventDefault();
            setActive(0);
        } else if (e.key === "End" && e.ctrlKey) {
            e.preventDefault();
            setActive(Math.max(0, flat.length - 1));
        } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (activeItem) choose(activeItem);
        } else if (e.key === "Escape") {
            e.preventDefault();
            // Native stop too: the shell closes its mobile rail on a window-level Escape.
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            if (query) setQuery("");
            else close();
        } else if (e.key === "Tab") {
            // Focus trap: the input is the dialog's only tab stop.
            e.preventDefault();
        }
    };

    let index = -1;
    const noResults = q.length > 0 && flat.length === 0 && !searchPending;

    return (
        <div className="fixed inset-0 z-[125] flex items-start justify-center px-4 pt-[10vh] sm:pt-[14vh]" onKeyDown={onKeyDown}>
            <div className="absolute inset-0 bg-ink/45 backdrop-blur-[2px] animate-fade-in" aria-hidden onPointerDown={close} />
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Palette de commandes"
                className="relative flex max-h-[min(78vh,620px)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-overlay motion-safe:animate-ds-pop"
            >
                <div className="flex items-center gap-3 border-b border-line-subtle px-4">
                    <Search className="h-4 w-4 flex-shrink-0 text-ink-4" aria-hidden />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setActive(0);
                        }}
                        role="combobox"
                        aria-expanded="true"
                        aria-controls={listId}
                        aria-autocomplete="list"
                        aria-activedescendant={activeItem ? optionId(activeItem.key) : undefined}
                        aria-label="Rechercher une conversation, un dossier, un fichier ou une action"
                        placeholder="Rechercher ou lancer une action…"
                        autoComplete="off"
                        spellCheck={false}
                        className="h-14 min-w-0 flex-1 bg-transparent text-[15px] font-medium text-ink outline-none placeholder:text-ink-4"
                    />
                    {searchPending ? (
                        <Spinner className="h-4 w-4 text-ink-4" label="Recherche" />
                    ) : query ? (
                        <button
                            type="button"
                            tabIndex={-1}
                            onClick={() => {
                                setQuery("");
                                inputRef.current?.focus();
                            }}
                            aria-label="Effacer"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-ink-4 hover:bg-surface-3 hover:text-ink-2"
                        >
                            <X className="h-4 w-4" aria-hidden />
                        </button>
                    ) : (
                        <Kbd className="hidden sm:inline-flex">Échap</Kbd>
                    )}
                </div>

                <div ref={listRef} id={listId} role="listbox" aria-label="Résultats" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
                    {sections.map((section) => (
                        <div key={section.id} role="group" aria-labelledby={`${uid}-g-${section.id}`} className="pb-1.5">
                            <div id={`${uid}-g-${section.id}`} role="presentation" className="px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-ink-4">
                                {GROUP_LABEL[section.id]}
                            </div>
                            {section.items.map((item) => {
                                index += 1;
                                const i = index;
                                const selected = i === activeIndex;
                                return (
                                    <div
                                        key={item.key}
                                        id={optionId(item.key)}
                                        role="option"
                                        aria-selected={selected}
                                        onPointerMove={() => i !== activeIndex && setActive(i)}
                                        onPointerDown={(e) => e.preventDefault()}
                                        onClick={() => choose(item)}
                                        className={cn(
                                            "flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 transition-colors duration-100",
                                            selected ? "bg-surface-3" : "hover:bg-surface-2",
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg",
                                                item.key.startsWith("folder:") ? "" : "border border-line bg-surface text-ink-3",
                                            )}
                                            aria-hidden
                                        >
                                            {item.icon}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-[13px] font-bold text-ink">
                                                <Highlighted text={item.label} ranges={item.ranges} />
                                            </span>
                                            {item.sublabel && <span className="block truncate text-[11px] text-ink-3">{item.sublabel}</span>}
                                        </span>
                                        {selected && (
                                            <span className="hidden flex-shrink-0 items-center gap-1 text-[11px] font-semibold text-ink-4 sm:inline-flex">
                                                Ouvrir <CornerDownLeft className="h-3 w-3" aria-hidden />
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ))}

                    {searching && searchPending && !search.data && (
                        <div className="space-y-1.5 px-2.5 py-2" aria-hidden>
                            {[0, 1, 2].map((i) => (
                                <div key={i} className="flex items-center gap-3">
                                    <span className="h-7 w-7 rounded-lg bg-surface-3 motion-safe:animate-pulse" />
                                    <span className="h-3 flex-1 rounded bg-surface-3 motion-safe:animate-pulse" style={{ maxWidth: `${70 - i * 15}%` }} />
                                </div>
                            ))}
                        </div>
                    )}

                    {q.length === 1 && (
                        <p className="px-2.5 py-2 text-[11px] text-ink-4">Tape au moins {SEARCH_MIN_CHARS} caractères pour chercher dans les conversations et les fichiers.</p>
                    )}

                    {noResults && (
                        <div className="px-4 py-10 text-center motion-safe:animate-ds-enter" role="status">
                            <p className="text-sm font-bold text-ink">Aucun résultat pour « {q} »</p>
                            <p className="mt-1 text-xs text-ink-3">Essaie un nom de client, un mot de la conversation ou un nom de fichier.</p>
                        </div>
                    )}

                    {search.error && searching && (
                        <p role="alert" className="mx-2.5 my-2 rounded-xl border border-warning-line bg-warning-soft px-3 py-2 text-[11px] font-semibold text-warning-ink">
                            Recherche indisponible : {search.error.message}
                        </p>
                    )}
                </div>

                <div className="flex items-center gap-3 border-t border-line-subtle bg-surface-2 px-4 py-2 text-[11px] font-semibold text-ink-4">
                    <span className="inline-flex items-center gap-1">
                        <Kbd>↑</Kbd>
                        <Kbd>↓</Kbd> naviguer
                    </span>
                    <span className="inline-flex items-center gap-1">
                        <Kbd>Entrée</Kbd> ouvrir
                    </span>
                    <span className="hidden items-center gap-1 sm:inline-flex">
                        <Kbd>Échap</Kbd> fermer
                    </span>
                    <span className="ml-auto inline-flex items-center gap-1">
                        <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
                        <Kbd>K</Kbd>
                    </span>
                </div>
            </div>
        </div>
    );
}

function Highlighted({ text, ranges }: { text: string; ranges: Range[] }) {
    if (!ranges.length) return <>{text}</>;
    return (
        <>
            {splitHighlight(text, ranges).map((part, i) =>
                part.match ? (
                    <mark key={i} className="rounded-[3px] bg-accent-100 px-px text-accent-800">
                        {part.text}
                    </mark>
                ) : (
                    <span key={i}>{part.text}</span>
                ),
            )}
        </>
    );
}
