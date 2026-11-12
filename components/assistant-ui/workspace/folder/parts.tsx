"use client";

/**
 * Small building blocks shared by the folder home tabs, on the shadcn layer:
 * empty and error states, the « not available yet » notice, a spinner, a
 * section eyebrow, an inline title editor and the « Actif il y a… » clock.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Loader2, RotateCw, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/shadcn/button";
import { EYEBROW } from "@/components/ui/recipes";
import { cn } from "@/lib/utils";

export function Spinner({ className, label }: { className?: string; label?: string }) {
    return (
        <Loader2
            className={cn("size-4 motion-safe:animate-spin", className)}
            aria-hidden={label ? undefined : true}
            aria-label={label}
            role={label ? "img" : undefined}
        />
    );
}

export function SectionTitle({ id, icon: Icon, children, className }: { id?: string; icon?: LucideIcon; children: ReactNode; className?: string }) {
    return (
        <h2 id={id} className={cn(EYEBROW, "flex items-center gap-1.5", className)}>
            {Icon && <Icon className="size-3.5 text-ink-4" aria-hidden />}
            {children}
        </h2>
    );
}

const EMPTY_TILE = {
    neutral: "border-line bg-surface text-ink-3",
    primary: "border-primary-200 bg-primary-50 text-primary-700",
    accent: "border-accent-200 bg-accent-soft text-accent-soft-ink",
    danger: "border-danger-line bg-danger-soft text-danger-ink",
} as const;

export function EmptyState({
    icon: Icon,
    title,
    hint,
    tone = "neutral",
    action,
    compact,
    className,
}: {
    icon: LucideIcon;
    title: string;
    hint?: ReactNode;
    tone?: keyof typeof EMPTY_TILE;
    action?: ReactNode;
    compact?: boolean;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "flex flex-col items-center gap-2 rounded-panel border border-dashed border-line bg-surface-2 px-6 text-center motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200",
                compact ? "py-7" : "py-10",
                className,
            )}
        >
            <span className={cn("mb-1 flex size-11 items-center justify-center rounded-panel border shadow-2xs", EMPTY_TILE[tone])} aria-hidden>
                <Icon className="size-5" />
            </span>
            <p className="text-sm font-semibold text-ink">{title}</p>
            {hint && <p className="max-w-md text-xs leading-relaxed text-ink-3">{hint}</p>}
            {action && <div className="mt-2">{action}</div>}
        </div>
    );
}

export function ErrorState({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
    return (
        <EmptyState
            compact
            icon={AlertTriangle}
            tone="danger"
            title={title}
            hint={message}
            action={
                onRetry ? (
                    <Button variant="outline" size="sm" onClick={onRetry}>
                        <RotateCw aria-hidden />
                        Réessayer
                    </Button>
                ) : undefined
            }
        />
    );
}

/** The v4 tables are missing on this instance (routes answer `degraded: true`). */
export function DegradedNotice({ children }: { children: ReactNode }) {
    return (
        <p role="status" className="flex items-start gap-2 rounded-control border border-warning-line bg-warning-soft px-3 py-2 text-xs font-medium text-warning-ink">
            <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
            <span>{children}</span>
        </p>
    );
}

/** Stagger for list entrances: the first rows cascade, the rest come in together. */
export function stagger(i: number, step = 30) {
    return { animationDelay: `${Math.min(i, 7) * step}ms` };
}

export const ENTER = "motion-safe:animate-ds-enter";

/**
 * Inline title editor: Entrée saves, Échap cancels, blur saves. The parent
 * decides when it shows; `onDone` always runs once the edit ends.
 */
export function InlineTitleInput({
    initial,
    maxLength,
    label,
    className,
    onSave,
    onDone,
}: {
    initial: string;
    maxLength: number;
    label: string;
    className?: string;
    onSave(value: string): void;
    onDone(): void;
}) {
    const [value, setValue] = useState(initial);
    const ref = useRef<HTMLInputElement>(null);
    const ended = useRef(false);

    useEffect(() => {
        ref.current?.focus();
        ref.current?.select();
    }, []);

    const end = (save: boolean) => {
        if (ended.current) return;
        ended.current = true;
        if (save) onSave(value);
        onDone();
    };

    return (
        <input
            ref={ref}
            value={value}
            maxLength={maxLength}
            aria-label={label}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => end(true)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    end(true);
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    end(false);
                }
            }}
            className={cn(
                "w-full min-w-0 rounded-[10px] border border-primary-400 bg-surface px-2 text-ink outline-none ring-4 ring-primary-500/12",
                className,
            )}
        />
    );
}
