"use client";

import { Check, Circle, Play } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/utils";

export interface ChecklistItem {
    id: string;
    label: string;
    done: boolean;
    /** Non-blocking items only warn. */
    blocking: boolean;
    hint?: string;
    action?: { label: string; onClick: () => void };
}

export function ActivationChecklist({
    items,
    onActivate,
    activating,
    isPaused,
    dirty,
}: {
    items: ChecklistItem[];
    onActivate: () => void;
    activating: boolean;
    isPaused: boolean;
    dirty: boolean;
}) {
    const ready = items.filter((i) => i.blocking).every((i) => i.done);
    const doneCount = items.filter((i) => i.done).length;

    return (
        <Card padding="none">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-subtle px-5 py-3">
                <div>
                    <h3 className="text-sm font-semibold text-ink">{isPaused ? "Reprendre les envois" : "Avant d'activer"}</h3>
                    <p className="text-xs text-ink-3">
                        {ready
                            ? isPaused
                                ? "Tout est prêt : les contacts en cours reprendront au prochain créneau."
                                : "Tout est prêt. À l'activation, le premier email part au prochain créneau d'envoi."
                            : `${doneCount} / ${items.length} prêts — complétez les points restants.`}
                    </p>
                </div>
                <Button leftIcon={<Play className="size-4" />} onClick={onActivate} isLoading={activating} disabled={!ready}>
                    {isPaused ? "Reprendre la séquence" : "Activer la séquence"}
                    {dirty ? " et enregistrer" : ""}
                </Button>
            </div>
            <ul className="grid gap-x-6 gap-y-2.5 px-5 py-4 md:grid-cols-2">
                {items.map((item) => (
                    <li key={item.id} className="flex items-start gap-2.5">
                        <span
                            className={cn(
                                "mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full",
                                item.done ? "bg-success text-white" : item.blocking ? "border border-line-strong text-ink-4" : "bg-warning-soft text-warning-ink",
                            )}
                            aria-hidden
                        >
                            {item.done ? <Check className="size-3" strokeWidth={3} /> : <Circle className="size-2 fill-current" />}
                        </span>
                        <div className="min-w-0 text-[13px]">
                            <p className={cn(item.done ? "text-ink-2" : "font-medium text-ink")}>
                                {item.label}
                                {!item.blocking && !item.done && <span className="ml-1 text-xs font-normal text-ink-4">(conseillé)</span>}
                            </p>
                            {!item.done && item.hint && <p className="text-xs text-ink-3">{item.hint}</p>}
                            {!item.done && item.action && (
                                <button type="button" onClick={item.action.onClick} className="mt-0.5 text-xs font-medium text-link hover:underline">
                                    {item.action.label}
                                </button>
                            )}
                        </div>
                    </li>
                ))}
            </ul>
        </Card>
    );
}
