"use client";

import {
    useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
    type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    AlertTriangle, ArrowDown, ArrowUp, Check, CheckSquare, ChevronRight, Copy, FileText, GripVertical, Heading2, Heading3,
    Link2, List, Loader2, Megaphone, Minus, PhoneCall, Quote, RefreshCw, Trash2, Type,
} from "lucide-react";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
    DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import { ConfirmModal } from "@/components/ui";
import { block as makeBlock, type Block, type BlockType } from "@/lib/client-pages/blocks";
import { CrumbActions } from "./CrumbSlot";
import { useFocusRequest } from "./focus";
import { clientPageKey, clientPagesKey, deleteClientPage, fetchClientPage, saveClientPage, type ClientPageDetail, type ClientPageSummary } from "./clientPages";
import type { WorkspaceLocation, WorkspaceMission } from "./InboxItem";

// ============================================================================
// Block catalogue (the « / » menu and « Transformer en »)
// ============================================================================

const BLOCKS: { type: BlockType; label: string; hint: string; icon: typeof Type; keywords: string }[] = [
    { type: "paragraph", label: "Texte", hint: "Un paragraphe simple", icon: Type, keywords: "texte paragraphe" },
    { type: "h2", label: "Titre", hint: "Titre de section", icon: Heading2, keywords: "titre section h2 #" },
    { type: "h3", label: "Sous-titre", hint: "Titre de niveau 2", icon: Heading3, keywords: "sous-titre h3 ##" },
    { type: "bullet", label: "Liste à puces", hint: "Une liste simple", icon: List, keywords: "liste puces -" },
    { type: "todo", label: "Liste de tâches", hint: "Créer une checklist", icon: CheckSquare, keywords: "tache tâche checklist todo case" },
    { type: "callout", label: "Bloc de mise en avant", hint: "Mettre une information en évidence", icon: Megaphone, keywords: "callout encadre important note" },
    { type: "quote", label: "Citation", hint: "Reprendre les mots d’un client", icon: Quote, keywords: "citation quote >" },
    { type: "divider", label: "Séparateur", hint: "Une ligne entre deux parties", icon: Minus, keywords: "separateur ligne divider ---" },
    { type: "callQueue", label: "File d’appels", hint: "Afficher la file d’appels d’une mission", icon: PhoneCall, keywords: "file appels mission sdr queue" },
];
const TEXT_TYPES = new Set<BlockType>(["paragraph", "h2", "h3", "bullet", "todo", "quote", "callout"]);
const PLACEHOLDER: Partial<Record<BlockType, string>> = {
    paragraph: "Écrivez, ou tapez « / » pour insérer un bloc",
    h2: "Titre",
    h3: "Sous-titre",
    bullet: "Élément de liste",
    todo: "Tâche",
    quote: "Citation",
    callout: "Information à mettre en avant",
};
const SHORTCUTS: [RegExp, BlockType][] = [[/^## $/, "h3"], [/^# $/, "h2"], [/^[-*] $/, "bullet"], [/^\[ ?\] $/, "todo"], [/^> $/, "quote"], [/^! $/, "callout"]];

function normalize(value: string) {
    return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const timeFr = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const dateTimeFr = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

type SaveState =
    | { kind: "idle" }
    | { kind: "dirty" }
    | { kind: "saving" }
    | { kind: "saved"; at: Date }
    | { kind: "error"; message: string }
    | { kind: "conflict"; message: string };

type Caret = number | "start" | "end";

interface Props {
    pageId: string;
    clientId: string;
    clientName: string;
    missions: (WorkspaceMission & { _lists?: number })[];
    onNavigate: (location: WorkspaceLocation, focus?: string) => void;
}

// ============================================================================
// Editor
// ============================================================================

export function ClientPageEditor({ pageId, clientId, clientName, missions, onNavigate }: Props) {
    const queryClient = useQueryClient();
    const { data: page, error, isLoading, refetch } = useQuery({
        queryKey: clientPageKey(pageId),
        queryFn: () => fetchClientPage(pageId),
        staleTime: Infinity,
        gcTime: 0,
    });

    if (isLoading) return <div className="cw-loading" role="status"><Loader2 className="animate-spin" /> Ouverture de la page…</div>;
    if (error || !page) {
        return <div className="cw-empty" role="alert">
            <AlertTriangle /><strong>Impossible d’ouvrir la page</strong><p>{error?.message ?? "Elle a peut-être été supprimée."}</p>
            <div className="cw-actions"><button className="cw-button" onClick={() => refetch()}><RefreshCw /> Réessayer</button><button className="cw-button cw-quiet" onClick={() => onNavigate({ client: clientId })}>Retour au client</button></div>
        </div>;
    }
    return <PageDocument key={page.id + page.updatedAt} initial={page} clientName={clientName} missions={missions} onNavigate={onNavigate}
        onReload={async () => { await queryClient.invalidateQueries({ queryKey: clientPageKey(pageId) }); }} />;
}

function PageDocument({ initial, clientName, missions, onNavigate, onReload }: {
    initial: ClientPageDetail;
    clientName: string;
    missions: Props["missions"];
    onNavigate: Props["onNavigate"];
    onReload: () => Promise<void>;
}) {
    const queryClient = useQueryClient();
    const [title, setTitle] = useState(initial.title);
    const [blocks, setBlocks] = useState<Block[]>(() => initial.blocks.length ? initial.blocks : [makeBlock("paragraph")]);
    const [missionId, setMissionId] = useState<string | null>(initial.missionId);
    const [meta, setMeta] = useState({ updatedAt: initial.updatedAt, updatedBy: initial.updatedBy, createdBy: initial.createdBy, createdAt: initial.createdAt });
    const [save, setSave] = useState<SaveState>({ kind: "idle" });
    const [slash, setSlash] = useState<{ blockId: string; query: string; index: number } | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [menuFor, setMenuFor] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    // What the next save sends: always the last rendered document.
    const latest = useRef({ title, blocks, missionId });
    useLayoutEffect(() => { latest.current = { title, blocks, missionId }; }, [title, blocks, missionId]);
    const baseRef = useRef(initial.updatedAt);
    const dirtyRef = useRef(false);
    const inFlight = useRef(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingFocus = useRef<{ id: string; caret: Caret } | null>(null);
    const editorRef = useRef<HTMLDivElement>(null);
    const titleRef = useRef<HTMLTextAreaElement>(null);
    useFocusRequest(initial.id);

    // ── Saving ──────────────────────────────────────────────────────────────
    const flushRef = useRef<() => Promise<void>>(async () => undefined);
    const flush = useCallback(async (force = false) => {
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
        if (!dirtyRef.current || inFlight.current) return;
        inFlight.current = true;
        dirtyRef.current = false;
        setSave({ kind: "saving" });
        const snapshot = latest.current;
        try {
            const saved = await saveClientPage(initial.id, { ...snapshot, baseUpdatedAt: force ? undefined : baseRef.current });
            baseRef.current = saved.updatedAt;
            setMeta((previous) => ({ ...previous, updatedAt: saved.updatedAt, updatedBy: saved.updatedBy }));
            queryClient.setQueryData<ClientPageSummary[]>(clientPagesKey(saved.clientId), (list) =>
                list?.map((item) => item.id === saved.id ? { ...item, title: saved.title, missionId: saved.missionId, updatedAt: saved.updatedAt, updatedBy: saved.updatedBy } : item));
            setSave(dirtyRef.current ? { kind: "dirty" } : { kind: "saved", at: new Date() });
        } catch (cause) {
            dirtyRef.current = true;
            const err = cause as Error & { status?: number };
            setSave(err.status === 409
                ? { kind: "conflict", message: err.message }
                : { kind: "error", message: err.message || "Enregistrement impossible" });
            inFlight.current = false;
            return;
        }
        inFlight.current = false;
        // Typing went on during the save: send the rest.
        if (dirtyRef.current) timer.current = setTimeout(() => void flushRef.current(), 400);
    }, [initial.id, queryClient]);
    useEffect(() => { flushRef.current = flush; }, [flush]);

    const markDirty = useCallback(() => {
        dirtyRef.current = true;
        setSave((previous) => previous.kind === "conflict" ? previous : { kind: "dirty" });
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void flush(), 900);
    }, [flush]);

    // Leaving with unsaved text: warn on reload/close, send what is left on in-app navigation.
    useEffect(() => {
        const beforeUnload = (event: BeforeUnloadEvent) => { if (dirtyRef.current || inFlight.current) event.preventDefault(); };
        window.addEventListener("beforeunload", beforeUnload);
        return () => {
            window.removeEventListener("beforeunload", beforeUnload);
            if (timer.current) clearTimeout(timer.current);
            if (dirtyRef.current) void saveClientPage(initial.id, { ...latest.current, baseUpdatedAt: baseRef.current }, true).catch(() => undefined);
        };
    }, [initial.id]);

    // ── Block operations ────────────────────────────────────────────────────
    const update = useCallback((recipe: (draft: Block[]) => Block[], focus?: { id: string; caret: Caret }) => {
        setBlocks((previous) => {
            const next = recipe(previous);
            return next.length ? next : [makeBlock("paragraph")];
        });
        if (focus) pendingFocus.current = focus;
        markDirty();
    }, [markDirty]);

    const focusBlock = useCallback((id: string, caret: Caret = "end") => {
        const element = editorRef.current?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`);
        if (!element) return;
        element.focus({ preventScroll: false });
        if (element instanceof HTMLTextAreaElement) {
            const position = caret === "start" ? 0 : caret === "end" ? element.value.length : Math.min(caret, element.value.length);
            element.setSelectionRange(position, position);
        }
    }, []);

    useLayoutEffect(() => {
        const target = pendingFocus.current;
        if (!target) return;
        pendingFocus.current = null;
        focusBlock(target.id, target.caret);
    });

    // Textareas grow with their content, including after a width change.
    useLayoutEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;
        const fit = () => {
            editor.querySelectorAll<HTMLTextAreaElement>("textarea").forEach(autosize);
            if (titleRef.current) autosize(titleRef.current);
        };
        fit();
        const observer = new ResizeObserver(fit);
        observer.observe(editor);
        return () => observer.disconnect();
    }, []);

    function setText(id: string, text: string) {
        update((list) => list.map((item) => item.id === id ? { ...item, text } : item));
    }

    function setType(id: string, type: BlockType, options: { keepText?: boolean } = {}) {
        if (type === "divider") {
            const next = makeBlock("paragraph");
            update((list) => list.flatMap((item) => item.id === id ? [{ id: item.id, type: "divider" as const, text: "" }, next] : [item]), { id: next.id, caret: "start" });
            return;
        }
        if (type === "callQueue") {
            const fallback = missionId ?? missions.find((mission) => mission.status === "ACTIVE")?.id ?? missions[0]?.id ?? null;
            update((list) => list.map((item) => item.id === id ? { id: item.id, type, text: "", missionId: fallback } : item));
            requestAnimationFrame(() => editorRef.current?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"] select, [data-block-id="${CSS.escape(id)}"]`)?.focus());
            return;
        }
        update((list) => list.map((item) => item.id === id ? { ...item, type, text: options.keepText ? item.text : "", checked: type === "todo" ? item.checked ?? false : undefined } : item), { id, caret: "end" });
    }

    function insertAfter(id: string, inserted: Block) {
        update((list) => {
            const index = list.findIndex((item) => item.id === id);
            return [...list.slice(0, index + 1), inserted, ...list.slice(index + 1)];
        }, { id: inserted.id, caret: "start" });
    }

    function remove(id: string, focusTo: "previous" | "next" = "previous") {
        const index = blocks.findIndex((item) => item.id === id);
        const neighbour = focusTo === "previous" ? blocks[index - 1] ?? blocks[index + 1] : blocks[index + 1] ?? blocks[index - 1];
        update((list) => list.filter((item) => item.id !== id), neighbour ? { id: neighbour.id, caret: focusTo === "previous" ? "end" : "start" } : undefined);
        if (!neighbour) requestAnimationFrame(() => editorRef.current?.querySelector<HTMLElement>("[data-block-id]")?.focus());
    }

    function move(id: string, delta: -1 | 1) {
        const index = blocks.findIndex((item) => item.id === id);
        const target = index + delta;
        if (target < 0 || target >= blocks.length) return;
        update((list) => {
            const next = [...list];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        }, { id, caret: "end" });
    }

    function duplicate(id: string) {
        const source = blocks.find((item) => item.id === id);
        if (source) insertAfter(id, { ...source, id: makeBlock("paragraph").id });
    }

    // ── Slash menu ──────────────────────────────────────────────────────────
    const slashItems = useMemo(() => {
        if (!slash) return [];
        const query = normalize(slash.query);
        return BLOCKS.filter((item) => !query || normalize(`${item.label} ${item.keywords}`).includes(query));
    }, [slash]);

    function chooseSlash(type: BlockType) {
        if (!slash) return;
        const id = slash.blockId;
        setSlash(null);
        setType(id, type);
    }

    // ── Keyboard ────────────────────────────────────────────────────────────
    function onTextChange(item: Block, event: ChangeEvent<HTMLTextAreaElement>) {
        const value = event.target.value;
        autosize(event.target);
        // Markdown-style shortcuts at the start of any text block: « # », « - », « [] », « > », « ! ».
        const shortcut = SHORTCUTS.find(([pattern, type]) => pattern.test(value) && type !== item.type);
        if (shortcut) { setType(item.id, shortcut[1]); setSlash(null); return; }
        if (item.type === "paragraph" && value === "---") { setType(item.id, "divider"); return; }
        if (value.startsWith("/") && !/\s/.test(value)) setSlash({ blockId: item.id, query: value.slice(1), index: 0 });
        else if (slash?.blockId === item.id) setSlash(null);
        setText(item.id, value);
    }

    function onTextKeyDown(item: Block, index: number, event: ReactKeyboardEvent<HTMLTextAreaElement>) {
        if (event.nativeEvent.isComposing) return;
        const input = event.currentTarget;
        const { selectionStart: start, selectionEnd: end, value } = input;

        if (slash?.blockId === item.id) {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const count = Math.max(slashItems.length, 1);
                setSlash({ ...slash, index: (slash.index + (event.key === "ArrowDown" ? 1 : -1) + count) % count });
                return;
            }
            if ((event.key === "Enter" || event.key === "Tab") && slashItems.length) {
                event.preventDefault();
                chooseSlash(slashItems[Math.min(slash.index, slashItems.length - 1)].type);
                return;
            }
            if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setSlash(null); return; }
        }

        if ((event.ctrlKey || event.metaKey) && event.key === "/") {
            event.preventDefault();
            setMenuFor(item.id);
            return;
        }

        if ((event.altKey && event.shiftKey) && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
            event.preventDefault();
            move(item.id, event.key === "ArrowUp" ? -1 : 1);
            return;
        }

        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if ((item.type === "bullet" || item.type === "todo" || item.type === "quote") && !value) { setType(item.id, "paragraph"); return; }
            const before = value.slice(0, start);
            const after = value.slice(end);
            const nextType: BlockType = item.type === "bullet" || item.type === "todo" ? item.type : "paragraph";
            const inserted = makeBlock(nextType, after, nextType === "todo" ? { checked: false } : {});
            update((list) => {
                const position = list.findIndex((entry) => entry.id === item.id);
                return [...list.slice(0, position), { ...list[position], text: before }, inserted, ...list.slice(position + 1)];
            }, { id: inserted.id, caret: "start" });
            return;
        }

        if (event.key === "Backspace" && start === 0 && end === 0) {
            if (item.type !== "paragraph") { event.preventDefault(); setType(item.id, "paragraph", { keepText: true }); return; }
            const previous = blocks[index - 1];
            if (!previous) return;
            event.preventDefault();
            if (TEXT_TYPES.has(previous.type)) {
                const join = previous.text.length;
                update((list) => list.flatMap((entry) => entry.id === previous.id ? [{ ...entry, text: entry.text + value }] : entry.id === item.id ? [] : [entry]), { id: previous.id, caret: join });
            } else if (!value) {
                remove(item.id);
            } else {
                focusBlock(previous.id);
            }
            return;
        }

        if (event.key === "Delete" && start === value.length && end === value.length) {
            const next = blocks[index + 1];
            if (next && TEXT_TYPES.has(next.type)) {
                event.preventDefault();
                update((list) => list.flatMap((entry) => entry.id === item.id ? [{ ...entry, text: entry.text + next.text }] : entry.id === next.id ? [] : [entry]), { id: item.id, caret: value.length });
            }
            return;
        }

        const singleLine = !value.includes("\n") && input.scrollHeight <= lineHeight(input) * 1.8;
        if (event.key === "ArrowUp" && start === end && (start === 0 || (singleLine && !value.slice(0, start).includes("\n")))) {
            const previous = blocks[index - 1];
            event.preventDefault();
            if (previous) focusBlock(previous.id, "end"); else titleRef.current?.focus();
            return;
        }
        if (event.key === "ArrowDown" && start === end && (start === value.length || (singleLine && !value.slice(start).includes("\n")))) {
            const next = blocks[index + 1];
            if (next) { event.preventDefault(); focusBlock(next.id, "start"); }
        }
    }

    function onObjectKeyDown(item: Block, index: number, event: ReactKeyboardEvent<HTMLElement>) {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Backspace" || event.key === "Delete") { event.preventDefault(); remove(item.id, event.key === "Delete" ? "next" : "previous"); }
        else if (event.key === "Enter") { event.preventDefault(); insertAfter(item.id, makeBlock("paragraph")); }
        else if (event.key === "ArrowUp" && blocks[index - 1]) { event.preventDefault(); focusBlock(blocks[index - 1].id, "end"); }
        else if (event.key === "ArrowDown" && blocks[index + 1]) { event.preventDefault(); focusBlock(blocks[index + 1].id, "start"); }
    }

    // ── Page actions ────────────────────────────────────────────────────────
    const linkedMission = missions.find((mission) => mission.id === missionId) ?? null;

    function linkMission(id: string | null) {
        setMissionId(id);
        markDirty();
    }

    async function removePage() {
        setDeleting(true);
        try {
            if (timer.current) clearTimeout(timer.current);
            dirtyRef.current = false;
            await deleteClientPage(initial.id);
            queryClient.setQueryData<ClientPageSummary[]>(clientPagesKey(initial.clientId), (list) => list?.filter((item) => item.id !== initial.id));
            setConfirmDelete(false);
            onNavigate({ client: initial.clientId }, "heading");
        } catch (cause) {
            setSave({ kind: "error", message: (cause as Error).message || "Suppression impossible" });
            setDeleting(false);
            setConfirmDelete(false);
        }
    }

    const updatedBy = meta.updatedBy?.name;

    return (
        <>
            <CrumbActions>
                <SaveIndicator state={save} onRetry={() => void flush()} onReload={() => void onReload()} onOverwrite={() => void flush(true)} />
            </CrumbActions>
            <div className="cw-layout">
                <main className="cw-doc" aria-labelledby="cw-page-title">
                    <span className="cw-eyebrow"><FileText aria-hidden /><span>Page · {clientName}</span></span>
                    <textarea
                        id="cw-page-title"
                        ref={titleRef}
                        className="cw-page-title"
                        rows={1}
                        data-focus-key="heading"
                        value={title}
                        placeholder="Sans titre"
                        aria-label="Titre de la page"
                        maxLength={200}
                        onChange={(event) => { autosize(event.target); setTitle(event.target.value.replace(/\n/g, "")); markDirty(); }}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" || (event.key === "ArrowDown" && event.currentTarget.selectionStart === event.currentTarget.value.length)) {
                                event.preventDefault();
                                if (blocks[0]) focusBlock(blocks[0].id, "start");
                            }
                        }}
                    />
                    <p className="cw-page-meta">
                        {linkedMission && <button className="cw-pill" onClick={() => onNavigate({ client: initial.clientId, mission: linkedMission.id })}><Link2 aria-hidden className="h-3 w-3" />{linkedMission.name}</button>}
                        <span>Modifiée {updatedBy ? `par ${updatedBy} ` : ""}le {dateTimeFr.format(new Date(meta.updatedAt))}</span>
                        <span aria-hidden>·</span>
                        <span>Tapez « / » pour insérer un bloc</span>
                    </p>

                    <div ref={editorRef} className="cw-editor" role="group" aria-label="Contenu de la page">
                        {blocks.map((item, index) => (
                            <div key={item.id} className="cw-block" data-type={item.type} data-checked={item.checked ? "" : undefined}>
                                <BlockMenu
                                    item={item}
                                    open={menuFor === item.id}
                                    onOpenChange={(open) => setMenuFor(open ? item.id : null)}
                                    onClosed={() => focusBlock(item.id)}
                                    first={index === 0}
                                    last={index === blocks.length - 1}
                                    onType={(type) => setType(item.id, type, { keepText: true })}
                                    onMove={(delta) => move(item.id, delta)}
                                    onDuplicate={() => duplicate(item.id)}
                                    onDelete={() => remove(item.id)}
                                />
                                {item.type === "divider" ? (
                                    <div className="cw-block-divider" role="separator" tabIndex={0} aria-label="Séparateur (Retour arrière pour supprimer)" data-block-id={item.id} onKeyDown={(event) => onObjectKeyDown(item, index, event)} />
                                ) : item.type === "callQueue" ? (
                                    <CallQueueBlock
                                        item={item}
                                        missions={missions}
                                        onKeyDown={(event) => onObjectKeyDown(item, index, event)}
                                        onChange={(id) => update((list) => list.map((entry) => entry.id === item.id ? { ...entry, missionId: id } : entry))}
                                        onOpen={(id, tab) => onNavigate({ client: initial.clientId, mission: id, tab })}
                                    />
                                ) : (
                                    <div className="cw-block-body">
                                        {item.type === "todo" && (
                                            <button
                                                className="cw-block-check"
                                                role="checkbox"
                                                aria-checked={Boolean(item.checked)}
                                                aria-label={item.checked ? "Marquer comme à faire" : "Marquer comme fait"}
                                                onClick={() => update((list) => list.map((entry) => entry.id === item.id ? { ...entry, checked: !entry.checked } : entry))}
                                            >{item.checked && <Check aria-hidden />}</button>
                                        )}
                                        {item.type === "callout" && <Megaphone aria-hidden />}
                                        <textarea
                                            className="cw-block-input"
                                            rows={1}
                                            data-block-id={item.id}
                                            value={item.text}
                                            placeholder={PLACEHOLDER[item.type]}
                                            aria-label={BLOCKS.find((entry) => entry.type === item.type)?.label}
                                            aria-autocomplete="list"
                                            aria-controls={slash?.blockId === item.id ? "cw-slash-menu" : undefined}
                                            aria-activedescendant={slash?.blockId === item.id && slashItems.length ? `cw-slash-${slashItems[Math.min(slash.index, slashItems.length - 1)].type}` : undefined}
                                            onChange={(event) => onTextChange(item, event)}
                                            onKeyDown={(event) => onTextKeyDown(item, index, event)}
                                            onBlur={() => { if (slash?.blockId === item.id) setTimeout(() => setSlash((current) => current?.blockId === item.id ? null : current), 120); }}
                                        />
                                    </div>
                                )}
                                {slash?.blockId === item.id && (
                                    <div id="cw-slash-menu" className="cw-slash" role="listbox" aria-label="Insérer un bloc" style={{ top: "100%", left: 26 }}>
                                        <div className="cw-slash-label">{slashItems.length ? "Blocs" : ""}</div>
                                        {slashItems.length ? slashItems.map((entry, position) => (
                                            <button
                                                key={entry.type}
                                                id={`cw-slash-${entry.type}`}
                                                role="option"
                                                tabIndex={-1}
                                                aria-selected={position === Math.min(slash.index, slashItems.length - 1)}
                                                className="cw-slash-item"
                                                onMouseDown={(event) => event.preventDefault()}
                                                onMouseEnter={() => setSlash({ ...slash, index: position })}
                                                onClick={() => chooseSlash(entry.type)}
                                            >
                                                <span><entry.icon aria-hidden /></span>
                                                <span><strong>{entry.label}</strong><small>{entry.hint}</small></span>
                                            </button>
                                        )) : <p className="cw-slash-empty">Aucun bloc ne correspond à « {slash.query} ».</p>}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </main>

                <aside className="cw-rail" aria-label="Détails de la page">
                    <section className="cw-rail-section">
                        <h2 className="cw-rail-title">Détails</h2>
                        <dl className="cw-props">
                            <div>
                                <dt>Mission liée</dt>
                                <dd>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <button className="cw-prop-button" aria-label={`Mission liée : ${linkedMission?.name ?? "aucune"}. Changer`}>
                                                <span className={linkedMission ? undefined : "cw-prop-empty"}>{linkedMission?.name ?? "Aucune"}</span><ChevronRight aria-hidden className="rotate-90" />
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-64">
                                            <DropdownMenuRadioGroup value={missionId ?? ""} onValueChange={(value) => linkMission(value || null)}>
                                                <DropdownMenuRadioItem value="">Aucune mission</DropdownMenuRadioItem>
                                                {missions.map((mission) => <DropdownMenuRadioItem key={mission.id} value={mission.id}><span className="truncate">{mission.name}</span></DropdownMenuRadioItem>)}
                                            </DropdownMenuRadioGroup>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </dd>
                            </div>
                            <div><dt>Créée par</dt><dd>{meta.createdBy?.name ?? "—"}</dd></div>
                            <div><dt>Créée le</dt><dd>{dateTimeFr.format(new Date(meta.createdAt))}</dd></div>
                            <div><dt>Modifiée</dt><dd>{dateTimeFr.format(new Date(meta.updatedAt))}</dd></div>
                        </dl>
                    </section>
                    {linkedMission && <section className="cw-rail-section">
                        <h2 className="cw-rail-title">Raccourcis</h2>
                        <div className="cw-shortcuts">
                            <button className="cw-shortcut" onClick={() => onNavigate({ client: initial.clientId, mission: linkedMission.id })}><FileText /><span>Ouvrir la mission</span><ChevronRight /></button>
                            <button className="cw-shortcut" onClick={() => onNavigate({ client: initial.clientId, mission: linkedMission.id, tab: "strategies" })}><Quote /><span>Ciblage et scripts</span><ChevronRight /></button>
                            <button className="cw-shortcut" onClick={() => onNavigate({ client: initial.clientId, mission: linkedMission.id, tab: "audience" })}><PhoneCall /><span>Bases de prospects</span><ChevronRight /></button>
                        </div>
                    </section>}
                    <section className="cw-rail-section">
                        <h2 className="cw-rail-title">Raccourcis clavier</h2>
                        <dl className="cw-props">
                            <div><dt>/</dt><dd>Insérer un bloc</dd></div>
                            <div><dt># , - , [ ]</dt><dd>Titre, liste, tâche</dd></div>
                            <div><dt>Alt ⇧ ↑ ↓</dt><dd>Déplacer le bloc</dd></div>
                            <div><dt>Ctrl /</dt><dd>Options du bloc</dd></div>
                        </dl>
                    </section>
                    <section className="cw-rail-section">
                        <button className="cw-button cw-quiet cw-danger" onClick={() => setConfirmDelete(true)}><Trash2 /> Supprimer la page</button>
                    </section>
                </aside>
            </div>
            <ConfirmModal
                isOpen={confirmDelete}
                onClose={() => !deleting && setConfirmDelete(false)}
                onConfirm={removePage}
                title="Supprimer la page"
                message={`« ${title || "Sans titre"} » sera supprimée définitivement pour toute l’équipe.`}
                confirmText="Supprimer"
                cancelText="Annuler"
                variant="danger"
                isLoading={deleting}
            />
        </>
    );
}

// ============================================================================
// Pieces
// ============================================================================

function autosize(element: HTMLTextAreaElement) {
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
}

function lineHeight(element: HTMLElement) {
    const value = parseFloat(getComputedStyle(element).lineHeight);
    return Number.isFinite(value) ? value : 24;
}

function SaveIndicator({ state, onRetry, onReload, onOverwrite }: { state: SaveState; onRetry: () => void; onReload: () => void; onOverwrite: () => void }) {
    if (state.kind === "idle") return <span className="cw-save-state" data-state="idle" role="status"><Check aria-hidden /> À jour</span>;
    if (state.kind === "dirty") return <span className="cw-save-state" data-state="dirty" role="status">Modifications non enregistrées</span>;
    if (state.kind === "saving") return <span className="cw-save-state" role="status"><Loader2 className="animate-spin" aria-hidden /> Enregistrement…</span>;
    if (state.kind === "saved") return <span className="cw-save-state" data-state="saved" role="status"><Check aria-hidden /> Enregistré à {timeFr.format(state.at)}</span>;
    if (state.kind === "conflict") return (
        <span className="cw-save-state" data-state="error" role="alert">
            <AlertTriangle aria-hidden /> {state.message}
            <button onClick={onReload}>Recharger</button>
            <button onClick={onOverwrite}>Garder ma version</button>
        </span>
    );
    return <span className="cw-save-state" data-state="error" role="alert"><AlertTriangle aria-hidden /> Non enregistré : {state.message} <button onClick={onRetry}>Réessayer</button></span>;
}

function BlockMenu({ item, open, onOpenChange, onClosed, first, last, onType, onMove, onDuplicate, onDelete }: {
    item: Block; open: boolean; onOpenChange: (open: boolean) => void; onClosed: () => void; first: boolean; last: boolean;
    onType: (type: BlockType) => void; onMove: (delta: -1 | 1) => void; onDuplicate: () => void; onDelete: () => void;
}) {
    const label = BLOCKS.find((entry) => entry.type === item.type)?.label ?? "Bloc";
    return (
        <DropdownMenu open={open} onOpenChange={onOpenChange}>
            <DropdownMenuTrigger asChild>
                <button className="cw-block-handle" aria-label={`Options du bloc ${label} (Ctrl + /)`} tabIndex={-1}><GripVertical aria-hidden /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="left" className="w-56" onCloseAutoFocus={(event) => { event.preventDefault(); onClosed(); }}>
                <DropdownMenuLabel>{label}</DropdownMenuLabel>
                {TEXT_TYPES.has(item.type) && <DropdownMenuSub>
                    <DropdownMenuSubTrigger><Type />Transformer en</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-52">
                        {BLOCKS.filter((entry) => TEXT_TYPES.has(entry.type)).map((entry) => (
                            <DropdownMenuItem key={entry.type} disabled={entry.type === item.type} onSelect={() => onType(entry.type)}><entry.icon />{entry.label}</DropdownMenuItem>
                        ))}
                    </DropdownMenuSubContent>
                </DropdownMenuSub>}
                <DropdownMenuItem disabled={first} onSelect={() => onMove(-1)}><ArrowUp />Monter</DropdownMenuItem>
                <DropdownMenuItem disabled={last} onSelect={() => onMove(1)}><ArrowDown />Descendre</DropdownMenuItem>
                <DropdownMenuItem onSelect={onDuplicate}><Copy />Dupliquer</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={onDelete}><Trash2 />Supprimer</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function CallQueueBlock({ item, missions, onChange, onOpen, onKeyDown }: {
    item: Block;
    missions: Props["missions"];
    onChange: (missionId: string | null) => void;
    onOpen: (missionId: string, tab?: string | null) => void;
    onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
}) {
    const mission = missions.find((entry) => entry.id === item.missionId);
    const readiness = mission?.readiness;
    const summary = !mission ? "Choisissez la mission à afficher."
        : !readiness ? "Préparation indisponible."
        : !readiness.activeLists ? "Aucune base active : la file est vide."
        : `${readiness.readyLists}/${readiness.activeLists} base${readiness.activeLists > 1 ? "s" : ""} prête${readiness.readyLists > 1 ? "s" : ""} · ${mission.sdrCount ?? 0} SDR`;
    return (
        <div className="cw-embed" tabIndex={0} data-block-id={item.id} role="group" aria-label={`File d’appels${mission ? ` : ${mission.name}` : ""}`} onKeyDown={onKeyDown}>
            <span className="cw-embed-icon"><PhoneCall aria-hidden /></span>
            <div className="cw-row-main">
                <strong>File d’appels{mission ? ` · ${mission.name}` : ""}</strong>
                <small>{summary}</small>
            </div>
            <div className="cw-row-side">
                <select aria-label="Mission de la file d’appels" value={item.missionId ?? ""} onChange={(event) => onChange(event.target.value || null)}>
                    <option value="">Choisir une mission</option>
                    {missions.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
                </select>
                {mission && <button className="cw-button" data-size="sm" onClick={() => onOpen(mission.id, "audience")}>Ouvrir <ChevronRight aria-hidden /></button>}
            </div>
        </div>
    );
}
