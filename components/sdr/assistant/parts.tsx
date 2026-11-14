"use client";

// ============================================
// SDR ASSISTANT — panel parts: welcome, thread, history, composer.
// Proportions follow the measured reference (docs/sdr-assistant-panel.md);
// colours, type, radii and shadows are the CRM's own roles.
// ============================================

import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
    AlertTriangle,
    ArrowRight,
    ArrowUp,
    CalendarClock,
    ChevronDown,
    ChevronRight,
    Lightbulb,
    Loader2,
    MessageSquare,
    RotateCcw,
    Square,
    Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/shadcn/button";
import { BrandLogo } from "@/components/brand/BrandLogo";
import AnswerMarkdown from "@/components/assistant-ui/AnswerMarkdown";
import { ActionConfirmationCard } from "@/components/assistant-ui/ActionConfirmationCard";
import type { StoredAction } from "@/components/assistant-ui/types";
import { splitFollowUps } from "@/lib/assistant/answer";
import type { SdrMessage } from "@/lib/sdr-assistant/contract";
import { MORE_SUGGESTIONS, PRIMARY_SUGGESTIONS, type Suggestion, type SuggestionTone } from "./suggestions";
import {
    decideAction,
    deleteConversation,
    dismissFailure,
    openConversation,
    newConversation,
    resend,
    retry,
    send,
    setComposer,
    stop,
    toggleMoreSuggestions,
    useAssistant,
} from "./store";

// ── Suggestions ──────────────────────────────────────────────────────────────

/** Icon chip + tinted hairline border per tone, from brand / status roles. */
const TONE: Record<SuggestionTone, { chip: string; border: string }> = {
    callback: { chip: "bg-warning-soft text-warning-ink", border: "border-[color-mix(in_oklab,var(--ds-warning)_40%,transparent)]" },
    call: { chip: "bg-primary-soft text-primary-soft-ink", border: "border-[color-mix(in_oklab,var(--ds-primary)_30%,transparent)]" },
    day: { chip: "bg-accent-soft text-accent-soft-ink", border: "border-[color-mix(in_oklab,var(--ds-accent)_40%,transparent)]" },
    neutral: { chip: "bg-surface-3 text-ink-2", border: "border-line" },
};

function SuggestionButton({ suggestion, disabled }: { suggestion: Suggestion; disabled: boolean }) {
    const Icon = suggestion.icon;
    const tone = TONE[suggestion.tone];
    return (
        <li className="flex max-w-full">
            <button
                type="button"
                disabled={disabled}
                onClick={() => void send(suggestion.prompt)}
                className={cn(
                    // Measured: 37 px high, 8/12/8/8 padding, pill, 13 px semibold.
                    "group/sg inline-flex h-[37px] max-w-full items-center gap-2 rounded-chip border bg-surface py-2 pl-2 pr-3 text-[13px] font-semibold leading-[1.375] text-ink",
                    "transition-[background-color,border-color] duration-150 ease-snappy hover:bg-surface-2",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-60",
                    tone.border,
                )}
            >
                <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-lg", tone.chip)}>
                    <Icon className="size-3.5" aria-hidden />
                </span>
                <span className="min-w-0 truncate">{suggestion.label}</span>
                <ChevronRight
                    className="size-3.5 shrink-0 text-ink-4 transition-transform duration-150 ease-snappy group-hover/sg:translate-x-0.5"
                    aria-hidden
                />
            </button>
        </li>
    );
}

/** The 64 px brand visual: the logo mark on a soft primary→accent tile. CSS only. */
function AssistantVisual() {
    return (
        <div className="sdr-ai-orb relative flex size-16 shrink-0 items-center justify-center rounded-[20px]" aria-hidden>
            <BrandLogo variant="mark" height={30} className="relative" />
        </div>
    );
}

