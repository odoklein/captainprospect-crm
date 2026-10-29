"use client";

/**
 * The message box: an autosized textarea in a card, attachment chips (upload
 * progress, then extraction status), and a toolbar — join a file,
 * « Réflexion approfondie », the model tier, Stop / Envoyer. An edit mode
 * re-sends the last question.
 *
 * Two menus open above it: « / » at the start of an empty box lists prompt
 * templates (/pdf, /bilan, /resume, /visuel, /memoire); « @ » lists the
 * folder's files and inserts « [fichier: nom] », the file joining the message.
 *
 * Keys: Entrée sends, Maj+Entrée breaks the line, Échap closes a menu, stops
 * the answer or leaves edit mode, ↑ in an empty box edits the last question,
 * ↑/↓ + Entrée/Tab pick in a menu. Ctrl/⌘+K and Ctrl/⌘+Maj+O are handled by
 * the workspace for the whole page.
 */

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, useSyncExternalStore, type Ref } from "react";
import { AlertCircle, ArrowUp, Check, FileText, Loader2, Paperclip, Pencil, Square, X } from "lucide-react";
import { FILE_ACCEPT, type FolderFile } from "@/lib/assistant/api-contract";
import { useFolderFiles } from "@/lib/assistant/client/folder-hooks";
import { cn } from "@/lib/utils";
import { AiMark } from "@/components/ui/AiMark";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Card } from "@/components/ui/shadcn/card";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/shadcn/command";
import { Kbd } from "@/components/ui/shadcn/kbd";
import { Progress } from "@/components/ui/shadcn/progress";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { Toggle } from "@/components/ui/shadcn/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/shadcn/tooltip";
import type { AttachmentItem } from "./thread/useAttachments";
import {
    filterMentionFiles,
    filterSlashCommands,
    insertMention,
    keptMentions,
    mentionAt,
    slashQuery,
    type SlashCommand,
} from "./thread/composer-logic";

export interface ComposerHandle {
    focus(): void;
    startEdit(messageId: string, text: string): void;
}

export interface MentionedFile {
    fileId: string;
    name: string;
    status: string;
}

export interface ComposerSubmit {
    text: string;
    deep: boolean;
    editMessageId?: string;
    /** Folder files mentioned with « @ » and still named in the text. */
    mentions?: MentionedFile[];
}

export interface ComposerAttachments {
    items: AttachmentItem[];
    uploading: boolean;
    add(files: File[]): void;
    remove(key: string): void;
}

const ACCEPT_ATTR = Object.values(FILE_ACCEPT).flat().join(",");

const noSubscribe = () => () => {};

/** ⌘ or Ctrl in the hints; false on the server, read once on the client. */
export function useIsMac(): boolean {
    return useSyncExternalStore(
        noSubscribe,
        () => {
            const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? "";
            return /mac|iphone|ipad/i.test(platform);
        },
        () => false,
    );
}

function statusOf(item: AttachmentItem): { label: string; tone: "busy" | "ok" | "bad" } {
    switch (item.status) {
        case "uploading":
            return { label: `Envoi… ${Math.round(item.progress * 100)} %`, tone: "busy" };
        case "PENDING":
        case "PROCESSING":
            return { label: "Lecture…", tone: "busy" };
        case "READY":
            return { label: "Prêt", tone: "ok" };
        case "NEEDS_OCR":
            return { label: "Scan illisible", tone: "bad" };
        case "UNSUPPORTED":
            return { label: "Non lisible", tone: "bad" };
        default:
            return { label: item.error ?? "Échec", tone: "bad" };
    }
}

