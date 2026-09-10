"use client";

import { useEffect, useCallback, useRef, useId } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

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

const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const SIZES = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
    full: "max-w-[95vw] max-h-[95vh]",
};

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
    const modalRef = useRef<HTMLDivElement>(null);
    const overlayPointerDownRef = useRef(false);
    const uid = useId();
    const titleId = `${uid}-title`;
    const descId = `${uid}-desc`;

    // Handle ESC key
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === "Escape" && closeOnEscape) {
                onClose();
            }
        },
        [closeOnEscape, onClose]
    );

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

    // Lock body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
            document.addEventListener("keydown", handleKeyDown);
        } else {
            document.body.style.overflow = "";
        }

        return () => {
            document.body.style.overflow = "";
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [isOpen, handleKeyDown]);

    // Focus: move into the dialog on open, restore to the trigger on close
    useEffect(() => {
        if (!isOpen) return;
        const previouslyFocused = document.activeElement as HTMLElement | null;
        const node = modalRef.current;
        // Prefer the first meaningful control, fall back to the dialog itself
        const first = node?.querySelector<HTMLElement>(FOCUSABLE);
        (first ?? node)?.focus();
        return () => previouslyFocused?.focus?.();
    }, [isOpen]);

    // Keep Tab cycling inside the dialog
    const handleTabKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key !== "Tab" || !modalRef.current) return;
        const items = Array.from(
            modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
        ).filter((el) => el.offsetParent !== null || el === document.activeElement);
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6"
            onPointerDown={handleOverlayPointerDown}
            onClick={handleOverlayClick}
        >
            {/* Overlay */}
            <div className="absolute inset-0 pointer-events-none bg-slate-900/40 backdrop-blur-[4px] animate-fade-in transition-all duration-300" />

            {/* Modal */}
            <div
                ref={modalRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby={title ? titleId : undefined}
                aria-describedby={description ? descId : undefined}
                onKeyDown={handleTabKey}
                onPointerDown={handleModalPointerDown}
                className={cn(
                    "relative w-full bg-white border border-slate-200 shadow-xl rounded-2xl overflow-hidden flex flex-col text-slate-900",
                    "transform transition-all duration-300 ease-out animate-scale-in max-h-[85vh]",
                    SIZES[size],
                    className
                )}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                {(title || showCloseButton) && (
                    <div className="flex-shrink-0 flex items-start justify-between px-6 py-5 border-b border-slate-200 bg-slate-50">
                        <div className="pr-8">
                            {title && (
                                <h2 id={titleId} className="text-xl font-bold text-slate-900">
                                    {title}
                                </h2>
                            )}
                            {description && (
                                <p id={descId} className="text-sm text-slate-600 mt-1.5 font-medium">
                                    {description}
                                </p>
                            )}
                        </div>
                        {showCloseButton && (
                            <button
                                onClick={onClose}
                                aria-label="Fermer"
                                className="absolute right-4 top-4 p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-full transition-all duration-200 z-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                )}

                {/* Content - explicit bg and text so content is never white-on-white */}
                <div
                    className={cn(
                        "p-6 md:p-8 overflow-y-auto custom-scrollbar flex-1 bg-white text-slate-900",
                        contentClassName
                    )}
                >
                    {children}
                </div>
            </div>
        </div>
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
                "flex items-center justify-end gap-3 pt-4 mt-4 border-t border-slate-100",
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
    const buttonVariants = {
        danger: "bg-red-600 hover:bg-red-700 text-white",
        warning: "bg-amber-600 hover:bg-amber-700 text-white",
        default: "bg-indigo-600 hover:bg-indigo-700 text-white",
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
            <p className="text-slate-600">{message}</p>
            <ModalFooter>
                <button
                    onClick={onClose}
                    disabled={isLoading}
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                >
                    {cancelText}
                </button>
                <button
                    onClick={onConfirm}
                    disabled={isLoading}
                    className={cn(
                        "px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50",
                        buttonVariants[variant]
                    )}
                >
                    {isLoading ? "Chargement..." : confirmText}
                </button>
            </ModalFooter>
        </Modal>
    );
}

export default Modal;
