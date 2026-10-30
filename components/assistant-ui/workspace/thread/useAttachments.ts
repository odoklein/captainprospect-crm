"use client";

/**
 * Files joined to the next message: uploaded one by one to the thread's
 * folder (with upload progress), then polled until their text is extracted.
 * Removing a chip cancels its upload. A thread without a folder (agency view)
 * cannot take attachments.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
    ASSISTANT_API,
    FILE_ACCEPT,
    FILE_MAX_BYTES,
    type FileTextStatus,
    type FolderFilesResponse,
} from "@/lib/assistant/api-contract";
import { apiGet } from "@/lib/assistant/client/fetcher";
import { uploadFolderFile } from "@/lib/assistant/client/folder-hooks";

export type AttachmentStatus = "uploading" | "error" | FileTextStatus;

export interface AttachmentItem {
    key: string;
    name: string;
    size: number;
    status: AttachmentStatus;
    /** Upload progress 0–1 while `uploading`. */
    progress: number;
    fileId: string | null;
    error: string | null;
}

const PENDING: AttachmentStatus[] = ["uploading", "PENDING", "PROCESSING"];
const ACCEPTED_EXT = Object.values(FILE_ACCEPT).flat() as string[];

export function isAttachmentPending(item: AttachmentItem): boolean {
    return PENDING.includes(item.status);
}

function rejectReason(file: File): string | null {
    if (file.size > FILE_MAX_BYTES) return "Fichier trop lourd (25 Mo maximum).";
    const ext = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
    if (!ACCEPTED_EXT.includes(ext)) return "Format non pris en charge.";
    return null;
}

export function useAttachments(folderId: string | null, onRejected?: (name: string, reason: string) => void) {
    const [items, setItems] = useState<AttachmentItem[]>([]);
    const rejectedRef = useRef(onRejected);
    const uploadsRef = useRef(new Map<string, AbortController>());
    useEffect(() => {
        rejectedRef.current = onRejected;
    }, [onRejected]);

    // Leaving the thread cancels what is still uploading.
    useEffect(() => {
        const uploads = uploadsRef.current;
        return () => {
            uploads.forEach((c) => c.abort());
            uploads.clear();
        };
    }, []);

    const patch = useCallback(
        (key: string, next: Partial<AttachmentItem>) => setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...next } : item))),
        [],
    );

    const add = useCallback(
        (files: File[]) => {
            if (!folderId || files.length === 0) return;
            const accepted: Array<{ key: string; file: File }> = [];
            for (const file of files) {
                const reason = rejectReason(file);
                if (reason) {
                    rejectedRef.current?.(file.name, reason);
                    continue;
                }
                accepted.push({ key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`, file });
            }
            if (accepted.length === 0) return;
            setItems((prev) => [
                ...prev,
                ...accepted.map(({ key, file }) => ({ key, name: file.name, size: file.size, status: "uploading" as const, progress: 0, fileId: null, error: null })),
            ]);
            for (const { key, file } of accepted) {
                const controller = new AbortController();
                uploadsRef.current.set(key, controller);
                uploadFolderFile(folderId, file, (fraction) => patch(key, { progress: fraction }), controller.signal)
                    .then((res) => {
                        const uploaded = res.files[0] ?? null;
                        const reason = res.rejected[0]?.reason;
                        if (reason || !uploaded) {
                            const why = reason ?? "Le fichier n’a pas été accepté.";
                            rejectedRef.current?.(file.name, why);
                            patch(key, { status: "error", error: why });
                            return;
                        }
                        patch(key, { status: uploaded.status, fileId: uploaded.fileId, error: uploaded.error, progress: 1 });
                    })
                    .catch((error: unknown) => {
                        if (controller.signal.aborted) return;
                        const why = error instanceof Error ? error.message : "Envoi impossible.";
                        rejectedRef.current?.(file.name, why);
                        patch(key, { status: "error", error: why });
                    })
                    .finally(() => uploadsRef.current.delete(key));
            }
        },
        [folderId, patch],
    );

    // Extraction status, polled while a file is still being read.
    const polling = items.some((i) => i.fileId && (i.status === "PENDING" || i.status === "PROCESSING"));
    useEffect(() => {
        if (!polling || !folderId) return;
        let cancelled = false;
        const tick = async () => {
            try {
                const res = await apiGet<FolderFilesResponse>(ASSISTANT_API.folderFiles(folderId));
                if (cancelled) return;
                const byId = new Map(res.files.map((f) => [f.fileId, f]));
                setItems((prev) =>
                    prev.map((item) => {
                        const f = item.fileId ? byId.get(item.fileId) : undefined;
                        return f && f.status !== item.status ? { ...item, status: f.status, error: f.error } : item;
                    }),
                );
            } catch {
                // Keep the chips as they are; the next tick retries.
            }
        };
        const timer = setInterval(tick, 2500);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [polling, folderId]);

    const remove = useCallback((key: string) => {
        uploadsRef.current.get(key)?.abort();
        uploadsRef.current.delete(key);
        setItems((prev) => prev.filter((i) => i.key !== key));
    }, []);
    const clear = useCallback(() => setItems([]), []);

    const ready = items.filter((i) => i.fileId && i.status !== "error");
    const uploading = items.some((i) => i.status === "uploading");

    return { items, add, remove, clear, ready, uploading };
}
