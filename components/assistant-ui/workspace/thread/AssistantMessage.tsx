"use client";

/**
 * One answer, from its first stream event to the saved message — ONE
 * component under one React key (the turn key, thread/handover.ts), so the
 * hand-over updates in place:
 *
 *   trace    « N sources consultées » — the live steps, folding in place into
 *            the saved trace (only when the turn used tools, live and saved alike)
 *   body     the streamed draft, then the saved text (only a rewritten block cross-fades)
 *   card     confirmation card / revealed secret (saved)
 *   footer   one h-7 row: live → phase · elapsed · reasoning;
 *            saved → Copier, Régénérer, avis, Exporter en PDF, coût
 *
 * Nothing above the text appears or disappears at the hand-over, and the
 * footer keeps its height, so the text never moves.
 */

import { memo, useMemo, useState } from "react";
import { ArrowRight, Check, Copy, FileDown, Loader2, Receipt, RotateCcw, ThumbsDown, ThumbsUp } from "lucide-react";
import type { ThreadMessage } from "@/lib/assistant/api-contract";
import type { StoredVisual } from "@/lib/assistant/visuals/spec";
import { splitFollowUps } from "@/lib/assistant/answer";
import { cn } from "@/lib/utils";
import { AiMark } from "@/components/ui/AiMark";
import { Badge } from "@/components/ui/shadcn/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/shadcn/hover-card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/shadcn/toggle-group";
import { SecretCard, type RevealedSecret } from "@/components/vault/SecretCard";
import { AnswerBody, type VisualHandlers } from "../../AnswerBody";
import { ActionConfirmationCard } from "../../ActionConfirmationCard";
import { Elapsed, PHASE_LABEL, formatSeconds, reasoningLine } from "../../LiveTurn";
import { ToolTraceList, ToolTraceRoot, ToolTraceTrigger, sourcesLabel, totalDuration, traceRows, type TraceRow } from "../../ToolTrace";
import type { LiveSnapshot } from "../useChatStream";
import { formatEuros, isLocalId, parseAction, parseTrace } from "./model";
import { MessageAction, useEnterOnce } from "./UserMessage";

export interface AssistantMessageProps {
    /** The turn key (streamed) or the message id: the same through the hand-over. */
    renderKey: string;
    /** The saved answer (null while it is being written). */
    message: ThreadMessage | null;
    /** The turn being written (null once saved). */
    live: LiveSnapshot | null;
    /** Latest answer of the thread: follow-ups and regenerate live here. */
    isLast: boolean;
    /** The thread is writable and idle. */
    interactive: boolean;
    secret: RevealedSecret | null;
    actionBusy: boolean;
    pinnedVisualIds: ReadonlySet<string>;
    canPin: boolean;
    /** This answer's PDF is being made. */
    exportingPdf: boolean;
    onFollowUp: (question: string) => void;
    onRegenerate: (messageId: string) => void;
    onFeedback: (messageId: string, rating: "up" | "down" | null) => void;
    onAction: (messageId: string, decision: "confirm" | "cancel") => void;
    onSecretExpire: (messageId: string) => void;
    onOpenVisual: (visual: StoredVisual, messageId: string | null) => void;
    onTogglePin: (visual: StoredVisual, messageId: string) => void;
    onExportPdf?: (messageId: string) => void;
}

const NBSP = " ";

