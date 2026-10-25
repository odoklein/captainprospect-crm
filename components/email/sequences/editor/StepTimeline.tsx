"use client";

import { ArrowDown, ArrowUp, CornerDownRight, Plus, Trash2 } from "lucide-react";
import { IconButton } from "@/components/ui";
import { cn } from "@/lib/utils";
import { dayLabels, delayLabel, findBracketPlaceholders, pct } from "../types";
import type { DraftStep } from "./draft";

interface StepTimelineProps {
    steps: DraftStep[];
    selectedKey: string | null;
    onSelect: (key: string) => void;
    onAdd: () => void;
    onMove: (key: string, direction: -1 | 1) => void;
    onRemove: (key: string) => void;
}

/** Vertical timeline of the emails: day, subject, first line, delay and rules. */
export function StepTimeline({ steps, selectedKey, onSelect, onAdd, onMove, onRemove }: StepTimelineProps) {
    const days = dayLabels(steps);

    return (
        <ol className="relative space-y-3" aria-label="Étapes de la séquence">
            {steps.map((step, index) => {
                const selected = step.key === selectedKey;
                const preview = step.body.replace(/\s+/g, " ").trim();
                const threaded = index > 0 && !step.subject.trim();
                const sent = step.stats?.sent ?? 0;
                const incomplete = !step.body.trim() || (index === 0 && !step.subject.trim());
                const placeholders = findBracketPlaceholders(`${step.subject}\n${step.body}`).length > 0;
                const rules = [
                    step.skipIfOpened && "si non ouvert",
                    step.skipIfClicked && "si pas de clic",
                ].filter(Boolean) as string[];

                return (
                    <li key={step.key} className="relative pl-7">
                        {/* rail */}
                        {index < steps.length - 1 && (
                            <span className="absolute left-[9px] top-6 -bottom-3 w-px bg-line" aria-hidden />
                        )}
                        <span
                            className={cn(
                                "absolute left-0 top-3 flex size-[19px] items-center justify-center rounded-full border text-[10px] font-bold",
                                selected ? "border-primary bg-primary text-primary-fg" : "border-line-strong bg-surface text-ink-3",
                            )}
                            aria-hidden
                        >
                            {index + 1}
                        </span>

                        <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink-4">
                            <span>{days[index]}</span>
                            <span className="font-normal normal-case tracking-normal">· {delayLabel(step, index)}</span>
                        </div>

                        <div
                            role="button"
                            tabIndex={0}
                            onClick={() => onSelect(step.key)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    onSelect(step.key);
                                }
                            }}
                            aria-pressed={selected}
                            className={cn(
                                "group block w-full cursor-pointer rounded-xl border bg-surface p-3 text-left transition-colors",
                                selected ? "border-primary-300 ring-2 ring-primary-100" : "border-line hover:border-line-strong",
                            )}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <p className={cn("min-w-0 truncate text-[13px] font-semibold", step.subject.trim() ? "text-ink" : "text-ink-3")}>
                                    {threaded ? (
                                        <span className="inline-flex items-center gap-1">
                                            <CornerDownRight className="size-3.5" aria-hidden /> Réponse dans le même fil
                                        </span>
                                    ) : (
                                        step.subject.trim() || "Sans objet"
                                    )}
                                </p>
                                <div
                                    className={cn("flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100", selected && "opacity-100")}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <IconButton icon={ArrowUp} label="Monter" size="xs" variant="ghost" disabled={index === 0} onClick={() => onMove(step.key, -1)} />
                                    <IconButton icon={ArrowDown} label="Descendre" size="xs" variant="ghost" disabled={index === steps.length - 1} onClick={() => onMove(step.key, 1)} />
                                    <IconButton icon={Trash2} label="Supprimer l'étape" size="xs" variant="danger" disabled={steps.length <= 1 || sent > 0} onClick={() => onRemove(step.key)} />
                                </div>
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-3">{preview || "Email vide"}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                                {incomplete && <span className="rounded-md bg-danger-soft px-1.5 py-0.5 font-medium text-danger-ink">À compléter</span>}
                                {!incomplete && placeholders && (
                                    <span className="rounded-md bg-warning-soft px-1.5 py-0.5 font-medium text-warning-ink">Champs [à remplir]</span>
                                )}
                                {rules.map((r) => (
                                    <span key={r} className="rounded-md bg-surface-3 px-1.5 py-0.5 text-ink-3">Envoyé {r}</span>
                                ))}
                                {sent > 0 && (
                                    <span className="text-ink-3">
                                        {sent} envoyé{sent > 1 ? "s" : ""} · {pct(step.stats?.opened ?? 0, sent)} ouv. · {step.stats?.replied ?? 0} rép.
                                    </span>
                                )}
                            </div>
                        </div>
                    </li>
                );
            })}

            <li className="pl-7">
                <button
                    type="button"
                    onClick={onAdd}
                    disabled={steps.length >= 20}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong px-3 py-3 text-[13px] font-medium text-ink-3 transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 disabled:opacity-50"
                >
                    <Plus className="size-4" aria-hidden /> Ajouter une relance
                </button>
            </li>
        </ol>
    );
}
