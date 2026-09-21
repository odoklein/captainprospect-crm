"use client";

/**
 * Image attachments for the support thread — shared by the client panel and the
 * manager workspace so both sides behave identically.
 *
 * Flow: files picked (or pasted) are uploaded straight away to
 * `POST /api/support/attachments`, which stores them unlinked. Sending the
 * message then hands the resulting ids to the message route, which ties them to
 * the new message. That keeps the send request small and lets the user see the
 * upload progress before committing.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SUP_DARK, SUP_LIGHT } from "./supportStyles";
import {
    SUPPORT_ATTACHMENT_MAX_COUNT,
    SUPPORT_ATTACHMENT_MAX_SIZE,
    SUPPORT_ATTACHMENT_MIME_TYPES,
} from "@/lib/support/types";
import type { SupportAttachmentDTO } from "@/lib/support/types";

type SupportTheme = "light" | "dark";

function tokensFor(theme: SupportTheme) {
    return theme === "light" ? SUP_LIGHT : SUP_DARK;
}

const ACCEPT = SUPPORT_ATTACHMENT_MIME_TYPES.join(",");
const MAX_MB = Math.floor(SUPPORT_ATTACHMENT_MAX_SIZE / (1024 * 1024));

function isAllowedType(type: string): boolean {
    return (SUPPORT_ATTACHMENT_MIME_TYPES as readonly string[]).includes(type);
}

export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export interface PendingAttachment {
    localId: string;
    fileName: string;
    size: number;
    /** Object URL for the local preview; revoked when the entry is dropped. */
    previewUrl: string;
    status: "uploading" | "ready" | "error";
    error?: string;
    remote?: SupportAttachmentDTO;
}

export interface SupportAttachmentsController {
    pending: PendingAttachment[];
    /** Ids of successfully uploaded attachments, ready to send. */
    readyIds: string[];
    /** True while at least one upload is still running. */
    isUploading: boolean;
    addFiles: (files: FileList | File[] | null | undefined) => void;
    remove: (localId: string) => void;
    /** Clear the strip after a successful send (uploads are now owned by the message). */
    clear: () => void;
    /** Drop everything AND delete the stored objects — for abandoned composers. */
    discard: () => void;
    /** Paste handler to wire on the composer textarea. */
    handlePaste: (event: React.ClipboardEvent) => void;
}

/**
 * Reads the natural size of an image file so the bubble can reserve the right
 * aspect ratio before the remote image loads. Best-effort: never rejects.
 */
function readDimensions(file: File): Promise<{ width: number; height: number } | null> {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve({ width: img.naturalWidth, height: img.naturalHeight });
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(null);
        };
        img.src = url;
    });
}

