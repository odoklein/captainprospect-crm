"use client";

/**
 * « Exporter en PDF » for a whole conversation or for some of its answers:
 * one export at a time, the busy key for the spinner, and the toast.
 */

import { useCallback, useRef, useState } from "react";
import { downloadConversationPdf } from "@/lib/assistant/client/export";
import { useToast } from "@/components/ui/Toast";

/** The busy key of an export: the conversation alone, or its message ids. */
export function pdfExportKey(conversationId: string, messageIds?: string[]): string {
    return messageIds && messageIds.length > 0 ? `${conversationId}:${messageIds.join(",")}` : conversationId;
}

export function usePdfExport() {
    const toast = useToast();
    const [busyKey, setBusyKey] = useState<string | null>(null);
    const runningRef = useRef(false);

    const exportPdf = useCallback(
        async (conversationId: string, messageIds?: string[]) => {
            if (runningRef.current) return;
            runningRef.current = true;
            setBusyKey(pdfExportKey(conversationId, messageIds));
            try {
                await downloadConversationPdf(conversationId, messageIds);
                toast.success("PDF téléchargé");
            } catch (e) {
                const detail = e instanceof Error && e.message ? e.message : "Le PDF n’a pas pu être généré. Réessayez dans un instant.";
                toast.error("Export PDF impossible", detail);
            } finally {
                runningRef.current = false;
                setBusyKey(null);
            }
        },
        [toast],
    );

    return { busyKey, exportPdf };
}
