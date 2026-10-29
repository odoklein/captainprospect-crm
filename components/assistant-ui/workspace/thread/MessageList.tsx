"use client";

/**
 * The scrolling column of a thread: older pages on demand (with the reading
 * position kept), skeleton on first load, the live turn while an answer is
 * written, and a « dernier message » button when the reader scrolled up.
 *
 * Scroll rules: a question just sent goes to the bottom; while streaming the
 * view follows only if the reader was already at the bottom; when the answer
 * lands, a long one is read from its question.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ChevronUp, Loader2 } from "lucide-react";
import type { ThreadMessage } from "@/lib/assistant/api-contract";
import { cn } from "@/lib/utils";
import { FOCUS, Shimmer } from "@/components/accueil/AccueilUI";
import { LiveTurn } from "../../LiveTurn";
import type { VisualHandlers } from "../../AnswerBody";
import { useLiveTurn, type ChatStream, type LiveSnapshot } from "../useChatStream";

const BOTTOM_SLACK = 80;

function LiveTurnClock({ snapshot, handlers }: { snapshot: LiveSnapshot; handlers: VisualHandlers }) {
    const [now, setNow] = useState(snapshot.startedAt);
    useEffect(() => {
        const tick = setInterval(() => setNow(Date.now()), 100);
        return () => clearInterval(tick);
    }, []);
    return <LiveTurn state={snapshot.state} elapsedMs={Math.max(0, now - snapshot.startedAt)} deep={snapshot.deep} handlers={handlers} />;
}

export function MessageSkeleton() {
    return (
        <div className="flex flex-col gap-8" aria-hidden>
            {[0, 1, 2].map((i) => (
                <div key={i} className="flex flex-col gap-3" style={{ animationDelay: `${i * 30}ms` }}>
                    <div className="flex justify-end">
                        <Shimmer className="h-10 w-[46%] rounded-[20px] rounded-br-md" />
                    </div>
                    <div className="space-y-2">
                        <Shimmer className="h-3.5 w-[88%] rounded-full" />
                        <Shimmer className="h-3.5 w-[76%] rounded-full" />
                        <Shimmer className="h-3.5 w-[58%] rounded-full" />
                    </div>
                </div>
            ))}
        </div>
    );
}

export function MessageList({
    conversationId,
    stream,
    messages,
    loading,
    olderCursor,
    onLoadOlder,
    renderMessage,
    liveHandlers,
    footer,
    empty,
    compact,
}: {
    conversationId: string | null;
    stream: ChatStream;
    messages: ThreadMessage[];
    loading: boolean;
    olderCursor: string | null;
    onLoadOlder: () => Promise<void>;
    renderMessage: (message: ThreadMessage, index: number) => ReactNode;
    liveHandlers: VisualHandlers;
    footer?: ReactNode;
    empty?: ReactNode;
    compact?: boolean;
}) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const atBottomRef = useRef(true);
    const [atBottom, setAtBottom] = useState(true);
    const [loadingOlder, setLoadingOlder] = useState(false);
    const prependAnchorRef = useRef<number | null>(null);
    const prevRef = useRef<{ first: string | null; last: string | null; count: number; conversationId: string | null }>({
        first: null,
        last: null,
        count: 0,
        conversationId: null,
    });
    const live = useLiveTurn(stream, conversationId);
    const wasLiveRef = useRef(false);

    const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
        const el = scrollRef.current;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior });
    }, []);

    const onScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_SLACK;
        atBottomRef.current = bottom;
        setAtBottom(bottom);
    };

    // Messages changed: decide where the view goes.
    useLayoutEffect(() => {
        const el = scrollRef.current;
        const prev = prevRef.current;
        const first = messages[0]?.id ?? null;
        const last = messages[messages.length - 1] ?? null;
        prevRef.current = { first, last: last?.id ?? null, count: messages.length, conversationId };
        if (!el) return;

        // Another thread, or its first page arriving: start at the bottom.
        if (prev.conversationId !== conversationId || (prev.count === 0 && messages.length > 0)) {
            el.scrollTop = el.scrollHeight;
            atBottomRef.current = true;
            setAtBottom(true);
            return;
        }
        // An older page above: keep the line being read where it was.
        if (prependAnchorRef.current !== null && first !== prev.first) {
            el.scrollTop = el.scrollHeight - prependAnchorRef.current;
            prependAnchorRef.current = null;
            return;
        }
        if (!last || last.id === prev.last) return;
        if (last.role === "USER") {
            atBottomRef.current = true;
            setAtBottom(true);
            scrollToBottom("smooth");
            return;
        }
        // An answer landed: a long one is read from its question.
        const followed = wasLiveRef.current || atBottomRef.current;
        wasLiveRef.current = false;
        if (followed) {
            const questions = el.querySelectorAll<HTMLElement>("[data-role='USER']");
            const question = questions[questions.length - 1];
            const answers = el.querySelectorAll<HTMLElement>("[data-role='ASSISTANT']");
            const answer = answers[answers.length - 1];
            const tall = answer ? answer.offsetHeight > el.clientHeight * 0.7 : false;
            if (question && tall) el.scrollTo({ top: Math.max(0, question.offsetTop - 16), behavior: "smooth" });
            else scrollToBottom("smooth");
        }
    }, [messages, conversationId, scrollToBottom]);

    // The live turn grows: follow it only when the reader is at the bottom.
    useLayoutEffect(() => {
        if (!live) return;
        wasLiveRef.current = true;
        if (atBottomRef.current) {
            const el = scrollRef.current;
            if (el) el.scrollTop = el.scrollHeight;
        }
    }, [live]);

    const loadOlder = async () => {
        const el = scrollRef.current;
        if (!el || loadingOlder) return;
        setLoadingOlder(true);
        prependAnchorRef.current = el.scrollHeight - el.scrollTop;
        try {
            await onLoadOlder();
        } catch {
            prependAnchorRef.current = null;
        } finally {
            setLoadingOlder(false);
        }
    };

    const showEmpty = !loading && messages.length === 0 && !live && !footer;

    return (
        <div className="relative min-h-0 flex-1">
            <div
                ref={scrollRef}
                onScroll={onScroll}
                className="h-full overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-gutter:stable]"
                role="log"
                aria-label="Messages"
                aria-busy={loading || live !== null}
            >
                <div className={cn("mx-auto flex w-full flex-col gap-7 px-4 pb-8 pt-6", compact ? "max-w-none gap-6 px-3 pt-4" : "max-w-3xl sm:px-6")}>
                    {olderCursor && !loading && (
                        <div className="flex justify-center">
                            <button
                                type="button"
                                onClick={() => void loadOlder()}
                                disabled={loadingOlder}
                                className={cn(
                                    "inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[12.5px] font-medium text-ink-2 shadow-2xs transition-[border-color,color] duration-200 hover:border-line-strong hover:text-ink disabled:opacity-60",
                                    FOCUS,
                                )}
                            >
                                {loadingOlder ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <ChevronUp className="size-3.5" aria-hidden />}
                                Charger les messages précédents
                            </button>
                        </div>
                    )}

                    {loading ? <MessageSkeleton /> : showEmpty ? empty : messages.map((m, i) => renderMessage(m, i))}

                    {live && <LiveTurnClock snapshot={live} handlers={liveHandlers} />}
                    {footer}
                </div>
            </div>

            <button
                type="button"
                onClick={() => scrollToBottom("smooth")}
                aria-label="Aller au dernier message"
                tabIndex={atBottom ? -1 : 0}
                className={cn(
                    "absolute bottom-3 left-1/2 z-10 flex size-9 -translate-x-1/2 items-center justify-center rounded-full border border-line bg-surface text-ink-2 shadow-raised",
                    "transition-[opacity,transform] duration-200 ease-[var(--ease-snappy)] hover:text-ink",
                    FOCUS,
                    atBottom || loading || showEmpty ? "pointer-events-none translate-y-2 opacity-0" : "translate-y-0 opacity-100",
                )}
            >
                <ArrowDown className="size-4" aria-hidden />
            </button>
        </div>
    );
}
