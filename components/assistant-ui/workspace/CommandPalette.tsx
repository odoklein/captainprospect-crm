"use client";

/**
 * Ctrl/Cmd + K palette of the Captain AI workspace, on shadcn's command
 * family (cmdk in a Dialog): recent items and actions when the query is
 * empty; actions and folders (fuzzy, accent-insensitive, local) plus
 * conversations and files (server search, debounced 200 ms, from 2
 * characters) once typing. Ranking is ours (CommandPaletteRank), so cmdk's
 * own filter is off (`shouldFilter={false}`): that is why the dialog is
 * composed from Dialog + Command here, exactly like `CommandDialog`, which
 * does not forward props to its Command. Échap clears the query, then closes.
 * The Ctrl/Cmd + K binding itself lives in the workspace shell.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Clock, CornerDownLeft, FileText, Globe, MessageSquare, SearchX, SquarePen } from "lucide-react";
import type { FolderKind } from "@/lib/assistant/api-contract";
import { SEARCH_MIN_CHARS, ensureClientFolder, useAssistantSearch, useFolderList } from "@/lib/assistant/client/folder-hooks";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@/components/ui/shadcn/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/shadcn/dialog";
import { Kbd, KbdGroup } from "@/components/ui/shadcn/kbd";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { AiMark } from "@/components/ui/AiMark";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { FolderGlyph } from "./folder/FolderHeader";
import { Spinner } from "./folder/parts";
import {
    PALETTE_DEBOUNCE_MS,
    escapeAction,
    fuzzyMatch,
    paletteSearchState,
    parseRecent,
    pushRecent,
    rankActions,
    rankItems,
    shortcutLabel,
    splitHighlight,
    type Range,
    type RecentItem,
} from "./CommandPaletteRank";

const RECENT_KEY = "captain-ai:palette-recent";
const AGENT_PATH = "/manager/assistant/agent";

export function CommandPalette(props: {
    open: boolean;
    onOpenChange(open: boolean): void;
    onOpenConversation(id: string): void;
    onOpenFolder(folderId: string | null): void;
    onNewConversation(): void;
}) {
    const { open, onOpenChange } = props;
    // Each opening gets a fresh body (empty query, recents re-read) while the
    // closing one stays mounted long enough to play its exit animation.
    const [prevOpen, setPrevOpen] = useState(open);
    const [session, setSession] = useState(0);
    if (open !== prevOpen) {
        setPrevOpen(open);
        if (open) setSession((s) => s + 1);
    }
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <PaletteBody key={session} {...props} />
        </Dialog>
    );
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
    /** Folder glyphs bring their own tile. */
    bareIcon?: boolean;
    shortcut?: string;
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

