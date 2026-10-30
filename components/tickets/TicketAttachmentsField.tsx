"use client";

/**
 * Screenshots for a ticket: drag and drop (anywhere on the page while the
 * drawer is open), click to browse, or paste straight from the clipboard.
 *
 * Files stay in the browser until the ticket exists, then `uploadAll` sends
 * them one by one to `/api/tickets/[id]/attachments`. A failed upload never
 * costs the user their ticket — the caller is told how many went missing.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui";
import {
    TICKET_ATTACHMENT_MAX_COUNT,
    TICKET_ATTACHMENT_MAX_SIZE,
    TICKET_ATTACHMENT_MIME_TYPES,
    formatAttachmentSize,
    isTicketAttachmentType,
} from "@/lib/tickets/attachments";

export interface DraftAttachment {
    id: string;
    file: File;
    /** Object URL for the local thumbnail; revoked when the draft is dropped. */
    previewUrl: string;
}

export interface TicketAttachmentsController {
    items: DraftAttachment[];
    /** Room left for new images, counting what the ticket already holds. */
    remaining: number;
    addFiles: (files: FileList | File[] | null | undefined) => void;
    remove: (id: string) => void;
    clear: () => void;
    /** Uploads every draft to the ticket; resolves with how many failed. */
    uploadAll: (ticketId: string) => Promise<{ failed: number }>;
}

const ACCEPT = TICKET_ATTACHMENT_MIME_TYPES.join(",");

