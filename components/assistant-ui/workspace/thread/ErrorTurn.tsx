"use client";

import { AlertCircle, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FOCUS, SECONDARY_BUTTON } from "@/components/accueil/AccueilUI";

/**
 * A turn that failed before any answer: the question stays visible (faded,
 * it was not saved) with the reason and « Réessayer », which sends the same
 * text again.
 */
export function ErrorTurn({
    text,
    message,
    onRetry,
    onDismiss,
    disabled,
}: {
    text: string;
    message: string;
    onRetry: () => void;
    onDismiss: () => void;
    disabled?: boolean;
}) {
    return (
        <div className="flex flex-col gap-3 motion-safe:animate-ds-enter">
            {text && (
                <div className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-[20px] rounded-br-md border border-dashed border-line-strong bg-surface-2 px-4 py-2.5 text-[14px] leading-relaxed text-ink-3 [overflow-wrap:anywhere] sm:max-w-[75%]">
                        {text}
                    </div>
                </div>
            )}
            <div role="alert" className="flex items-start gap-3 rounded-panel border border-danger-line bg-danger-soft/60 p-3.5">
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-surface text-danger ring-1 ring-inset ring-danger-line">
                    <AlertCircle className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-sm font-semibold text-ink">La réponse n’a pas pu être produite</p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-ink-3">{message}</p>
                    <button type="button" onClick={onRetry} disabled={disabled} className={cn(SECONDARY_BUTTON, "mt-2.5 h-8")}>
                        <RotateCcw className="size-3.5" aria-hidden />
                        Réessayer
                    </button>
                </div>
                <button
                    type="button"
                    onClick={onDismiss}
                    aria-label="Ignorer l’erreur"
                    className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-ink-4 transition-colors hover:bg-surface hover:text-ink-2", FOCUS)}
                >
                    <X className="size-4" aria-hidden />
                </button>
            </div>
        </div>
    );
}