export const AssistantMessage = memo(function AssistantMessage({
    renderKey,
    message,
    live,
    isLast,
    interactive,
    secret,
    actionBusy,
    pinnedVisualIds,
    canPin,
    exportingPdf,
    onFollowUp,
    onRegenerate,
    onFeedback,
    onAction,
    onSecretExpire,
    onOpenVisual,
    onTogglePin,
    onExportPdf,
}: AssistantMessageProps) {
    const enter = useEnterOnce(renderKey);
    const streaming = live !== null && message === null;
    const state = live?.state ?? null;

    const trace = useMemo(() => parseTrace(message?.trace ?? null), [message?.trace]);
    const action = useMemo(() => parseAction(message?.action ?? null), [message?.action]);
    const content = message ? message.content : (state?.draft ?? "");
    const visuals = message ? trace.visuals : (state?.visuals ?? trace.visuals);
    const { followUps } = useMemo(() => splitFollowUps(content), [content]);
    const writing = streaming ? content.trim().length > 0 || visuals.length > 0 : true;
    const messageId = message?.id ?? null;
    const persisted = messageId !== null && !isLocalId(messageId);

    // ---- Header: live steps or saved trace, the same rows ---------------------------

    const rows: TraceRow[] = useMemo(() => {
        if (streaming && state) {
            return state.steps.map((s) => ({
                label: s.label,
                state: s.state,
                meta: s.durationMs !== undefined ? (s.cached ? "déjà lu" : formatSeconds(s.durationMs)) : undefined,
            }));
        }
        return traceRows(trace.entries);
    }, [streaming, state, trace.entries]);

    const [userOpen, setUserOpen] = useState<boolean | null>(null);
    // While tools run the list is the news; once the answer flows it folds into one line.
    const traceOpen = rows.length > 0 && (userOpen ?? (streaming && !writing));
    const reasoning = streaming && !writing ? reasoningLine(state?.reasoning) : "";

    const handlers: VisualHandlers = useMemo(
        () =>
            messageId
                ? {
                      onOpen: (v) => onOpenVisual(v, messageId),
                      onTogglePin: canPin ? (v) => onTogglePin(v, messageId) : undefined,
                      isPinned: (v) => pinnedVisualIds.has(v.id),
                  }
                : { onOpen: (v) => onOpenVisual(v, null) },
        [messageId, onOpenVisual, onTogglePin, canPin, pinnedVisualIds],
    );

    return (
        <article
            data-role="ASSISTANT"
            aria-busy={streaming || undefined}
            aria-live={streaming ? "polite" : undefined}
            className={cn("group/turn min-w-0", enter && "motion-safe:animate-ds-enter")}
        >
            {/* Trace: only for a turn that used tools; the live steps fold in place into the saved trace. */}
            {rows.length > 0 && (
                <ToolTraceRoot open={traceOpen} onOpenChange={setUserOpen} className="mb-2 text-[12.5px]">
                    <div className="flex h-7 min-w-0 items-center">
                        <ToolTraceTrigger open={traceOpen}>
                            {sourcesLabel(rows.length)}
                            {!streaming && <span className="text-ink-4"> · {totalDuration(trace.entries)}</span>}
                        </ToolTraceTrigger>
                    </div>
                    <ToolTraceList
                        rows={rows}
                        footer={
                            streaming && !writing && state?.phase === "thinking" && rows.every((r) => r.state !== "running") ? (
                                <li className="text-ink-4">Analyse des résultats…</li>
                            ) : null
                        }
                    />
                </ToolTraceRoot>
            )}

            {/* Body: the same element from the first word to the saved text. */}
            {writing && (
                <div className={cn("cp-ai-answer min-w-0", streaming && "cp-ai-caret")}>
                    <AnswerBody content={content} citations={message ? trace.citations : undefined} visuals={visuals} handlers={handlers} />
                </div>
            )}

            {message && action && (
                <ActionConfirmationCard
                    action={action}
                    busy={actionBusy}
                    onConfirm={() => onAction(message.id, "confirm")}
                    onCancel={() => onAction(message.id, "cancel")}
                />
            )}
            {message && secret && <SecretCard secret={secret} onExpire={() => onSecretExpire(message.id)} />}

            {/* Footer: one h-7 row — the live status, then the actions in its place. */}
            <div
                className={cn(
                    "mt-1.5 flex h-7 min-w-0 items-center gap-0.5 transition-opacity duration-150 ease-snappy",
                    message && !isLast && "opacity-0 focus-within:opacity-100 group-hover/turn:opacity-100 max-md:opacity-100",
                )}
            >
                {message ? (
                    <AnswerActions
                        message={message}
                        isLast={isLast}
                        interactive={interactive}
                        persisted={persisted}
                        usage={trace.usage}
                        exportingPdf={exportingPdf}
                        onRegenerate={onRegenerate}
                        onFeedback={onFeedback}
                        onExportPdf={onExportPdf}
                    />
                ) : (
                    <div className="flex min-w-0 items-center gap-2 text-[12.5px] text-ink-3">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-soft-ink" aria-hidden>
                            <AiMark className="size-3.5 motion-safe:animate-pulse" />
                        </span>
                        <span className="shrink-0 font-medium text-ink-2">{PHASE_LABEL[state?.phase ?? "connecting"]}</span>
                        {live && <Elapsed startedAt={live.startedAt} className="shrink-0 tabular-nums text-ink-4" />}
                        {live?.deep && (
                            <Badge variant="ai" className="shrink-0">
                                Réflexion approfondie
                            </Badge>
                        )}
                        {reasoning && (
                            <span className="min-w-0 truncate italic text-ink-4" title={state?.reasoning}>
                                {reasoning}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {message && isLast && interactive && followUps.length > 0 && (
                <div className="mt-3 flex flex-col items-start gap-1.5">
                    {followUps.map((question, i) => (
                        <button
                            key={question}
                            type="button"
                            onClick={() => onFollowUp(question)}
                            style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
                            className={cn(
                                "group/fu inline-flex max-w-full items-center gap-2 rounded-control border border-line bg-surface px-3 py-1.5 text-left text-[13px] text-ink-2 shadow-2xs motion-safe:animate-ds-enter",
                                "transition-[border-color,color,background-color] duration-200 ease-snappy hover:border-line-strong hover:bg-surface-2 hover:text-ink",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                            )}
                        >
                            <ArrowRight className="size-3.5 shrink-0 text-ink-4 transition-transform duration-200 ease-snappy group-hover/fu:translate-x-0.5" aria-hidden />
                            <span className="min-w-0">{question}</span>
                        </button>
                    ))}
                </div>
            )}
        </article>
    );
});

// ============================================
// Actions bar
// ============================================

function AnswerActions({
    message,
    isLast,
    interactive,
    persisted,
    usage,
    exportingPdf,
    onRegenerate,
    onFeedback,
    onExportPdf,
}: {
    message: ThreadMessage;
    isLast: boolean;
    interactive: boolean;
    persisted: boolean;
    usage: ReturnType<typeof parseTrace>["usage"];
    exportingPdf: boolean;
    onRegenerate: (messageId: string) => void;
    onFeedback: (messageId: string, rating: "up" | "down" | null) => void;
    onExportPdf?: (messageId: string) => void;
}) {
    const [copied, setCopied] = useState(false);
    const rating = message.feedback?.rating ?? null;

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
        <>
            <MessageAction label="Copier la réponse" tooltip={copied ? "Copié" : "Copier"} onClick={() => void copy()}>
                {copied ? <Check className="text-success" aria-hidden /> : <Copy aria-hidden />}
            </MessageAction>
            {isLast && interactive && persisted && (
                <MessageAction label="Régénérer la réponse" tooltip="Régénérer" onClick={() => onRegenerate(message.id)} className="[&:hover>svg]:-rotate-90">
                    <RotateCcw className="transition-transform duration-300 ease-snappy" aria-hidden />
                </MessageAction>
            )}
            {persisted && (
                <ToggleGroup
                    type="single"
                    size="sm"
                    value={rating ?? ""}
                    onValueChange={(value) => onFeedback(message.id, value === "up" || value === "down" ? value : null)}
                    aria-label="Votre avis sur la réponse"
                    className="gap-0.5"
                >
                    <ToggleGroupItem
                        value="up"
                        aria-label="Réponse utile"
                        title="Utile"
                        className="size-7 min-w-7 flex-none rounded-lg px-0 text-ink-4 first:rounded-lg data-[state=on]:bg-success-soft data-[state=on]:text-success-ink [&_svg]:size-3.5"
                    >
                        <ThumbsUp aria-hidden />
                    </ToggleGroupItem>
                    <ToggleGroupItem
                        value="down"
                        aria-label="Réponse à améliorer"
                        title="À améliorer"
                        className="size-7 min-w-7 flex-none rounded-lg px-0 text-ink-4 last:rounded-lg data-[state=on]:bg-danger-soft data-[state=on]:text-danger-ink [&_svg]:size-3.5"
                    >
                        <ThumbsDown aria-hidden />
                    </ToggleGroupItem>
                </ToggleGroup>
            )}
            {persisted && onExportPdf && (
                <MessageAction label="Exporter cette réponse en PDF" tooltip="Exporter en PDF" onClick={() => onExportPdf(message.id)} disabled={exportingPdf}>
                    {exportingPdf ? <Loader2 className="animate-spin" aria-hidden /> : <FileDown aria-hidden />}
                </MessageAction>
            )}
            {usage && (
                <HoverCard openDelay={200} closeDelay={100}>
                    <HoverCardTrigger asChild>
                        <button
                            type="button"
                            aria-label={`Coût de la réponse : ${formatEuros(usage.costEur)}`}
                            className="inline-flex size-7 items-center justify-center rounded-lg text-ink-4 transition-colors duration-150 ease-snappy hover:bg-surface-3 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                        >
                            <Receipt className="size-3.5" aria-hidden />
                        </button>
                    </HoverCardTrigger>
                    <HoverCardContent side="top" align="start" className="w-64 p-3 text-[12.5px]">
                        <CostDetail usage={usage} />
                    </HoverCardContent>
                </HoverCard>
            )}
        </>
    );
}

function CostDetail({ usage }: { usage: NonNullable<ReturnType<typeof parseTrace>["usage"]> }) {
    const cachePct = usage.promptTokens > 0 && usage.cachedInputTokens ? Math.round((usage.cachedInputTokens / usage.promptTokens) * 100) : 0;
    const tokens = (n: number) => n.toLocaleString("fr-FR");
    const line = (label: string, value: string) => (
        <div className="flex items-center justify-between gap-3 py-0.5">
            <dt className="text-ink-3">{label}</dt>
            <dd className="font-medium tabular-nums text-ink">{value}</dd>
        </div>
    );
    return (
        <>
            <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="font-semibold text-ink">Coût de la réponse</span>
                <span className="font-semibold tabular-nums text-ink">{formatEuros(usage.costEur)}</span>
            </div>
            <dl className="border-t border-line-subtle pt-1.5">
                {usage.model && line("Modèle", usage.model)}
                {line("Jetons envoyés", tokens(usage.promptTokens))}
                {line("Jetons écrits", tokens(usage.completionTokens))}
                {line("En cache", `${cachePct}${NBSP}%`)}
                {usage.reasoningTokens ? line("Dont réflexion", tokens(usage.reasoningTokens)) : null}
                {usage.calls && usage.calls > 1 ? line("Appels au modèle", String(usage.calls)) : null}
            </dl>
        </>
    );
}
