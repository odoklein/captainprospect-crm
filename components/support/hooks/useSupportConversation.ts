"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supportApi } from "@/lib/support/api";
import type {
    SupportConversationDetailDTO,
    SupportMessageDTO,
} from "@/lib/support/types";

interface UseSupportConversationOptions {
    initialConversation: SupportConversationDetailDTO;
    onUpdate?: (updated: SupportConversationDetailDTO) => void;
}

export function useSupportConversation({
    initialConversation,
    onUpdate,
}: UseSupportConversationOptions) {
    const [conversation, setConversation] = useState<SupportConversationDetailDTO>(initialConversation);
    const [isReopening, setIsReopening] = useState(false);
    const [emailNotif, setEmailNotif] = useState(initialConversation.emailNotificationOnReply);
    const [error, setError] = useState<string | null>(null);

    // Keep ref to latest onUpdate to avoid stale closures
    const onUpdateRef = useRef(onUpdate);
    onUpdateRef.current = onUpdate;

    // Sync when initialConversation changes ID
    useEffect(() => {
        setConversation(initialConversation);
        setEmailNotif(initialConversation.emailNotificationOnReply);
    }, [initialConversation.id, initialConversation.updatedAt]);

    const updateConversationState = useCallback(
        (updater: (prev: SupportConversationDetailDTO) => SupportConversationDetailDTO) => {
            setConversation((prev) => {
                const next = updater(prev);
                onUpdateRef.current?.(next);
                return next;
            });
        },
        [],
    );

    const appendOptimisticMessage = useCallback(
        (tempId: string, content: string, attachments: any[] = [], intent: any = null) => {
            const optimistic: SupportMessageDTO = {
                id: tempId,
                conversationId: conversation.id,
                role: "CLIENT",
                content,
                intent,
                context: null,
                author: null,
                attachments,
                createdAt: new Date().toISOString(),
            };

            updateConversationState((prev) => ({
                ...prev,
                messages: [...prev.messages, optimistic],
                messageCount: prev.messageCount + 1,
                lastMessageAt: optimistic.createdAt,
                status: "ACTIVE",
                resolvedAt: null,
                resolvedBy: null,
            }));

            return optimistic;
        },
        [conversation.id, updateConversationState],
    );

    const reconcileMessage = useCallback(
        (tempId: string, saved: SupportMessageDTO) => {
            updateConversationState((prev) => ({
                ...prev,
                messages: prev.messages.map((m) => (m.id === tempId ? saved : m)),
                lastMessageAt: saved.createdAt,
            }));
        },
        [updateConversationState],
    );

    const rollbackMessage = useCallback(
        (tempId: string, errorMsg: string) => {
            const failureSystemMessage: SupportMessageDTO = {
                id: `sys-err-${crypto.randomUUID()}`,
                conversationId: conversation.id,
                role: "SYSTEM",
                content: `Échec de l'envoi : ${errorMsg}`,
                intent: null,
                context: null,
                author: null,
                attachments: [],
                createdAt: new Date().toISOString(),
            };

            updateConversationState((prev) => ({
                ...prev,
                messages: [
                    ...prev.messages.filter((m) => m.id !== tempId),
                    failureSystemMessage,
                ],
            }));
        },
        [conversation.id, updateConversationState],
    );

    const markRead = useCallback(async () => {
        try {
            await supportApi.markRead(conversation.id);
            setConversation((prev) => (prev.unreadCount > 0 ? { ...prev, unreadCount: 0 } : prev));
        } catch {
            // non-fatal
        }
    }, [conversation.id]);

    const reopen = useCallback(async () => {
        setIsReopening(true);
        setError(null);
        try {
            await supportApi.reopenConversation(conversation.id);
            const refreshed = await supportApi.getConversation(conversation.id);
            if (refreshed) {
                setConversation(refreshed);
                onUpdateRef.current?.(refreshed);
            }
        } catch (err: any) {
            setError(err?.message || "Impossible de rouvrir la conversation");
        } finally {
            setIsReopening(false);
        }
    }, [conversation.id]);

    const toggleEmailNotif = useCallback(async () => {
        const next = !emailNotif;
        setEmailNotif(next);
        try {
            await supportApi.updateEmailNotification(next);
            updateConversationState((prev) => ({
                ...prev,
                emailNotificationOnReply: next,
            }));
        } catch {
            setEmailNotif(!next); // rollback
        }
    }, [emailNotif, updateConversationState]);

    return {
        conversation,
        emailNotif,
        isReopening,
        error,
        appendOptimisticMessage,
        reconcileMessage,
        rollbackMessage,
        markRead,
        reopen,
        toggleEmailNotif,
        setConversationState: updateConversationState,
    };
}
