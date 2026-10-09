"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
    ArrowUp,
    Bot,
    ChevronDown,
    Cpu,
    Loader2,
    MessageSquarePlus,
    RotateCcw,
    Send,
    Sparkles,
    User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AiMark } from "@/components/ui/AiMark";
import Markdown from "@/components/assistant-projet/Markdown";
import { SecretCard, type RevealedSecret } from "@/components/vault/SecretCard";
import { ToolTrace } from "./ToolTrace";
import { ActionConfirmationCard } from "./ActionConfirmationCard";
import type { ClientOption, StoredAction, TraceEntry } from "./types";

interface Message {
    id: string;
    role: "USER" | "ASSISTANT";
    content: string;
    trace?: TraceEntry[] | null;
    action?: StoredAction | null;
    secret?: RevealedSecret | null;
}

export interface AssistantThreadProps {
    conversationId?: string | null;
    clientId?: string;
    missionId?: string;
    clients?: ClientOption[];
    onScopeChange?: (clientId: string, missionId: string) => void;
    onConversationChange?: (id: string | null) => void;
    onDataChanged?: () => void;
    fixedClientId?: string;
    fixedMissionId?: string;
    compact?: boolean;
    className?: string;
}

const PROJECT_PROMPTS = [
    "Fais-moi le point sur ce projet",
    "Quels commerciaux n'ont pas encore leurs accès ?",
    "Envoie l'email d'accès aux commerciaux",
    "Combien de RDV ce mois-ci, et quels retours ?",
];

const AGENCY_PROMPTS = [
    "Où en est l'agence en ce moment ?",
    "Quels clients méritent mon attention ?",
    "Combien de RDV ce mois, et par client ?",
    "Comment créer une nouvelle mission ?",
];

