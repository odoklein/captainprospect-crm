"use client";

/**
 * The message box: autosized textarea, attachment chips with their
 * extraction status, « Réflexion approfondie », Stop / Envoyer, and an edit
 * mode for the last question.
 *
 * Keys: Enter sends, Maj+Entrée breaks the line, Échap stops the answer (or
 * leaves edit mode), ↑ in an empty box edits the last question. Ctrl/⌘+K and
 * Ctrl/⌘+Maj+O are handled by the workspace for the whole page.
 */

import { useCallback, useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore, type Ref } from "react";
import { AlertCircle, ArrowUp, Check, FileText, Loader2, Paperclip, Pencil, Square, X } from "lucide-react";
import { FILE_ACCEPT } from "@/lib/assistant/api-contract";
import { cn } from "@/lib/utils";
import { FOCUS } from "@/components/accueil/AccueilUI";
import { Tooltip } from "@/components/ui/Tooltip";
import { AiMark } from "@/components/ui/AiMark";
import type { AttachmentItem } from "./thread/useAttachments";

export interface ComposerHandle {
    focus(): void;
    startEdit(messageId: string, text: string): void;
}

export interface ComposerSubmit {
    text: string;
    deep: boolean;
    editMessageId?: string;
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
            return { label: "Envoi…", tone: "busy" };
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
        <li
            className={cn(
                "group/chip inline-flex h-8 max-w-[240px] items-center gap-1.5 rounded-xl border pl-2 pr-1 text-[12px] motion-safe:animate-ds-pop",
                status.tone === "bad" ? "border-danger-line bg-danger-soft/60 text-danger-ink" : "border-line bg-surface-2 text-ink-2",
            )}
            title={item.error ?? `${item.name} · ${status.label}`}
        >
            {status.tone === "busy" ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin text-ink-4" aria-hidden />
            ) : status.tone === "ok" ? (
                <FileText className="size-3.5 shrink-0 text-ink-3" aria-hidden />
            ) : (
                <AlertCircle className="size-3.5 shrink-0 text-danger" aria-hidden />
            )}
            <span className="min-w-0 truncate font-medium">{item.name}</span>
            <span className="shrink-0 text-[11px] text-ink-4">
                {status.tone === "ok" ? <Check className="size-3 text-success" aria-label="Prêt" /> : status.label}
            </span>
            <button
                type="button"
                onClick={onRemove}
                aria-label={`Retirer ${item.name}`}
                className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-lg text-ink-4 transition-colors hover:bg-surface-3 hover:text-ink", FOCUS)}
            >
                <X className="size-3.5" aria-hidden />
            </button>
        </li>
    );
}

