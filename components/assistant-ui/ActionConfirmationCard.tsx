"use client";

/**
 * An action the assistant proposes and the manager confirms: what it will do
 * (title + details), the warning, then Annuler / Confirmer. A dangerous action
 * asks once more in an AlertDialog before running.
 */

import { useState } from "react";
import { AlertTriangle, Check, KeyRound, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import { Card } from "@/components/ui/shadcn/card";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/shadcn/alert-dialog";
import type { StoredAction } from "./types";

interface ActionConfirmationCardProps {
    action: StoredAction;
    busy?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    className?: string;
}

export function ActionConfirmationCard({ action, busy = false, onConfirm, onCancel, className }: ActionConfirmationCardProps) {
    const [confirming, setConfirming] = useState(false);
    const isPending = action.state === "pending";
    const isConfirmed = action.state === "confirmed";
    const isCancelled = action.state === "cancelled";
    const isFailed = action.state === "failed";
    const danger = action.card.danger;
    const confirmLabel = action.card.confirmLabel || "Confirmer";

    return (
        <Card
            className={cn(
                "my-3 gap-0 rounded-panel p-4 text-xs shadow-2xs transition-[background-color,border-color,opacity] duration-200 ease-snappy",
                isPending && danger && "border-warning-line bg-warning-soft/50",
                isPending && !danger && "bg-surface-2",
                isConfirmed && "border-success-line bg-success-soft/50",
                isCancelled && "bg-surface-3/60 opacity-80",
                isFailed && "border-danger-line bg-danger-soft/50",
                className,
            )}
        >
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <span className="flex size-6 items-center justify-center rounded-lg border border-line bg-surface shadow-2xs">
                    <KeyRound className="size-3.5 text-accent-600" aria-hidden />
                </span>
                <span>{action.card.title}</span>
            </div>

            {action.card.details && action.card.details.length > 0 && (
                <dl className="mt-3 divide-y divide-line-subtle rounded-control border border-line bg-surface p-3 shadow-2xs">
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
                <div className="mt-3.5 flex items-center justify-end gap-2 border-t border-line-subtle pt-3">
                    <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={busy}>
                        Annuler
                    </Button>
                    <Button
                        type="button"
                        variant={danger ? "destructive" : "default"}
                        size="sm"
                        onClick={() => (danger ? setConfirming(true) : onConfirm())}
                        disabled={busy}
                    >
                        {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                        {busy ? "Exécution…" : confirmLabel}
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
                    <span>{action.outcome ?? "L’action a échoué"}</span>
                </div>
            )}

            {danger && (
                <AlertDialog open={confirming} onOpenChange={setConfirming}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>{action.card.title}</AlertDialogTitle>
                            <AlertDialogDescription>
                                {action.card.warning ?? "Cette action modifie des données et ne pourra pas être annulée depuis Captain AI."}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Annuler</AlertDialogCancel>
                            <AlertDialogAction
                                className={buttonVariants({ variant: "destructive" })}
                                onClick={() => {
                                    setConfirming(false);
                                    onConfirm();
                                }}
                            >
                                {confirmLabel}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}
        </Card>
    );
}
