"use client";

/**
 * A visual in the thread: title, the drawing, and a quiet row of actions.
 * « Agrandir » opens it in the canvas beside the chat. Keyed by visual id by
 * its callers, so it keeps its DOM (and its chart) through the hand-over from
 * the streamed answer to the saved one.
 */

import type { ReactNode } from "react";
import { AlertTriangle, Maximize2, Pin, PinOff } from "lucide-react";
import type { StoredVisual } from "@/lib/assistant/visuals/spec";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/shadcn/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/shadcn/tooltip";
import { VisualView } from "./VisualView";

export function IconButton({ label, onClick, children, active }: { label: string; onClick: () => void; children: ReactNode; active?: boolean }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={onClick}
                    aria-label={label}
                    aria-pressed={active}
                    className={cn(active && "bg-accent-soft text-accent-soft-ink hover:bg-accent-soft hover:text-accent-soft-ink")}
                >
                    {children}
                </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    );
}

export function UnverifiedNote({ values }: { values: number[] | undefined }) {
    if (!values || values.length === 0) return null;
    return (
        <p className="mt-2 flex items-start gap-1.5 text-[12px] text-warning-ink">
            <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
            <span>
                {values.length === 1 ? "1 valeur" : `${values.length} valeurs`} de ce visuel {values.length === 1 ? "n’a" : "n’ont"} pas été retrouvée{values.length === 1 ? "" : "s"} dans les sources
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
        <figure className={cn("cp-viz group/viz my-3 rounded-panel border border-line bg-surface p-4 shadow-2xs", className)} role="group" aria-label={spec.title}>
            <figcaption className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold text-ink">{spec.title}</div>
                    {spec.subtitle && <div className="mt-0.5 text-[12px] text-ink-3">{spec.subtitle}</div>}
                </div>
                <div className="cp-viz-actions flex shrink-0 items-center gap-0.5">
                    {refreshSlot}
                    {onTogglePin && (
                        <IconButton label={pinned ? "Retirer du tableau du dossier" : "Épingler au dossier"} onClick={() => onTogglePin(visual)} active={pinned}>
                            {pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
                        </IconButton>
                    )}
                    {onOpen && (
                        <IconButton label="Agrandir" onClick={() => onOpen(visual)}>
                            <Maximize2 aria-hidden />
                        </IconButton>
                    )}
                </div>
            </figcaption>
            <VisualView spec={spec} />
            <UnverifiedNote values={visual.unverified} />
        </figure>
    );
}