export function Welcome({ firstName, disabled, notice }: { firstName: string | null; disabled: boolean; notice: React.ReactNode }) {
    const more = useAssistant((s) => s.moreSuggestions);
    const moreId = useId();
    return (
        <div className="flex min-h-full flex-col justify-center gap-4 py-1">
            <div className="flex flex-col items-center gap-3 px-1.5 text-center">
                <AssistantVisual />
                <h3 className="text-balance text-[16px] font-semibold leading-[1.2] tracking-[-0.01em] text-ink">
                    {firstName ? `Bonjour ${firstName}, par quoi commence-t-on ?` : "Par quoi commence-t-on ?"}
                </h3>
            </div>
            {notice}
            <div className="flex flex-col items-center gap-3">
                <ul className="flex w-full flex-col items-center gap-2" aria-label="Suggestions">
                    {PRIMARY_SUGGESTIONS.map((s) => (
                        <SuggestionButton key={s.id} suggestion={s} disabled={disabled} />
                    ))}
                </ul>
                {more && (
                    <ul id={moreId} className="flex w-full flex-col items-center gap-2 motion-safe:animate-ds-enter" aria-label="Autres suggestions">
                        {MORE_SUGGESTIONS.map((s) => (
                            <SuggestionButton key={s.id} suggestion={s} disabled={disabled} />
                        ))}
                    </ul>
                )}
                <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={toggleMoreSuggestions}
                    aria-expanded={more}
                    aria-controls={more ? moreId : undefined}
                    className="text-[13px] font-medium text-ink"
                >
                    <ChevronDown className={cn("transition-transform duration-150", more && "rotate-180")} aria-hidden />
                    {more ? "Moins d'idées" : "Plus d'idées"}
                </Button>
            </div>
        </div>
    );
}

// ── Thread ───────────────────────────────────────────────────────────────────

/** Source markers are manager-only (evidence viewer); SDR answers link records instead. */
const cleanAnswer = (text: string) => text.replace(/\s?\[E\d{1,3}\]/g, "");

const UserBubble = memo(function UserBubble({ message }: { message: SdrMessage }) {
    return (
        <li className="flex justify-end [content-visibility:auto] [contain-intrinsic-size:auto_48px]">
            <div className="max-w-[85%] whitespace-pre-wrap rounded-[18px] rounded-br-md bg-surface-3 px-3.5 py-2 text-[13px] leading-[1.6] text-ink [overflow-wrap:anywhere]">
                {message.content.replace(/\s*\[demo:[a-z]+\]/gi, "")}
            </div>
        </li>
    );
});

function toCardAction(message: SdrMessage, busy: boolean): StoredAction | null {
    const a = message.action;
    if (!a) return null;
    const state = a.state === "executing" ? "pending" : a.state === "expired" ? "failed" : a.state;
    return {
        tool: a.tool,
        args: a.args,
        card: a.card,
        state: busy ? "pending" : state,
        outcome: a.state === "expired" ? "Proposition expirée : redemandez-la à l'assistant." : a.outcome,
    };
}