export function useSupportAttachments(options: {
    conversationId: string | null;
    disabled?: boolean;
}): SupportAttachmentsController {
    const { conversationId, disabled } = options;
    const [pending, setPending] = useState<PendingAttachment[]>([]);

    // Keep the live list in a ref so cleanup on unmount can revoke object URLs
    // without re-running the effect on every change.
    const pendingRef = useRef<PendingAttachment[]>([]);
    useEffect(() => {
        pendingRef.current = pending;
    }, [pending]);
    useEffect(() => {
        return () => {
            for (const item of pendingRef.current) URL.revokeObjectURL(item.previewUrl);
        };
    }, []);

    const upload = useCallback(
        async (localId: string, file: File) => {
            try {
                const dimensions = await readDimensions(file);
                const form = new FormData();
                form.append("file", file);
                if (conversationId) form.append("conversationId", conversationId);
                if (dimensions) {
                    form.append("width", String(dimensions.width));
                    form.append("height", String(dimensions.height));
                }

                const res = await fetch("/api/support/attachments", {
                    method: "POST",
                    body: form,
                });
                const json = await res.json();
                if (!res.ok || !json?.success) {
                    throw new Error(json?.error ?? "Échec de l'envoi de l'image");
                }
                const remote = json.data as SupportAttachmentDTO;
                setPending((current) =>
                    current.map((item) =>
                        item.localId === localId
                            ? { ...item, status: "ready", remote }
                            : item,
                    ),
                );
            } catch (err) {
                setPending((current) =>
                    current.map((item) =>
                        item.localId === localId
                            ? {
                                ...item,
                                status: "error",
                                error:
                                    err instanceof Error
                                        ? err.message
                                        : "Échec de l'envoi de l'image",
                            }
                            : item,
                    ),
                );
            }
        },
        [conversationId],
    );

    const addFiles = useCallback(
        (files: FileList | File[] | null | undefined) => {
            if (disabled || !files) return;
            const list = Array.from(files);
            if (list.length === 0) return;

            setPending((current) => {
                const room = SUPPORT_ATTACHMENT_MAX_COUNT - current.length;
                if (room <= 0) return current;

                const accepted: PendingAttachment[] = [];
                for (const file of list.slice(0, room)) {
                    const localId = `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                    const previewUrl = URL.createObjectURL(file);
                    const base = {
                        localId,
                        fileName: file.name || "image",
                        size: file.size,
                        previewUrl,
                    };

                    if (!isAllowedType(file.type)) {
                        accepted.push({
                            ...base,
                            status: "error",
                            error: "Format non supporté (JPEG, PNG, WebP, GIF)",
                        });
                        continue;
                    }
                    if (file.size > SUPPORT_ATTACHMENT_MAX_SIZE) {
                        accepted.push({
                            ...base,
                            status: "error",
                            error: `Image trop lourde (max ${MAX_MB} Mo)`,
                        });
                        continue;
                    }

                    accepted.push({ ...base, status: "uploading" });
                    void upload(localId, file);
                }
                return [...current, ...accepted];
            });
        },
        [disabled, upload],
    );

    const remove = useCallback((localId: string) => {
        setPending((current) => {
            const target = current.find((item) => item.localId === localId);
            if (target) {
                URL.revokeObjectURL(target.previewUrl);
                // Drop the stored object too, so abandoned uploads don't pile up.
                if (target.remote) {
                    void fetch(`/api/support/attachments/${target.remote.id}`, {
                        method: "DELETE",
                    }).catch(() => undefined);
                }
            }
            return current.filter((item) => item.localId !== localId);
        });
    }, []);

    const clear = useCallback(() => {
        setPending((current) => {
            for (const item of current) URL.revokeObjectURL(item.previewUrl);
            return [];
        });
    }, []);

    const discard = useCallback(() => {
        setPending((current) => {
            for (const item of current) {
                URL.revokeObjectURL(item.previewUrl);
                if (item.remote) {
                    void fetch(`/api/support/attachments/${item.remote.id}`, {
                        method: "DELETE",
                    }).catch(() => undefined);
                }
            }
            return [];
        });
    }, []);

    const handlePaste = useCallback(
        (event: React.ClipboardEvent) => {
            const files = Array.from(event.clipboardData?.files ?? []).filter((f) =>
                f.type.startsWith("image/"),
            );
            if (files.length === 0) return;
            // A pasted screenshot should become an attachment, not a blob of text.
            event.preventDefault();
            addFiles(files);
        },
        [addFiles],
    );

    return {
        pending,
        readyIds: pending
            .filter((item) => item.status === "ready" && item.remote)
            .map((item) => item.remote!.id),
        isUploading: pending.some((item) => item.status === "uploading"),
        addFiles,
        remove,
        clear,
        discard,
        handlePaste,
    };
}

// ============================================
// Composer — attach button + preview strip
// ============================================

export function SupportAttachButton({
    onFiles,
    disabled,
    theme = "light",
    size = 36,
}: {
    onFiles: (files: FileList | null) => void;
    disabled?: boolean;
    theme?: SupportTheme;
    size?: number;
}) {
    const t = tokensFor(theme);
    const inputRef = useRef<HTMLInputElement | null>(null);

    return (
        <>
            <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                multiple
                hidden
                onChange={(e) => {
                    onFiles(e.target.files);
                    // Reset so picking the same file twice still fires onChange.
                    e.target.value = "";
                }}
            />
            <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={disabled}
                title="Joindre une image"
                aria-label="Joindre une image"
                style={{
                    width: size,
                    height: size,
                    borderRadius: t.radiusS,
                    flexShrink: 0,
                    background: theme === "light" ? SUP_LIGHT.paperSunken : SUP_DARK.surfaceSunken,
                    border: `1px solid ${t.line}`,
                    color: disabled ? t.ink4 : t.ink3,
                    cursor: disabled ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 150ms ease",
                }}
            >
                <svg
                    width={size * 0.45}
                    height={size * 0.45}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                >
                    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
            </button>
        </>
    );
}

export function SupportAttachmentPreviews({
    pending,
    onRemove,
    theme = "light",
}: {
    pending: PendingAttachment[];
    onRemove: (localId: string) => void;
    theme?: SupportTheme;
}) {
    const t = tokensFor(theme);
    if (pending.length === 0) return null;

    return (
        <div
            style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginBottom: 8,
                animation: "cpSupSlideUp 0.2s ease both",
            }}
        >
            {pending.map((item) => {
                const failed = item.status === "error";
                return (
                    <div
                        key={item.localId}
                        title={failed ? item.error : `${item.fileName} · ${formatFileSize(item.size)}`}
                        style={{
                            position: "relative",
                            width: 60,
                            height: 60,
                            borderRadius: 10,
                            overflow: "hidden",
                            border: `1px solid ${failed ? t.danger : t.line}`,
                            background: theme === "light" ? SUP_LIGHT.paperSunken : SUP_DARK.surfaceSunken,
                            flexShrink: 0,
                        }}
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={item.previewUrl}
                            alt={item.fileName}
                            style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                                opacity: item.status === "ready" ? 1 : 0.45,
                                transition: "opacity 200ms ease",
                            }}
                        />

                        {item.status === "uploading" && (
                            <div
                                style={{
                                    position: "absolute",
                                    inset: 0,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    background: "rgba(0,0,0,0.28)",
                                }}
                                aria-label="Envoi en cours"
                            >
                                <span
                                    style={{
                                        width: 16,
                                        height: 16,
                                        borderRadius: "50%",
                                        border: "2px solid rgba(255,255,255,0.4)",
                                        borderTopColor: "#fff",
                                        animation: "cpSupSpin 0.7s linear infinite",
                                        display: "inline-block",
                                    }}
                                />
                            </div>
                        )}

                        {failed && (
                            <div
                                style={{
                                    position: "absolute",
                                    inset: 0,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    background: "rgba(178,59,59,0.72)",
                                    color: "#fff",
                                    fontSize: 16,
                                    fontWeight: 700,
                                }}
                                aria-label={item.error ?? "Échec"}
                            >
                                !
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={() => onRemove(item.localId)}
                            aria-label={`Retirer ${item.fileName}`}
                            style={{
                                position: "absolute",
                                top: 2,
                                right: 2,
                                width: 18,
                                height: 18,
                                borderRadius: "50%",
                                border: "none",
                                background: "rgba(0,0,0,0.6)",
                                color: "#fff",
                                fontSize: 12,
                                lineHeight: 1,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                padding: 0,
                            }}
                        >
                            ×
                        </button>
                    </div>
                );
            })}
        </div>
    );
}

// ============================================
// Thread — gallery + lightbox
// ============================================

function SupportImageLightbox({
    attachment,
    onClose,
}: {
    attachment: SupportAttachmentDTO;
    onClose: () => void;
}) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        // Flag the lightbox on <body> so the panel/workspace Esc handlers stand
        // down while it is up — otherwise one Esc closes the image *and* the
        // surface behind it.
        document.body.setAttribute("data-cp-sup-lightbox", "open");
        return () => {
            window.removeEventListener("keydown", onKey);
            document.body.removeAttribute("data-cp-sup-lightbox");
        };
    }, [onClose]);

    // Rendered in a portal: the support panel animates with `transform`, which
    // would otherwise become the containing block for `position: fixed`.
    if (typeof document === "undefined") return null;

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-label={attachment.fileName}
            onClick={onClose}
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 2147483000,
                background: "rgba(12,16,12,0.82)",
                backdropFilter: "blur(4px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 32,
                cursor: "zoom-out",
                animation: "cpSupSlideUp 0.18s ease both",
            }}
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={attachment.url}
                alt={attachment.fileName}
                onClick={(e) => e.stopPropagation()}
                style={{
                    maxWidth: "100%",
                    maxHeight: "100%",
                    objectFit: "contain",
                    borderRadius: 12,
                    boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
                    cursor: "default",
                }}
            />
            <a
                href={attachment.url}
                download={attachment.fileName}
                onClick={(e) => e.stopPropagation()}
                style={{
                    position: "absolute",
                    bottom: 20,
                    left: "50%",
                    transform: "translateX(-50%)",
                    padding: "8px 16px",
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.14)",
                    border: "1px solid rgba(255,255,255,0.24)",
                    color: "#fff",
                    fontSize: 12.5,
                    fontWeight: 600,
                    textDecoration: "none",
                }}
            >
                Télécharger · {formatFileSize(attachment.size)}
            </a>
            <button
                type="button"
                onClick={onClose}
                aria-label="Fermer l'image"
                style={{
                    position: "absolute",
                    top: 16,
                    right: 20,
                    width: 34,
                    height: 34,
                    borderRadius: "50%",
                    border: "1px solid rgba(255,255,255,0.24)",
                    background: "rgba(255,255,255,0.14)",
                    color: "#fff",
                    fontSize: 18,
                    lineHeight: 1,
                    cursor: "pointer",
                }}
            >
                ×
            </button>
        </div>,
        document.body,
    );
}

export function SupportAttachmentGallery({
    attachments,
    theme = "light",
    hasText,
}: {
    attachments: SupportAttachmentDTO[];
    theme?: SupportTheme;
    /** When the message also has text, the gallery sits under the bubble. */
    hasText: boolean;
}) {
    const t = tokensFor(theme);
    const [opened, setOpened] = useState<SupportAttachmentDTO | null>(null);

    if (attachments.length === 0) return null;

    const single = attachments.length === 1;

    return (
        <>
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: single ? "1fr" : "repeat(2, minmax(0, 1fr))",
                    gap: 4,
                    marginTop: hasText ? 4 : 0,
                    maxWidth: 240,
                }}
            >
                {attachments.map((att) => {
                    // Reserve the real aspect ratio when we know it, so the bubble
                    // doesn't jump once the image loads.
                    const ratio =
                        single && att.width && att.height
                            ? `${att.width} / ${att.height}`
                            : "1 / 1";
                    return (
                        <button
                            key={att.id}
                            type="button"
                            onClick={() => setOpened(att)}
                            aria-label={`Agrandir ${att.fileName}`}
                            style={{
                                padding: 0,
                                border: `1px solid ${t.line}`,
                                borderRadius: t.radiusS,
                                overflow: "hidden",
                                background: theme === "light" ? SUP_LIGHT.paperSunken : SUP_DARK.surfaceSunken,
                                cursor: "zoom-in",
                                display: "block",
                                width: "100%",
                                aspectRatio: ratio,
                                maxHeight: 260,
                            }}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={att.url}
                                alt={att.fileName}
                                loading="lazy"
                                style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: single ? "contain" : "cover",
                                    display: "block",
                                }}
                            />
                        </button>
                    );
                })}
            </div>
            {opened && (
                <SupportImageLightbox attachment={opened} onClose={() => setOpened(null)} />
            )}
        </>
    );
}
