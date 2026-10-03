"use client";

import { useEffect, useCallback, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================
// DRAWER COMPONENT
// ============================================

interface DrawerProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    description?: string;
    children: React.ReactNode;
    size?: "sm" | "md" | "lg" | "xl" | "full";
    side?: "right" | "left";
    showCloseButton?: boolean;
    closeOnOverlay?: boolean;
    closeOnEscape?: boolean;
    className?: string;
    footer?: React.ReactNode;
    /** Helper link shown above footer (e.g. "Learn more about...") */
    footerHelperLink?: { href: string; label: string };
    /** Center title in header (reference style) */
    headerCentered?: boolean;
    /** If false, drawer behaves as non-modal side panel (no full-screen blocking layer). */
    modal?: boolean;
}

const SIZES = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
    full: "max-w-[95vw]",
};

export function Drawer({
    isOpen,
    onClose,
    title,
    description,
    children,
    size = "lg",
    side = "right",
    showCloseButton = true,
    closeOnOverlay = true,
    closeOnEscape = true,
    className,
    footer,
    footerHelperLink,
    headerCentered = false,
    modal = true,
}: DrawerProps) {
    const drawerRef = useRef<HTMLDivElement>(null);

    // Handle ESC key
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === "Escape" && closeOnEscape) {
                onClose();
            }
        },
        [closeOnEscape, onClose]
    );

    // Lock body scroll when drawer is open
    useEffect(() => {
        if (isOpen && modal) {
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

    // Focus trap
    useEffect(() => {
        if (isOpen && drawerRef.current) {
            drawerRef.current.focus();
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleOverlayClickClose = () => {
        if (closeOnOverlay) onClose();
    };

    return (
        <div className={cn("fixed inset-0 z-[80] flex", modal ? "pointer-events-auto" : "pointer-events-none")}>
            {/* Overlay */}
            {modal && (
                <div
                    className="absolute inset-0 bg-black/30 backdrop-blur-[2px] animate-fade-in cursor-pointer transition-opacity duration-300"
                    onClick={handleOverlayClickClose}
                    aria-hidden="true"
                />
            )}

            {/* Drawer panel */}
            <div
                ref={drawerRef}
                tabIndex={-1}
                role="dialog"
                aria-modal={modal ? "true" : undefined}
                aria-label={title || "Panneau latéral"}
                className={cn(
                    "fixed top-0 bottom-0 w-full flex flex-col bg-surface shadow-2xl shadow-black/10 z-[81] outline-none",
                    side === "right"
                        ? "right-0 animate-slide-in-right"
                        : "left-0 animate-slide-in-left",
                    !modal && "pointer-events-auto",
                    SIZES[size],
                    className
                )}
            >
                {/* Header */}
                {(title || showCloseButton) && (
                    <div className={cn(
                        "flex items-center px-6 py-4 border-b border-line-subtle bg-surface sticky top-0 z-10",
                        headerCentered ? "justify-center" : "justify-between"
                    )}>
                        {showCloseButton && !headerCentered && (
                            <div className="flex-1 min-w-0 pr-4" />
                        )}
                        {showCloseButton && headerCentered && (
                            <button
                                onClick={onClose}
                                aria-label="Fermer le panneau"
                                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 -m-1 text-ink-4 hover:text-ink hover:bg-surface-3 rounded-lg transition-all duration-150 flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        )}
                        <div className={cn(
                            "flex-1 min-w-0",
                            headerCentered ? "text-center pr-10" : "pr-4"
                        )}>
                            {title && (
                                <h2 className="text-lg font-semibold text-ink truncate leading-tight">
                                    {title}
                                </h2>
                            )}
                            {description && (
                                <p className="text-xs text-ink-3 mt-0.5 font-medium">
                                    {description}
                                </p>
                            )}
                        </div>
                        {showCloseButton && !headerCentered && (
                            <button
                                onClick={onClose}
                                aria-label="Fermer le panneau"
                                className="p-2 -m-1 text-ink-4 hover:text-ink hover:bg-surface-3 rounded-lg transition-all duration-150 flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                )}

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 drawer-scrollbar">
                    {children}
                </div>

                {/* Footer helper link */}
                {footerHelperLink && (
                    <div className="px-6 pt-2 pb-1 border-t border-line-subtle bg-surface-2/30">
                        <a
                            href={footerHelperLink.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary-600 hover:text-primary-700 hover:underline"
                        >
                            {footerHelperLink.label}
                        </a>
                    </div>
                )}

                {/* Footer */}
                {footer && (
                    <div className="px-6 py-4 border-t border-line-subtle bg-surface sticky bottom-0 z-10">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}

// ============================================
// DRAWER SECTION (for organizing content)
// ============================================

interface DrawerSectionProps {
    title?: string;
    children: React.ReactNode;
    className?: string;
}

export function DrawerSection({ title, children, className }: DrawerSectionProps) {
    return (
        <div className={cn("space-y-3", className)}>
            {title && (
                <h3 className="text-sm font-bold text-ink uppercase tracking-wide">
                    {title}
                </h3>
            )}
            {children}
        </div>
    );
}

// ============================================
// DRAWER FIELD (for displaying info)
// ============================================

interface DrawerFieldProps {
    label: string;
    value: React.ReactNode;
    icon?: React.ReactNode;
    className?: string;
}

export function DrawerField({ label, value, icon, className }: DrawerFieldProps) {
    return (
        <div className={cn("flex items-start gap-3", className)}>
            {icon && (
                <div className="w-10 h-10 rounded-lg bg-surface-3 flex items-center justify-center flex-shrink-0">
                    {icon}
                </div>
            )}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink-3">{label}</p>
                <div className="text-ink mt-0.5">
                    {value || <span className="text-ink-4 italic">Non renseigné</span>}
                </div>
            </div>
        </div>
    );
}

export default Drawer;
