"use client";

import { useEffect, useRef, useState, ReactNode, useCallback } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// Hook — click-to-edit lifecycle with autosave on Enter / blur, cancel on Esc.
// ============================================================================

type UseInlineEditArgs<T> = {
    value: T;
    onSave: (next: T) => Promise<void> | void;
};

function useInlineEdit<T>({ value, onSave }: UseInlineEditArgs<T>) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<T>(value);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!editing) setDraft(value);
    }, [value, editing]);

    const commit = useCallback(async () => {
        if (draft === value) {
            setEditing(false);
            return;
        }
        setSaving(true);
        try {
            await onSave(draft);
            setEditing(false);
        } finally {
            setSaving(false);
        }
    }, [draft, value, onSave]);

    const cancel = useCallback(() => {
        setDraft(value);
        setEditing(false);
    }, [value]);

    return { editing, setEditing, draft, setDraft, saving, commit, cancel };
}

// ============================================================================
// InlineText — single-line text / email / tel / url click-to-edit
// ============================================================================

type InlineTextProps = {
    label?: string;
    value: string;
    placeholder?: string;
    onSave: (next: string) => Promise<void> | void;
    type?: "text" | "email" | "tel" | "url" | "number";
    icon?: ReactNode;
    trailing?: ReactNode;
    readOnly?: boolean;
    className?: string;
    valueClassName?: string;
    multiline?: boolean;
};

export function InlineText({
    label,
    value,
    placeholder = "Non renseigné",
    onSave,
    type = "text",
    icon,
    trailing,
    readOnly,
    className,
    valueClassName,
    multiline,
}: InlineTextProps) {
    const { editing, setEditing, draft, setDraft, saving, commit, cancel } = useInlineEdit<string>({
        value: value || "",
        onSave,
    });
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

    useEffect(() => {
        if (editing) {
            requestAnimationFrame(() => {
                inputRef.current?.focus();
                if (inputRef.current && "select" in inputRef.current) {
                    (inputRef.current as HTMLInputElement).select();
                }
            });
        }
    }, [editing]);

    return (
        <div className={cn("group", className)}>
            {label && (
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    {label}
                </p>
            )}
            {editing ? (
                <div className="flex items-start gap-1.5">
                    {multiline ? (
                        <textarea
                            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onBlur={commit}
                            onKeyDown={(e) => {
                                if (e.key === "Escape") cancel();
                                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit();
                            }}
                            rows={3}
                            className="flex-1 px-2.5 py-1.5 text-sm text-slate-900 bg-white border border-primary-400 rounded-lg outline-none focus:ring-2 focus:ring-primary-500/20 resize-none"
                        />
                    ) : (
                        <input
                            ref={inputRef as React.RefObject<HTMLInputElement>}
                            type={type}
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onBlur={commit}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") commit();
                                if (e.key === "Escape") cancel();
                            }}
                            className="flex-1 px-2.5 py-1.5 text-sm text-slate-900 bg-white border border-primary-400 rounded-lg outline-none focus:ring-2 focus:ring-primary-500/20"
                        />
                    )}
                    <div className="flex items-center gap-1 pt-0.5">
                        {saving ? (
                            <div className="w-6 h-6 rounded-md bg-primary-50 flex items-center justify-center">
                                <svg className="animate-spin h-3 w-3 text-primary-600" viewBox="0 0 24 24">
                                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" className="opacity-25" />
                                    <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                            </div>
                        ) : (
                            <>
                                <button
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={commit}
                                    className="w-6 h-6 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center transition-colors"
                                    aria-label="Sauvegarder"
                                >
                                    <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={cancel}
                                    className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
                                    aria-label="Annuler"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </>
                        )}
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => !readOnly && setEditing(true)}
                    className={cn(
                        "w-full flex items-center gap-2 text-left px-2.5 py-1.5 -mx-2.5 rounded-lg transition-colors",
                        !readOnly && "hover:bg-slate-50 cursor-text"
                    )}
                >
                    {icon && <span className="flex-shrink-0 text-slate-400">{icon}</span>}
                    <span
                        className={cn(
                            "flex-1 text-sm truncate",
                            value ? "text-slate-900 font-medium" : "text-slate-400 italic",
                            valueClassName
                        )}
                    >
                        {value || placeholder}
                    </span>
                    {trailing}
                    {!readOnly && (
                        <Pencil className="w-3.5 h-3.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                    )}
                </button>
            )}
        </div>
    );
}

// ============================================================================
// InlineSelect — click-to-edit dropdown (inline popover)
// ============================================================================

type InlineSelectOption = {
    value: string;
    label: string;
    icon?: ReactNode;
    tone?: "default" | "success" | "warning" | "danger" | "info";
};

type InlineSelectProps = {
    label?: string;
    value: string;
    options: InlineSelectOption[];
    placeholder?: string;
    onSave: (next: string) => Promise<void> | void;
    readOnly?: boolean;
    className?: string;
    /** Render the selected value as a colored pill instead of plain text. */
    asPill?: boolean;
};

const TONE_PILL: Record<string, string> = {
    default: "bg-slate-100 text-slate-700",
    success: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warning: "bg-amber-50 text-amber-700 border-amber-200",
    danger: "bg-red-50 text-red-700 border-red-200",
    info: "bg-primary-50 text-primary-700 border-primary-200",
};

