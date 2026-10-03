"use client";

// ============================================
// SuggestionChips - AI-powered reply suggestions
// ============================================

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { AiMark } from "@/components/ui/AiMark";

interface MessageSuggestion {
    content: string;
    type: "quick_reply" | "follow_up" | "clarification";
    confidence: number;
}

interface SuggestionChipsProps {
    threadId: string;
    onSelect: (content: string) => void;
    className?: string;
}

export function SuggestionChips({
    threadId,
    onSelect,
    className,
}: SuggestionChipsProps) {
    const [suggestions, setSuggestions] = useState<MessageSuggestion[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        fetchSuggestions();
    }, [threadId]);

    const fetchSuggestions = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/comms/threads/${threadId}/suggestions`);
            if (res.ok) {
                const data = await res.json();
                setSuggestions(data);
            }
        } catch (error) {
            console.error("Failed to fetch suggestions:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelect = (suggestion: MessageSuggestion) => {
        onSelect(suggestion.content);
        setIsVisible(false);
    };

    if (!isVisible || (!isLoading && suggestions.length === 0)) {
        return null;
    }

    const typeStyles = {
        quick_reply: "bg-primary-50 text-primary-700 border-primary-200",
        follow_up: "bg-amber-50 text-amber-700 border-amber-200",
        clarification: "bg-blue-50 text-blue-700 border-blue-200",
    };

    return (
        <div className={cn("flex items-center gap-2 flex-wrap", className)}>
            <div className="flex items-center gap-1 text-xs text-slate-400">
                <AiMark className="w-3 h-3" />
                <span>Suggestions:</span>
            </div>

            {isLoading ? (
                <div className="flex items-center gap-1 text-xs text-slate-400">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Chargement...</span>
                </div>
            ) : (
                suggestions.map((suggestion, i) => (
                    <button
                        key={i}
                        onClick={() => handleSelect(suggestion)}
                        className={cn(
                            "text-xs px-3 py-1.5 rounded-full border transition-all hover:shadow-sm",
                            typeStyles[suggestion.type]
                        )}
                    >
                        {suggestion.content}
                    </button>
                ))
            )}
        </div>
    );
}

export default SuggestionChips;
