"use client";

import { memo, useState } from "react";
import { Check, Copy, FileText, Pencil } from "lucide-react";
import type { ThreadMessage } from "@/lib/assistant/api-contract";
import { cn } from "@/lib/utils";
import { FOCUS } from "@/components/accueil/AccueilUI";
import { formatMessageTime } from "./model";

export const MESSAGE_ACTION =
    "inline-flex size-7 items-center justify-center rounded-lg text-ink-4 transition-[background-color,color] duration-150 ease-[var(--ease-snappy)] hover:bg-surface-3 hover:text-ink disabled:pointer-events-none disabled:opacity-40";

/** A question, as a bubble on the right. « Modifier » only on the last one. */
export const UserMessage = memo(function UserMessage({
    message,
    onEdit,
    faded,
}: {
    message: ThreadMessage;
    /** Present on the last question of a writable, idle thread. */
    onEdit?: (() => void) | null;
    faded?: boolean;
}) {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(message.content);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // Clipboard refused (insecure context): nothing to recover.
        }
    };

    return (
        <div data-role="USER" className={cn("group flex flex-col items-end gap-1 motion-safe:animate-ds-enter", faded && "opacity-60")}>
            {message.attachments && message.attachments.length > 0 && (
                <ul className="flex max-w-[85%] flex-wrap justify-end gap-1.5" aria-label="Fichiers joints">
                    {message.attachments.map((a) => (
                        <li
                            key={a.fileId}
                            className="inline-flex max-w-[220px] items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1 text-[12px] text-ink-2 shadow-2xs"
                        >
                            <FileText className="size-3.5 shrink-0 text-ink-4" aria-hidden />
                            <span className="truncate">{a.name}</span>
                        </li>
                    ))}
                </ul>
            )}
            <div className="max-w-[85%] whitespace-pre-wrap rounded-[20px] rounded-br-md bg-surface-3 px-4 py-2.5 text-[14px] leading-relaxed text-ink [overflow-wrap:anywhere] sm:max-w-[75%]">
                {message.content}
            </div>
            <div className="flex h-7 items-center gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
                <time dateTime={message.createdAt} className="mr-1 text-[11px] tabular-nums text-ink-4">
                    {formatMessageTime(message.createdAt)}
                </time>
                <button type="button" onClick={() => void copy()} aria-label="Copier la question" title="Copier" className={cn(MESSAGE_ACTION, FOCUS)}>
                    {copied ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                </button>
                {onEdit && (
                    <button type="button" onClick={onEdit} aria-label="Modifier la question" title="Modifier (↑)" className={cn(MESSAGE_ACTION, FOCUS)}>
                        <Pencil className="size-3.5" aria-hidden />
                    </button>
                )}
            </div>
        </div>
    );
});
