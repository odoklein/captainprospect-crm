"use client";

// ============================================
// SDR ASSISTANT — client store.
//
// Module-level on purpose: the panel unmounts when it is closed (nothing of it
// renders on the CRM page), but the conversation, the draft in the composer
// and an answer still being written all live here and are there again when
// it reopens. Components read slices with useAssistant(selector), so a
// streamed delta only re-renders the live block, never the message list.
// Deltas are flushed once per animation frame.
// ============================================

import { useSyncExternalStore } from "react";
import type { StreamEvent, TurnPayload } from "@/lib/ai/agent/protocol";
import { readNdjson } from "@/lib/assistant/answer";
import {
    SDR_ASSISTANT_API,
    type SdrAssistantMode,
    type SdrConversationCard,
    type SdrConversationsResponse,
    type SdrMessage,
    type SdrStoredAction,
    type SdrThreadResponse,
} from "@/lib/sdr-assistant/contract";

export interface LiveTurn {
    conversationId: string;
    draft: string;
    /** What the assistant is doing right now, for the status line. */
    activity: string;
    startedAt: number;
}

export interface Failure {
    conversationId: string | null;
    message: string;
    /** The question to send again. */
    text: string;
    /** Local id of the question left on screen, removed on retry. */
    localId: string | null;
}

interface Thread {
    messages: SdrMessage[];
    status: "loading" | "ready" | "error";
    error?: string;
}

export interface AssistantState {
    listStatus: "idle" | "loading" | "ready" | "error";
    listError: string | null;
    mode: SdrAssistantMode | null;
    unavailableReason: string | null;
    conversations: SdrConversationCard[];
    /** null = a new conversation (welcome screen). */
    activeId: string | null;
    threads: Record<string, Thread>;
    view: "chat" | "history";
    live: LiveTurn | null;
    failure: Failure | null;
    /** Message whose action is being confirmed/refused. */
    actionBusyId: string | null;
    composer: string;
    expanded: boolean;
    moreSuggestions: boolean;
}

const INITIAL: AssistantState = {
    listStatus: "idle",
    listError: null,
    mode: null,
    unavailableReason: null,
    conversations: [],
    activeId: null,
    threads: {},
    view: "chat",
    live: null,
    failure: null,
    actionBusyId: null,
    composer: "",
    expanded: false,
    moreSuggestions: false,
};

let state: AssistantState = INITIAL;
const listeners = new Set<() => void>();
let frame: number | null = null;

function emit() {
    listeners.forEach((l) => l());
}

function set(patch: Partial<AssistantState> | ((s: AssistantState) => Partial<AssistantState>)) {
    const next = typeof patch === "function" ? patch(state) : patch;
    state = { ...state, ...next };
    if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
    }
    emit();
}

/** Batched: at most one render per frame while a draft streams. */
function setLive(live: LiveTurn | null) {
    state = { ...state, live };
    if (frame !== null) return;
    frame = requestAnimationFrame(() => {
        frame = null;
        emit();
    });
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function useAssistant<T>(selector: (s: AssistantState) => T): T {
    return useSyncExternalStore(
        subscribe,
        () => selector(state),
        () => selector(INITIAL),
    );
}

export const getAssistantState = () => state;

// ── helpers ──────────────────────────────────────────────────────────────────

async function api<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
    const json = (await res.json().catch(() => null)) as { success?: boolean; data?: T; error?: string } | null;
    if (!res.ok || !json?.success) throw new ApiError(json?.error ?? "Le serveur n'a pas répondu.", res.status);
    return json.data as T;
}

class ApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
    }
}

function patchThread(id: string, fn: (t: Thread) => Thread) {
    set((s) => ({ threads: { ...s.threads, [id]: fn(s.threads[id] ?? { messages: [], status: "ready" }) } }));
}

function touchConversation(id: string, patch: Partial<SdrConversationCard>) {
    set((s) => {
        const current = s.conversations.find((c) => c.id === id);
        const card: SdrConversationCard = { ...(current ?? { id, title: "Nouvelle conversation", lastMessageAt: null, messageCount: 0 }), ...patch };
        return { conversations: [card, ...s.conversations.filter((c) => c.id !== id)] };
    });
}

function titleFrom(text: string) {
    const clean = text.replace(/\[demo:[a-z]+\]/gi, "").trim().replace(/\s+/g, " ");
    return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
}

let localSeq = 0;
const localId = (prefix: string) => `${prefix}-${Date.now()}-${++localSeq}`;

