"use client";

// ============================================
// ThreadSummary - AI-generated thread summary
// ============================================

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
    ChevronDown,
    ChevronUp,
    Loader2,
    CheckCircle,
    Users,
    List,
} from "lucide-react";
import { AiMark } from "@/components/ui/AiMark";

interface ThreadSummaryData {
    summary: string;
    keyPoints: string[];
    actionItems: string[];
    participants: { name: string; messageCount: number }[];
    sentiment: "positive" | "neutral" | "negative";
}

interface ThreadSummaryProps {
    threadId: string;
    className?: string;
}

export function ThreadSummary({ threadId, className }: ThreadSummaryProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [summary, setSummary] = useState<ThreadSummaryData | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchSummary = async () => {
        if (summary) {
            setIsExpanded(!isExpanded);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const res = await fetch(`/api/comms/threads/${threadId}/summary`);
            if (res.ok) {
                const data = await res.json();
                setSummary(data);
                setIsExpanded(true);
            } else {
                setError("Impossible de générer le résumé");
            }
        } catch {
            setError("Erreur de connexion");
        } finally {
            setIsLoading(false);
        }
    };

    const sentimentColors = {
        positive: "text-green-600 bg-green-50",
        neutral: "text-slate-600 bg-slate-50",
        negative: "text-red-600 bg-red-50",
    };

    const sentimentLabels = {
        positive: "Positif",
        neutral: "Neutre",
        negative: "Négatif",
    };

    return (
        <div className={cn("border-b border-slate-200", className)}>
            <button
                onClick={fetchSummary}
                disabled={isLoading}
                className="w-full px-4 py-2 flex items-center justify-between hover:bg-slate-50 transition-colors"
            >
                <div className="flex items-center gap-2 text-sm">
                    <AiMark className="w-4 h-4 text-primary-500" />
                    <span className="font-medium text-slate-700">Résumé IA</span>
                </div>
                {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                ) : isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
            </button>

            {error && (
                <div className="px-4 py-2 text-sm text-red-600 bg-red-50">
                    {error}
                </div>
            )}

            {isExpanded && summary && (
                <div className="px-4 pb-4 space-y-4 animate-in slide-in-from-top-2">
                    {/* Summary */}
                    <div className="bg-primary-50 rounded-lg p-3">
                        <p className="text-sm text-slate-700">{summary.summary}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        {/* Sentiment */}
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">Ton:</span>
                            <span
                                className={cn(
                                    "text-xs px-2 py-0.5 rounded-full",
                                    sentimentColors[summary.sentiment]
                                )}
                            >
                                {sentimentLabels[summary.sentiment]}
                            </span>
                        </div>

                        {/* Participant count */}
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                            <Users className="w-3 h-3" />
                            {summary.participants.length} participant{summary.participants.length > 1 ? "s" : ""}
                        </div>
                    </div>

                    {/* Key Points */}
                    {summary.keyPoints.length > 0 && (
                        <div>
                            <h4 className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1">
                                <List className="w-3 h-3" />
                                Points clés
                            </h4>
                            <ul className="space-y-1">
                                {summary.keyPoints.map((point, i) => (
                                    <li
                                        key={i}
                                        className="text-xs text-slate-600 pl-3 border-l-2 border-primary-200"
                                    >
                                        {point}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Action Items */}
                    {summary.actionItems.length > 0 && (
                        <div>
                            <h4 className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" />
                                Actions à suivre
                            </h4>
                            <ul className="space-y-1">
                                {summary.actionItems.map((item, i) => (
                                    <li
                                        key={i}
                                        className="text-xs text-slate-600 flex items-start gap-2"
                                    >
                                        <span className="w-4 h-4 rounded bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0 text-[10px]">
                                            {i + 1}
                                        </span>
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Top Participants */}
                    {summary.participants.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {summary.participants.slice(0, 5).map((p) => (
                                <div
                                    key={p.name}
                                    className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full"
                                >
                                    {p.name} ({p.messageCount})
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default ThreadSummary;
