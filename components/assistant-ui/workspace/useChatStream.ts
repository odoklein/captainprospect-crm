"use client";

/**
 * The NDJSON streaming client of the chat route (lib/ai/agent/protocol.ts),
 * lifted out of the old ChatWorkspace.
 *
 * - The live turn lives in a tiny external store, flushed once per animation
 *   frame: only the components that read it (useLiveTurn) re-render on each
 *   delta, never the rail or the shell.
 * - The thread is edited in the SWR cache: optimistic question (or the edit /
 *   regenerate cut), the final answer appended in place, rollback to the
 *   snapshot when the turn fails before an answer. After a turn, one merge
 *   refresh of the thread brings the server ids and title; the rail is never
 *   refetched.
 * - Stop closes the stream (the route cancels and saves the turn) and keeps
 *   what was already written on screen.
 * - It lives above the threads, so switching conversation does not cut an
 *   answer being written.
 * - Hand-over (thread/handover.ts): each send mints a turn key; the saved
 *   answer's id is bound to it and the snapshot is « settled » with that
 *   answer before the thread receives it, so the live block and the saved
 *   message are one React element that updates in place — never a remount.
 */

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ASSISTANT_API, type ChatBodyExtras, type ThreadMessage } from "@/lib/assistant/api-contract";
import type { StreamEvent, TurnPayload } from "@/lib/ai/agent/protocol";
import { readNdjson, splitFollowUps } from "@/lib/assistant/answer";
import { useThreadActions } from "@/lib/assistant/client/thread-hooks";
import type { LiveTurnState } from "../LiveTurn";
import {
    EMPTY_LIVE,
    appendMessage,
    applyOptimisticSend,
    liveReducer,
    localUserMessage,
    payloadToMessage,
    previewOf,
} from "./thread/model";
import { nextTurnKey, renderKeys } from "./thread/handover";

export interface SendOptions {
    conversationId: string;
    text: string;
    deep: boolean;
    attachments?: Array<{ fileId: string; name: string; status: string }>;
    regenerateMessageId?: string;
    editMessageId?: string;
}

export type SendOutcome =
    | { ok: true; answerId: string }
    | { ok: false; error: string; aborted?: boolean; busy?: boolean };

export interface LiveSnapshot {
    conversationId: string;
    /** Render key of this turn, shared by the live block and the saved answer. */
    turnKey: string;
    state: LiveTurnState;
    startedAt: number;
    deep: boolean;
    /** The saved answer, set the moment the final payload lands (before the thread has it). */
    settled: ThreadMessage | null;
}

export interface FailedTurn {
    conversationId: string;
    message: string;
    options: SendOptions;
}

interface LiveStore {
    get(): LiveSnapshot | null;
    set(next: LiveSnapshot | null): void;
    subscribe(listener: () => void): () => void;
}

