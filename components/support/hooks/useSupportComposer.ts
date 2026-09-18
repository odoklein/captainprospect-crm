"use client";

import { useCallback, useRef, useState } from "react";
import { supportApi } from "@/lib/support/api";
import { useSupportAttachments } from "../SupportAttachments";
import type {
    SupportIntent,
    SupportMessageContext,
} from "@/lib/support/types";

interface UseSupportComposerOptions {
    conversationId: string;
    pathname?: string | null;
    pageLabel?: string;
    onAppendOptimistic: (tempId: string, content: string, attachments: any[], intent: any) => void;
    onReconcile: (tempId: string, saved: any) => void;
    onRollback: (tempId: string, errorMsg: string) => void;
}

export function useSupportComposer({
    conversationId,
    pathname,
    pageLabel,
    onAppendOptimistic,
    onReconcile,
    onRollback,
}: UseSupportComposerOptions) {
    const [inputValue, setInputValue] = useState("");
    const [selectedIntent, setSelectedIntent] = useState<SupportIntent | null>(null);
    const [isSending, setIsSending] = useState(false);
    const [attachedRdvRefs, setAttachedRdvRefs] = useState<string[]>([]);
    const [contextBannerDismissed, setContextBannerDismissed] = useState(false);
    const [quickRepliesOpen, setQuickRepliesOpen] = useState(false);

    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    const attachments = useSupportAttachments({
        conversationId,
        disabled: isSending,
    });

    const canSend =
        (inputValue.trim().length > 0 || attachments.readyIds.length > 0) &&
        !isSending &&
        !attachments.isUploading;

    const handleAddContextTag = useCallback(() => {
        setContextBannerDismissed(true);
        // Focus composer
        textareaRef.current?.focus();
    }, []);

    const handleAddRdvRef = useCallback((label: string) => {
        setAttachedRdvRefs((prev) => Array.from(new Set([...prev, label])));
        textareaRef.current?.focus();
    }, []);

    const handleRemoveRdvRef = useCallback((label: string) => {
        setAttachedRdvRefs((prev) => prev.filter((r) => r !== label));
    }, []);

    const handleSelectQuickReply = useCallback((reply: string) => {
        setInputValue(reply);
        setQuickRepliesOpen(false);
        textareaRef.current?.focus();
    }, []);

    const sendMessage = useCallback(async () => {
        const text = inputValue.trim();
        const attachmentIds = attachments.readyIds;
        const sentAttachmentDTOs = attachments.pending
            .filter((a) => a.status === "ready" && a.remote)
            .map((a) => a.remote!);

        if ((!text && attachmentIds.length === 0) || isSending || attachments.isUploading) {
            return;
        }

        const tempId = `tmp-${crypto.randomUUID()}`;
        const currentIntent = selectedIntent;
        const currentRdvRefs = [...attachedRdvRefs];

        // 1. Optimistic append
        onAppendOptimistic(tempId, text, sentAttachmentDTOs, currentIntent);

        // 2. Clear input and attachments
        setInputValue("");
        attachments.clear();
        setSelectedIntent(null);
        setAttachedRdvRefs([]);
        setIsSending(true);

        // 3. Build clean structured context
        const contextPayload: SupportMessageContext = {
            pathname: pathname ?? undefined,
            pageLabel: !contextBannerDismissed ? pageLabel : undefined,
            rdvRefs: currentRdvRefs.length > 0 ? currentRdvRefs : undefined,
            intent: currentIntent ?? undefined,
        };

        try {
            const saved = await supportApi.sendMessage({
                conversationId,
                content: text,
                intent: currentIntent ?? undefined,
                context: contextPayload,
                attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
            });

            onReconcile(tempId, saved);
        } catch (err: any) {
            onRollback(tempId, err?.message || "Impossible d'envoyer le message");
        } finally {
            setIsSending(false);
            textareaRef.current?.focus();
        }
    }, [
        inputValue,
        attachments,
        isSending,
        selectedIntent,
        attachedRdvRefs,
        conversationId,
        pathname,
        contextBannerDismissed,
        pageLabel,
        onAppendOptimistic,
        onReconcile,
        onRollback,
    ]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        },
        [sendMessage],
    );

    return {
        inputValue,
        setInputValue,
        selectedIntent,
        setSelectedIntent,
        attachedRdvRefs,
        handleAddRdvRef,
        handleRemoveRdvRef,
        contextBannerDismissed,
        dismissContextBanner: () => setContextBannerDismissed(true),
        handleAddContextTag,
        quickRepliesOpen,
        setQuickRepliesOpen,
        handleSelectQuickReply,
        attachments,
        canSend,
        isSending,
        textareaRef,
        sendMessage,
        handleKeyDown,
    };
}
