"use client";

import { useEffect, useRef, useId, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, OctagonAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import Button from "./Button";
import { FOCUS_RING } from "./recipes";
import { registerDialogLayer } from "./dialogStack";

// ============================================
// MODAL COMPONENT
// ============================================

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    description?: string;
    children: React.ReactNode;
    size?: "sm" | "md" | "lg" | "xl" | "full";
    showCloseButton?: boolean;
    closeOnOverlay?: boolean;
    closeOnEscape?: boolean;
    className?: string;
    /** Overrides the padding/scroll wrapper around children — for dialogs that
     *  own their full-bleed layout (e.g. sidebar + content split views). */
    contentClassName?: string;
}

const SIZES = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
    full: "max-w-[95vw] max-h-[95vh]",
};

const subscribeToHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function Modal({
    isOpen,
    onClose,
    title,
    description,
    children,
    size = "md",
    showCloseButton = true,
    closeOnOverlay = true,
    closeOnEscape = true,
    className,
    contentClassName,
}: ModalProps) {
    const hydrated = useSyncExternalStore(subscribeToHydration, clientReady, serverReady);
    // A nested confirmation must escape the clipped drawer panel, while
    // workspace dialogs still inherit the workspace palette.
    const portalTarget = isOpen && hydrated
        ? document.querySelector(".manager-client-studio") ?? document.body
        : null;
    const modalRef = useRef<HTMLDivElement>(null);
    const overlayPointerDownRef = useRef(false);
    const uid = useId();
    const titleId = `${uid}-title`;
    const descId = `${uid}-desc`;

    const closeRef = useRef({ onClose, closeOnEscape });
    useEffect(() => {
        closeRef.current = { onClose, closeOnEscape };
    }, [onClose, closeOnEscape]);

    useEffect(() => {
        const panel = modalRef.current;
        if (!portalTarget || !panel) return;
        return registerDialogLayer({
            panel,
            priority: 2,
            modal: true,
            close: () => { if (closeRef.current.closeOnEscape) closeRef.current.onClose(); },
            focus: "first",
        });
    }, [portalTarget]);

    // Track whether interaction started on overlay
    const handleOverlayPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        overlayPointerDownRef.current = e.target === e.currentTarget;
    };

    // Track pointer down inside the modal — if drag started inside, never close on release
    const handleModalPointerDown = () => {
        overlayPointerDownRef.current = false;
    };

    // Handle overlay click
    const handleOverlayClick = (e: React.MouseEvent) => {
        if (!closeOnOverlay) {
            overlayPointerDownRef.current = false;
            e.stopPropagation();
            return;
        }

        if (
            e.target === e.currentTarget &&
            overlayPointerDownRef.current &&
            closeOnOverlay
        ) {
            onClose();
        }
        overlayPointerDownRef.current = false;
    };

    if (!portalTarget) return null;

    return createPortal(
        <div
            className="fixed inset-x-0 top-0 bottom-[var(--softphone-dock-h,0px)] z-[120] flex items-center justify-center p-4 sm:p-6"
            onPointerDown={handleOverlayPointerDown}
            onClick={handleOverlayClick}
        >
            {/* Overlay */}
            <div className="absolute inset-0 pointer-events-none bg-ink/45 backdrop-blur-[2px] animate-fade-in" />

            {/* Modal */}
            <div
                ref={modalRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby={title ? titleId : undefined}
                aria-describedby={description ? descId : undefined}
                onPointerDown={handleModalPointerDown}
                className={cn(
                    "relative w-full bg-surface border border-line shadow-overlay rounded-card overflow-hidden flex flex-col text-ink",
                    "animate-ds-pop max-h-[85vh] focus:outline-none",
                    SIZES[size],
                    className
                )}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                {(title || showCloseButton) && (
                    <div className={cn("flex-shrink-0 flex items-start justify-between px-6 pt-5", title || description ? "pb-4 border-b border-line-subtle" : "pb-0")}>
                        <div className="pr-10 min-w-0">
                            {title && (
                                <h2 id={titleId} className="text-lg font-semibold tracking-tight text-ink">
                                    {title}
                                </h2>
                            )}
                            {description && (
                                <p id={descId} className="text-sm text-ink-3 mt-1 leading-relaxed">
                                    {description}
                                </p>
                            )}
                        </div>
                        {showCloseButton && (
                            <button
                                onClick={onClose}
                                aria-label="Fermer"
                                className={cn("absolute right-3.5 top-3.5 z-10 inline-flex size-9 items-center justify-center rounded-control text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink", FOCUS_RING)}
                            >
                                <X className="size-[18px]" />
                            </button>
                        )}
                    </div>
                )}

                {/* Content - explicit bg and text so content is never white-on-white */}
                <div
                    className={cn(
                        "p-6 overflow-y-auto custom-scrollbar flex-1 bg-surface text-ink",
                        contentClassName
                    )}
                >
                    {children}
                </div>
            </div>
        </div>,
        portalTarget,
    );
}

// ============================================
// MODAL FOOTER (for buttons)
// ============================================

interface ModalFooterProps {
    children: React.ReactNode;
    className?: string;
}

export function ModalFooter({ children, className }: ModalFooterProps) {
    return (
        <div
            className={cn(
                "flex flex-wrap items-center justify-end gap-2 pt-4 mt-6 border-t border-line-subtle",
                className
            )}
        >
            {children}
        </div>
    );
}

// ============================================
// CONFIRMATION MODAL
// ============================================

interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: "danger" | "warning" | "default";
    isLoading?: boolean;
}

export function ConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = "Confirmer",
    cancelText = "Annuler",
    variant = "default",
    isLoading = false,
}: ConfirmModalProps) {
    const Icon = variant === "danger" ? OctagonAlert : variant === "warning" ? AlertTriangle : null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
            <div className="flex items-start gap-3.5">
                {Icon && (
                    <span
                        className={cn(
                            "inline-flex size-10 shrink-0 items-center justify-center rounded-xl border",
                            variant === "danger" ? "bg-danger-soft border-danger-line text-danger" : "bg-warning-soft border-warning-line text-warning"
                        )}
                    >
                        <Icon className="size-5" aria-hidden />
                    </span>
                )}
                <p className="pt-0.5 text-sm leading-relaxed text-ink-2">{message}</p>
            </div>
            <ModalFooter>
                <Button variant="ghost" onClick={onClose} disabled={isLoading}>
                    {cancelText}
                </Button>
                <Button
                    variant={variant === "danger" ? "danger" : "primary"}
                    onClick={onConfirm}
                    isLoading={isLoading}
                    className={variant === "warning" ? "bg-warning hover:bg-warning-ink shadow-xs" : undefined}
                >
                    {confirmText}
                </Button>
            </ModalFooter>
        </Modal>
    );
}

export default Modal;
