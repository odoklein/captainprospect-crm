"use client";

/**
 * One answer: the markdown body with its source chips and visuals
 * (AnswerBody), the confirmation card or revealed secret it carries, the
 * sources consulted, then a quiet row of actions — copy, regenerate (last
 * answer), thumbs, and the cost of the turn.
 */

import { memo, useMemo, useState } from "react";
import { ArrowRight, Check, Copy, Receipt, RotateCcw, ThumbsDown, ThumbsUp } from "lucide-react";
import type { ThreadMessage } from "@/lib/assistant/api-contract";
import type { StoredVisual } from "@/lib/assistant/visuals/spec";
import { splitFollowUps } from "@/lib/assistant/answer";
import { cn } from "@/lib/utils";
import { FOCUS } from "@/components/accueil/AccueilUI";
import { Tooltip } from "@/components/ui/Tooltip";
import { SecretCard, type RevealedSecret } from "@/components/vault/SecretCard";
import { AnswerBody, type VisualHandlers } from "../../AnswerBody";
import { ToolTrace } from "../../ToolTrace";
import { ActionConfirmationCard } from "../../ActionConfirmationCard";
import { formatCostLine, isLocalId, parseAction, parseTrace } from "./model";
import { MESSAGE_ACTION } from "./UserMessage";

export interface AssistantMessageProps {
    message: ThreadMessage;
    /** Latest answer of the thread: follow-ups and regenerate live here. */
    isLast: boolean;
    /** The thread is writable and idle. */
    interactive: boolean;
    secret: RevealedSecret | null;
    actionBusy: boolean;
    pinnedVisualIds: ReadonlySet<string>;
    canPin: boolean;
    onFollowUp: (question: string) => void;
    onRegenerate: (messageId: string) => void;
    onFeedback: (messageId: string, rating: "up" | "down" | null) => void;
    onAction: (messageId: string, decision: "confirm" | "cancel") => void;
    onSecretExpire: (messageId: string) => void;
    onOpenVisual: (visual: StoredVisual, messageId: string) => void;
    onTogglePin: (visual: StoredVisual, messageId: string) => void;
}

export const AssistantMessage = memo(function AssistantMessage({
    message,
    isLast,
    interactive,
    secret,
    actionBusy,
    pinnedVisualIds,
    canPin,
    onFollowUp,
    onRegenerate,
    onFeedback,
    onAction,
    onSecretExpire,
    onOpenVisual,
    onTogglePin,
}: AssistantMessageProps) {
    const trace = useMemo(() => parseTrace(message.trace), [message.trace]);
    const action = useMemo(() => parseAction(message.action), [message.action]);
    const { followUps } = useMemo(() => splitFollowUps(message.content), [message.content]);
    const costLine = formatCostLine(trace.usage);
    const [copied, setCopied] = useState(false);
    const persisted = !isLocalId(message.id);
    const rating = message.feedback?.rating ?? null;

    const handlers: VisualHandlers = useMemo(
        () => ({
            onOpen: (v) => onOpenVisual(v, message.id),
            onTogglePin: canPin ? (v) => onTogglePin(v, message.id) : undefined,
            isPinned: (v) => pinnedVisualIds.has(v.id),
        }),
        [onOpenVisual, onTogglePin, canPin, pinnedVisualIds, message.id],
    );

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(splitFollowUps(message.content).body);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // Clipboard refused (insecure context): nothing to recover.
        }
    };

    return (
        <div data-role="ASSISTANT" className="group min-w-0 motion-safe:animate-ds-enter">
            <div className="cp-ai-answer min-w-0">
                <AnswerBody content={message.content} citations={trace.citations} visuals={trace.visuals} handlers={handlers} />

                {action && (
                    <ActionConfirmationCard
                        action={action}
                        busy={actionBusy}
                        onConfirm={() => onAction(message.id, "confirm")}
                        onCancel={() => onAction(message.id, "cancel")}
                    />
                )}
                {secret && <SecretCard secret={secret} onExpire={() => onSecretExpire(message.id)} />}
                {trace.entries.length > 0 && <ToolTrace trace={trace.entries} />}

                <div
                    className={cn(
                        "mt-1.5 flex items-center gap-0.5 transition-opacity duration-150",
                        isLast ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100",
                    )}
                >
                    <button type="button" onClick={() => void copy()} aria-label="Copier la réponse" title="Copier" className={cn(MESSAGE_ACTION, FOCUS)}>
                        {copied ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                    </button>
                    {isLast && interactive && persisted && (
                        <button
                            type="button"
                            onClick={() => onRegenerate(message.id)}
                            aria-label="Régénérer la réponse"
                            title="Régénérer"
                            className={cn(MESSAGE_ACTION, FOCUS, "[&:hover>svg]:-rotate-90")}
                        >
                            <RotateCcw className="size-3.5 transition-transform duration-300 ease-[var(--ease-snappy)]" aria-hidden />
                        </button>
                    )}
                    {persisted && (
                        <>
                            <button
                                type="button"
                                onClick={() => onFeedback(message.id, rating === "up" ? null : "up")}
                                aria-label="Réponse utile"
                                aria-pressed={rating === "up"}
                                title="Utile"
                                className={cn(MESSAGE_ACTION, FOCUS, rating === "up" && "bg-success-soft text-success-ink hover:bg-success-soft hover:text-success-ink")}
                            >
                                <ThumbsUp className={cn("size-3.5 transition-transform duration-200", rating === "up" && "motion-safe:scale-110")} aria-hidden />
                            </button>
                            <button
                                type="button"
                                onClick={() => onFeedback(message.id, rating === "down" ? null : "down")}
                                aria-label="Réponse à améliorer"
                                aria-pressed={rating === "down"}
                                title="À améliorer"
                                className={cn(MESSAGE_ACTION, FOCUS, rating === "down" && "bg-danger-soft text-danger-ink hover:bg-danger-soft hover:text-danger-ink")}
                            >
                                <ThumbsDown className={cn("size-3.5 transition-transform duration-200", rating === "down" && "motion-safe:scale-110")} aria-hidden />
                            </button>
                        </>
                    )}
                    {costLine && (
                        <Tooltip content={costLine} position="top" className="text-xs">
                            <span
                                tabIndex={0}
                                role="note"
                                aria-label={`Coût de la réponse : ${costLine}`}
                                className={cn(MESSAGE_ACTION, FOCUS, "cursor-default")}
                            >
                                <Receipt className="size-3.5" aria-hidden />
                            </span>
                        </Tooltip>
                    )}
                </div>

                {isLast && interactive && followUps.length > 0 && (
                    <div className="mt-3 flex flex-col items-start gap-1.5">
                        {followUps.map((question, i) => (
                            <button
                                key={question}
                                type="button"
                                onClick={() => onFollowUp(question)}
                                style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
                                className={cn(
                                    "group/fu inline-flex max-w-full items-center gap-2 rounded-xl border border-line bg-surface px-3 py-1.5 text-left text-[13px] text-ink-2 shadow-2xs motion-safe:animate-ds-enter",
                                    "transition-[border-color,color,background-color] duration-200 ease-[var(--ease-snappy)] hover:border-line-strong hover:bg-surface-2 hover:text-ink",
                                    FOCUS,
                                )}
                            >
                                <ArrowRight className="size-3.5 shrink-0 text-ink-4 transition-transform duration-200 ease-[var(--ease-snappy)] group-hover/fu:translate-x-0.5" aria-hidden />
                                <span className="min-w-0">{question}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
});