function payloadToMessage(payload: TurnPayload): SdrMessage {
    return {
        id: payload.messageId ?? localId("a"),
        role: "ASSISTANT",
        content: payload.answer || (payload.pendingAction ? "Voici ce que je propose :" : ""),
        createdAt: new Date().toISOString(),
        action: (payload.pendingAction as SdrStoredAction | null) ?? null,
        status: payload.status,
        sources: [...new Set(payload.trace.filter((t) => t.ok).map((t) => t.label))],
    };
}

// ── actions ──────────────────────────────────────────────────────────────────

let listPromise: Promise<void> | null = null;

/** Loads mode + history. Cheap and idempotent; `force` refreshes it. */
export function loadConversations(force = false): Promise<void> {
    if (listPromise && !force) return listPromise;
    if (state.listStatus === "idle" || state.listStatus === "error") set({ listStatus: "loading", listError: null });
    listPromise = api<SdrConversationsResponse>(SDR_ASSISTANT_API.conversations)
        .then((data) => {
            set({
                listStatus: "ready",
                mode: data.mode,
                unavailableReason: data.unavailableReason,
                // Keep a conversation created locally that the server has not listed yet.
                conversations: [
                    ...state.conversations.filter((c) => !data.conversations.some((d) => d.id === c.id) && c.messageCount > 0),
                    ...data.conversations,
                ],
            });
        })
        .catch((error: Error) => {
            listPromise = null;
            set({ listStatus: "error", listError: error.message });
        });
    return listPromise;
}

export function newConversation() {
    if (state.live) return;
    set({ activeId: null, view: "chat", failure: null, moreSuggestions: false });
}

export async function openConversation(id: string) {
    set({ activeId: id, view: "chat", failure: state.failure?.conversationId === id ? state.failure : null });
    const thread = state.threads[id];
    if (thread && thread.status !== "error") return;
    patchThread(id, () => ({ messages: [], status: "loading" }));
    try {
        const data = await api<SdrThreadResponse>(SDR_ASSISTANT_API.conversation(id));
        patchThread(id, () => ({ messages: data.messages, status: "ready" }));
    } catch (error) {
        patchThread(id, () => ({ messages: [], status: "error", error: (error as Error).message }));
    }
}

export async function deleteConversation(id: string) {
    await api(SDR_ASSISTANT_API.conversation(id), { method: "DELETE" });
    set((s) => {
        const threads = { ...s.threads };
        delete threads[id];
        return {
            conversations: s.conversations.filter((c) => c.id !== id),
            threads,
            activeId: s.activeId === id ? null : s.activeId,
        };
    });
}

export const setView = (view: AssistantState["view"]) => set({ view });
export const setComposer = (composer: string) => set({ composer });
export const toggleExpanded = () => set((s) => ({ expanded: !s.expanded }));
export const toggleMoreSuggestions = () => set((s) => ({ moreSuggestions: !s.moreSuggestions }));
export const dismissFailure = () => set({ failure: null });

let controller: AbortController | null = null;

const ACTIVITY: Record<string, string> = {
    connecting: "Connexion…",
    thinking: "Réflexion…",
    tools: "Consultation du CRM…",
    writing: "Rédaction…",
    verifying: "Vérification des chiffres…",
    repairing: "Correction…",
};

