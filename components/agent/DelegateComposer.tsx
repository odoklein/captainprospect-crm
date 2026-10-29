"use client";

/**
 * « Déléguer une mission »: a goal in plain French, a scope (agency or one
 * client), a budget (MISSION_BUDGETS) and a dry-run switch. « Lancer »
 * queues the mission and hands the new run id back, so the caller opens its
 * RunDetail and the manager watches it start.
 */

import { useState } from "react";
import { Gauge, Loader2, Rocket, Telescope } from "lucide-react";
import { cn } from "@/lib/utils";
import { Drawer } from "@/components/ui/Drawer";
import { Field } from "@/components/ui/Field";
import { Kbd } from "@/components/ui/Kbd";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { AiMark } from "@/components/ui/AiMark";
import { FOCUS_RING } from "@/components/ui/recipes";
import { PRIMARY_BUTTON, SECONDARY_BUTTON, SelectField } from "@/components/accueil/AccueilUI";
import { MISSION_BUDGETS, type CreateMissionBody } from "@/lib/assistant/api-contract";
import { formatDuration, formatEur } from "@/lib/agent/client/format";
import { createMission, useClientOptions, type ClientOption } from "@/lib/agent/client/hooks";

type BudgetKey = CreateMissionBody["budget"];

const GOAL_MAX = 2000;

const BUDGETS: Array<{ key: BudgetKey; label: string; hint: string; icon: typeof Gauge }> = [
    { key: "rapide", label: "Rapide", hint: "Une question précise, une réponse courte.", icon: Gauge },
    { key: "standard", label: "Standard", hint: "Une analyse croisée sur plusieurs sources.", icon: Rocket },
    { key: "approfondi", label: "Approfondi", hint: "Une enquête complète, avec propositions d’actions.", icon: Telescope },
];

const STARTERS = [
    "Pourquoi le taux de RDV a-t-il baissé ce mois-ci, et que faire ?",
    "Prépare un point client : résultats, risques et prochaines actions.",
    "Repère les listes épuisées et propose quoi relancer.",
];

export function DelegateComposer({
    open,
    onClose,
    client,
    onLaunched,
}: {
    open: boolean;
    onClose: () => void;
    /** Prefills and locks the scope (folder panel). */
    client?: ClientOption | null;
    onLaunched: (runId: string) => void;
}) {
    return (
        <Drawer
            isOpen={open}
            onClose={onClose}
            size="md"
            title="Déléguer une mission"
            description={client ? client.name : "L’agent travaille en arrière-plan et te soumet ses propositions"}
        >
            {open && <ComposerBody client={client ?? null} onClose={onClose} onLaunched={onLaunched} />}
        </Drawer>
    );
}

