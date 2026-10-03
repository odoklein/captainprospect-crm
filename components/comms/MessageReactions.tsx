"use client";

// ============================================
// MessageReactions – emoji reactions display + picker
// ============================================

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { CommsMessageReactionView } from "@/lib/comms/types";

const EMOJI_LIST = ["👍", "❤️", "😂", "🎉", "👀", "🔥"];

interface MessageReactionsProps {
    messageId: string;
    reactions: CommsMessageReactionView[];
    currentUserId: string;
    onToggle: (messageId: string, emoji: string) => Promise<void>;
    isOwn: boolean;
    className?: string;
}

export function MessageReactions({
    messageId,
    reactions,
    currentUserId,
    onToggle,
    isOwn,
    className,
}: MessageReactionsProps) {
    const [showPicker, setShowPicker] = useState(false);
    const [loading, setLoading] = useState<string | null>(null);
    const pickerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
                setShowPicker(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleClick = async (emoji: string) => {
        if (loading) return;
        setLoading(emoji);
        try {
            await onToggle(messageId, emoji);
        } finally {
            setLoading(null);
            setShowPicker(false);
        }
    };

    const hasReacted = (r: CommsMessageReactionView) => r.userIds.includes(currentUserId);

    return (
        <div className={cn("flex flex-wrap items-center gap-1 mt-1", className)}>
            {reactions.map((r) => (
                <button
                    key={r.emoji}
                    type="button"
                    onClick={() => handleClick(r.emoji)}
                    disabled={!!loading}
                    className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs border transition-colors",
                        hasReacted(r)
                            ? "bg-primary-50 border-primary-200 text-primary-700"
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                    )}
                >
                    <span>{r.emoji}</span>
                    <span>{r.count}</span>
                </button>
            ))}
            <div className="relative" ref={pickerRef}>
                <button
                    type="button"
                    onClick={() => setShowPicker(!showPicker)}
                    className="rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 text-xs w-6 h-6 flex items-center justify-center"
                    aria-label="Ajouter une réaction"
                >
                    +
                </button>
                {showPicker && (
                    <div className="absolute bottom-full left-0 mb-1 flex gap-0.5 p-1 bg-white rounded-xl shadow-lg border border-slate-200 z-50">
                        {EMOJI_LIST.map((e) => (
                            <button
                                key={e}
                                type="button"
                                onClick={() => handleClick(e)}
                                disabled={!!loading}
                                className="p-1.5 rounded-lg hover:bg-slate-100 text-lg"
                            >
                                {e}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
