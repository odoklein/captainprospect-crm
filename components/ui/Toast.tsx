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
                className={cn(
                    "fixed z-[100] flex flex-col gap-2 pointer-events-none",
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
        success: <CheckCircle2 className="w-5 h-5" />,
        error: <AlertCircle className="w-5 h-5" />,
        warning: <AlertTriangle className="w-5 h-5" />,
        info: <Info className="w-5 h-5" />,
    };

    const colors = {
        success: "bg-emerald-50 border-emerald-200 text-emerald-600",
        error: "bg-red-50 border-red-200 text-red-600",
        warning: "bg-amber-50 border-amber-200 text-amber-600",
        info: "bg-blue-50 border-blue-200 text-blue-600",
    };

    return (
        <div
            className={cn(
                "pointer-events-auto min-w-[300px] max-w-md flex items-start gap-3 p-4",
                "bg-white border rounded-xl shadow-xl shadow-slate-200/50",
                "animate-slide-in",
                colors[toast.type]
            )}
        >
            <span className="flex-shrink-0">{icons[toast.type]}</span>
            <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900">{toast.title}</p>
                {toast.message && (
                    <p className="text-sm text-slate-600 mt-0.5">{toast.message}</p>
                )}
                {toast.action && (
                    <button
                        type="button"
                        onClick={() => {
                            toast.action?.onClick();
                            onClose();
                        }}
                        className="mt-2 text-sm font-semibold text-indigo-600 underline-offset-2 hover:underline"
                    >
                        {toast.action.label}
                    </button>
                )}
            </div>
            <button
                onClick={onClose}
                className="flex-shrink-0 p-1 -m-1 text-slate-400 hover:text-slate-600 transition-colors"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}

export default ToastProvider;