export function useTicketAttachments(alreadyAttached = 0): TicketAttachmentsController {
    const toast = useToast();
    const [items, setItems] = useState<DraftAttachment[]>([]);

    // Live copy so unmount can revoke object URLs without re-running the effect.
    const itemsRef = useRef<DraftAttachment[]>([]);
    useEffect(() => {
        itemsRef.current = items;
    }, [items]);
    useEffect(() => {
        return () => {
            for (const item of itemsRef.current) URL.revokeObjectURL(item.previewUrl);
        };
    }, []);

    const remaining = Math.max(0, TICKET_ATTACHMENT_MAX_COUNT - alreadyAttached - items.length);

    const addFiles = useCallback(
        (files: FileList | File[] | null | undefined) => {
            const list = Array.from(files ?? []);
            if (!list.length) return;

            const room = Math.max(0, TICKET_ATTACHMENT_MAX_COUNT - alreadyAttached - itemsRef.current.length);
            const accepted: DraftAttachment[] = [];
            let wrongType = 0;
            let tooBig = 0;
            let overflow = 0;

            for (const file of list) {
                if (!isTicketAttachmentType(file.type)) {
                    wrongType++;
                } else if (file.size > TICKET_ATTACHMENT_MAX_SIZE) {
                    tooBig++;
                } else if (accepted.length >= room) {
                    overflow++;
                } else {
                    accepted.push({
                        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                        file,
                        previewUrl: URL.createObjectURL(file),
                    });
                }
            }

            if (wrongType) toast.error("Seules les images (PNG, JPEG, WebP, GIF) sont acceptées");
            if (tooBig) toast.error(`Image trop lourde (max ${formatAttachmentSize(TICKET_ATTACHMENT_MAX_SIZE)})`);
            if (overflow) toast.error(`Maximum ${TICKET_ATTACHMENT_MAX_COUNT} captures par ticket`);
            if (accepted.length) setItems((current) => [...current, ...accepted]);
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [alreadyAttached],
    );

    const remove = useCallback((id: string) => {
        setItems((current) => {
            const target = current.find((item) => item.id === id);
            if (target) URL.revokeObjectURL(target.previewUrl);
            return current.filter((item) => item.id !== id);
        });
    }, []);

    const clear = useCallback(() => {
        setItems((current) => {
            for (const item of current) URL.revokeObjectURL(item.previewUrl);
            return [];
        });
    }, []);

    const uploadAll = useCallback(async (ticketId: string) => {
        let failed = 0;
        // One at a time: screenshots are a few MB each and the server stores
        // them synchronously, so parallel requests only buy timeouts.
        for (const item of itemsRef.current) {
            try {
                const form = new FormData();
                form.append("file", item.file, item.file.name || "capture.png");
                const response = await fetch(`/api/tickets/${ticketId}/attachments`, { method: "POST", body: form });
                const result = await response.json().catch(() => null);
                if (!response.ok || !result?.success) failed++;
            } catch {
                failed++;
            }
        }
        return { failed };
    }, []);

    return { items, remaining, addFiles, remove, clear, uploadAll };
}

interface TicketAttachmentsFieldProps {
    controller: TicketAttachmentsController;
    /** Listen for paste and page-wide drops — true while the drawer is open. */
    active: boolean;
    disabled?: boolean;
    /** Images already stored on the ticket (edit mode), shown read-only. */
    existing?: { id: string; name: string; src: string }[];
}

function hasFiles(event: DragEvent): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

export function TicketAttachmentsField({ controller, active, disabled, existing = [] }: TicketAttachmentsFieldProps) {
    const { items, remaining, addFiles, remove } = controller;
    const inputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    // Keep the latest handler without re-subscribing window listeners.
    const addRef = useRef(addFiles);
    useEffect(() => {
        addRef.current = addFiles;
    }, [addFiles]);

    useEffect(() => {
        if (!active || disabled) return;

        // dragenter/dragleave fire for every child element crossed, so a plain
        // boolean flickers; count enters and leaves instead.
        let depth = 0;

        const onEnter = (event: DragEvent) => {
            if (!hasFiles(event)) return;
            depth++;
            setIsDragging(true);
        };
        const onLeave = (event: DragEvent) => {
            if (!hasFiles(event)) return;
            depth = Math.max(0, depth - 1);
            if (depth === 0) setIsDragging(false);
        };
        const onOver = (event: DragEvent) => {
            // Without this the browser would open the dropped image instead.
            if (hasFiles(event)) event.preventDefault();
        };
        const onDrop = (event: DragEvent) => {
            if (!hasFiles(event)) return;
            event.preventDefault();
            depth = 0;
            setIsDragging(false);
            addRef.current(event.dataTransfer?.files);
        };
        const onPaste = (event: ClipboardEvent) => {
            const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith("image/"));
            if (!files.length) return;
            // A pasted screenshot becomes an attachment, never text in the field.
            event.preventDefault();
            addRef.current(files);
        };

        window.addEventListener("dragenter", onEnter);
        window.addEventListener("dragleave", onLeave);
        window.addEventListener("dragover", onOver);
        window.addEventListener("drop", onDrop);
        window.addEventListener("paste", onPaste);
        return () => {
            window.removeEventListener("dragenter", onEnter);
            window.removeEventListener("dragleave", onLeave);
            window.removeEventListener("dragover", onOver);
            window.removeEventListener("drop", onDrop);
            window.removeEventListener("paste", onPaste);
            setIsDragging(false);
        };
    }, [active, disabled]);

    const full = remaining === 0;

    return (
        <div>
            <div className="mb-1.5 flex items-baseline justify-between">
                <label className="text-sm font-medium text-slate-700">Captures d&apos;écran</label>
                <span className="text-xs text-slate-400">Facultatif</span>
            </div>

            <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={disabled || full}
                className={cn(
                    "flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30",
                    isDragging
                        ? "border-primary-500 bg-primary-50"
                        : "border-slate-200 bg-slate-50/60 hover:border-slate-300 hover:bg-slate-50",
                    (disabled || full) && "cursor-not-allowed opacity-60",
                )}
            >
                <ImagePlus className={cn("h-6 w-6", isDragging ? "text-primary-600" : "text-slate-400")} />
                <span className="text-sm font-medium text-slate-700">
                    {isDragging ? "Déposez vos captures ici" : "Glissez vos captures ici"}
                </span>
                <span className="text-xs text-slate-500">
                    {full
                        ? `Maximum ${TICKET_ATTACHMENT_MAX_COUNT} images atteint`
                        : "ou cliquez pour parcourir · vous pouvez aussi coller avec Ctrl+V"}
                </span>
            </button>

            <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                multiple
                hidden
                onChange={(event) => {
                    addFiles(event.target.files);
                    // Reset so picking the same file twice still fires onChange.
                    event.target.value = "";
                }}
            />

            {(existing.length > 0 || items.length > 0) && (
                <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {existing.map((image) => (
                        <li key={image.id} className="aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                            <a href={image.src} target="_blank" rel="noreferrer" title={image.name}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={image.src} alt={image.name} className="h-full w-full object-cover" />
                            </a>
                        </li>
                    ))}
                    {items.map((item) => (
                        <li
                            key={item.id}
                            title={`${item.file.name} · ${formatAttachmentSize(item.file.size)}`}
                            className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={item.previewUrl} alt={item.file.name} className="h-full w-full object-cover" />
                            <button
                                type="button"
                                onClick={() => remove(item.id)}
                                disabled={disabled}
                                aria-label={`Retirer ${item.file.name}`}
                                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
