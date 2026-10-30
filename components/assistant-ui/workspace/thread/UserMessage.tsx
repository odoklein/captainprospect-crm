"use client";

import { memo, useEffect, useState, type ReactNode } from "react";
import { Check, Copy, FileText, Pencil } from "lucide-react";
import type { ThreadMessage } from "@/lib/assistant/api-contract";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/shadcn/button";
import { Kbd } from "@/components/ui/shadcn/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/shadcn/tooltip";
import { renderKeys } from "./handover";
import { formatMessageTime } from "./model";

/** A quiet icon action under a message, with its tooltip. */
export function MessageAction({
    label,
    tooltip,
    onClick,
    children,
    className,
    disabled,
}: {
    label: string;
    tooltip?: ReactNode;
    onClick: () => void;
    children: ReactNode;
    className?: string;
    disabled?: boolean;
}) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="icon-xs" onClick={onClick} aria-label={label} disabled={disabled} className={cn("text-ink-4", className)}>
                    {children}
                </Button>
            </TooltipTrigger>
            <TooltipContent>{tooltip ?? label}</TooltipContent>
        </Tooltip>
    );
}

/** Plays the enter animation once for a message loaded from history, never for one written in this session. */
export function useEnterOnce(renderKey: string): boolean {
    const [enter] = useState(() => renderKeys.shouldEnter(renderKey));
    useEffect(() => renderKeys.markEntered(renderKey), [renderKey]);
    return enter;
}

/** A question, as a bubble on the right. « Modifier » only on the last one. */
export const UserMessage = memo(function UserMessage({
    message,
    renderKey,
    onEdit,
    faded,
}: {
    message: ThreadMessage;
    /** Stable through the swap of the browser id for the server id. */
    renderKey: string;
    /** Present on the last question of a writable, idle thread. */
    onEdit?: (() => void) | null;
    faded?: boolean;
}) {
    const enter = useEnterOnce(renderKey);
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
        <div data-role="USER" className={cn("group/msg flex flex-col items-end gap-1", enter && "motion-safe:animate-ds-enter", faded && "opacity-60")}>
            {message.attachments && message.attachments.length > 0 && (
                <ul className="flex max-w-[85%] flex-wrap justify-end gap-1.5" aria-label="Fichiers joints">
                    {message.attachments.map((a) => (
                        <li
                            key={a.fileId}
                            className="inline-flex max-w-[220px] items-center gap-1.5 rounded-chip border border-line bg-surface px-2.5 py-1 text-[12px] font-medium text-ink-2 shadow-2xs"
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
            <div className="flex h-7 items-center gap-0.5 opacity-0 transition-opacity duration-150 ease-snappy focus-within:opacity-100 group-hover/msg:opacity-100 max-md:opacity-100">
                <time dateTime={message.createdAt} className="mr-1 text-[11px] tabular-nums text-ink-4">
                    {formatMessageTime(message.createdAt)}
                </time>
                <MessageAction label="Copier la question" tooltip={copied ? "Copié" : "Copier"} onClick={() => void copy()}>
                    {copied ? <Check className="text-success" aria-hidden /> : <Copy aria-hidden />}
                </MessageAction>
                {onEdit && (
                    <MessageAction
                        label="Modifier la question"
                        tooltip={
                            <span className="flex items-center gap-1.5">
                                Modifier <Kbd>↑</Kbd>
                            </span>
                        }
                        onClick={onEdit}
                    >
                        <Pencil aria-hidden />
                    </MessageAction>
                )}
            </div>
        </div>
    );
});
