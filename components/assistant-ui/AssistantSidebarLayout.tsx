"use client";

import { useEffect, useState, useCallback } from "react";
import {
    Activity,
    Coins,
    Cpu,
    Filter,
    MessageSquare,
    MessageSquarePlus,
    Sparkles,
    Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AiMark } from "@/components/ui/AiMark";
import { AssistantThread } from "./Thread";
import type { ClientOption, ConversationSummary } from "./types";
import type { UserAiUsageSummary } from "@/lib/ai/usage";

interface AssistantSidebarLayoutProps {
    fixedClientId?: string;
    fixedMissionId?: string;
    className?: string;
}

export function AssistantSidebarLayout({
    fixedClientId,
    fixedMissionId,
    className,
}: AssistantSidebarLayoutProps) {
    const [clients, setClients] = useState<ClientOption[]>([]);
    const [conversations, setConversations] = useState<ConversationSummary[]>([]);
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

    const [clientId, setClientId] = useState(fixedClientId ?? "");
    const [missionId, setMissionId] = useState(fixedMissionId ?? "");
    const [usage, setUsage] = useState<UserAiUsageSummary | null>(null);

    // Load clients, conversations, and usage stats
    const loadData = useCallback(async () => {
        try {
            const query = new URLSearchParams();
            if (clientId) query.set("clientId", clientId);
            if (missionId) query.set("missionId", missionId);

            const [convRes, usageRes] = await Promise.all([
                fetch(`/api/manager/assistant/conversations?${query}`),
                fetch("/api/ai/usage"),
            ]);

            if (convRes.ok) {
                const convJson = await convRes.json();
                const data = convJson.data ?? convJson;
                setClients(data.clients ?? []);
                setConversations(data.conversations ?? []);
                if (data.conversationId) {
                    setActiveConversationId(data.conversationId);
                }
            }

            if (usageRes.ok) {
                const usageJson = await usageRes.json();
                setUsage(usageJson.data ?? usageJson);
            }
        } catch {
            // Silently recover
        }
    }, [clientId, missionId]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const activeClient = clients.find((c) => c.id === clientId) ?? null;

    const formatTokens = (num: number) => new Intl.NumberFormat("fr-FR").format(num);
    const formatEuros = (cost: number) => {
        if (cost < 0.01 && cost > 0) return `${cost.toFixed(4).replace(".", ",")} €`;
        return new Intl.NumberFormat("fr-FR", {
            style: "currency",
            currency: "EUR",
            minimumFractionDigits: 2,
            maximumFractionDigits: 4,
        }).format(cost);
    };

    return (
        <div
            className={cn(
                "flex h-[calc(100vh-130px)] min-h-[500px] w-full gap-4 overflow-hidden",
                className
            )}
        >
            {/* Left Sidebar: Threads, Scopes, and Token Consumption */}
            <div className="flex w-80 shrink-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
                {/* Header */}
                <div className="border-b border-slate-200/80 bg-slate-50/70 p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-600 text-white shadow-2xs">
                                <AiMark className="h-4 w-4" />
                            </span>
                            <span className="text-sm font-bold text-slate-900">Conversations</span>
                        </div>
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-700 border border-emerald-200/70">
                            <Cpu className="h-2.5 w-2.5" />
                            gpt-4o-mini
                        </span>
                    </div>

                    {/* Scope Selector */}
                    {!fixedClientId && (
                        <div className="mt-3 space-y-2">
                            <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                                <Filter className="h-3 w-3" />
                                <span>Périmètre du projet :</span>
                            </label>
                            <select
                                value={clientId}
                                onChange={(e) => {
                                    setClientId(e.target.value);
                                    setMissionId("");
                                    setActiveConversationId(null);
                                }}
                                className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
                            >
                                <option value="">🏢 Vue Agence (tous les clients)</option>
                                {clients.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        📁 {c.name}
                                    </option>
                                ))}
                            </select>

                            {activeClient && activeClient.missions.length > 0 && (
                                <select
                                    value={missionId}
                                    onChange={(e) => {
                                        setMissionId(e.target.value);
                                        setActiveConversationId(null);
                                    }}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
                                >
                                    <option value="">Toutes les missions</option>
                                    {activeClient.missions.map((m) => (
                                        <option key={m.id} value={m.id}>
                                            🎯 {m.name}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
                    )}

                    {/* New chat action */}
                    <button
                        type="button"
                        onClick={() => setActiveConversationId(null)}
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-accent-600 px-3 py-2 text-xs font-semibold text-white shadow-xs transition-all hover:bg-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
                    >
                        <MessageSquarePlus className="h-4 w-4" />
                        <span>Nouvelle conversation</span>
                    </button>
                </div>

                {/* Thread List */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {conversations.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-400">
                            Aucune conversation sur ce périmètre.
                        </div>
                    ) : (
                        conversations.map((conv) => (
                            <button
                                key={conv.id}
                                type="button"
                                onClick={() => setActiveConversationId(conv.id)}
                                className={cn(
                                    "flex w-full flex-col gap-0.5 rounded-xl px-3 py-2 text-left text-xs transition-colors",
                                    activeConversationId === conv.id
                                        ? "bg-accent-50 text-accent-900 font-semibold border border-accent-200/80 shadow-2xs"
                                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent"
                                )}
                            >
                                <div className="flex items-center gap-1.5 truncate">
                                    <MessageSquare className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                    <span className="truncate">{conv.title || "Nouvel échange"}</span>
                                </div>
                                <div className="flex items-center justify-between text-[10.5px] text-slate-400">
                                    <span>{conv.messageCount} messages</span>
                                    <span>
                                        {conv.lastMessageAt
                                            ? new Date(conv.lastMessageAt).toLocaleDateString("fr-FR", {
                                                  day: "numeric",
                                                  month: "short",
                                              })
                                            : ""}
                                    </span>
                                </div>
                            </button>
                        ))
                    )}
                </div>

                {/* Bottom: OpenAI Low-Cost Consumption Panel */}
                <div className="border-t border-slate-200/80 bg-slate-50/60 p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 font-medium text-slate-600">
                            <Coins className="h-3.5 w-3.5 text-rose-500" />
                            Coût aujourd&apos;hui
                        </span>
                        <span className="font-bold text-rose-600">
                            {formatEuros(usage?.today.costEur ?? 0)}
                        </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span className="flex items-center gap-1.5">
                            <Zap className="h-3 w-3 text-amber-500" />
                            Tokens aujourd&apos;hui
                        </span>
                        <span className="font-semibold text-slate-700">
                            {formatTokens(usage?.today.tokens ?? 0)}
                        </span>
                    </div>
                    <div className="flex items-center gap-1 text-[10.5px] font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200/60">
                        <Sparkles className="h-3 w-3 shrink-0 text-emerald-600" />
                        <span>~95% d&apos;économie avec gpt-4o-mini</span>
                    </div>
                </div>
            </div>

            {/* Main Thread Workspace */}
            <div className="flex-1 min-w-0 h-full">
                <AssistantThread
                    conversationId={activeConversationId}
                    clientId={clientId}
                    missionId={missionId}
                    clients={clients}
                    onScopeChange={(c, m) => {
                        setClientId(c);
                        setMissionId(m);
                        setActiveConversationId(null);
                    }}
                    onConversationChange={setActiveConversationId}
                    fixedClientId={fixedClientId}
                    fixedMissionId={fixedMissionId}
                    onDataChanged={loadData}
                />
            </div>
        </div>
    );
}