const AssistantAnswer = memo(function AssistantAnswer({
    message,
    question,
    isLast,
    busy,
    interactive,
}: {
    message: SdrMessage;
    question: string | null;
    isLast: boolean;
    busy: boolean;
    interactive: boolean;
}) {
    const failed = message.status === "failed" || message.status === "timeout";
    const { body, followUps } = useMemo(() => splitFollowUps(cleanAnswer(message.content)), [message.content]);
    const action = toCardAction(message, busy);

    if (failed) {
        return (
            <li role="alert" className="rounded-panel border border-danger-line bg-danger-soft/60 px-3 py-2.5 text-[12.5px] text-danger-ink">
                <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <p className="min-w-0 flex-1">{body || "L'assistant n'a pas pu répondre."}</p>
                </div>
                {isLast && question && interactive && (
                    <div className="mt-2 flex justify-end">
                        <Button type="button" size="xs" variant="outline" onClick={() => resend(question)}>
                            <RotateCcw aria-hidden />
                            Réessayer
                        </Button>
                    </div>
                )}
            </li>
        );
    }

    return (
        <li className="min-w-0 [content-visibility:auto] [contain-intrinsic-size:auto_120px]">
            {body && (
                <div className="cp-ai-answer sdr-ai-answer min-w-0">
                    <AnswerMarkdown content={body} />
                </div>
            )}
            {action && (
                <ActionConfirmationCard
                    action={action}
                    busy={busy}
                    icon={CalendarClock}
                    cancelledLabel="Proposition refusée"
                    onConfirm={() => void decideAction(message.id, "confirm")}
                    onCancel={() => void decideAction(message.id, "cancel")}
                    className="my-2"
                />
            )}
            {message.sources && message.sources.length > 0 && (
                <p className="mt-1.5 text-[11px] text-ink-4">Données consultées : {message.sources.join(" · ")}</p>
            )}
            {isLast && interactive && followUps.length > 0 && (
                <div className="mt-2.5 flex flex-col items-start gap-1.5" aria-label="Questions suivantes" role="group">
                    {followUps.map((q) => (
                        <button
                            key={q}
                            type="button"
                            onClick={() => void send(q)}
                            className={cn(
                                "group/fu inline-flex max-w-full items-center gap-2 rounded-control border border-line bg-surface px-2.5 py-1.5 text-left text-[12.5px] text-ink-2 shadow-2xs",
                                "transition-[border-color,color,background-color] duration-150 ease-snappy hover:border-line-strong hover:bg-surface-2 hover:text-ink",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                            )}
                        >
                            <ArrowRight className="size-3.5 shrink-0 text-ink-4" aria-hidden />
                            <span className="min-w-0">{q}</span>
                        </button>
                    ))}
                </div>
            )}
        </li>
    );
});

/** The answer being written: the only part that re-renders on each delta. */
function LiveAnswer({ conversationId }: { conversationId: string }) {
    const live = useAssistant((s) => (s.live?.conversationId === conversationId ? s.live : null));
    if (!live) return null;
    const { body } = splitFollowUps(cleanAnswer(live.draft));
    return (
        <li className="min-w-0" aria-live="off">
            {body ? (
                <div className="cp-ai-answer sdr-ai-answer cp-ai-caret min-w-0">
                    <AnswerMarkdown content={body} />
                </div>
            ) : null}
            <p className="mt-1 inline-flex items-center gap-1.5 text-[12px] text-ink-3" role="status">
                <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden />
                {live.activity}
            </p>
        </li>
    );
}

