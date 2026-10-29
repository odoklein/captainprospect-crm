"use client";

import { AlertCircle, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/shadcn/button";

/**
 * A turn that failed before any answer: the question stays visible (dashed,
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
                    <Button type="button" variant="outline" size="sm" onClick={onRetry} disabled={disabled} className="mt-2.5">
                        <RotateCcw aria-hidden />
                        Réessayer
                    </Button>
                </div>
                <Button type="button" variant="ghost" size="icon-xs" onClick={onDismiss} aria-label="Ignorer l’erreur" className="hover:bg-surface">
                    <X aria-hidden />
                </Button>
            </div>
        </div>
    );
}