function PaletteBody({
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
    const [query, setQuery] = useState("");
    const [debounced, setDebounced] = useState("");
    const [recent] = useState<RecentItem[]>(readRecent);
    const [isMac] = useState(() => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));

    const { data: folderList } = useFolderList();
    const search = useAssistantSearch(debounced);

    useEffect(() => {
        const id = setTimeout(() => setDebounced(query), PALETTE_DEBOUNCE_MS);
        return () => clearTimeout(id);
    }, [query]);

    const close = () => onOpenChange(false);
    const state = paletteSearchState(query, debounced, { isValidating: search.isValidating, hasData: !!search.data }, SEARCH_MIN_CHARS);
    const { q, searching } = state;

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

    const sections = useMemo(() => {
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

        const out: Array<{ id: GroupId; items: PaletteItem[] }> = [];
        const actions: Array<{ key: string; label: string; keywords: string; icon: ReactNode; shortcut?: string; run(): void }> = [
            {
                key: "new",
                label: "Nouvelle conversation",
                keywords: "nouveau chat question demander",
                icon: <SquarePen />,
                shortcut: shortcutLabel(["mod", "shift", "O"], isMac),
                run: onNewConversation,
            },
            { key: "agency", label: "Vue agence", keywords: "agence accueil general tout", icon: <Globe />, run: () => onOpenFolder(null) },
            {
                key: "agent",
                label: "Agent",
                keywords: "agent veille automatisation surveillance rapports",
                icon: <AiMark className="text-accent-600" />,
                run: () => router.push(AGENT_PATH),
            },
        ];
        const actionItem = (a: (typeof actions)[number], ranges: Range[]): PaletteItem => ({
            key: `action:${a.key}`,
            label: a.label,
            ranges,
            icon: a.icon,
            shortcut: a.shortcut,
            run: a.run,
        });

        if (!q) {
            if (recent.length) {
                out.push({
                    id: "recent",
                    items: recent.map((r) => ({
                        key: `recent:${r.kind}:${r.id}`,
                        label: r.label,
                        ranges: [],
                        sublabel: r.kind === "conversation" ? "Conversation" : r.kind === "file" ? "Fichier" : "Dossier",
                        icon: r.kind === "conversation" ? <MessageSquare /> : r.kind === "file" ? <FileText /> : <Clock />,
                        recent: r,
                        run: () => {
                            if (r.kind === "conversation") onOpenConversation(r.id);
                            else if (r.kind === "file") onOpenFolder(r.folderId);
                            else openFolder({ id: r.id.startsWith("client:") ? null : r.id, clientId: r.clientId ?? null, name: r.label });
                        },
                    })),
                });
            }
            out.push({ id: "actions", items: actions.map((a) => actionItem(a, [])) });
            return out;
        }

        const actionHits = rankActions(q, actions).map(({ item, ranges }) => actionItem(item, ranges));
        if (actionHits.length) out.push({ id: "actions", items: actionHits });

        const folderHits = rankItems(q, folderCandidates, (f) => f.name, 6);
        if (folderHits.length) {
            out.push({
                id: "folders",
                items: folderHits.map(({ item: f, hit }) => ({
                    key: `folder:${f.id ?? `client:${f.clientId}`}`,
                    label: f.name,
                    ranges: hit.ranges,
                    sublabel: f.kind === "CLIENT" ? "Dossier client" : "Dossier",
                    icon: <FolderGlyph kind={f.kind} icon={f.icon} color={f.color} name={f.name} size="xs" />,
                    bareIcon: true,
                    recent: { kind: "folder", id: f.id ?? `client:${f.clientId}`, label: f.name, folderId: f.id, clientId: f.clientId },
                    run: () => openFolder(f),
                })),
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
                        icon: <MessageSquare />,
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
                        icon: <FileText />,
                        recent: { kind: "file", id: f.fileId, label: f.name, folderId: f.folderId },
                        run: () => onOpenFolder(f.folderId),
                    })),
                });
            }
        }
        return out;
    }, [q, searching, search.data, folderCandidates, folderNames, recent, isMac, onNewConversation, onOpenFolder, onOpenConversation, router, toast]);

    const choose = (item: PaletteItem) => {
        if (item.recent) writeRecent(item.recent);
        close();
        item.run();
    };

    const itemCount = sections.reduce((n, s) => n + s.items.length, 0);
    const showLoading = state.pending && !search.data;
    const noResults = q.length > 0 && itemCount === 0 && !state.pending;

    return (
        <DialogContent
            showCloseButton={false}
            className="top-[min(14%,7rem)] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
            onEscapeKeyDown={(e) => {
                if (escapeAction(query) === "clear") {
                    e.preventDefault();
                    setQuery("");
                }
            }}
        >
            <DialogHeader className="sr-only">
                <DialogTitle>Palette de commandes</DialogTitle>
                <DialogDescription>Rechercher une conversation, un dossier, un fichier ou une action.</DialogDescription>
            </DialogHeader>
            <Command
                shouldFilter={false}
                loop
                label="Palette de commandes"
                className="rounded-none **:data-[slot=command-input-wrapper]:h-14 **:data-[slot=command-input-wrapper]:px-4 [&_[cmdk-input]]:h-14 [&_[cmdk-input]]:text-[15px] [&_[cmdk-item]]:py-2"
            >
                <div className="relative">
                    <CommandInput
                        value={query}
                        onValueChange={setQuery}
                        placeholder="Rechercher ou lancer une action…"
                        aria-label="Rechercher une conversation, un dossier, un fichier ou une action"
                        autoComplete="off"
                        spellCheck={false}
                        className="pr-16"
                    />
                    <span className="pointer-events-none absolute right-4 top-1/2 flex -translate-y-1/2 items-center">
                        {state.pending ? <Spinner className="text-ink-4" label="Recherche en cours" /> : <Kbd className="hidden sm:inline-flex">Échap</Kbd>}
                    </span>
                </div>

                <CommandList className="max-h-[min(60vh,440px)] overscroll-contain">
                    {sections.map((section, si) => (
                        <div key={section.id}>
                            {si > 0 && <CommandSeparator alwaysRender />}
                            <CommandGroup heading={GROUP_LABEL[section.id]}>
                                {section.items.map((item) => (
                                    <PaletteRow key={item.key} item={item} onSelect={() => choose(item)} />
                                ))}
                            </CommandGroup>
                        </div>
                    ))}

                    {showLoading && (
                        <div role="status" className="space-y-1 p-1.5 motion-safe:animate-in motion-safe:fade-in-0">
                            <p className="flex items-center gap-2 px-2 pb-1 pt-1.5 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3">
                                <Spinner className="size-3" />
                                Recherche dans les conversations et les fichiers
                            </p>
                            {[0, 1, 2].map((i) => (
                                <div key={i} className="flex items-center gap-3 px-2 py-2" aria-hidden>
                                    <Skeleton className="size-7 rounded-lg" />
                                    <div className="flex-1 space-y-1.5">
                                        <Skeleton className="h-3 rounded-md" style={{ width: `${68 - i * 14}%` }} />
                                        <Skeleton className="h-2.5 w-1/3 rounded-md" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {state.tooShort && (
                        <p className="px-4 pb-3 pt-1 text-xs text-ink-4">
                            Tape au moins {SEARCH_MIN_CHARS} caractères pour chercher dans les conversations et les fichiers.
                        </p>
                    )}

                    {search.error && searching && (
                        <p role="alert" className="mx-3 my-2 rounded-control border border-warning-line bg-warning-soft px-3 py-2 text-xs font-medium text-warning-ink">
                            Recherche indisponible : {search.error.message}
                        </p>
                    )}

                    {noResults && (
                        <CommandEmpty className="flex flex-col items-center gap-1.5 px-6 py-10 motion-safe:animate-in motion-safe:fade-in-0">
                            <span className="mb-1 flex size-10 items-center justify-center rounded-panel border border-line bg-surface-2 text-ink-4" aria-hidden>
                                <SearchX className="size-5" />
                            </span>
                            <span className="text-sm font-semibold text-ink">Aucun résultat pour « {q} »</span>
                            <span className="text-xs text-ink-3">Essaie un nom de client, un mot de la conversation ou un nom de fichier.</span>
                        </CommandEmpty>
                    )}
                </CommandList>

                <div className="flex items-center gap-4 border-t border-line-subtle bg-surface-2 px-4 py-2 text-xs text-ink-4">
                    <span className="inline-flex items-center gap-1.5">
                        <KbdGroup>
                            <Kbd>↑</Kbd>
                            <Kbd>↓</Kbd>
                        </KbdGroup>
                        naviguer
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <Kbd>
                            <CornerDownLeft />
                        </Kbd>
                        ouvrir
                    </span>
                    <span className="hidden items-center gap-1.5 sm:inline-flex">
                        <Kbd>Échap</Kbd>
                        {query ? "effacer" : "fermer"}
                    </span>
                    <span className="ml-auto inline-flex items-center gap-1">
                        <KbdGroup>
                            <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
                            <Kbd>K</Kbd>
                        </KbdGroup>
                    </span>
                </div>
            </Command>
        </DialogContent>
    );
}

function PaletteRow({ item, onSelect }: { item: PaletteItem; onSelect(): void }) {
    return (
        <CommandItem value={item.key} onSelect={onSelect} className="group/item gap-3 px-2">
            <span
                className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors duration-100",
                    !item.bareIcon && "border border-line bg-surface text-ink-3 group-data-[selected=true]/item:border-line-strong",
                )}
                aria-hidden
            >
                {item.icon}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium text-ink">
                    <Highlighted text={item.label} ranges={item.ranges} />
                </span>
                {item.sublabel && <span className="block truncate text-xs text-ink-3">{item.sublabel}</span>}
            </span>
            {item.shortcut ? (
                <CommandShortcut className="tracking-normal">{item.shortcut}</CommandShortcut>
            ) : (
                <span className="ml-auto hidden shrink-0 items-center gap-1 text-xs text-ink-4 sm:group-data-[selected=true]/item:inline-flex">
                    Ouvrir
                    <ArrowUpRight className="size-3" aria-hidden />
                </span>
            )}
        </CommandItem>
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