export function Thread({ conversationId, onNavigate }: { conversationId: string; onNavigate: (href: string) => void }) {
    const thread = useAssistant((s) => s.threads[conversationId]);
    const failure = useAssistant((s) => (s.failure?.conversationId === conversationId ? s.failure : null));
    const busyId = useAssistant((s) => s.actionBusyId);
    const streaming = useAssistant((s) => s.live?.conversationId === conversationId);
    const draftLength = useAssistant((s) => (s.live?.conversationId === conversationId ? s.live.draft.length : 0));
    const mode = useAssistant((s) => s.mode);
    const scroller = useRef<HTMLDivElement>(null);
    const stick = useRef(true);
    const messages = thread?.messages;

    // Follow the conversation while the reader is at the bottom; never yank them back up.
    const onScroll = useCallback(() => {
        const el = scroller.current;
        if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    }, []);
    useLayoutEffect(() => {
        const el = scroller.current;
        if (el && stick.current) el.scrollTop = el.scrollHeight;
    }, [messages?.length, draftLength, streaming, failure]);
    useEffect(() => {
        stick.current = true;
    }, [conversationId]);

    // Record links navigate inside the app: the panel and its state stay put.
    const onClick = (e: React.MouseEvent) => {
        const a = (e.target as HTMLElement).closest("a");
        const href = a?.getAttribute("href");
        if (!a || !href || !href.startsWith("/") || href.startsWith("//")) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onNavigate(href);
    };

    if (!thread || thread.status === "loading") {
        return (
            <div className="flex flex-1 items-center justify-center text-[12.5px] text-ink-3" role="status">
                <Loader2 className="mr-2 size-4 motion-safe:animate-spin" aria-hidden /> Chargement de la conversation…
            </div>
        );
    }
    if (thread.status === "error") {
        return (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-[12.5px] text-ink-3" role="alert">
                <p>{thread.error ?? "Impossible de charger la conversation."}</p>
                <Button type="button" size="xs" variant="outline" onClick={() => void openConversation(conversationId)}>
                    <RotateCcw aria-hidden /> Réessayer
                </Button>
            </div>
        );
    }

    const lastIndex = (messages?.length ?? 0) - 1;
    return (
        <div
            ref={scroller}
            onScroll={onScroll}
            onClick={onClick}
            role="region"
            aria-label="Messages"
            // Focusable so the keyboard can scroll a long answer that has no link in it.
            tabIndex={0}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
        >
            <ol className="flex flex-col gap-4" aria-label="Conversation">
                {messages!.map((m, i) =>
                    m.role === "USER" ? (
                        <UserBubble key={m.id} message={m} />
                    ) : (
                        <AssistantAnswer
                            key={m.id}
                            message={m}
                            question={i > 0 && messages![i - 1].role === "USER" ? messages![i - 1].content : null}
                            isLast={i === lastIndex && !streaming}
                            busy={busyId === m.id}
                            interactive={mode !== "unavailable"}
                        />
                    ),
                )}
                <LiveAnswer conversationId={conversationId} />
                {failure && (
                    <li role="alert" className="rounded-panel border border-danger-line bg-danger-soft/60 px-3 py-2.5 text-[12.5px] text-danger-ink">
                        <div className="flex items-start gap-2">
                            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                            <p className="min-w-0 flex-1">{failure.message}</p>
                        </div>
                        <div className="mt-2 flex justify-end gap-1.5">
                            <Button type="button" size="xs" variant="ghost" onClick={dismissFailure}>
                                Ignorer
                            </Button>
                            <Button type="button" size="xs" variant="outline" onClick={retry}>
                                <RotateCcw aria-hidden /> Réessayer
                            </Button>
                        </div>
                    </li>
                )}
            </ol>
        </div>
    );
}

// ── History ──────────────────────────────────────────────────────────────────

function relative(iso: string | null): string {
    if (!iso) return "";
    const diff = Date.now() - new Date(iso).getTime();
    const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
    const min = Math.round(diff / 60_000);
    if (min < 1) return "à l'instant";
    if (min < 60) return rtf.format(-min, "minute");
    const h = Math.round(min / 60);
    if (h < 24) return rtf.format(-h, "hour");
    return rtf.format(-Math.round(h / 24), "day");
}