function ComposerBody({ client, onClose, onLaunched }: { client: ClientOption | null; onClose: () => void; onLaunched: (runId: string) => void }) {
    const toast = useToast();
    const { clients } = useClientOptions(!client);
    const [goal, setGoal] = useState("");
    const [clientId, setClientId] = useState<string>(client?.clientId ?? "");
    const [budget, setBudget] = useState<BudgetKey>("standard");
    const [dryRun, setDryRun] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const trimmed = goal.trim();
    const canSend = trimmed.length >= 8 && trimmed.length <= GOAL_MAX && !sending;

    const launch = async () => {
        if (!canSend) {
            setError(trimmed.length < 8 ? "Décris la mission en une phrase au moins." : null);
            return;
        }
        setError(null);
        setSending(true);
        const scope = client ?? clients.find((c) => c.clientId === clientId) ?? null;
        try {
            const runId = await createMission({
                goal: trimmed,
                budget,
                dryRun,
                clientId: scope?.clientId ?? null,
                folderId: scope?.folderId ?? null,
            });
            toast.success("Mission lancée", dryRun ? "Mode essai : rien ne sera exécuté." : "Tu valideras ses propositions avant toute action.");
            onClose();
            if (runId) onLaunched(runId);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Lancement impossible.");
        } finally {
            setSending(false);
        }
    };

    return (
        <form
            className="space-y-5"
            onSubmit={(e) => {
                e.preventDefault();
                void launch();
            }}
            onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void launch();
                }
            }}
        >
            <div className="space-y-2">
                <Textarea
                    label="Objectif"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value.slice(0, GOAL_MAX))}
                    maxLength={GOAL_MAX}
                    showCount
                    rows={5}
                    autoFocus
                    required
                    placeholder="Ce que l’agent doit comprendre, vérifier ou préparer, et pour quand."
                    error={error ?? undefined}
                />
                {goal.length === 0 && (
                    <div className="flex flex-wrap gap-1.5" aria-label="Exemples">
                        {STARTERS.map((s) => (
                            <button
                                key={s}
                                type="button"
                                onClick={() => setGoal(s)}
                                className={cn(
                                    "rounded-chip border border-line bg-surface px-2.5 py-1 text-left text-[11px] font-medium text-ink-3 transition-colors duration-150 hover:border-line-strong hover:text-ink",
                                    FOCUS_RING,
                                )}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <Field label="Périmètre">
                {client ? (
                    <p className="flex h-10 items-center rounded-control border border-line bg-surface-2 px-3.5 text-sm font-semibold text-ink-2">{client.name}</p>
                ) : (
                    <SelectField value={clientId} onChange={setClientId} ariaLabel="Périmètre">
                        <option value="">Vue agence</option>
                        {clients.map((c) => (
                            <option key={c.clientId} value={c.clientId}>
                                {c.name}
                            </option>
                        ))}
                    </SelectField>
                )}
            </Field>

            <Field label="Budget">
                <div role="radiogroup" aria-label="Budget" className="grid gap-2 sm:grid-cols-3">
                    {BUDGETS.map((b) => {
                        const limits = MISSION_BUDGETS[b.key];
                        const active = budget === b.key;
                        const Icon = b.icon;
                        return (
                            <button
                                key={b.key}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                onClick={() => setBudget(b.key)}
                                className={cn(
                                    "relative rounded-panel border p-3 text-left transition-[border-color,background-color,box-shadow,transform] duration-150 ease-snappy active:scale-[0.99]",
                                    FOCUS_RING,
                                    active ? "border-primary-300 bg-primary-50 shadow-xs" : "border-line bg-surface hover:border-line-strong",
                                )}
                            >
                                <span className="flex items-center justify-between gap-2">
                                    <span className={cn("inline-flex items-center gap-1.5 text-sm font-bold", active ? "text-primary-700" : "text-ink")}>
                                        <Icon className="size-4" aria-hidden />
                                        {b.label}
                                    </span>
                                    <span
                                        aria-hidden
                                        className={cn(
                                            "size-4 rounded-full border-2 transition-colors duration-150",
                                            active ? "border-primary bg-primary shadow-[inset_0_0_0_2px_var(--ds-surface)]" : "border-line-strong",
                                        )}
                                    />
                                </span>
                                <span className="mt-1 block text-xs font-semibold tabular-nums text-ink-2">
                                    {formatEur(limits.maxCostEur).replace(",00", "")} · {formatDuration(limits.deadlineMs)}
                                </span>
                                <span className="mt-1 block text-[11px] leading-snug text-ink-3">{b.hint}</span>
                            </button>
                        );
                    })}
                </div>
            </Field>

            <div className="rounded-panel border border-line bg-surface p-3.5">
                <Switch
                    checked={dryRun}
                    onChange={setDryRun}
                    label="Mode essai"
                    description="L’agent mène l’enquête et rédige ses propositions, sans rien pouvoir exécuter."
                />
            </div>

            <div className="sticky bottom-0 -mx-6 -mb-6 flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle bg-surface px-6 py-4">
                <span className="hidden items-center gap-1 text-[11px] text-ink-4 sm:inline-flex">
                    <Kbd>Ctrl</Kbd>
                    <Kbd>Entrée</Kbd>
                    pour lancer
                </span>
                <div className="ml-auto flex items-center gap-2">
                    <button type="button" className={SECONDARY_BUTTON} onClick={onClose} disabled={sending}>
                        Annuler
                    </button>
                    <button type="submit" className={PRIMARY_BUTTON} disabled={!canSend}>
                        {sending ? <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden /> : <AiMark className="size-4" aria-hidden />}
                        Lancer
                    </button>
                </div>
            </div>
        </form>
    );
}
