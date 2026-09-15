"use client";

/**
 * ============================================================
 * ASSISTANT PROJET — panel
 * ============================================================
 * Bound to one project (client + mission). Changing the binding starts a
 * different conversation, which is the whole point: one project's context never
 * leaks into another's.
 *
 * Reads and reversible writes run on their own and show up in the tool trace.
 * Anything irreversible arrives as a card the manager confirms — that click is
 * what executes it.
 *
 * Revealed passwords live in this component's state only, never in the stored
 * transcript, and are wiped after SECRET_TTL_MS.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Check,
    ChevronRight,
    KeyRound,
    Loader2,
    MessageSquarePlus,
    Search,
    Sparkles,
    X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Markdown from "./Markdown";
// One implementation of the password card, shared with the vault list, so the
// masking and the 2-minute wipe cannot drift between the two surfaces.
import { SecretCard, type RevealedSecret } from "@/components/vault/SecretCard";

// ============================================
// TYPES
// ============================================

interface TraceEntry {
    tool: string;
    label: string;
    ok: boolean;
    durationMs: number;
    errorCode?: string;
}

interface ActionCard {
    title: string;
    details: Array<{ label: string; value: string }>;
    warning: string | null;
    confirmLabel: string;
    danger: boolean;
}

interface StoredAction {
    tool: string;
    args: Record<string, unknown>;
    card: ActionCard;
    state: "pending" | "confirmed" | "cancelled" | "failed";
    outcome?: string;
}

interface Message {
    id: string;
    role: "USER" | "ASSISTANT";
    content: string;
    trace?: TraceEntry[] | null;
    action?: StoredAction | null;
    /** Client-side only. Never persisted, never sent to the model. */
    secret?: RevealedSecret | null;
}

interface MissionOption {
    id: string;
    name: string;
    status: string;
}

interface ClientOption {
    id: string;
    name: string;
    missions: MissionOption[];
}

