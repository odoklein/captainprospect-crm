"use client";

/**
 * The scrolling column of a thread: older pages on demand (with the reading
 * position kept), skeleton on first load, the turn being written, and a
 * « dernier message » button when the reader scrolled up.
 *
 * The live turn is the last item of the SAME list as the messages, keyed by
 * its turn key; the saved answer gets that key too (thread/handover.ts), so
 * the hand-over is an in-place update, never an unmount + mount.
 *
 * Scroll rules: the view sticks to the bottom while the reader is there (a
 * ResizeObserver follows every growth — stream, folding trace, chart drawn);
 * scrolling up releases it, and nothing ever moves the view on its own then —
 * not even the final answer landing. A question just sent goes to the bottom.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ChevronUp, Loader2 } from "lucide-react";
import type { ThreadMessage } from "@/lib/assistant/api-contract";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/shadcn/button";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { useLiveTurn, type ChatStream, type LiveSnapshot } from "../useChatStream";
import { liveItemVisible } from "./handover";

const BOTTOM_SLACK = 80;

export function MessageSkeleton() {
    return (
        <div className="flex flex-col gap-8" aria-hidden>
            {[0, 1, 2].map((i) => (
                <div key={i} className="flex flex-col gap-3">
                    <div className="flex justify-end">
                        <Skeleton className="h-10 w-[46%] rounded-[20px] rounded-br-md" />
                    </div>
                    <div className="space-y-2">
                        <Skeleton className="h-3.5 w-[88%] rounded-chip" />
                        <Skeleton className="h-3.5 w-[76%] rounded-chip" />
                        <Skeleton className="h-3.5 w-[58%] rounded-chip" />
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
    renderLive,
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
    /** `isLast`: the newest item of the column (no live turn after it). */
    renderMessage: (message: ThreadMessage, index: number, isLast: boolean) => ReactNode;
    /** The turn being written, keyed by its turn key. */
    renderLive: (live: LiveSnapshot) => ReactNode;
    footer?: ReactNode;
    empty?: ReactNode;
    compact?: boolean;
}) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    /** Follow the bottom: true while the reader is there, released by scrolling up. */
    const stickRef = useRef(true);
    const lastTopRef = useRef(0);
    const lastHeightRef = useRef(0);
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
    const showLive = live !== null && liveItemVisible(live.settled?.id ?? null, messages);

    const toBottom = useCallback((behavior: ScrollBehavior = "auto") => {
        const el = scrollRef.current;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior });
    }, []);

    const onScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
        const bottom = distance < BOTTOM_SLACK;
        // Moving up by hand releases the view; the browser clamping scrollTop
        // because the content shrank (a trace folding) does not.
        const shrank = el.scrollHeight < lastHeightRef.current;
        if (bottom) stickRef.current = true;
        else if (el.scrollTop < lastTopRef.current - 1 && !shrank) stickRef.current = false;
        lastTopRef.current = el.scrollTop;
        lastHeightRef.current = el.scrollHeight;
        setAtBottom(bottom);
    };

    // Every growth of the column (stream, folding trace, chart drawn, older
    // page): follow it while stuck to the bottom.
    useEffect(() => {
        const el = scrollRef.current;
        const content = contentRef.current;
        if (!el || !content) return;
        const observer = new ResizeObserver(() => {
            if (prependAnchorRef.current !== null) return;
            if (stickRef.current) el.scrollTop = el.scrollHeight;
            lastTopRef.current = el.scrollTop;
            lastHeightRef.current = el.scrollHeight;
        });
        observer.observe(content);
        return () => observer.disconnect();
    }, []);

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
            stickRef.current = true;
            setAtBottom(true);
            return;
        }
        // An older page above: keep the line being read where it was.
        if (prependAnchorRef.current !== null && first !== prev.first) {
            el.scrollTop = el.scrollHeight - prependAnchorRef.current;
            prependAnchorRef.current = null;
            return;
        }
        // A question just sent: go and stay at the bottom. An answer landing
        // moves nothing (the observer keeps the bottom if the reader is there).
        if (last && last.id !== prev.last && last.role === "USER") {
            stickRef.current = true;
            setAtBottom(true);
            toBottom("smooth");
        }
    }, [messages, conversationId, toBottom]);

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

    // One list: the messages, then the live turn — so its key can be taken over in place.
    const items: ReactNode[] = messages.map((m, i) => renderMessage(m, i, !showLive && i === messages.length - 1));
    if (live && showLive) items.push(renderLive(live));

    return (
        <div className="relative min-h-0 flex-1">
            <div
                ref={scrollRef}
                onScroll={onScroll}
                className="h-full overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-gutter:stable] [scrollbar-width:thin]"
                role="log"
                aria-label="Messages"
                aria-busy={loading || live !== null}
            >
                <div ref={contentRef} className={cn("mx-auto flex w-full flex-col gap-7 px-4 pb-8 pt-6", compact ? "max-w-none gap-6 px-3 pt-4" : "max-w-3xl sm:px-6")}>
                    {olderCursor && !loading && (
                        <div className="flex justify-center">
                            <Button type="button" variant="outline" size="xs" className="rounded-chip" onClick={() => void loadOlder()} disabled={loadingOlder}>
                                {loadingOlder ? <Loader2 className="animate-spin" aria-hidden /> : <ChevronUp aria-hidden />}
                                Charger les messages précédents
                            </Button>
                        </div>
                    )}

                    {loading ? <MessageSkeleton /> : showEmpty ? empty : items}
                    {footer}
                </div>
            </div>

            <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => {
                    stickRef.current = true;
                    toBottom("smooth");
                }}
                aria-label="Aller au dernier message"
                tabIndex={atBottom ? -1 : 0}
                className={cn(
                    "absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full shadow-raised",
                    "transition-[opacity,transform] duration-200 ease-snappy",
                    atBottom || loading || showEmpty ? "pointer-events-none translate-y-2 opacity-0" : "translate-y-0 opacity-100",
                )}
            >
                <ArrowDown aria-hidden />
            </Button>
        </div>
    );
}
