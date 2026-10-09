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
                "my-3 rounded-2xl border p-4 text-xs transition-all shadow-sm",
                isPending && action.card.danger && "border-amber-300 bg-amber-50/40",
                isPending && !action.card.danger && "border-slate-200 bg-slate-50/70",
                isConfirmed && "border-emerald-200 bg-emerald-50/40",
                isCancelled && "border-slate-200 bg-slate-100/60 opacity-80",
                isFailed && "border-red-200 bg-red-50/40",
                className
            )}
        >
            <div className="flex items-center gap-2 font-semibold text-slate-900 text-sm">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white shadow-xs border border-slate-200/80">
                    <KeyRound className="h-3.5 w-3.5 text-accent-600" />
                </span>
                <span>{action.card.title}</span>
            </div>

            {action.card.details && action.card.details.length > 0 && (
                <dl className="mt-3 divide-y divide-slate-100 rounded-xl bg-white p-3 border border-slate-200/70 shadow-2xs">
                    {action.card.details.map((detail, idx) => (
                        <div
                            key={`${detail.label}-${idx}`}
                            className="flex items-center justify-between py-1.5 first:pt-0 last:pb-0 text-xs"
                        >
                            <dt className="text-slate-500 font-medium">{detail.label}</dt>
                            <dd className="font-semibold text-slate-800 text-right">{detail.value}</dd>
                        </div>
                    ))}
                </dl>
            )}

            {action.card.warning && isPending && (
                <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-amber-100/60 px-3 py-2 text-amber-800 text-[11.5px] border border-amber-200/70">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
                    <span>{action.card.warning}</span>
                </div>
            )}

            {/* Actions for pending state */}
            {isPending && (
                <div className="mt-3.5 flex items-center justify-end gap-2 pt-2 border-t border-slate-200/60">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={onCancel}
                        disabled={busy}
                    >
                        Annuler
                    </Button>
                    <Button
                        type="button"
                        variant={action.card.danger ? "danger" : "primary"}
                        size="sm"
                        onClick={onConfirm}
                        disabled={busy}
                        icon={busy ? <Loader2 className="h-3 w-3 animate-spin" /> : undefined}
                    >
                        {busy ? "Exécution…" : action.card.confirmLabel || "Confirmer"}
                    </Button>
                </div>
            )}

            {/* Settled state outcomes */}
            {isConfirmed && (
                <div className="mt-2.5 flex items-center gap-1.5 font-medium text-emerald-700 text-xs">
                    <Check className="h-4 w-4" />
                    <span>{action.outcome ?? "Action exécutée avec succès"}</span>
                </div>
            )}
            {isCancelled && (
                <div className="mt-2.5 flex items-center gap-1.5 font-medium text-slate-500 text-xs">
                    <X className="h-4 w-4" />
                    <span>Action annulée par le manager</span>
                </div>
            )}
            {isFailed && (
                <div className="mt-2.5 flex items-center gap-1.5 font-medium text-red-600 text-xs">
                    <AlertTriangle className="h-4 w-4" />
                    <span>{action.outcome ?? "L'action a échoué"}</span>
                </div>
            )}
        </div>
    );
}
