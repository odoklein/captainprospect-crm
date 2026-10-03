"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================
// TOAST TYPES
// ============================================

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
    id: string;
    type: ToastType;
    title: string;
    message?: string;
    duration?: number;
    /** Optional inline action, e.g. an "Annuler" button on a reversible change. */
    action?: { label: string; onClick: () => void };
}

interface ToastContextType {
    toasts: Toast[];
    addToast: (toast: Omit<Toast, "id">) => void;
    removeToast: (id: string) => void;
    success: (title: string, message?: string) => void;
    error: (title: string, message?: string) => void;
    warning: (title: string, message?: string) => void;
    info: (title: string, message?: string) => void;
}

// ============================================
// TOAST CONTEXT
// ============================================

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error("useToast must be used within a ToastProvider");
    }
    return context;
}

// ============================================
// TOAST PROVIDER
// ============================================

interface ToastProviderProps {
    children: React.ReactNode;
    position?: "top-right" | "top-center" | "bottom-right" | "bottom-center";
}

export function ToastProvider({
    children,
    position = "top-right",
}: ToastProviderProps) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback((toast: Omit<Toast, "id">) => {
        const id = Math.random().toString(36).substring(2, 9);
        const newToast = { ...toast, id };

        setToasts((prev) => [...prev, newToast]);

        // Auto-dismiss
        const duration = toast.duration ?? 5000;
        if (duration > 0) {
            setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== id));
            }, duration);
        }
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    // Convenience methods
    const success = useCallback(
        (title: string, message?: string) => addToast({ type: "success", title, message }),
        [addToast]
    );
    const error = useCallback(
        (title: string, message?: string) => addToast({ type: "error", title, message }),
        [addToast]
    );
    const warning = useCallback(
        (title: string, message?: string) => addToast({ type: "warning", title, message }),
        [addToast]
    );
    const info = useCallback(
        (title: string, message?: string) => addToast({ type: "info", title, message }),
        [addToast]
    );

    const positionClasses = {
        "top-right": "top-4 right-4",
        "top-center": "top-4 left-1/2 -translate-x-1/2",
        "bottom-right": "bottom-4 right-4",
        "bottom-center": "bottom-4 left-1/2 -translate-x-1/2",
    };

    return (
        <ToastContext.Provider
            value={{ toasts, addToast, removeToast, success, error, warning, info }}
        >
            {children}

            {/* Toast Container */}
            <div
                aria-live="polite"
                className={cn(
                    "fixed z-[130] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2 pointer-events-none",
                    positionClasses[position]
                )}
            >
                {toasts.map((toast) => (
                    <ToastItem
                        key={toast.id}
                        toast={toast}
                        onClose={() => removeToast(toast.id)}
                    />
                ))}
            </div>
        </ToastContext.Provider>
    );
}

// ============================================
// TOAST ITEM
// ============================================

interface ToastItemProps {
    toast: Toast;
    onClose: () => void;
}

function ToastItem({ toast, onClose }: ToastItemProps) {
    const icons = {
        success: <CheckCircle2 className="size-4" />,
        error: <AlertCircle className="size-4" />,
        warning: <AlertTriangle className="size-4" />,
        info: <Info className="size-4" />,
    };

    const tiles = {
        success: "bg-success-soft text-success ring-success-line",
        error: "bg-danger-soft text-danger ring-danger-line",
        warning: "bg-warning-soft text-warning ring-warning-line",
        info: "bg-info-soft text-info ring-info-line",
    };

    return (
        <div
            role={toast.type === "error" ? "alert" : "status"}
            className={cn(
                "pointer-events-auto w-full flex items-start gap-3 p-3.5 pr-3",
                "bg-surface border border-line rounded-panel shadow-overlay",
                "animate-ds-slide-in"
            )}
        >
            <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] ring-1 ring-inset", tiles[toast.type])}>
                {icons[toast.type]}
            </span>
            <div className="flex-1 min-w-0 pt-0.5">
                <p className="text-sm font-semibold text-ink">{toast.title}</p>
                {toast.message && (
                    <p className="text-[13px] leading-relaxed text-ink-3 mt-0.5">{toast.message}</p>
                )}
                {toast.action && (
                    <button
                        type="button"
                        onClick={() => {
                            toast.action?.onClick();
                            onClose();
                        }}
                        className="mt-2 text-[13px] font-semibold text-link underline-offset-2 hover:underline"
                    >
                        {toast.action.label}
                    </button>
                )}
            </div>
            <button
                type="button"
                onClick={onClose}
                aria-label="Fermer"
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-ink-4 transition-colors hover:bg-surface-3 hover:text-ink-2"
            >
                <X className="size-4" />
            </button>
        </div>
    );
}

export default ToastProvider;