export function History() {
    const conversations = useAssistant((s) => s.conversations);
    const status = useAssistant((s) => s.listStatus);
    const activeId = useAssistant((s) => s.activeId);
    const live = useAssistant((s) => s.live?.conversationId ?? null);
    const [confirming, setConfirming] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const visible = conversations.filter((c) => c.messageCount > 0);

    return (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
            <Button type="button" variant="ghost" size="sm" className="mb-1 w-full justify-start text-ink-2" onClick={newConversation} disabled={!!live}>
                <MessageSquare aria-hidden /> Nouvelle conversation
            </Button>
            {error && (
                <p role="alert" className="mx-2 mb-1 text-[12px] text-danger-ink">
                    {error}
                </p>
            )}
            {status === "loading" && visible.length === 0 ? (
                <p className="px-3 py-6 text-center text-[12.5px] text-ink-3" role="status">
                    Chargement…
                </p>
            ) : visible.length === 0 ? (
                <p className="px-3 py-6 text-center text-[12.5px] text-ink-3">Aucune conversation pour l&apos;instant.</p>
            ) : (
                <ul className="flex flex-col gap-0.5" aria-label="Conversations précédentes">
                    {visible.map((c) => (
                        <li key={c.id} className="group/row flex items-center gap-1 rounded-control hover:bg-surface-2">
                            <button
                                type="button"
                                onClick={() => void openConversation(c.id)}
                                aria-current={c.id === activeId ? "true" : undefined}
                                className={cn(
                                    "flex min-w-0 flex-1 flex-col items-start rounded-control px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                                    c.id === activeId && "bg-primary-soft",
                                )}
                            >
                                <span className="w-full truncate text-[13px] font-medium text-ink">{c.title}</span>
                                <span className="text-[11.5px] text-ink-4">
                                    {c.id === live ? "Réponse en cours…" : relative(c.lastMessageAt)}
                                </span>
                            </button>
                            {confirming === c.id ? (
                                <Button
                                    type="button"
                                    size="xs"
                                    variant="destructive"
                                    className="mr-1"
                                    onClick={async () => {
                                        setConfirming(null);
                                        try {
                                            setError(null);
                                            await deleteConversation(c.id);
                                        } catch (e) {
                                            setError((e as Error).message);
                                        }
                                    }}
                                    onBlur={() => setConfirming(null)}
                                    autoFocus
                                >
                                    Supprimer
                                </Button>
                            ) : (
                                <Button
                                    type="button"
                                    size="icon-xs"
                                    variant="ghost"
                                    className="mr-1 text-ink-4 opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100 max-sm:opacity-100"
                                    aria-label={`Supprimer « ${c.title} »`}
                                    disabled={c.id === live}
                                    onClick={() => setConfirming(c.id)}
                                >
                                    <Trash2 aria-hidden />
                                </Button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

// ── Composer ─────────────────────────────────────────────────────────────────

const LINE = 20.8; // px, measured textarea line height (13 px text)
const MAX_LINES = 8; // measured max-height 166.3 px

function SuggestionsMenu({ disabled, onPicked }: { disabled: boolean; onPicked: () => void }) {
    const [open, setOpen] = useState(false);
    const menuId = useId();
    const trigger = useRef<HTMLButtonElement>(null);
    const items = useRef<(HTMLButtonElement | null)[]>([]);
    const all = [...PRIMARY_SUGGESTIONS, ...MORE_SUGGESTIONS];

    useEffect(() => {
        if (open) items.current[0]?.focus();
    }, [open]);

    const close = (refocus = true) => {
        setOpen(false);
        if (refocus) trigger.current?.focus();
    };
    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        const i = items.current.findIndex((el) => el === document.activeElement);
        if (e.key === "Escape") {
            e.stopPropagation();
            close();
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            items.current[(i + 1) % all.length]?.focus();
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            items.current[(i - 1 + all.length) % all.length]?.focus();
        } else if (e.key === "Home") {
            e.preventDefault();
            items.current[0]?.focus();
        } else if (e.key === "End") {
            e.preventDefault();
            items.current[all.length - 1]?.focus();
        } else if (e.key === "Tab") {
            close(false);
        }
    };

    return (
        <div className="relative shrink-0" onKeyDown={open ? onKeyDown : undefined}>
            <button
                ref={trigger}
                type="button"
                onClick={() => setOpen((v) => !v)}
                disabled={disabled}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={open ? menuId : undefined}
                aria-label="Tâches suggérées"
                title="Tâches suggérées"
                className={cn(
                    "flex size-8 items-center justify-center rounded-xl text-ink-2 transition-colors duration-150",
                    "hover:bg-surface-3 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50",
                    open && "bg-surface-3 text-ink",
                )}
            >
                <Lightbulb className="size-4" aria-hidden />
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-0" aria-hidden onClick={() => close(false)} />
                    <div
                        id={menuId}
                        role="menu"
                        aria-label="Tâches suggérées"
                        className="absolute bottom-[calc(100%+10px)] left-0 z-10 w-[min(300px,calc(100vw-48px))] rounded-panel border border-line bg-surface p-1 shadow-overlay motion-safe:animate-ds-enter"
                    >
                        {all.map((s, i) => {
                            const Icon = s.icon;
                            return (
                                <button
                                    key={s.id}
                                    ref={(el) => {
                                        items.current[i] = el;
                                    }}
                                    type="button"
                                    role="menuitem"
                                    tabIndex={-1}
                                    onClick={() => {
                                        setOpen(false);
                                        onPicked();
                                        void send(s.prompt);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink focus:bg-surface-2 focus:text-ink focus:outline-none"
                                >
                                    <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-lg", TONE[s.tone].chip)}>
                                        <Icon className="size-3.5" aria-hidden />
                                    </span>
                                    <span className="min-w-0 truncate">{s.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}

export function Composer({ textareaRef, disabledReason }: { textareaRef: React.RefObject<HTMLTextAreaElement | null>; disabledReason: string | null }) {
    const value = useAssistant((s) => s.composer);
    const streaming = useAssistant((s) => !!s.live);
    const hintId = useId();
    const [composing, setComposing] = useState(false);
    const disabled = !!disabledReason;
    const empty = value.trim().length === 0;

    // Grows from one line to eight, then scrolls (measured 20.8 → 166.3 px).
    useLayoutEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(Math.max(el.scrollHeight, LINE), LINE * MAX_LINES)}px`;
    }, [value, textareaRef]);

    const submit = () => {
        if (empty || streaming || disabled) return;
        const text = value;
        setComposer("");
        void send(text);
    };

    return (
        <div className="shrink-0 px-2 pb-2">
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    submit();
                }}
                className={cn(
                    // Measured: 20 px radius, hairline border, 6 px inner padding, 4 px gap.
                    "flex items-end gap-1 rounded-[20px] border border-line bg-surface p-1.5 shadow-xs transition-[border-color,box-shadow] duration-150",
                    "focus-within:border-line-strong focus-within:shadow-[0_0_0_3px_var(--ds-focus)]",
                    disabled && "bg-surface-2",
                )}
            >
                <SuggestionsMenu disabled={disabled || streaming} onPicked={() => textareaRef.current?.blur()} />
                <div className="flex min-w-0 flex-1 py-1.5">
                    <label htmlFor={`${hintId}-input`} className="sr-only">
                        Message à l&apos;assistant
                    </label>
                    <textarea
                        ref={textareaRef}
                        id={`${hintId}-input`}
                        rows={1}
                        value={value}
                        disabled={disabled}
                        onChange={(e) => setComposer(e.target.value)}
                        onCompositionStart={() => setComposing(true)}
                        onCompositionEnd={() => setComposing(false)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey && !composing && !e.nativeEvent.isComposing) {
                                e.preventDefault();
                                submit();
                            }
                        }}
                        placeholder={disabled ? "Assistant indisponible" : "Posez votre question…"}
                        aria-describedby={hintId}
                        className="block max-h-[166.4px] min-h-[20.8px] w-full resize-none overflow-y-auto bg-transparent px-3 text-[13px] leading-[20.8px] text-ink placeholder:text-ink-4 focus:outline-none disabled:cursor-not-allowed"
                    />
                    <span id={hintId} className="sr-only">
                        {disabledReason ?? "Entrée pour envoyer, Maj + Entrée pour aller à la ligne."}
                    </span>
                </div>
                {streaming ? (
                    <button
                        type="button"
                        onClick={stop}
                        aria-label="Arrêter la réponse"
                        title="Arrêter la réponse"
                        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-surface shadow-xs transition-colors duration-100 hover:bg-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    >
                        <Square className="size-3 fill-current" aria-hidden />
                    </button>
                ) : (
                    <button
                        type="submit"
                        disabled={empty || disabled}
                        aria-label="Envoyer"
                        title="Envoyer"
                        className={cn(
                            "flex size-8 shrink-0 items-center justify-center rounded-full shadow-xs transition-colors duration-100",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                            empty || disabled
                                ? "cursor-not-allowed bg-surface-3 text-ink-4"
                                : "bg-primary text-primary-fg shadow-[inset_0_0_0_1px_rgb(255_255_255/0.4)] hover:bg-primary-hover",
                        )}
                    >
                        <ArrowUp className="size-4" aria-hidden />
                    </button>
                )}
            </form>
        </div>
    );
}