export interface AssistantProjetPanelProps {
    /** Locks the panel to one client (e.g. embedded in a client page). */
    fixedClientId?: string;
    /** Locks the mission too — used when opening from a specific mission row. */
    fixedMissionId?: string;
    className?: string;
    /** Called after any action that changed data, so the host page can refetch. */
    onDataChanged?: () => void;
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

function formatSeconds(ms: number): string {
    const seconds = ms / 1000;
    return seconds < 10 ? `${seconds.toFixed(1)} s` : `${Math.round(seconds)} s`;
}

// ============================================
// TOOL TRACE
// ============================================

function ToolTrace({ trace }: { trace: TraceEntry[] }) {
    const [open, setOpen] = useState(false);
    const total = trace.reduce((sum, t) => sum + t.durationMs, 0);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <button
                type="button"
                className="ap-trace-toggle"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
            >
                <Search className="h-3 w-3 shrink-0" />
                <span>
                    {trace.length} source{trace.length > 1 ? "s" : ""} consultée
                    {trace.length > 1 ? "s" : ""}
                </span>
                <span className="ap-trace-time">{formatSeconds(total)}</span>
                <ChevronRight
                    className={cn("h-3 w-3 transition-transform duration-200", open && "rotate-90")}
                />
            </button>

            {open && (
                <ul className="ap-trace-list">
                    {trace.map((entry, i) => (
                        <li key={`${entry.tool}-${i}`} className="ap-trace-item">
                            <span className={cn("ap-trace-dot", entry.ok ? "is-ok" : "is-ko")} />
                            <span className="ap-trace-name">{entry.label}</span>
                            <span className="ap-trace-meta">
                                {entry.ok ? `${entry.durationMs} ms` : (entry.errorCode ?? "refusé")}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

// ============================================
// ACTION CARD
// ============================================

function ConfirmationCard({
    action,
    busy,
    onConfirm,
    onCancel,
}: {
    action: StoredAction;
    busy: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    const settled = action.state !== "pending";

    return (
        <div
            className={cn(
                "ap-card",
                settled ? "is-done" : action.card.danger ? "is-danger" : undefined,
            )}
        >
            <div className="ap-card-title">
                <KeyRound className="h-3.5 w-3.5 shrink-0" />
                {action.card.title}
            </div>

            <dl className="ap-card-rows">
                {action.card.details.map((detail) => (
                    <div key={detail.label} className="ap-card-row">
                        <dt>{detail.label}</dt>
                        <dd>{detail.value}</dd>
                    </div>
                ))}
            </dl>

            {action.card.warning && !settled && (
                <p className="ap-card-warn">{action.card.warning}</p>
            )}

            {action.state === "pending" && (
                <div className="ap-card-actions">
                    <button
                        type="button"
                        className={cn("ap-btn", action.card.danger && "is-danger")}
                        onClick={onConfirm}
                        disabled={busy}
                    >
                        {busy && <Loader2 className="h-3 w-3 animate-spin" style={{ marginRight: 6 }} />}
                        {action.card.confirmLabel}
                    </button>
                    <button type="button" className="ap-btn is-ghost" onClick={onCancel} disabled={busy}>
                        Annuler
                    </button>
                </div>
            )}

            {action.state === "cancelled" && (
                <p className="ap-outcome">
                    <X className="inline h-3 w-3" /> Action annulée
                </p>
            )}
            {action.state === "confirmed" && (
                <p className="ap-outcome">
                    <Check className="inline h-3 w-3" /> {action.outcome ?? "Action exécutée"}
                </p>
            )}
            {action.state === "failed" && (
                <p className="ap-outcome is-error">{action.outcome ?? "L'action a échoué"}</p>
            )}
        </div>
    );
}

// ============================================
// PANEL
// ============================================

export default function AssistantProjetPanel({
    fixedClientId,
    fixedMissionId,
    className,
    onDataChanged,
}: AssistantProjetPanelProps) {
    const [clients, setClients] = useState<ClientOption[]>([]);
    const [clientId, setClientId] = useState(fixedClientId ?? "");
    const [missionId, setMissionId] = useState(fixedMissionId ?? "");

    const [conversationId, setConversationId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [busyMessageId, setBusyMessageId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const threadRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const activeClient = useMemo(
        () => clients.find((c) => c.id === clientId) ?? null,
        [clients, clientId],
    );

    // ── Scope + history ───────────────────────────────────────────────────────

    const loadScope = useCallback(async () => {
        setIsLoading(true);
        try {
            const query = new URLSearchParams();
            if (clientId) query.set("clientId", clientId);
            if (missionId) query.set("missionId", missionId);

            const response = await fetch(`/api/manager/assistant/conversations?${query}`);
            const payload = await response.json();
            if (!response.ok) throw new Error(payload?.error ?? "Chargement impossible");

            const data = payload.data ?? payload;
            setClients(data.clients ?? []);
            setConversationId(data.conversationId ?? null);
            setMessages(
                (data.messages ?? []).map((m: Message) => ({
                    id: m.id,
                    role: m.role,
                    content: m.content,
                    trace: m.trace ?? null,
                    action: m.action ?? null,
                })),
            );
        } catch {
            setMessages([]);
        } finally {
            setIsLoading(false);
        }
    }, [clientId, missionId]);

    useEffect(() => {
        void loadScope();
    }, [loadScope]);

    // Live timer while the model works — a tool loop can take several seconds,
    // and silence reads as a hang.
    useEffect(() => {
        if (!isSending) {
            setElapsedMs(0);
            return;
        }
        const startedAt = Date.now();
        const tick = setInterval(() => setElapsedMs(Date.now() - startedAt), 100);
        return () => clearInterval(tick);
    }, [isSending]);

    useEffect(() => {
        threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
    }, [messages, isSending]);

    // ── Conversation ──────────────────────────────────────────────────────────

    const ensureConversation = useCallback(async (): Promise<string | null> => {
        if (conversationId) return conversationId;

        const response = await fetch("/api/manager/assistant/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                clientId: clientId || null,
                missionId: clientId ? missionId || null : null,
            }),
        });
        const payload = await response.json();
        if (!response.ok) return null;

        const id = (payload.data ?? payload).conversation.id as string;
        setConversationId(id);
        return id;
    }, [conversationId, clientId, missionId]);

    const startNewThread = useCallback(async () => {
        setConversationId(null);
        setMessages([]);
        await ensureConversation();
    }, [ensureConversation]);

    const send = useCallback(
        async (text: string) => {
            const question = text.trim();
            if (!question || isSending) return;

            const id = await ensureConversation();
            if (!id) return;

            setMessages((prev) => [
                ...prev,
                { id: `local-${Date.now()}`, role: "USER", content: question },
            ]);
            setInput("");
            setIsSending(true);

            try {
                const response = await fetch("/api/manager/assistant/chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ conversationId: id, message: question }),
                });
                const payload = await response.json();
                if (!response.ok) throw new Error(payload?.error ?? "L'assistant n'a pas pu répondre");

                const data = payload.data ?? payload;
                setMessages((prev) => [
                    ...prev,
                    {
                        id: data.messageId,
                        role: "ASSISTANT",
                        content: data.answer,
                        trace: data.trace ?? null,
                        action: data.pendingAction ?? null,
                    },
                ]);
            } catch (error) {
                setMessages((prev) => [
                    ...prev,
                    {
                        id: `err-${Date.now()}`,
                        role: "ASSISTANT",
                        content:
                            error instanceof Error ? error.message : "L'assistant n'a pas pu répondre.",
                    },
                ]);
            } finally {
                setIsSending(false);
            }
        },
        [ensureConversation, isSending],
    );

    // ── Actions ───────────────────────────────────────────────────────────────

    const decide = useCallback(
        async (message: Message, decision: "confirm" | "cancel") => {
            if (!message.action || !conversationId) return;
            setBusyMessageId(message.id);

            try {
                const response = await fetch("/api/manager/assistant/execute", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        conversationId,
                        messageId: message.id,
                        decision,
                    }),
                });
                const payload = await response.json();
                if (!response.ok) throw new Error(payload?.error ?? "L'action a échoué");

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
                            : m,
                    ),
                );
                if (data.refresh) onDataChanged?.();
            } catch (error) {
                const detail = error instanceof Error ? error.message : "L'action a échoué";
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === message.id && m.action
                            ? { ...m, action: { ...m.action, state: "failed", outcome: detail } }
                            : m,
                    ),
                );
            } finally {
                setBusyMessageId(null);
            }
        },
        [conversationId, onDataChanged],
    );

    const clearSecret = useCallback((id: string) => {
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, secret: null } : m)));
    }, []);

    // ── Render ────────────────────────────────────────────────────────────────

    const scopeLabel = activeClient
        ? missionId
            ? `${activeClient.name} — ${activeClient.missions.find((m) => m.id === missionId)?.name ?? ""}`
            : `${activeClient.name} — toutes missions`
        : "Vue agence — tous les clients";

    return (
        <div className={cn("ap-root", className)}>
            <header className="ap-header">
                <span className="ap-mark">
                    <Sparkles className="h-4 w-4" />
                </span>
                <span className="ap-titles">
                    <span className="ap-title">Assistant Projet</span>
                    <span className="ap-subtitle">{scopeLabel}</span>
                </span>
                <button
                    type="button"
                    className="ap-icon-btn"
                    onClick={startNewThread}
                    title="Nouvelle conversation"
                    aria-label="Nouvelle conversation"
                >
                    <MessageSquarePlus className="h-4 w-4" />
                </button>
            </header>

            <div className="ap-scope">
                <span className="ap-scope-label">Projet</span>

                {!fixedClientId && (
                    <select
                        id="ap-client"
                        className="ap-select"
                        value={clientId}
                        onChange={(e) => {
                            setClientId(e.target.value);
                            setMissionId("");
                            setConversationId(null);
                            setMessages([]);
                        }}
                        aria-label="Client"
                    >
                        <option value="">Vue agence (tous les clients)</option>
                        {clients.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name}
                            </option>
                        ))}
                    </select>
                )}

                {!fixedMissionId && (
                <select
                    id="ap-mission"
                    className="ap-select"
                    value={missionId}
                    onChange={(e) => {
                        setMissionId(e.target.value);
                        setConversationId(null);
                        setMessages([]);
                    }}
                    disabled={!activeClient}
                    aria-label="Mission"
                >
                    <option value="">Toutes les missions</option>
                    {activeClient?.missions.map((m) => (
                        <option key={m.id} value={m.id}>
                            {m.name}
                        </option>
                    ))}
                </select>
                )}
            </div>

            <div ref={threadRef} className="ap-thread" role="log" aria-live="polite">
                {messages.length === 0 && !isLoading && (
                    <div className="ap-welcome">
                        <span className="ap-welcome-mark">
                            <Sparkles className="h-6 w-6" />
                        </span>
                        <p className="ap-welcome-title">
                            {clientId ? "Sur quoi je t'aide ?" : "Vue agence"}
                        </p>
                        <p className="ap-welcome-sub">
                            {clientId
                                ? "Je connais ce projet : sa mission, ses documents, ses comptes rendus d'appels, ses accès et ses chiffres. Toute action sensible passe par ta validation."
                                : "Questions transverses : l'état de l'agence, les clients à surveiller, les chiffres consolidés, et comment utiliser le CRM. Choisis un client ci-dessus pour ses accès, ses documents et les actions."}
                        </p>
                        <div className="ap-prompts">
                            {(clientId ? PROJECT_PROMPTS : AGENCY_PROMPTS).map((prompt) => (
                                <button
                                    key={prompt}
                                    type="button"
                                    className="ap-prompt"
                                    onClick={() => void send(prompt)}
                                >
                                    <Sparkles className="h-3.5 w-3.5 shrink-0 opacity-50" />
                                    <span>{prompt}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {messages.map((message) =>
                    message.role === "USER" ? (
                        <div key={message.id} className="ap-row ap-row-user">
                            <div className="ap-bubble-user">{message.content}</div>
                        </div>
                    ) : (
                        <div key={message.id} className="ap-row">
                            {!!message.trace?.length && <ToolTrace trace={message.trace} />}

                            {message.content && message.content !== "—" && (
                                <div className="ap-answer">
                                    <Markdown content={message.content} />
                                </div>
                            )}

                            {message.action && (
                                <ConfirmationCard
                                    action={message.action}
                                    busy={busyMessageId === message.id}
                                    onConfirm={() => void decide(message, "confirm")}
                                    onCancel={() => void decide(message, "cancel")}
                                />
                            )}

                            {message.secret && (
                                <SecretCard
                                    secret={message.secret}
                                    onExpire={() => clearSecret(message.id)}
                                />
                            )}
                        </div>
                    ),
                )}

                {isSending && (
                    <div className="ap-row">
                        <div className="ap-thinking">
                            <span className="ap-orb" aria-hidden="true" />
                            <span>Analyse du projet</span>
                            <span className="ap-thinking-time">{formatSeconds(elapsedMs)}</span>
                        </div>
                        <div className="ap-skeleton" aria-hidden="true">
                            <span style={{ width: "92%" }} />
                            <span style={{ width: "78%" }} />
                            <span style={{ width: "56%" }} />
                        </div>
                    </div>
                )}
            </div>

            <div className="ap-composer">
                <div className="ap-composer-box">
                    <textarea
                        id="ap-input"
                        ref={inputRef}
                        className="ap-input"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                void send(input);
                            }
                        }}
                        rows={1}
                        placeholder={
                            clientId
                                ? "Pose ta question sur ce projet…"
                                : "Pose ta question sur l'agence…"
                        }
                        aria-label="Message à l'assistant"
                    />
                    <div className="ap-composer-bar">
                        <span className="ap-model">
                            <span className="ap-model-dot" aria-hidden="true" />
                            Mistral Large
                        </span>
                        <span className="ap-hint">
                            <kbd>Entrée</kbd> envoyer · <kbd>Maj+Entrée</kbd> ligne
                        </span>
                        <button
                            type="button"
                            className="ap-send"
                            onClick={() => void send(input)}
                            disabled={isSending || !input.trim()}
                            aria-label="Envoyer"
                        >
                            {isSending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M12 19V5M5 12l7-7 7 7" />
                                </svg>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
