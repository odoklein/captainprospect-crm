"use client";

import { useEffect, useCallback, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================
// DRAWER COMPONENT
// ============================================

/**
 * Shared look of every right-side drawer / sheet in the app.
 * - Backdrop: a light scrim (the page stays readable behind the panel), no blur.
 * - Panel: floats inset from the viewport edge, rounded on all corners and
 *   clipped to them (`overflow-hidden`) so sticky headers/footers and inner
 *   scroll areas follow the radius.
 * Exported so non-`Drawer` sheets (e.g. the booking dialog) match exactly.
 */
export const DRAWER_BACKDROP_CLASS = "bg-black/15 animate-fade-in";
export const DRAWER_PANEL_SURFACE_CLASS =
    "overflow-hidden rounded-2xl sm:rounded-[20px] border border-line bg-surface shadow-overlay";

interface DrawerProps {
    isOpen: boolean;
    onClose: () => void;
    /** Centered in the header. */
    title?: React.ReactNode;
    /** Centered under the title. */
    description?: React.ReactNode;
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
    /** @deprecated The title is always centered now; kept so existing call sites compile. */
    headerCentered?: boolean;
    /** Optional content for the header's left slot (back button, status, ...). */
    headerLeft?: React.ReactNode;
    /** Optional actions rendered in the header's right slot, before the close button. */
    headerActions?: React.ReactNode;
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

// ============================================
// DRAWER HEADER (3 slots: left / centered title / right)
// ============================================

interface DrawerHeaderProps {
    title?: React.ReactNode;
    subtitle?: React.ReactNode;
    /** Left slot, pinned to the start edge. */
    left?: React.ReactNode;
    /** Right slot, pinned to the end edge (before the close button). */
    right?: React.ReactNode;
    onClose?: () => void;
    showCloseButton?: boolean;
    className?: string;
}

/**
 * Header with a truly centered title: the two outer columns are equal (`1fr`)
 * so the title stays in the middle whatever the left/right slots contain.
 */
export function DrawerHeader({
    title,
    subtitle,
    left,
    right,
    onClose,
    showCloseButton = true,
    className,
}: DrawerHeaderProps) {
    return (
        <div
            className={cn(
                "grid shrink-0 grid-cols-[minmax(2.5rem,1fr)_minmax(0,auto)_minmax(2.5rem,1fr)] items-center gap-2",
                "border-b border-line-subtle bg-surface px-3 py-3 sm:px-4",
                className
            )}
        >
            <div className="flex min-w-0 items-center justify-start gap-1">{left}</div>
            <div className="min-w-0 max-w-full text-center">
                {title && (
                    <h2 className="truncate text-base font-semibold leading-tight text-ink sm:text-lg">
                        {title}
                    </h2>
                )}
                {subtitle && (
                    <p className="mt-0.5 truncate text-xs font-medium text-ink-3">{subtitle}</p>
                )}
            </div>
            <div className="flex min-w-0 items-center justify-end gap-1">
                {right}
                {showCloseButton && onClose && (
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Fermer le panneau"
                        className="flex-shrink-0 rounded-lg p-2 text-ink-4 transition-colors duration-150 hover:bg-surface-3 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                    >
                        <X className="h-5 w-5" />
                    </button>
                )}
            </div>
        </div>
    );
}

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
    headerLeft,
    headerActions,
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
                    className={cn(
                        DRAWER_BACKDROP_CLASS,
                        "absolute inset-0 transition-opacity duration-300",
                        closeOnOverlay && "cursor-pointer"
                    )}
                    onClick={handleOverlayClickClose}
                    aria-hidden="true"
                />
            )}

            {/* Drawer panel: floating, inset from the viewport edge, rounded + clipped */}
            <div
                ref={drawerRef}
                tabIndex={-1}
                role="dialog"
                aria-modal={modal ? "true" : undefined}
                aria-label={typeof title === "string" ? title : "Panneau latéral"}
                className={cn(
                    "fixed top-2 bottom-2 z-[81] flex w-[calc(100%-1rem)] flex-col outline-none sm:top-3 sm:bottom-3 sm:w-[calc(100%-1.5rem)]",
                    DRAWER_PANEL_SURFACE_CLASS,
                    side === "right"
                        ? "right-2 sm:right-3 animate-drawer-in-right"
                        : "left-2 sm:left-3 animate-drawer-in-left",
                    !modal && "pointer-events-auto",
                    SIZES[size],
                    className
                )}
            >
                {/* Header */}
                {(title || description || headerLeft || headerActions || showCloseButton) && (
                    <DrawerHeader
                        title={title}
                        subtitle={description}
                        left={headerLeft}
                        right={headerActions}
                        onClose={onClose}
                        showCloseButton={showCloseButton}
                    />
                )}

                {/* Content */}
                <div className="min-h-0 flex-1 overflow-y-auto p-6 drawer-scrollbar">
                    {children}
                </div>

                {/* Footer helper link */}
                {footerHelperLink && (
                    <div className="shrink-0 px-6 pt-2 pb-1 border-t border-line-subtle bg-surface-2/30">
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
                    <div className="shrink-0 px-6 py-4 border-t border-line-subtle bg-surface">
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