function AttachmentChip({ item, onRemove }: { item: AttachmentItem; onRemove: () => void }) {
    const status = statusOf(item);
    return (
        <li className="motion-safe:animate-ds-pop">
            <Badge
                variant={status.tone === "bad" ? "danger" : "outline"}
                className="relative h-8 max-w-[240px] gap-1.5 rounded-control pl-2 pr-1 text-[12px] font-medium"
                title={item.error ?? `${item.name} · ${status.label}`}
            >
                {status.tone === "busy" ? (
                    <Loader2 className="animate-spin text-ink-4" aria-hidden />
                ) : status.tone === "ok" ? (
                    <FileText className="text-ink-3" aria-hidden />
                ) : (
                    <AlertCircle className="text-danger" aria-hidden />
                )}
                <span className="min-w-0 truncate">{item.name}</span>
                <span className="shrink-0 text-[11px] font-normal text-ink-4">
                    {status.tone === "ok" ? <Check className="size-3 text-success" aria-label="Prêt" /> : status.label}
                </span>
                <button
                    type="button"
                    onClick={onRemove}
                    aria-label={`Retirer ${item.name}`}
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-lg text-ink-4 transition-colors duration-150 ease-snappy hover:bg-surface-3 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                    <X className="size-3.5" aria-hidden />
                </button>
                {item.status === "uploading" && (
                    <Progress value={item.progress * 100} className="absolute inset-x-2 bottom-0.5 h-0.5 w-auto" aria-label={`Envoi de ${item.name}`} />
                )}
            </Badge>
        </li>
    );
}

type Menu =
    | { kind: "slash"; items: SlashCommand[] }
    | { kind: "mention"; items: FolderFile[]; loading: boolean; range: { start: number; query: string } };

