"use client";

import { Check, KeyRound, Loader2, X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import Button from "@/components/ui/Button";
import type { StoredAction } from "./types";

interface ActionConfirmationCardProps {
    action: StoredAction;
    busy?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    className?: string;
}

export function ActionConfirmationCard({
    action,
    busy = false,
    onConfirm,
    onCancel,
    className,
}: ActionConfirmationCardProps) {
    const isPending = action.state === "pending";
    const isConfirmed = action.state === "confirmed";
    const isCancelled = action.state === "cancelled";
    const isFailed = action.state === "failed";

    return (
        <div
            className={cn(
                "my-3 rounded-panel border p-4 text-xs shadow-xs transition-[background-color,border-color,opacity] duration-200 motion-safe:animate-ds-pop",
                isPending && action.card.danger && "border-warning-line bg-warning-soft/50",
                isPending && !action.card.danger && "border-line bg-surface-2",
                isConfirmed && "border-success-line bg-success-soft/50",
                isCancelled && "border-line bg-surface-3/60 opacity-80",
                isFailed && "border-danger-line bg-danger-soft/50",
                className
            )}
        >
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <span className="flex size-6 items-center justify-center rounded-lg border border-line bg-surface shadow-xs">
                    <KeyRound className="size-3.5 text-accent-600" aria-hidden />
                </span>
                <span>{action.card.title}</span>
            </div>

            {action.card.details && action.card.details.length > 0 && (
                <dl className="mt-3 divide-y divide-line-subtle rounded-xl border border-line bg-surface p-3 shadow-2xs">
                    {action.card.details.map((detail, idx) => (
                        <div key={`${detail.label}-${idx}`} className="flex items-center justify-between gap-3 py-1.5 text-xs first:pt-0 last:pb-0">
                            <dt className="font-medium text-ink-3">{detail.label}</dt>
                            <dd className="text-right font-semibold text-ink">{detail.value}</dd>
                        </div>
                    ))}
                </dl>
            )}

            {action.card.warning && isPending && (
                <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-[11.5px] text-warning-ink">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
                    <span>{action.card.warning}</span>
                </div>
            )}

            {isPending && (
                <div className="mt-3.5 flex items-center justify-end gap-2 border-t border-line-subtle pt-2">
                    <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={busy}>
                        Annuler
                    </Button>
                    <Button
                        type="button"
                        variant={action.card.danger ? "danger" : "primary"}
                        size="sm"
                        onClick={onConfirm}
                        disabled={busy}
                        leftIcon={busy ? <Loader2 className="size-3 animate-spin" /> : undefined}
                    >
                        {busy ? "Exécution…" : action.card.confirmLabel || "Confirmer"}
                    </Button>
                </div>
            )}

            {isConfirmed && (
                <div className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-success-ink">
                    <Check className="size-4" aria-hidden />
                    <span>{action.outcome ?? "Action exécutée avec succès"}</span>
                </div>
            )}
            {isCancelled && (
                <div className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-ink-3">
                    <X className="size-4" aria-hidden />
                    <span>Action annulée par le manager</span>
                </div>
            )}
            {isFailed && (
                <div className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-danger-ink">
                    <AlertTriangle className="size-4" aria-hidden />
                    <span>{action.outcome ?? "L'action a échoué"}</span>
                </div>
            )}
        </div>
    );
}
