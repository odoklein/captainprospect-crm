"use client";

/**
 * Full-page assistant workspace, laid out after chatbot.ai-sdk.dev: a
 * collapsible history rail, a thin header, one centred reading column and a
 * composer pinned to the bottom. Same endpoints as Thread.tsx — only the
 * surface differs.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
    ArrowDown,
    ArrowRight,
    ArrowUp,
    Brain,
    Check,
    ChevronDown,
    Coins,
    Copy,
    Loader2,
    PanelLeft,
    Plus,
    Square,
    Trash2,
    Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AiMark } from "@/components/ui/AiMark";
import Markdown from "@/components/assistant-projet/Markdown";
import { SecretCard, type RevealedSecret } from "@/components/vault/SecretCard";
import { ToolTrace } from "./ToolTrace";
import { ActionConfirmationCard } from "./ActionConfirmationCard";
import { ThinkingStatus } from "./ThinkingStatus";
import type { ClientOption, ConversationSummary, StoredAction, TraceEntry } from "./types";
import type { UserAiUsageSummary } from "@/lib/ai/usage";

interface Message {
    id: string;
    role: "USER" | "ASSISTANT";
    content: string;
    trace?: TraceEntry[] | null;
    action?: StoredAction | null;
    secret?: RevealedSecret | null;
    failed?: boolean;
}

const PROJECT_SUGGESTIONS = [
    { title: "Fais-moi le point", detail: "sur ce projet" },
    { title: "Quels commerciaux", detail: "n'ont pas encore leurs accès ?" },
    { title: "Envoie l'email d'accès", detail: "aux commerciaux" },
    { title: "Combien de RDV ce mois-ci", detail: "et quels retours ?" },
];

const AGENCY_SUGGESTIONS = [
    { title: "Où en est l'agence", detail: "en ce moment ?" },
    { title: "Quels clients", detail: "méritent mon attention ?" },
    { title: "Combien de RDV ce mois", detail: "et par client ?" },
    { title: "Comment créer", detail: "une nouvelle mission ?" },
];

const HISTORY_GROUPS = ["Aujourd'hui", "Hier", "7 derniers jours", "30 derniers jours", "Plus ancien"] as const;

function historyGroup(iso: string | null): (typeof HISTORY_GROUPS)[number] {
    if (!iso) return "Plus ancien";
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const days = (startOfToday.getTime() - new Date(iso).getTime()) / 86_400_000;
    if (days <= 0) return "Aujourd'hui";
    if (days <= 1) return "Hier";
    if (days <= 7) return "7 derniers jours";
    if (days <= 30) return "30 derniers jours";
    return "Plus ancien";
}

function toMessage(m: any): Message {
    const rawTrace = m.trace;
    return {
        id: m.id,
        role: m.role,
        content: m.content,
        trace: Array.isArray(rawTrace) ? rawTrace : rawTrace?.entries ?? null,
        action: m.action ?? null,
    };
}

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

export function ChatWorkspace() {
    const { data: session } = useSession();
    const firstName = session?.user?.name?.split(" ")[0] ?? null;
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [pendingPrompt, setPendingPrompt] = useState("");
    const [clients, setClients] = useState<ClientOption[]>([]);
    const [conversations, setConversations] = useState<ConversationSummary[]>([]);
    const [usage, setUsage] = useState<UserAiUsageSummary | null>(null);
    const [clientId, setClientId] = useState("");
    const [missionId, setMissionId] = useState("");

    const [conversationId, setConversationId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [busyMessageId, setBusyMessageId] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [atBottom, setAtBottom] = useState(true);
    // Deep mode costs more per message (stronger model, bigger tool budget),
    // so it is a per-message choice, off by default.
    const [deep, setDeep] = useState(false);

    const scrollRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    const activeClient = useMemo(
        () => clients.find((c) => c.id === clientId) ?? null,
        [clients, clientId]
    );

    // The history rail starts closed on small screens, where it overlays the chat.
    useEffect(() => {
        if (window.matchMedia("(max-width: 767px)").matches) setSidebarOpen(false);
    }, []);

    // ---- History & usage ----------------------------------------------------

    const loadHistory = useCallback(async () => {
        try {
            const query = new URLSearchParams();
            if (clientId) query.set("clientId", clientId);
            if (missionId) query.set("missionId", missionId);
            const [convRes, usageRes] = await Promise.all([
                fetch(`/api/manager/assistant/conversations?${query}`),
                fetch("/api/ai/usage"),
            ]);
            if (convRes.ok) {
                const data = (await convRes.json()).data;
                setClients(data?.clients ?? []);
                setConversations(data?.conversations ?? []);
            }
            if (usageRes.ok) {
                const json = await usageRes.json();
                setUsage(json.data ?? json);
            }
        } catch {
            // The rail stays as it was; the chat itself still works.
        }
    }, [clientId, missionId]);

    useEffect(() => {
        void loadHistory();
    }, [loadHistory]);

    const grouped = useMemo(() => {
        const map = new Map<string, ConversationSummary[]>();
        for (const conv of conversations) {
            const group = historyGroup(conv.lastMessageAt ?? conv.updatedAt);
            map.set(group, [...(map.get(group) ?? []), conv]);
        }
        return HISTORY_GROUPS.filter((g) => map.has(g)).map((g) => ({ label: g, items: map.get(g)! }));
    }, [conversations]);

    // ---- Opening a thread ----------------------------------------------------

    const openConversation = useCallback(async (id: string) => {
        abortRef.current?.abort();
        setConversationId(id);
        setIsLoading(true);
        if (window.matchMedia("(max-width: 767px)").matches) setSidebarOpen(false);
        try {
            const res = await fetch(`/api/manager/assistant/conversations?conversationId=${encodeURIComponent(id)}`);
            const payload = await res.json();
            if (!res.ok) throw new Error();
            setMessages((payload.data?.messages ?? []).map(toMessage));
        } catch {
            setMessages([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const startNewChat = useCallback(() => {
        abortRef.current?.abort();
        setConversationId(null);
        setMessages([]);
        setInput("");
        textareaRef.current?.focus();
    }, []);

    const deleteConversation = useCallback(
        async (id: string) => {
            if (!window.confirm("Supprimer cette conversation ?")) return;
            const res = await fetch("/api/manager/assistant/conversations", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ conversationId: id }),
            });
            if (!res.ok) return;
            setConversations((prev) => prev.filter((c) => c.id !== id));
            if (id === conversationId) startNewChat();
        },
        [conversationId, startNewChat]
    );

    const changeScope = (nextClientId: string, nextMissionId: string) => {
        setClientId(nextClientId);
        setMissionId(nextMissionId);
        startNewChat();
    };

    // ---- Sending -------------------------------------------------------------

    useEffect(() => {
        if (!isSending) {
            setElapsedMs(0);
            return;
        }
        const startedAt = Date.now();
        const tick = setInterval(() => setElapsedMs(Date.now() - startedAt), 100);
        return () => clearInterval(tick);
    }, [isSending]);

    const sendMessage = useCallback(
        async (text?: string) => {
            const prompt = (text ?? input).trim();
            if (!prompt || isSending) return;

            const controller = new AbortController();
            abortRef.current = controller;
            setInput("");
            setPendingPrompt(prompt);
            setIsSending(true);
            setAtBottom(true);
            setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: "USER", content: prompt }]);

            try {
                let id = conversationId;
                if (!id) {
                    const res = await fetch("/api/manager/assistant/conversations", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            clientId: clientId || null,
                            missionId: clientId ? missionId || null : null,
                        }),
                        signal: controller.signal,
                    });
                    const payload = await res.json();
                    if (!res.ok) throw new Error(payload?.error ?? "Impossible de créer la conversation");
                    id = payload.data.conversation.id as string;
                    setConversationId(id);
                }

                const res = await fetch("/api/manager/assistant/chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        conversationId: id,
                        message: prompt,
                        depth: deep ? "deep" : "standard",
                    }),
                    signal: controller.signal,
                });
                const payload = await res.json();
                if (!res.ok) throw new Error(payload?.error ?? "L'assistant n'a pas pu répondre");

                const data = payload.data;
                setMessages((prev) => [
                    ...prev,
                    {
                        id: data.messageId,
                        role: "ASSISTANT",
                        content: data.answer,
                        trace: Array.isArray(data.trace) ? data.trace : data.trace?.entries ?? null,
                        action: data.pendingAction ?? null,
                    },
                ]);
            } catch (err) {
                if (controller.signal.aborted) return;
                setMessages((prev) => [
                    ...prev,
                    {
                        id: `err-${Date.now()}`,
                        role: "ASSISTANT",
                        content: err instanceof Error ? err.message : "Erreur de communication avec l'assistant.",
                        failed: true,
                    },
                ]);
            } finally {
                if (abortRef.current === controller) {
                    abortRef.current = null;
                    setIsSending(false);
                    void loadHistory();
                }
            }
        },
        [input, isSending, conversationId, clientId, missionId, deep, loadHistory]
    );

    // Stop only stops waiting: the server may still finish the turn, and the
    // answer then shows up when the thread is reopened.
    const stopWaiting = () => {
        abortRef.current?.abort();
        abortRef.current = null;
        setIsSending(false);
    };

    const handleActionDecision = useCallback(
        async (message: Message, decision: "confirm" | "cancel") => {
            if (!message.action || !conversationId) return;
            setBusyMessageId(message.id);
            try {
                const res = await fetch("/api/manager/assistant/execute", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ conversationId, messageId: message.id, decision }),
                });
                const payload = await res.json();
                if (!res.ok) throw new Error(payload?.error ?? "L'action a échoué");
                const data = payload.data;
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === message.id && m.action
                            ? {
                                  ...m,
                                  action: { ...m.action, state: data.state, outcome: data.message },
                                  secret: data.secret ?? null,
                              }
                            : m
                    )
                );
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
        [conversationId]
    );

    const copyMessage = async (message: Message) => {
        try {
            await navigator.clipboard.writeText(message.content);
            setCopiedId(message.id);
            setTimeout(() => setCopiedId((id) => (id === message.id ? null : id)), 1500);
        } catch {
            // Clipboard refused (insecure context) — nothing to recover.
        }
    };

    // ---- Scrolling & composer ------------------------------------------------

    const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
        const el = scrollRef.current;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior });
    };

    useEffect(() => {
        if (atBottom) scrollToBottom();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messages, isSending]);

    const onScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
    };

    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
    }, [input]);

    const suggestions = clientId ? PROJECT_SUGGESTIONS : AGENCY_SUGGESTIONS;
    const isEmpty = !isLoading && messages.length === 0;

    // ---- Render --------------------------------------------------------------

    return (
        <div className="relative flex h-full min-h-0 w-full overflow-hidden bg-white">
            {/* Mobile backdrop */}
            {sidebarOpen && (
                <div
                    className="absolute inset-0 z-20 bg-slate-900/20 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                    aria-hidden="true"
                />
            )}

            {/* History rail */}
            <aside
                className={cn(
                    "z-30 flex h-full w-64 shrink-0 flex-col border-r border-slate-200 bg-gradient-to-b from-accent-50/60 via-slate-50/80 to-slate-50/80 transition-[margin,transform] duration-200",
                    "absolute inset-y-0 left-0 md:relative",
                    sidebarOpen ? "translate-x-0 md:ml-0" : "-translate-x-full md:translate-x-0 md:-ml-64"
                )}
                aria-label="Historique des conversations"
            >
                <div className="flex h-12 items-center justify-between px-3">
                    <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <span className="cp-ai-orb flex h-6 w-6 items-center justify-center rounded-md text-white">
                            <AiMark className="h-3.5 w-3.5" />
                        </span>
                        Captain AI
                    </span>
                    <button
                        type="button"
                        onClick={startNewChat}
                        title="Nouvelle conversation"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-accent-700 hover:bg-accent-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
                    >
                        <Plus className="h-4 w-4" />
                    </button>
                </div>

                <nav className="flex-1 overflow-y-auto px-2 pb-2">
                    {grouped.length === 0 ? (
                        <p className="px-2 py-6 text-center text-xs text-slate-400">
                            Vos conversations apparaîtront ici.
                        </p>
                    ) : (
                        grouped.map((group) => (
                            <div key={group.label} className="mb-3">
                                <p className="px-2 pb-1 pt-2 text-[11px] font-medium text-slate-400">{group.label}</p>
                                {group.items.map((conv) => (
                                    <div
                                        key={conv.id}
                                        className={cn(
                                            "group relative flex items-center rounded-lg text-[13px] transition-colors",
                                            conv.id === conversationId
                                                ? "bg-accent-100/80 font-medium text-accent-900"
                                                : "text-slate-600 hover:bg-accent-50 hover:text-slate-900"
                                        )}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => void openConversation(conv.id)}
                                            className="min-w-0 flex-1 truncate px-2 py-1.5 text-left focus-visible:outline-none"
                                        >
                                            {conv.title || "Nouvel échange"}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void deleteConversation(conv.id)}
                                            title="Supprimer"
                                            className="mr-1 hidden h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-white hover:text-rose-600 group-hover:flex"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ))
                    )}
                </nav>

                <div className="space-y-1 border-t border-slate-200 px-3 py-2.5 text-[11.5px] text-slate-500">
                    <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                            <Coins className="h-3.5 w-3.5" />
                            Coût aujourd&apos;hui
                        </span>
                        <span className="font-semibold text-slate-700">{formatEuros(usage?.today.costEur ?? 0)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                            <Zap className="h-3.5 w-3.5" />
                            Tokens aujourd&apos;hui
                        </span>
                        <span className="font-semibold text-slate-700">{formatTokens(usage?.today.tokens ?? 0)}</span>
                    </div>
                </div>
            </aside>

            {/* Main column */}
            <section className="cp-ai-canvas flex min-w-0 flex-1 flex-col">
                <header className="flex h-12 shrink-0 items-center gap-2 px-3">
                    <button
                        type="button"
                        onClick={() => setSidebarOpen((v) => !v)}
                        title={sidebarOpen ? "Masquer l'historique" : "Afficher l'historique"}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
                    >
                        <PanelLeft className="h-4 w-4" />
                    </button>
                    {!sidebarOpen && (
                        <button
                            type="button"
                            onClick={startNewChat}
                            title="Nouvelle conversation"
                            className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Nouvelle conversation</span>
                        </button>
                    )}

                    <ScopeSelect
                        value={clientId}
                        onChange={(v) => changeScope(v, "")}
                        options={[{ value: "", label: "Vue agence" }, ...clients.map((c) => ({ value: c.id, label: c.name }))]}
                    />
                    {activeClient && activeClient.missions.length > 0 && (
                        <ScopeSelect
                            value={missionId}
                            onChange={(v) => changeScope(clientId, v)}
                            options={[
                                { value: "", label: "Toutes les missions" },
                                ...activeClient.missions.map((m) => ({ value: m.id, label: m.name })),
                            ]}
                        />
                    )}

                    <span className="ml-auto hidden items-center gap-1.5 rounded-full border border-accent-200 bg-accent-50 px-2.5 py-0.5 text-[11px] font-semibold text-accent-700 sm:inline-flex">
                        <span className="h-1.5 w-1.5 rounded-full bg-accent-500" aria-hidden />
                        Captain AI · {deep ? "gpt-4.1 · approfondi" : "gpt-4o-mini"}
                    </span>
                </header>

                <div
                    ref={scrollRef}
                    onScroll={onScroll}
                    className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
                >
                    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-6 pt-4">
                        {isLoading ? (
                            <div className="flex h-40 items-center justify-center">
                                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                            </div>
                        ) : isEmpty ? (
                            <div className="mt-[10vh] px-2 md:mt-[15vh]">
                                <span className="cp-ai-orb mb-5 flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-lg shadow-accent-500/25">
                                    <AiMark className="h-6 w-6" />
                                </span>
                                <h1 className="bg-gradient-to-r from-primary-700 via-accent-600 to-accent-500 bg-clip-text text-3xl font-semibold text-transparent">
                                    Bonjour{firstName ? ` ${firstName}` : ""} !
                                </h1>
                                <p className="mt-1 text-2xl text-slate-400">
                                    {activeClient
                                        ? `Que voulez-vous savoir sur ${activeClient.name} ?`
                                        : "Comment puis-je vous aider aujourd'hui ?"}
                                </p>
                            </div>
                        ) : (
                            messages.map((msg) =>
                                msg.role === "USER" ? (
                                    <div key={msg.id} className="flex justify-end">
                                        <div className="max-w-[80%] whitespace-pre-wrap [overflow-wrap:anywhere] rounded-2xl rounded-br-md bg-gradient-to-br from-primary-600 to-primary-800 px-4 py-2.5 text-sm text-white shadow-sm">
                                            {msg.content}
                                        </div>
                                    </div>
                                ) : (
                                    <div key={msg.id} className="group flex gap-3 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                                        <span className="cp-ai-orb mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white shadow-sm shadow-accent-500/30">
                                            <AiMark className="h-4 w-4" />
                                        </span>
                                        <div className="cp-ai-answer min-w-0 flex-1">
                                            {msg.trace && msg.trace.length > 0 && <ToolTrace trace={msg.trace} />}
                                            <div className={cn(msg.failed && "text-rose-600")}>
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
                                                            prev.map((m) => (m.id === msg.id ? { ...m, secret: null } : m))
                                                        )
                                                    }
                                                />
                                            )}
                                            {!msg.failed && (
                                                <div className="mt-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                                                    <button
                                                        type="button"
                                                        onClick={() => void copyMessage(msg)}
                                                        title="Copier"
                                                        className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                                                    >
                                                        {copiedId === msg.id ? (
                                                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                                                        ) : (
                                                            <Copy className="h-3.5 w-3.5" />
                                                        )}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            )
                        )}

                        {isSending && (
                            <ThinkingStatus
                                prompt={pendingPrompt}
                                scopeName={activeClient?.name ?? null}
                                elapsedMs={elapsedMs}
                                deep={deep}
                            />
                        )}
                    </div>
                </div>

                {/* Composer */}
                <div className="relative mx-auto w-full max-w-3xl shrink-0 px-4 pb-4">
                    {/* Text scrolling under the composer fades out instead of cutting off. */}
                    <div
                        aria-hidden
                        className="pointer-events-none absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-white to-transparent"
                    />
                    {!atBottom && !isEmpty && (
                        <button
                            type="button"
                            onClick={() => scrollToBottom()}
                            title="Aller en bas"
                            className="absolute -top-12 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:text-slate-900"
                        >
                            <ArrowDown className="h-4 w-4" />
                        </button>
                    )}

                    {isEmpty && (
                        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {suggestions.map((s, i) => (
                                <button
                                    key={s.title}
                                    type="button"
                                    onClick={() => void sendMessage(`${s.title} ${s.detail}`)}
                                    className={cn(
                                        "group relative rounded-xl border border-slate-200 bg-white px-4 py-3 pr-9 text-left text-sm transition-all hover:-translate-y-0.5 hover:border-accent-300 hover:bg-accent-50/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
                                        i > 1 && "hidden sm:block"
                                    )}
                                >
                                    <span className="block font-medium text-slate-900">{s.title}</span>
                                    <span className="block text-slate-500">{s.detail}</span>
                                    <ArrowRight className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300 transition-colors group-hover:text-accent-500" />
                                </button>
                            ))}
                        </div>
                    )}

                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            void sendMessage();
                        }}
                        className="relative rounded-2xl border border-slate-200 bg-slate-50 shadow-sm transition-all focus-within:border-accent-300 focus-within:bg-white focus-within:ring-4 focus-within:ring-accent-100"
                    >
                        <textarea
                            ref={textareaRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                                    e.preventDefault();
                                    void sendMessage();
                                }
                            }}
                            rows={2}
                            autoFocus
                            placeholder="Demandez à Captain AI…"
                            className="block max-h-[220px] min-h-[72px] w-full resize-none bg-transparent px-4 pb-11 pt-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                        />
                        <button
                            type="button"
                            onClick={() => setDeep((v) => !v)}
                            aria-pressed={deep}
                            title="Modèle plus puissant et enquête plus longue : réponse plus lente et plus coûteuse"
                            className={cn(
                                "absolute bottom-2 left-2 flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
                                deep
                                    ? "border-accent-300 bg-accent-50 text-accent-700"
                                    : "border-slate-200 bg-white text-slate-500 hover:text-slate-900"
                            )}
                        >
                            <Brain className="h-3.5 w-3.5" />
                            Réflexion approfondie
                        </button>
                        <div className="absolute bottom-2 right-2">
                            {isSending ? (
                                <button
                                    type="button"
                                    onClick={stopWaiting}
                                    title="Arrêter"
                                    className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-700 text-white hover:bg-primary-800"
                                >
                                    <Square className="h-3 w-3 fill-current" />
                                </button>
                            ) : (
                                <button
                                    type="submit"
                                    disabled={!input.trim()}
                                    title="Envoyer"
                                    className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-accent-500 to-accent-700 text-white shadow-sm shadow-accent-500/30 transition-transform hover:scale-105 disabled:scale-100 disabled:opacity-30 disabled:shadow-none"
                                >
                                    <ArrowUp className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    </form>
                    <p className="mt-2 text-center text-[11px] text-slate-400">
                        Captain AI peut se tromper : vérifiez les chiffres importants.
                    </p>
                </div>
            </section>
        </div>
    );
}

function ScopeSelect({
    value,
    onChange,
    options,
}: {
    value: string;
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
}) {
    return (
        <label className="relative min-w-0">
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="h-8 max-w-[220px] appearance-none truncate rounded-lg border border-slate-200 bg-white pl-2.5 pr-7 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
            >
                {options.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        </label>
    );
}
