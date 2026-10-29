"use client";

/**
 * A visual in the thread: title, the drawing, and a quiet row of actions.
 * Clicking « Agrandir » opens it in the canvas beside the chat.
 */

import type { ReactNode } from "react";
import { AlertTriangle, Maximize2, Pin, PinOff } from "lucide-react";
import type { StoredVisual } from "@/lib/assistant/visuals/spec";
import { VisualView } from "./VisualView";
import { cn } from "@/lib/utils";

export function IconButton({ label, onClick, children, active }: { label: string; onClick: () => void; children: ReactNode; active?: boolean }) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={label}
            aria-label={label}
            aria-pressed={active}
            className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md text-[var(--ds-ink-3)] transition-[background-color,color] duration-150 hover:bg-[var(--ds-surface-3)] hover:text-[var(--ds-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus)]",
                active && "bg-[var(--ds-accent-soft)] text-[var(--ds-accent-soft-ink)]",
            )}
        >
            {children}
        </button>
    );
}

export function UnverifiedNote({ values }: { values: number[] | undefined }) {
    if (!values || values.length === 0) return null;
    return (
        <p className="mt-2 flex items-start gap-1.5 text-[12px] text-[var(--ds-warning-ink)]">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
                {values.length === 1 ? "1 valeur" : `${values.length} valeurs`} de ce visuel {values.length === 1 ? "n'a" : "n'ont"} pas été retrouvée{values.length === 1 ? "" : "s"} dans les sources
                consultées ({values.slice(0, 4).join(", ")}
                {values.length > 4 ? "…" : ""}).
            </span>
        </p>
    );
}

export function VisualCard({
    visual,
    onOpen,
    onTogglePin,
    pinned,
    refreshSlot,
    className,
}: {
    visual: StoredVisual;
    onOpen?: (visual: StoredVisual) => void;
    onTogglePin?: (visual: StoredVisual) => void;
    pinned?: boolean;
    /** Board cards: the refresh control, when the visual can be refreshed. */
    refreshSlot?: ReactNode;
    className?: string;
}) {
    const { spec } = visual;
    return (
        <figure
            className={cn("cp-viz my-3 rounded-xl border border-[var(--ds-line)] bg-[var(--ds-surface)] p-4", className)}
            role="group"
            aria-label={spec.title}
        >
            <figcaption className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold text-[var(--ds-ink)]">{spec.title}</div>
                    {spec.subtitle && <div className="mt-0.5 text-[12px] text-[var(--ds-ink-3)]">{spec.subtitle}</div>}
                </div>
                <div className="cp-viz-actions flex shrink-0 items-center gap-0.5">
                    {refreshSlot}
                    {onTogglePin && (
                        <IconButton label={pinned ? "Retirer du tableau du dossier" : "Épingler au dossier"} onClick={() => onTogglePin(visual)} active={pinned}>
                            {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                        </IconButton>
                    )}
                    {onOpen && (
                        <IconButton label="Agrandir" onClick={() => onOpen(visual)}>
                            <Maximize2 className="h-3.5 w-3.5" />
                        </IconButton>
                    )}
                </div>
            </figcaption>
            <VisualView spec={spec} />
            <UnverifiedNote values={visual.unverified} />
        </figure>
    );
}