export function AssistantThread({
    conversationId: externalConvId,
    clientId = "",
    missionId = "",
    clients = [],
    onScopeChange,
    onConversationChange,
    onDataChanged,
    fixedClientId,
    fixedMissionId,
    compact = false,
    className,
}: AssistantThreadProps) {
    const [localConvId, setLocalConvId] = useState<string | null>(externalConvId ?? null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [busyMessageId, setBusyMessageId] = useState<string | null>(null);

    const threadEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const activeConvId = externalConvId ?? localConvId;

    const activeClient = useMemo(
        () => clients.find((c) => c.id === clientId) ?? null,
        [clients, clientId]
    );

    // Auto-scroll when messages update
    useEffect(() => {
        threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isSending]);

    // Live timer while the AI generates
    useEffect(() => {
        if (!isSending) {
            setElapsedMs(0);
            return;
        }
        const startedAt = Date.now();
        const tick = setInterval(() => setElapsedMs(Date.now() - startedAt), 100);
        return () => clearInterval(tick);
    }, [isSending]);

    // Fetch conversation messages
    const loadConversation = useCallback(async () => {
        setIsLoading(true);
        try {
            const query = new URLSearchParams();
            if (clientId) query.set("clientId", clientId);
            if (missionId) query.set("missionId", missionId);
            if (activeConvId) query.set("conversationId", activeConvId);

            const res = await fetch(`/api/manager/assistant/conversations?${query}`);
            const payload = await res.json();
            if (!res.ok) throw new Error(payload?.error ?? "Impossible de charger");

            const data = payload.data ?? payload;
            if (data.conversationId && data.conversationId !== activeConvId) {
                setLocalConvId(data.conversationId);
                onConversationChange?.(data.conversationId);
            }

            setMessages(
                (data.messages ?? []).map((m: any) => {
                    const rawTrace = m.trace;
                    const traceEntries = Array.isArray(rawTrace)
                        ? rawTrace
                        : rawTrace?.entries ?? null;

                    return {
                        id: m.id,
                        role: m.role,
                        content: m.content,
                        trace: traceEntries,
                        action: m.action ?? null,
                    };
                })
            );
        } catch {
            setMessages([]);
        } finally {
            setIsLoading(false);
        }
    }, [clientId, missionId, activeConvId, onConversationChange]);

    useEffect(() => {
        void loadConversation();
    }, [loadConversation]);

    const ensureConversation = useCallback(async (): Promise<string | null> => {
        if (activeConvId) return activeConvId;

        const res = await fetch("/api/manager/assistant/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                clientId: clientId || null,
                missionId: clientId ? missionId || null : null,
            }),
        });
        const payload = await res.json();
        if (!res.ok) return null;

        const newId = (payload.data ?? payload).conversation.id as string;
        setLocalConvId(newId);
        onConversationChange?.(newId);
        return newId;
    }, [activeConvId, clientId, missionId, onConversationChange]);

    const handleNewThread = useCallback(async () => {
        setLocalConvId(null);
        onConversationChange?.(null);
        setMessages([]);
    }, [onConversationChange]);

    const sendMessage = useCallback(
        async (textToSend?: string) => {
            const prompt = (textToSend ?? input).trim();
            if (!prompt || isSending) return;

            const id = await ensureConversation();
            if (!id) return;

            setMessages((prev) => [
                ...prev,
                { id: `local-${Date.now()}`, role: "USER", content: prompt },
            ]);
            setInput("");
            setIsSending(true);

            try {
                const res = await fetch("/api/manager/assistant/chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ conversationId: id, message: prompt }),
                });
                const payload = await res.json();
                if (!res.ok) throw new Error(payload?.error ?? "L'assistant n'a pas pu répondre");

                const data = payload.data ?? payload;
                const traceEntries = Array.isArray(data.trace)
                    ? data.trace
                    : data.trace?.entries ?? null;

                setMessages((prev) => [
                    ...prev,
                    {
                        id: data.messageId,
                        role: "ASSISTANT",
                        content: data.answer,
                        trace: traceEntries,
                        action: data.pendingAction ?? null,
                    },
                ]);
            } catch (err) {
                setMessages((prev) => [
                    ...prev,
                    {
                        id: `err-${Date.now()}`,
                        role: "ASSISTANT",
                        content:
                            err instanceof Error ? err.message : "Erreur de communication avec l'assistant.",
                    },
                ]);
            } finally {
                setIsSending(false);
            }
        },
        [input, isSending, ensureConversation]
    );

    const handleActionDecision = useCallback(
        async (message: Message, decision: "confirm" | "cancel") => {
            if (!message.action || !activeConvId) return;
            setBusyMessageId(message.id);

            try {
                const res = await fetch("/api/manager/assistant/execute", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        conversationId: activeConvId,
                        messageId: message.id,
                        decision,
                    }),
                });
                const payload = await res.json();
                if (!res.ok) throw new Error(payload?.error ?? "L'action a échoué");

                const data = payload.data ?? payload;
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === message.id && m.action
                            ? {
                                  ...m,
                                  action: {
                                      ...m.action,
                                      state: data.state,
                                      outcome: data.message,
                                  },
                                  secret: data.secret ?? null,
                              }
                            : m
                    )
                );
                if (data.refresh) onDataChanged?.();
            } catch (err) {
                const detail = err instanceof Error ? err.message : "Échec de l'action";
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === message.id && m.action
                            ? { ...m, action: { ...m.action, state: "failed", outcome: detail } }
                            : m
                    )
                );
            } finally {
                setBusyMessageId(null);
            }
        },
        [activeConvId, onDataChanged]
    );

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void sendMessage();
        }
    };

    const starterPrompts = clientId ? PROJECT_PROMPTS : AGENCY_PROMPTS;

    return (
        <div
            className={cn(
                "flex h-full w-full flex-col bg-white overflow-hidden rounded-2xl border border-slate-200 shadow-sm",
                className
            )}
        >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/70 px-4 py-3 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent-600 text-white shadow-xs">
                        <AiMark className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">
                                Assistant Projet
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-700 border border-emerald-200/70">
                                <Cpu className="h-2.5 w-2.5" />
                                gpt-4o-mini
                            </span>
                        </div>
                        <div className="truncate text-[11px] text-slate-500">
                            {activeClient
                                ? `${activeClient.name} ${missionId ? "• Mission active" : "• Toutes missions"}`
                                : "Vue Agence (transverse)"}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-1.5">
                    {/* Project switcher if allowed */}
                    {!fixedClientId && clients.length > 0 && onScopeChange && (
                        <div className="relative">
                            <select
                                value={clientId}
                                onChange={(e) => onScopeChange(e.target.value, "")}
                                className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
                            >
                                <option value="">Vue Agence</option>
                                {clients.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={handleNewThread}
                        title="Nouvelle conversation"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
                    >
                        <MessageSquarePlus className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Message Thread Viewport */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {isLoading ? (
                    <div className="flex h-40 items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-accent-600" />
                    </div>
                ) : messages.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center text-center p-6 space-y-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-50 text-accent-600 border border-accent-100">
                            <Sparkles className="h-6 w-6" />
                        </div>
                        <div className="max-w-sm space-y-1">
                            <h3 className="text-sm font-semibold text-slate-900">
                                Comment puis-je vous aider ?
                            </h3>
                            <p className="text-xs text-slate-500">
                                Posez une question sur le projet, consultez les documents, ou pilotez les accès commerciaux.
                            </p>
                        </div>

                        {/* Starter Prompts */}
                        <div className="grid w-full max-w-md grid-cols-1 gap-2 pt-2">
                            {starterPrompts.map((p) => (
                                <button
                                    key={p}
                                    type="button"
                                    onClick={() => void sendMessage(p)}
                                    className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-2.5 text-left text-xs font-medium text-slate-700 transition-all hover:bg-white hover:border-accent-300 hover:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={cn(
                                "flex gap-3 text-xs leading-relaxed",
                                msg.role === "USER" ? "justify-end" : "justify-start"
                            )}
                        >
                            {msg.role === "ASSISTANT" && (
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-600 text-white shadow-xs">
                                    <Bot className="h-4 w-4" />
                                </div>
                            )}

                            <div
                                className={cn(
                                    "max-w-[85%] rounded-2xl px-4 py-3 shadow-2xs",
                                    msg.role === "USER"
                                        ? "bg-accent-600 text-white"
                                        : "border border-slate-200/80 bg-white text-slate-800"
                                )}
                            >
                                {msg.role === "USER" ? (
                                    <div className="whitespace-pre-wrap">{msg.content}</div>
                                ) : (
                                    <>
                                        {msg.trace && msg.trace.length > 0 && (
                                            <ToolTrace trace={msg.trace} />
                                        )}
                                        <div className="prose prose-xs max-w-none text-slate-800">
                                            <Markdown content={msg.content} />
                                        </div>
                                        {msg.action && (
                                            <ActionConfirmationCard
                                                action={msg.action}
                                                busy={busyMessageId === msg.id}
                                                onConfirm={() => handleActionDecision(msg, "confirm")}
                                                onCancel={() => handleActionDecision(msg, "cancel")}
                                            />
                                        )}
                                        {msg.secret && (
                                            <SecretCard
                                                secret={msg.secret}
                                                onExpire={() =>
                                                    setMessages((prev) =>
                                                        prev.map((m) =>
                                                            m.id === msg.id ? { ...m, secret: null } : m
                                                        )
                                                    )
                                                }
                                            />
                                        )}
                                    </>
                                )}
                            </div>

                            {msg.role === "USER" && (
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white shadow-xs">
                                    <User className="h-3.5 w-3.5" />
                                </div>
                            )}
                        </div>
                    ))
                )}

                {/* Generating indicator */}
                {isSending && (
                    <div className="flex items-center gap-2.5 text-xs text-slate-500 animate-in fade-in-50">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-600/90 text-white animate-pulse">
                            <Bot className="h-4 w-4" />
                        </div>
                        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-2xs">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-600" />
                            <span>Réflexion en cours ({(elapsedMs / 1000).toFixed(1)}s)…</span>
                        </div>
                    </div>
                )}

                <div ref={threadEndRef} />
            </div>

            {/* Composer */}
            <div className="border-t border-slate-200/80 bg-white p-3 shrink-0">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        void sendMessage();
                    }}
                    className="flex flex-col gap-2 rounded-xl border border-slate-200/90 bg-slate-50/50 p-2 shadow-2xs focus-within:border-accent-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-accent-100 transition-all"
                >
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={
                            activeClient
                                ? `Demandez à l'assistant sur ${activeClient.name}…`
                                : "Posez une question globale sur l'agence…"
                        }
                        rows={compact ? 2 : 3}
                        className="w-full resize-none bg-transparent px-2 py-1 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none"
                    />
                    <div className="flex items-center justify-between border-t border-slate-200/50 pt-2 px-1 text-[11px] text-slate-400">
                        <span className="hidden sm:inline">
                            <strong>Entrée</strong> pour envoyer, <strong>Maj+Entrée</strong> pour saut de ligne
                        </span>
                        <button
                            type="submit"
                            disabled={!input.trim() || isSending}
                            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition-all hover:bg-accent-700 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
                        >
                            <span>Envoyer</span>
                            <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