export function Composer({
    handleRef,
    sending,
    blockedReason,
    onSubmit,
    onStop,
    onRequestEditLast,
    attachments,
    attachDisabledReason,
    folderId = null,
    placeholder = "Demandez à Captain AI…",
    compact,
    autoFocus,
    isMac,
}: {
    handleRef?: Ref<ComposerHandle>;
    /** This thread's answer is being written. */
    sending: boolean;
    /** Why sending is not possible right now (read-only, another answer running…). */
    blockedReason: string | null;
    /** Return false to keep the text (the send was refused). */
    onSubmit: (submit: ComposerSubmit) => boolean | void;
    onStop: () => void;
    onRequestEditLast?: () => { id: string; content: string } | null;
    attachments: ComposerAttachments | null;
    /** Why files cannot be joined here (no folder, read-only). */
    attachDisabledReason: string | null;
    /** The thread's folder: its files can be mentioned with « @ ». */
    folderId?: string | null;
    placeholder?: string;
    compact?: boolean;
    autoFocus?: boolean;
    isMac?: boolean;
}) {
    const [text, setText] = useState("");
    const [caret, setCaret] = useState(0);
    const [deep, setDeep] = useState(false);
    const [editing, setEditing] = useState<{ messageId: string; original: string } | null>(null);
    const [mentions, setMentions] = useState<MentionedFile[]>([]);
    const [dismissedFor, setDismissedFor] = useState<string | null>(null);
    const [active, setActive] = useState(0);
    const [filesWanted, setFilesWanted] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    // The folder's files load the first time « @ » is typed.
    const { data: folderFiles, isLoading: filesLoading } = useFolderFiles(filesWanted ? folderId : null);

    const focus = useCallback(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
    }, []);

    const placeCaret = useCallback((position: number) => {
        requestAnimationFrame(() => {
            const el = textareaRef.current;
            if (!el) return;
            el.focus();
            el.setSelectionRange(position, position);
            setCaret(position);
        });
    }, []);

    const startEdit = useCallback(
        (messageId: string, original: string) => {
            setEditing({ messageId, original });
            setText(original);
            requestAnimationFrame(focus);
        },
        [focus],
    );

    useImperativeHandle(handleRef, () => ({ focus, startEdit }), [focus, startEdit]);

    // Autosize, capped; the box scrolls past the cap.
    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, compact ? 160 : 240)}px`;
    }, [text, compact]);

    // ---- Menus ---------------------------------------------------------------------

    const menu: Menu | null = useMemo(() => {
        if (dismissedFor === text) return null;
        const slash = editing ? null : slashQuery(text);
        if (slash !== null) {
            const items = filterSlashCommands(slash);
            return items.length > 0 ? { kind: "slash", items } : null;
        }
        if (!folderId) return null;
        const range = mentionAt(text, caret);
        if (!range) return null;
        const files = folderFiles?.files ?? [];
        return { kind: "mention", items: filterMentionFiles(files, range.query), loading: filesLoading || !folderFiles, range };
    }, [text, caret, editing, folderId, folderFiles, filesLoading, dismissedFor]);

    const menuItems = menu?.items.length ?? 0;
    const activeIndex = menuItems > 0 ? Math.min(active, menuItems - 1) : 0;
    const activeValue = menu ? (menu.kind === "slash" ? `slash:${menu.items[activeIndex]?.id ?? ""}` : `file:${menu.items[activeIndex]?.fileId ?? ""}`) : "";

    const pickSlash = (command: SlashCommand) => {
        setText(command.template);
        setActive(0);
        placeCaret(command.template.length);
    };

    const pickFile = (file: FolderFile, range: { start: number; query: string }) => {
        if (file.status !== "READY") return;
        const next = insertMention(text, range, caret, file.name);
        setText(next.text);
        setMentions((prev) => (prev.some((m) => m.fileId === file.fileId) ? prev : [...prev, { fileId: file.fileId, name: file.name, status: file.status }]));
        setActive(0);
        placeCaret(next.caret);
    };

    const pickActive = () => {
        if (!menu) return;
        if (menu.kind === "slash") {
            const command = menu.items[activeIndex];
            if (command) pickSlash(command);
        } else {
            const file = menu.items[activeIndex];
            if (file) pickFile(file, menu.range);
        }
    };

    // ---- Send ------------------------------------------------------------------------

    const cancelEdit = () => {
        setEditing(null);
        setText("");
    };

    const submit = () => {
        const value = text.trim();
        if (!value || sending || blockedReason || attachments?.uploading) return;
        const kept = keptMentions(value, mentions);
        const result = onSubmit({ text: value, deep, editMessageId: editing?.messageId, mentions: kept.length > 0 ? kept : undefined });
        if (result === false) return;
        setText("");
        setCaret(0);
        setMentions([]);
        setEditing(null);
    };

    const canSend = text.trim().length > 0 && !blockedReason && !attachments?.uploading;
    const mod = isMac ? "⌘" : "Ctrl";
    const menuId = "captain-composer-menu";

    return (
        <div className={cn("mx-auto w-full shrink-0", compact ? "px-3 pb-3" : "max-w-3xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6")}>
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    submit();
                }}
                className="relative"
            >
                {menu && (
                    <div className="absolute inset-x-0 bottom-full z-20 mb-2" onMouseDown={(e) => e.preventDefault()}>
                        <Command
                            shouldFilter={false}
                            value={activeValue}
                            onValueChange={(value) => {
                                const index = menu.kind === "slash" ? menu.items.findIndex((c) => `slash:${c.id}` === value) : menu.items.findIndex((f) => `file:${f.fileId}` === value);
                                if (index >= 0) setActive(index);
                            }}
                            className="border border-line shadow-overlay duration-150 ease-snappy animate-in fade-in-0 slide-in-from-bottom-1"
                        >
                            <CommandList id={menuId} className="max-h-64 p-1.5">
                                {menu.kind === "slash" ? (
                                    <CommandGroup heading="Commandes">
                                        {menu.items.map((command) => (
                                            <CommandItem key={command.id} value={`slash:${command.id}`} onSelect={() => pickSlash(command)}>
                                                <span className="w-16 shrink-0 font-mono text-[12.5px] text-accent-soft-ink">{command.command}</span>
                                                <span className="min-w-0 flex-1 truncate">
                                                    <span className="font-medium text-ink">{command.label}</span>
                                                    <span className="text-ink-4"> — {command.hint}</span>
                                                </span>
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                ) : (
                                    <>
                                        {menu.loading && menu.items.length === 0 ? (
                                            <div className="flex items-center gap-2 px-2 py-3 text-sm text-ink-3">
                                                <Loader2 className="size-4 animate-spin" aria-hidden /> Chargement des fichiers…
                                            </div>
                                        ) : (
                                            <CommandEmpty>{menu.range.query ? "Aucun fichier ne correspond." : "Aucun fichier dans ce dossier."}</CommandEmpty>
                                        )}
                                        {menu.items.length > 0 && (
                                            <CommandGroup heading="Fichiers du dossier">
                                                {menu.items.map((file) => (
                                                    <CommandItem
                                                        key={file.fileId}
                                                        value={`file:${file.fileId}`}
                                                        disabled={file.status !== "READY"}
                                                        onSelect={() => pickFile(file, menu.range)}
                                                    >
                                                        <FileText aria-hidden />
                                                        <span className="min-w-0 flex-1 truncate">{file.name}</span>
                                                        {file.status !== "READY" && <span className="shrink-0 text-xs text-ink-4">{file.status === "PENDING" || file.status === "PROCESSING" ? "Lecture…" : "Illisible"}</span>}
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        )}
                                    </>
                                )}
                            </CommandList>
                            <div className="flex items-center gap-3 border-t border-line-subtle px-3 py-1.5 text-[11px] text-ink-4">
                                <span className="flex items-center gap-1">
                                    <Kbd>↑</Kbd>
                                    <Kbd>↓</Kbd> choisir
                                </span>
                                <span className="flex items-center gap-1">
                                    <Kbd>Entrée</Kbd> insérer
                                </span>
                                <span className="flex items-center gap-1">
                                    <Kbd>Échap</Kbd> fermer
                                </span>
                            </div>
                        </Command>
                    </div>
                )}

                <Card
                    className={cn(
                        "gap-0 rounded-[22px] py-0 shadow-raised",
                        "transition-[border-color,box-shadow] duration-200 ease-snappy",
                        editing ? "border-accent-300 ring-4 ring-accent-500/10" : "focus-within:border-line-strong focus-within:ring-4 focus-within:ring-primary-500/[0.06]",
                    )}
                >
                    {editing && (
                        <div className="flex items-center gap-2 border-b border-line-subtle px-4 py-2 text-[12.5px] text-ink-3 motion-safe:animate-ds-enter">
                            <Pencil className="size-3.5 text-accent-600" aria-hidden />
                            <span className="min-w-0 flex-1 truncate">Modification de votre dernière question</span>
                            <Button type="button" variant="ghost" size="xs" onClick={cancelEdit}>
                                Annuler
                            </Button>
                        </div>
                    )}

                    {attachments && attachments.items.length > 0 && (
                        <ul className="flex flex-wrap gap-1.5 px-3 pt-3" aria-label="Fichiers à joindre">
                            {attachments.items.map((item) => (
                                <AttachmentChip key={item.key} item={item} onRemove={() => attachments.remove(item.key)} />
                            ))}
                        </ul>
                    )}

                    <Textarea
                        ref={textareaRef}
                        value={text}
                        onChange={(e) => {
                            const value = e.target.value;
                            const position = e.target.selectionStart ?? value.length;
                            setText(value);
                            setCaret(position);
                            setActive(0);
                            if (!filesWanted && folderId && mentionAt(value, position)) setFilesWanted(true);
                        }}
                        onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
                        onKeyDown={(e) => {
                            if (e.nativeEvent.isComposing) return;
                            if (menu && menuItems > 0) {
                                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                                    e.preventDefault();
                                    const step = e.key === "ArrowDown" ? 1 : -1;
                                    setActive((activeIndex + step + menuItems) % menuItems);
                                    return;
                                }
                                if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
                                    e.preventDefault();
                                    pickActive();
                                    return;
                                }
                            }
                            if (e.key === "Escape" && menu) {
                                e.preventDefault();
                                e.stopPropagation();
                                setDismissedFor(text);
                                return;
                            }
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                submit();
                                return;
                            }
                            if (e.key === "Escape") {
                                if (sending) {
                                    e.preventDefault();
                                    onStop();
                                } else if (editing) {
                                    e.preventDefault();
                                    cancelEdit();
                                }
                                return;
                            }
                            if (e.key === "ArrowUp" && !text && !editing && onRequestEditLast) {
                                const last = onRequestEditLast();
                                if (last) {
                                    e.preventDefault();
                                    startEdit(last.id, last.content);
                                }
                            }
                        }}
                        rows={1}
                        autoFocus={autoFocus}
                        placeholder={placeholder}
                        aria-label="Message à Captain AI"
                        aria-autocomplete="list"
                        aria-expanded={menu !== null}
                        aria-controls={menu ? menuId : undefined}
                        className={cn(
                            "rounded-none border-0 bg-transparent px-4 pb-1 pt-3.5 text-[14.5px] shadow-none hover:border-transparent focus-visible:border-transparent focus-visible:ring-0",
                            compact ? "min-h-[48px]" : "min-h-[56px]",
                        )}
                    />

                    <div className="flex items-center gap-1 px-2 pb-2 pt-1">
                        {attachments && (
                            <>
                                <input
                                    ref={fileRef}
                                    type="file"
                                    multiple
                                    accept={ACCEPT_ATTR}
                                    className="hidden"
                                    tabIndex={-1}
                                    onChange={(e) => {
                                        const files = Array.from(e.target.files ?? []);
                                        e.target.value = "";
                                        attachments.add(files);
                                    }}
                                />
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        {/* A span keeps the tooltip on a disabled button. */}
                                        <span tabIndex={attachDisabledReason ? 0 : -1} className="inline-flex rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-focus">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon-sm"
                                                onClick={() => fileRef.current?.click()}
                                                disabled={attachDisabledReason !== null}
                                                aria-label={attachDisabledReason ? `Joindre un fichier — ${attachDisabledReason}` : "Joindre un fichier"}
                                            >
                                                <Paperclip aria-hidden />
                                            </Button>
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent>{attachDisabledReason ?? "Joindre un fichier (PDF, Word, Excel, CSV, texte)"}</TooltipContent>
                                </Tooltip>
                            </>
                        )}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Toggle size="sm" pressed={deep} onPressedChange={setDeep} aria-label="Réflexion approfondie" className="gap-1.5 px-2.5 text-[12.5px] font-medium">
                                    <AiMark className={cn("size-3.5 transition-transform duration-300 ease-snappy", deep && "rotate-45")} aria-hidden />
                                    <span className={cn(compact && "max-sm:sr-only")}>Réflexion approfondie</span>
                                </Toggle>
                            </TooltipTrigger>
                            <TooltipContent>Modèle plus puissant et enquête plus longue : réponse plus lente et plus coûteuse</TooltipContent>
                        </Tooltip>

                        <div className="ml-auto flex items-center gap-2">
                            {!compact && (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Badge variant={deep ? "ai" : "outline"} className="cursor-default max-sm:hidden" tabIndex={0}>
                                            {deep ? "Approfondi" : "Standard"}
                                        </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>{deep ? "Le modèle le plus capable, pour les questions difficiles." : "Le modèle rapide, pour l’essentiel des questions."}</TooltipContent>
                                </Tooltip>
                            )}
                            {sending ? (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button type="button" size="icon" onClick={onStop} aria-label="Arrêter la réponse" className="rounded-full bg-ink text-surface shadow-xs hover:bg-ink-2 motion-safe:animate-ds-pop">
                                            <Square className="size-3 fill-current" aria-hidden />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent className="flex items-center gap-1.5">
                                        Arrêter <Kbd>Échap</Kbd>
                                    </TooltipContent>
                                </Tooltip>
                            ) : (
                                <Button
                                    type="submit"
                                    size="icon"
                                    disabled={!canSend}
                                    aria-label={editing ? "Renvoyer la question modifiée" : "Envoyer"}
                                    className={cn("rounded-full", !canSend && "bg-surface-3 text-ink-4 shadow-none disabled:opacity-100")}
                                >
                                    <ArrowUp className={cn("transition-transform duration-200 ease-snappy", canSend && "motion-safe:-translate-y-px")} aria-hidden />
                                </Button>
                            )}
                        </div>
                    </div>
                </Card>
            </form>
            {blockedReason && !sending ? (
                <p role="status" className="mt-2 text-center text-[11.5px] font-medium text-warning-ink motion-safe:animate-ds-enter">
                    {blockedReason}
                </p>
            ) : (
                !compact && (
                    <p className="mt-2 hidden items-center justify-center gap-1.5 text-center text-[11px] text-ink-4 sm:flex">
                        <Kbd>Entrée</Kbd> envoyer · <Kbd>Maj</Kbd>
                        <Kbd>Entrée</Kbd> à la ligne · <Kbd>/</Kbd> commandes{folderId ? <> · <Kbd>@</Kbd> fichiers</> : null} · <Kbd>{mod}</Kbd>
                        <Kbd>K</Kbd> chercher · Captain AI peut se tromper, vérifiez les chiffres sourcés.
                    </p>
                )
            )}
        </div>
    );
}