export function Composer({
    handleRef,
    sending,
    blockedReason,
    onSubmit,
    onStop,
    onRequestEditLast,
    attachments,
    attachDisabledReason,
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
    placeholder?: string;
    compact?: boolean;
    autoFocus?: boolean;
    isMac?: boolean;
}) {
    const [text, setText] = useState("");
    const [deep, setDeep] = useState(false);
    const [editing, setEditing] = useState<{ messageId: string; original: string } | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const focus = useCallback(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
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

    const cancelEdit = () => {
        setEditing(null);
        setText("");
    };

    const submit = () => {
        const value = text.trim();
        if (!value || sending || blockedReason || attachments?.uploading) return;
        const result = onSubmit({ text: value, deep, editMessageId: editing?.messageId });
        if (result === false) return;
        setText("");
        setEditing(null);
    };

    const canSend = text.trim().length > 0 && !blockedReason && !attachments?.uploading;
    const mod = isMac ? "⌘" : "Ctrl";

    return (
        <div className={cn("mx-auto w-full shrink-0", compact ? "px-3 pb-3" : "max-w-3xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6")}>
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    submit();
                }}
                className={cn(
                    "relative rounded-[22px] border bg-surface shadow-raised",
                    "transition-[border-color,box-shadow] duration-200 ease-[var(--ease-snappy)]",
                    editing ? "border-accent-300 ring-4 ring-accent-500/10" : "border-line focus-within:border-line-strong focus-within:ring-4 focus-within:ring-primary-500/[0.06]",
                )}
            >
                {editing && (
                    <div className="flex items-center gap-2 border-b border-line-subtle px-4 py-2 text-[12.5px] text-ink-3 motion-safe:animate-ds-enter">
                        <Pencil className="size-3.5 text-accent-600" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">Modification de votre dernière question</span>
                        <button type="button" onClick={cancelEdit} className={cn("rounded-md px-1.5 py-0.5 font-medium text-ink-2 hover:bg-surface-3 hover:text-ink", FOCUS)}>
                            Annuler
                        </button>
                    </div>
                )}

                {attachments && attachments.items.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5 px-3 pt-3" aria-label="Fichiers à joindre">
                        {attachments.items.map((item) => (
                            <AttachmentChip key={item.key} item={item} onRemove={() => attachments.remove(item.key)} />
                        ))}
                    </ul>
                )}

                <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
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
                    className={cn(
                        "block w-full resize-none bg-transparent px-4 pt-3.5 text-[14.5px] leading-relaxed text-ink placeholder:text-ink-4 focus:outline-none",
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
                            {attachDisabledReason ? (
                                <Tooltip content={attachDisabledReason} position="top" className="text-xs">
                                    <span
                                        tabIndex={0}
                                        aria-disabled="true"
                                        aria-label={`Joindre un fichier — ${attachDisabledReason}`}
                                        className={cn("inline-flex size-8 cursor-not-allowed items-center justify-center rounded-xl text-ink-4 opacity-50", FOCUS)}
                                    >
                                        <Paperclip className="size-4" aria-hidden />
                                    </span>
                                </Tooltip>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => fileRef.current?.click()}
                                    aria-label="Joindre un fichier"
                                    title="Joindre un fichier (PDF, Word, Excel, CSV, texte)"
                                    className={cn(
                                        "inline-flex size-8 items-center justify-center rounded-xl text-ink-3 transition-[background-color,color] duration-150 hover:bg-surface-3 hover:text-ink",
                                        FOCUS,
                                    )}
                                >
                                    <Paperclip className="size-4" aria-hidden />
                                </button>
                            )}
                        </>
                    )}
                    <button
                        type="button"
                        onClick={() => setDeep((v) => !v)}
                        aria-pressed={deep}
                        title="Modèle plus puissant et enquête plus longue : réponse plus lente et plus coûteuse"
                        className={cn(
                            "inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-[12.5px] font-medium transition-[background-color,color,box-shadow] duration-200 ease-[var(--ease-snappy)]",
                            FOCUS,
                            deep ? "bg-accent-soft text-accent-soft-ink ring-1 ring-inset ring-accent-200" : "text-ink-3 hover:bg-surface-3 hover:text-ink",
                        )}
                    >
                        <AiMark className={cn("size-3.5 transition-transform duration-300 ease-[var(--ease-snappy)]", deep && "rotate-45")} aria-hidden />
                        <span className={cn(compact && "max-sm:sr-only")}>Réflexion approfondie</span>
                    </button>

                    <div className="ml-auto flex items-center gap-2">
                        {sending ? (
                            <button
                                type="button"
                                onClick={onStop}
                                aria-label="Arrêter la réponse"
                                title="Arrêter (Échap)"
                                className={cn(
                                    "inline-flex size-9 items-center justify-center rounded-full bg-ink text-surface shadow-xs transition-transform duration-150 active:scale-95 motion-safe:animate-ds-pop",
                                    FOCUS,
                                )}
                            >
                                <Square className="size-3 fill-current" aria-hidden />
                            </button>
                        ) : (
                            <button
                                type="submit"
                                disabled={!canSend}
                                aria-label={editing ? "Renvoyer la question modifiée" : "Envoyer"}
                                title={editing ? "Renvoyer (Entrée)" : "Envoyer (Entrée)"}
                                className={cn(
                                    "inline-flex size-9 items-center justify-center rounded-full transition-[background-color,color,transform,box-shadow] duration-200 ease-[var(--ease-snappy)] active:scale-95",
                                    FOCUS,
                                    canSend ? "bg-primary text-primary-fg shadow-primary hover:bg-primary-hover" : "bg-surface-3 text-ink-4",
                                )}
                            >
                                <ArrowUp className={cn("size-4 transition-transform duration-200", canSend && "motion-safe:-translate-y-px")} aria-hidden />
                            </button>
                        )}
                    </div>
                </div>
            </form>
            {blockedReason && !sending ? (
                <p role="status" className="mt-2 text-center text-[11.5px] font-medium text-warning-ink motion-safe:animate-ds-enter">
                    {blockedReason}
                </p>
            ) : !compact && (
                <p className="mt-2 hidden text-center text-[11px] text-ink-4 sm:block">
                    Entrée pour envoyer · Maj+Entrée pour aller à la ligne · {mod}+K pour chercher · Captain AI peut se tromper, vérifiez les chiffres sourcés.
                </p>
            )}
        </div>
    );
}