export function InlineSelect({
    label,
    value,
    options,
    placeholder = "—",
    onSave,
    readOnly,
    className,
    asPill,
}: InlineSelectProps) {
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);

    const selected = options.find((o) => o.value === value);

    useEffect(() => {
        if (!open || !triggerRef.current) return;
        const r = triggerRef.current.getBoundingClientRect();
        setRect({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 180) });
        const close = (e: MouseEvent) => {
            const t = e.target as Element;
            if (!t.closest("[data-inline-select]") && !triggerRef.current?.contains(t)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", close);
        return () => document.removeEventListener("mousedown", close);
    }, [open]);

    const handlePick = async (v: string) => {
        setOpen(false);
        if (v === value) return;
        setSaving(true);
        try {
            await onSave(v);
        } finally {
            setSaving(false);
        }
    };

    const pillClass = asPill && selected ? TONE_PILL[selected.tone || "default"] : "";

    return (
        <div className={cn("group", className)}>
            {label && (
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    {label}
                </p>
            )}
            <button
                ref={triggerRef}
                type="button"
                disabled={readOnly || saving}
                onClick={() => !readOnly && setOpen((v) => !v)}
                className={cn(
                    "flex items-center gap-2 text-left transition-colors",
                    asPill
                        ? cn(
                              "px-2.5 py-1 rounded-full text-xs font-semibold border",
                              pillClass || "bg-slate-100 text-slate-700 border-slate-200",
                              !readOnly && "hover:opacity-80"
                          )
                        : cn(
                              "w-full px-2.5 py-1.5 -mx-2.5 rounded-lg text-sm",
                              !readOnly && "hover:bg-slate-50"
                          )
                )}
            >
                {selected?.icon}
                <span className={cn("flex-1 truncate", !selected && !asPill && "text-slate-400 italic")}>
                    {selected?.label || placeholder}
                </span>
                {!readOnly && !asPill && (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                )}
                {saving && (
                    <svg className="animate-spin h-3 w-3 text-slate-400" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" className="opacity-25" />
                        <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                )}
            </button>
            {open && rect && typeof document !== "undefined" &&
                createPortal(
                    <div
                        data-inline-select
                        className="fixed z-[120] bg-white border border-slate-200 rounded-xl shadow-xl shadow-slate-900/10 overflow-hidden animate-scale-in origin-top py-1"
                        style={{ top: rect.top, left: rect.left, minWidth: rect.width }}
                    >
                        {options.map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => handlePick(opt.value)}
                                className={cn(
                                    "w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors hover:bg-primary-50",
                                    opt.value === value && "bg-primary-50/60 text-primary-700 font-medium"
                                )}
                            >
                                {opt.icon}
                                <span className="flex-1 truncate">{opt.label}</span>
                                {opt.value === value && <Check className="w-4 h-4 text-primary-600" />}
                            </button>
                        ))}
                    </div>,
                    document.body
                )}
        </div>
    );
}

// ============================================================================
// InlineToggle — on/off switch with auto-save
// ============================================================================

type InlineToggleProps = {
    label: string;
    description?: string;
    value: boolean;
    onSave: (next: boolean) => Promise<void> | void;
    readOnly?: boolean;
};

export function InlineToggle({ label, description, value, onSave, readOnly }: InlineToggleProps) {
    const [saving, setSaving] = useState(false);
    const handle = async () => {
        if (readOnly || saving) return;
        setSaving(true);
        try {
            await onSave(!value);
        } finally {
            setSaving(false);
        }
    };
    return (
        <button
            type="button"
            disabled={readOnly || saving}
            onClick={handle}
            className="w-full flex items-start gap-3 py-2 px-3 -mx-3 rounded-lg hover:bg-slate-50 transition-colors text-left"
        >
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900">{label}</p>
                {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
            </div>
            <div
                className={cn(
                    "relative flex-shrink-0 w-10 h-5 rounded-full transition-colors mt-0.5",
                    value ? "bg-primary-600" : "bg-slate-300"
                )}
            >
                <div
                    className={cn(
                        "absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform",
                        value ? "translate-x-[22px]" : "translate-x-0.5"
                    )}
                />
            </div>
        </button>
    );
}

// ============================================================================
// PopoverPanel — anchored floating panel for complex edits (permissions, etc.)
// ============================================================================

type PopoverPanelProps = {
    open: boolean;
    onClose: () => void;
    anchor: React.RefObject<HTMLElement | null>;
    width?: number;
    children: ReactNode;
    align?: "start" | "end";
};

export function PopoverPanel({ open, onClose, anchor, width = 320, children, align = "start" }: PopoverPanelProps) {
    const [rect, setRect] = useState<{ top: number; left: number } | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open || !anchor.current) return;
        const r = anchor.current.getBoundingClientRect();
        const left = align === "end" ? r.right - width : r.left;
        setRect({ top: r.bottom + 6, left });
        const close = (e: MouseEvent) => {
            const t = e.target as Node;
            if (panelRef.current?.contains(t) || anchor.current?.contains(t)) return;
            onClose();
        };
        document.addEventListener("mousedown", close);
        return () => document.removeEventListener("mousedown", close);
    }, [open, anchor, align, width, onClose]);

    if (!open || !rect || typeof document === "undefined") return null;

    return createPortal(
        <div
            ref={panelRef}
            className="fixed z-[130] bg-white border border-slate-200 rounded-2xl shadow-2xl shadow-slate-900/10 animate-scale-in origin-top"
            style={{ top: rect.top, left: rect.left, width }}
        >
            {children}
        </div>,
        document.body
    );
}