function createLiveStore(): LiveStore {
    let value: LiveSnapshot | null = null;
    const listeners = new Set<() => void>();
    return {
        get: () => value,
        set(next) {
            value = next;
            listeners.forEach((l) => l());
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}

export interface ChatStream {
    store: LiveStore;
    /** Conversation whose answer is being written, or null. */
    sendingFor: string | null;
    failures: Record<string, FailedTurn>;
    send(options: SendOptions): Promise<SendOutcome>;
    stop(): void;
    clearFailure(conversationId: string): void;
}

const NULL_SNAPSHOT = () => null;

/** The live turn of one conversation (null when it is not the one streaming). */
export function useLiveTurn(stream: ChatStream, conversationId: string | null): LiveSnapshot | null {
    const getSnapshot = useCallback(() => {
        const snap = stream.store.get();
        return snap && snap.conversationId === conversationId ? snap : null;
    }, [stream.store, conversationId]);
    return useSyncExternalStore(stream.store.subscribe, getSnapshot, NULL_SNAPSHOT);
}

export function useChatStream(): ChatStream {
    const actions = useThreadActions();
    const storeRef = useRef<LiveStore | null>(null);
    if (!storeRef.current) storeRef.current = createLiveStore();
    const store = storeRef.current;

    const [sendingFor, setSendingFor] = useState<string | null>(null);
    const [failures, setFailures] = useState<Record<string, FailedTurn>>({});
    const abortRef = useRef<AbortController | null>(null);
    const liveRef = useRef<LiveSnapshot | null>(null);
    const frameRef = useRef<number | null>(null);

    const flushNow = useCallback(() => {
        if (frameRef.current !== null) {
            cancelAnimationFrame(frameRef.current);
            frameRef.current = null;
        }
        store.set(liveRef.current);
    }, [store]);

    const publish = useCallback(() => {
        if (frameRef.current !== null) return;
        frameRef.current = requestAnimationFrame(() => {
            frameRef.current = null;
            store.set(liveRef.current);
        });
    }, [store]);

    const clearFailure = useCallback((conversationId: string) => {
        setFailures((prev) => {
            if (!(conversationId in prev)) return prev;
            const next = { ...prev };
            delete next[conversationId];
            return next;
        });
    }, []);

    const send = useCallback(
        async (options: SendOptions): Promise<SendOutcome> => {
            if (abortRef.current) return { ok: false, busy: true, error: "Une réponse est déjà en cours d’écriture." };
            const { conversationId } = options;
            const prompt = options.text.trim();
            if (!prompt && !options.regenerateMessageId) return { ok: false, error: "Message vide." };

            const controller = new AbortController();
            abortRef.current = controller;
            clearFailure(conversationId);

            const snapshot = actions.getThread(conversationId);
            const now = new Date().toISOString();
            const question: ThreadMessage | null = options.regenerateMessageId
                ? null
                : localUserMessage(`local-${Date.now()}`, prompt, options.attachments ?? null, now);
            actions.updateThread(conversationId, (t) => applyOptimisticSend(t, question, options));

            const turnKey = nextTurnKey();
            renderKeys.markStreamed(turnKey);
            liveRef.current = { conversationId, turnKey, state: EMPTY_LIVE, startedAt: Date.now(), deep: options.deep, settled: null };
            flushNow();
            setSendingFor(conversationId);

            const extras: ChatBodyExtras = {};
            if (options.attachments?.length) extras.attachmentFileIds = options.attachments.map((a) => a.fileId);
            if (options.regenerateMessageId) extras.regenerateMessageId = options.regenerateMessageId;
            if (options.editMessageId) extras.editMessageId = options.editMessageId;

            try {
                const res = await fetch(ASSISTANT_API.chat, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        conversationId,
                        message: prompt,
                        depth: options.deep ? "deep" : "standard",
                        stream: true,
                        ...extras,
                    }),
                    signal: controller.signal,
                });
                // Refusals before the turn starts (busy, not configured) are plain JSON.
                if (!res.ok || !res.body) {
                    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
                    throw new Error(payload?.error ?? "L’assistant n’a pas pu répondre.");
                }

                let final: TurnPayload | null = null;
                let failure: string | null = null;
                await readNdjson(res.body, (event: StreamEvent) => {
                    if (event.type === "final") {
                        final = event.payload;
                    } else if (event.type === "error") {
                        if (event.payload) final = event.payload;
                        else failure = event.error.message;
                    } else if (liveRef.current && liveRef.current.conversationId === conversationId) {
                        liveRef.current = { ...liveRef.current, state: liveReducer(liveRef.current.state, event) };
                        publish();
                    }
                });

                if (controller.signal.aborted) return { ok: false, aborted: true, error: "" };
                const payload = final as TurnPayload | null;
                if (!payload) throw new Error(failure ?? "La réponse a été interrompue.");

                const answer = payloadToMessage(payload, `a-${Date.now()}`, new Date().toISOString());
                // Hand-over: same key, the live block settles on the saved answer
                // first, then the thread row (same key) takes over in place.
                renderKeys.bind(answer.id, turnKey);
                if (liveRef.current && liveRef.current.turnKey === turnKey) {
                    liveRef.current = { ...liveRef.current, settled: answer };
                    flushNow();
                }
                actions.updateThread(conversationId, (t) => appendMessage(t, answer));
                const card = actions.getThread(conversationId)?.conversation;
                if (card) {
                    actions.syncConversation(
                        {
                            ...card,
                            lastMessageAt: answer.createdAt,
                            preview: previewOf(answer.content),
                            messageCount: options.regenerateMessageId ? card.messageCount : card.messageCount + 2,
                        },
                        true,
                    );
                }
                actions.bumpUsage(payload.usage?.costEur ?? 0);
                // Server ids for the question, the title the route may have set.
                void actions.refreshThread(conversationId);
                return { ok: true, answerId: answer.id };
            } catch (err) {
                if (controller.signal.aborted) return { ok: false, aborted: true, error: "" };
                actions.setThread(conversationId, snapshot);
                const message = err instanceof Error && err.message ? err.message : "Erreur de communication avec l’assistant.";
                setFailures((prev) => ({ ...prev, [conversationId]: { conversationId, message, options: { ...options, text: prompt } } }));
                return { ok: false, error: message };
            } finally {
                if (abortRef.current === controller) {
                    abortRef.current = null;
                    liveRef.current = null;
                    flushNow();
                    setSendingFor(null);
                }
            }
        },
        [actions, clearFailure, flushNow, publish],
    );

    // Closing the stream cancels the turn on the server (the route aborts it
    // and saves it as cancelled). What was already written stays on screen.
    const stop = useCallback(() => {
        const live = liveRef.current;
        const controller = abortRef.current;
        if (!controller || !live) return;
        const draft = splitFollowUps(live.state.draft).body.trim();
        controller.abort();
        abortRef.current = null;
        const stopped: ThreadMessage = {
            id: `stopped-${Date.now()}`,
            role: "ASSISTANT",
            content: draft ? `${draft}\n\n*(Réponse interrompue.)*` : "*Réponse interrompue.*",
            createdAt: new Date().toISOString(),
            trace: {
                // The lookups already done stay listed, as on a finished answer.
                entries: live.state.steps
                    .filter((s) => s.state !== "running")
                    .map((s) => ({ tool: s.tool, label: s.label, ok: s.state === "ok", durationMs: s.durationMs ?? 0 })),
                visuals: live.state.visuals,
                status: "cancelled",
            },
            action: null,
            attachments: null,
            feedback: null,
        };
        // Same hand-over as a final answer: the thread row takes the turn's key.
        renderKeys.bind(stopped.id, live.turnKey);
        liveRef.current = { ...live, settled: stopped };
        flushNow();
        actions.updateThread(live.conversationId, (t) => appendMessage(t, stopped));
        liveRef.current = null;
        flushNow();
        setSendingFor(null);
    }, [actions, flushNow]);

    return useMemo(
        () => ({ store, sendingFor, failures, send, stop, clearFailure }),
        [store, sendingFor, failures, send, stop, clearFailure],
    );
}
