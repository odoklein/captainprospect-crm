"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const BOTTOM_THRESHOLD_PX = 45;

export function useSupportScroll(messageCount: number) {
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const [isAtBottom, setIsAtBottom] = useState(true);
    const [unreadIncomingCount, setUnreadIncomingCount] = useState(0);
    const prevCountRef = useRef(messageCount);

    const scrollToBottom = useCallback((smooth = true) => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({
                behavior: smooth ? "smooth" : "auto",
                block: "end",
            });
            setUnreadIncomingCount(0);
        }
    }, []);

    // Initial mount auto-scroll
    useEffect(() => {
        scrollToBottom(false);
    }, [scrollToBottom]);

    // Handle scroll listener to know if user is reading scrollback
    const handleScroll = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        const atBottom = distanceFromBottom <= BOTTOM_THRESHOLD_PX;
        setIsAtBottom(atBottom);
        if (atBottom) {
            setUnreadIncomingCount(0);
        }
    }, []);

    // When messageCount increases:
    useEffect(() => {
        if (messageCount > prevCountRef.current) {
            if (isAtBottom) {
                // If user was at bottom, keep them at bottom
                setTimeout(() => scrollToBottom(true), 30);
            } else {
                // User is reading scrollback, increment pill counter
                setUnreadIncomingCount((c) => c + (messageCount - prevCountRef.current));
            }
        }
        prevCountRef.current = messageCount;
    }, [messageCount, isAtBottom, scrollToBottom]);

    return {
        scrollRef,
        messagesEndRef,
        isAtBottom,
        unreadIncomingCount,
        handleScroll,
        scrollToBottom,
    };
}
