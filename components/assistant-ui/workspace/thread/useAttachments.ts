"use client";

/**
 * Files joined to the next message: uploaded to the thread's folder
 * (ASSISTANT_API.folderFiles), then polled until their text is extracted.
 * A thread without a folder (agency view) cannot take attachments.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
    ASSISTANT_API,
    FILE_ACCEPT,
    FILE_MAX_BYTES,
    type FileTextStatus,
    type FolderFilesResponse,
    type UploadFilesResponse,
} from "@/lib/assistant/api-contract";
import { apiGet, apiUpload } from "@/lib/assistant/client/fetcher";

export type AttachmentStatus = "uploading" | "error" | FileTextStatus;

export interface AttachmentItem {
    key: string;
    name: string;
    size: number;
    status: AttachmentStatus;
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
    useEffect(() => {
        rejectedRef.current = onRejected;
    }, [onRejected]);

    const add = useCallback(
        async (files: File[]) => {
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
                ...accepted.map(({ key, file }) => ({ key, name: file.name, size: file.size, status: "uploading" as const, fileId: null, error: null })),
            ]);
            const form = new FormData();
            for (const { file } of accepted) form.append("file", file);
            try {
                const res = await apiUpload<UploadFilesResponse>(ASSISTANT_API.folderFiles(folderId), form);
                const byName = new Map(res.files.map((f) => [f.name, f]));
                const rejected = new Map(res.rejected.map((r) => [r.name, r.reason]));
                setItems((prev) =>
                    prev.map((item) => {
                        const mine = accepted.find((a) => a.key === item.key);
                        if (!mine) return item;
                        const uploaded = byName.get(item.name) ?? res.files[accepted.indexOf(mine)] ?? null;
                        const reason = rejected.get(item.name);
                        if (reason || !uploaded) {
                            const why = reason ?? "Le fichier n’a pas été accepté.";
                            rejectedRef.current?.(item.name, why);
                            return { ...item, status: "error", error: why };
                        }
                        return { ...item, status: uploaded.status, fileId: uploaded.fileId, error: uploaded.error };
                    }),
                );
            } catch (error) {
                const why = error instanceof Error ? error.message : "Envoi impossible.";
                setItems((prev) => prev.map((item) => (accepted.some((a) => a.key === item.key) ? { ...item, status: "error", error: why } : item)));
                rejectedRef.current?.(accepted.length === 1 ? accepted[0].file.name : `${accepted.length} fichiers`, why);
            }
        },
        [folderId],
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

    const remove = useCallback((key: string) => setItems((prev) => prev.filter((i) => i.key !== key)), []);
    const clear = useCallback(() => setItems([]), []);

    const ready = items.filter((i) => i.fileId && i.status !== "error");
    const uploading = items.some((i) => i.status === "uploading");

    return { items, add, remove, clear, ready, uploading };
}