export async function send(rawText: string): Promise<boolean> {
    const text = rawText.trim();
    if (!text || state.live || state.mode === "unavailable") return false;

    set({ failure: null, view: "chat", composer: state.composer.trim() === text ? "" : state.composer });

    let conversationId = state.activeId;
    if (!conversationId) {
        try {
            const card = await api<SdrConversationCard>(SDR_ASSISTANT_API.conversations, { method: "POST", body: "{}" });
            conversationId = card.id;
            set((s) => ({ activeId: card.id, threads: { ...s.threads, [card.id]: { messages: [], status: "ready" } } }));
        } catch (error) {
            set({ failure: { conversationId: null, message: (error as Error).message, text, localId: null } });
            return false;
        }
    }
    const id = conversationId;

    const question: SdrMessage = { id: localId("q"), role: "USER", content: text, createdAt: new Date().toISOString(), action: null };
    patchThread(id, (t) => ({ ...t, messages: [...t.messages, question] }));
    const first = (state.conversations.find((c) => c.id === id)?.messageCount ?? 0) === 0;
    touchConversation(id, { lastMessageAt: question.createdAt, ...(first ? { title: titleFrom(text) } : {}) });

    const abort = new AbortController();
    controller = abort;
    let live: LiveTurn = { conversationId: id, draft: "", activity: ACTIVITY.connecting, startedAt: Date.now() };
    set({ live });

    try {
        const res = await fetch(SDR_ASSISTANT_API.chat, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ conversationId: id, message: text, stream: true }),
            signal: abort.signal,
        });
        if (!res.ok || !res.body) {
            const json = (await res.json().catch(() => null)) as { error?: string } | null;
            throw new ApiError(json?.error ?? "L'assistant n'a pas pu répondre.", res.status);
        }

        let final: TurnPayload | null = null;
        let streamError: string | null = null;
        await readNdjson(res.body, (event: StreamEvent) => {
            switch (event.type) {
                case "final":
                    final = event.payload;
                    break;
                case "error":
                    if (event.payload) final = event.payload;
                    streamError = event.error.message;
                    break;
                case "delta":
                    live = { ...live, draft: live.draft + event.text, activity: ACTIVITY.writing };
                    setLive(live);
                    break;
                case "reset":
                    live = { ...live, draft: "" };
                    setLive(live);
                    break;
                case "phase":
                    live = { ...live, activity: ACTIVITY[event.phase] ?? live.activity };
                    setLive(live);
                    break;
                case "tool_start":
                    live = { ...live, activity: `${event.label}…` };
                    setLive(live);
                    break;
                default:
                    break;
            }
        });

        if (abort.signal.aborted) return false;
        const payload = final as TurnPayload | null;
        if (!payload) throw new ApiError(streamError ?? "La réponse a été interrompue.", 0);

        const answer = payloadToMessage(payload);
        if (payload.status === "failed" || payload.status === "timeout" || (streamError && !payload.answer)) {
            // Saved server-side as a failed turn: show it as one, with a retry.
            answer.status = payload.status === "timeout" ? "timeout" : "failed";
            answer.content = streamError ?? (payload.answer || "L'assistant n'a pas pu répondre.");
        }
        patchThread(id, (t) => ({ ...t, messages: [...t.messages, answer] }));
        touchConversation(id, {
            lastMessageAt: answer.createdAt,
            messageCount: (state.conversations.find((c) => c.id === id)?.messageCount ?? 0) + 2,
        });
        return true;
    } catch (error) {
        if (abort.signal.aborted) return false;
        // Nothing was saved (refused before the turn, or the connection broke):
        // the question stays on screen with a retry.
        set({ failure: { conversationId: id, message: (error as Error).message || "Erreur de connexion.", text, localId: question.id } });
        return false;
    } finally {
        if (controller === abort) {
            controller = null;
            if (frame !== null) {
                cancelAnimationFrame(frame);
                frame = null;
            }
            set({ live: null });
        }
    }
}

/** Stops the answer being written. The server saves the turn as interrupted. */
export function stop() {
    const live = state.live;
    if (!controller || !live) return;
    controller.abort();
    controller = null;
    const draft = live.draft.trim();
    const stopped: SdrMessage = {
        id: localId("stopped"),
        role: "ASSISTANT",
        content: draft ? `${draft}\n\n*(Réponse interrompue.)*` : "*Réponse interrompue.*",
        createdAt: new Date().toISOString(),
        action: null,
        status: "cancelled",
    };
    patchThread(live.conversationId, (t) => ({ ...t, messages: [...t.messages, stopped] }));
    touchConversation(live.conversationId, {
        messageCount: (state.conversations.find((c) => c.id === live.conversationId)?.messageCount ?? 0) + 2,
    });
    set({ live: null });
}

/** Sends the failed question again (removing the copy left on screen). */
export function retry() {
    const failure = state.failure;
    if (!failure) return;
    if (failure.conversationId && failure.localId) {
        patchThread(failure.conversationId, (t) => ({ ...t, messages: t.messages.filter((m) => m.id !== failure.localId) }));
    }
    set({ failure: null });
    void send(failure.text);
}

/** Retry of a saved failed answer: ask the same question again. */
export function resend(text: string) {
    void send(text);
}

export async function decideAction(messageId: string, decision: "confirm" | "cancel") {
    const id = state.activeId;
    if (!id || state.actionBusyId) return;
    const setAction = (patch: Partial<SdrStoredAction>) =>
        patchThread(id, (t) => ({
            ...t,
            messages: t.messages.map((m) => (m.id === messageId && m.action ? { ...m, action: { ...m.action, ...patch } } : m)),
        }));
    set({ actionBusyId: messageId });
    try {
        const data = await api<{ state: "confirmed" | "cancelled"; message?: string }>(SDR_ASSISTANT_API.execute, {
            method: "POST",
            body: JSON.stringify({ conversationId: id, messageId, decision }),
        });
        setAction({ state: data.state, outcome: data.message });
    } catch (error) {
        const e = error as ApiError;
        if (e.status === 409) {
            // Already handled elsewhere (another tab): show the stored truth.
            set((s) => {
                const threads = { ...s.threads };
                delete threads[id];
                return { threads };
            });
            void openConversation(id);
        } else {
            setAction({ state: "failed", outcome: e.message });
        }
    } finally {
        set({ actionBusyId: null });
    }
}
