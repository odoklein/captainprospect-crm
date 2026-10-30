"use client";

/**
 * « Déléguer une mission », in a right Sheet: a goal in plain French (with a
 * counter and starters), a scope (agency or one client), a budget preset
 * (MISSION_BUDGETS, as a RadioGroup of cards) and a dry-run switch.
 * Ctrl / ⌘ + Entrée launches. « Lancer » queues the mission and hands the new
 * run id back, so the caller opens its RunDetail and watches it start.
 */

import { useState } from "react";
import { Gauge, Loader2, Rocket, Telescope } from "lucide-react";
import { cn } from "@/lib/utils";
import { AiMark } from "@/components/ui/AiMark";
import { FOCUS_RING } from "@/components/ui/recipes";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/shadcn/button";
import { Kbd, KbdGroup } from "@/components/ui/shadcn/kbd";
import { Label } from "@/components/ui/shadcn/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/shadcn/radio-group";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { Switch } from "@/components/ui/shadcn/switch";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { MISSION_BUDGETS, type CreateMissionBody } from "@/lib/assistant/api-contract";
import { formatDuration, formatEur } from "@/lib/agent/client/format";
import { createMission, useClientOptions, type ClientOption } from "@/lib/agent/client/hooks";
import { FormField, StaticField } from "./shared";

type BudgetKey = CreateMissionBody["budget"];

const GOAL_MIN = 8;
const GOAL_MAX = 2000;
const AGENCY = "__agency";
const FORM_ID = "agent-delegate-form";

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
        <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
            <SheetContent side="right" className="w-full gap-0 sm:max-w-lg">
                <SheetHeader>
                    <div className="flex items-center gap-3">
                        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-accent text-accent-fg shadow-2xs">
                            <AiMark className="size-[18px]" aria-hidden />
                        </span>
                        <div className="min-w-0">
                            <SheetTitle>Déléguer une mission</SheetTitle>
                            <SheetDescription className="text-xs">
                                {client ? `Pour ${client.name}` : "L’agent travaille en arrière-plan et te soumet ses propositions"}
                            </SheetDescription>
                        </div>
                    </div>
                </SheetHeader>
                {open && <ComposerBody client={client ?? null} onClose={onClose} onLaunched={onLaunched} />}
            </SheetContent>
        </Sheet>
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
    const canSend = trimmed.length >= GOAL_MIN && trimmed.length <= GOAL_MAX && !sending;

    const launch = async () => {
        if (!canSend) {
            setError(trimmed.length < GOAL_MIN ? "Décris la mission en une phrase au moins." : null);
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
        <>
            <form
                id={FORM_ID}
                className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5"
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
                <FormField
                    label={
                        <span className="flex w-full items-center justify-between gap-2">
                            <span>Objectif</span>
                            <span className={cn("text-2xs font-medium tabular-nums", goal.length > GOAL_MAX * 0.9 ? "text-warning-ink" : "text-ink-4")}>
                                {goal.length} / {GOAL_MAX}
                            </span>
                        </span>
                    }
                    htmlFor="agent-delegate-goal"
                    error={error ?? undefined}
                    required
                >
                    <Textarea
                        id="agent-delegate-goal"
                        value={goal}
                        onChange={(e) => {
                            setGoal(e.target.value.slice(0, GOAL_MAX));
                            if (error) setError(null);
                        }}
                        maxLength={GOAL_MAX}
                        rows={5}
                        autoFocus
                        aria-invalid={Boolean(error) || undefined}
                        placeholder="Ce que l’agent doit comprendre, vérifier ou préparer, et pour quand."
                        className="min-h-32 max-h-72"
                    />
                </FormField>
                {goal.length === 0 && (
                    <div className="-mt-3 flex flex-wrap gap-1.5" aria-label="Exemples">
                        {STARTERS.map((s, i) => (
                            <button
                                key={s}
                                type="button"
                                onClick={() => setGoal(s)}
                                style={{ animationDelay: `${i * 40}ms` }}
                                className={cn(
                                    "rounded-chip border border-line bg-surface px-2.5 py-1 text-left text-2xs font-medium text-ink-3 shadow-2xs motion-safe:animate-ds-enter",
                                    "transition-[border-color,color,background-color] duration-150 ease-snappy hover:border-accent-200 hover:bg-accent-soft hover:text-accent-soft-ink",
                                    FOCUS_RING,
                                )}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                )}

                <FormField label="Périmètre" htmlFor="agent-delegate-scope">
                    {client ? (
                        <StaticField>{client.name}</StaticField>
                    ) : (
                        <Select value={clientId === "" ? AGENCY : clientId} onValueChange={(v) => setClientId(v === AGENCY ? "" : v)}>
                            <SelectTrigger id="agent-delegate-scope" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-72">
                                <SelectItem value={AGENCY}>Vue agence</SelectItem>
                                {clients.length > 0 && <SelectSeparator />}
                                {clients.map((c) => (
                                    <SelectItem key={c.clientId} value={c.clientId}>
                                        {c.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </FormField>

                <fieldset className="grid gap-1.5">
                    <legend className="mb-1.5 text-xs font-semibold text-ink-2">Budget</legend>
                    <RadioGroup value={budget} onValueChange={(v) => setBudget(v as BudgetKey)} aria-label="Budget" className="grid gap-2 sm:grid-cols-3">
                        {BUDGETS.map((b) => {
                            const limits = MISSION_BUDGETS[b.key];
                            const active = budget === b.key;
                            const Icon = b.icon;
                            const itemId = `agent-budget-${b.key}`;
                            return (
                                <Label
                                    key={b.key}
                                    htmlFor={itemId}
                                    className={cn(
                                        "relative flex cursor-pointer flex-col items-stretch gap-1 rounded-panel border p-3 font-normal",
                                        "transition-[border-color,background-color,box-shadow,transform] duration-150 ease-snappy active:scale-[0.99]",
                                        active ? "border-primary-300 bg-primary-50 shadow-2xs" : "border-line bg-surface hover:border-line-strong",
                                    )}
                                >
                                    <span className="flex items-center justify-between gap-2">
                                        <span className={cn("inline-flex items-center gap-1.5 text-sm font-semibold", active ? "text-primary-700" : "text-ink")}>
                                            <Icon className="size-4" aria-hidden />
                                            {b.label}
                                        </span>
                                        <RadioGroupItem id={itemId} value={b.key} />
                                    </span>
                                    <span className="text-xs font-semibold tabular-nums text-ink-2">
                                        {formatEur(limits.maxCostEur).replace(",00", "")} · {formatDuration(limits.deadlineMs)}
                                    </span>
                                    <span className="text-2xs leading-snug text-ink-3">{b.hint}</span>
                                </Label>
                            );
                        })}
                    </RadioGroup>
                </fieldset>

                <div className="flex items-start justify-between gap-4 rounded-panel border border-line bg-surface px-3.5 py-3">
                    <div className="min-w-0">
                        <Label htmlFor="agent-delegate-dry" className="text-sm font-medium text-ink">
                            Mode essai
                        </Label>
                        <p className="mt-1 text-2xs leading-relaxed text-ink-3">L’agent mène l’enquête et rédige ses propositions, sans rien pouvoir exécuter.</p>
                    </div>
                    <Switch id="agent-delegate-dry" checked={dryRun} onCheckedChange={setDryRun} className="mt-0.5" />
                </div>
            </form>
            <SheetFooter className="mt-0 flex-row items-center gap-2">
                <span className="hidden items-center gap-1.5 text-2xs text-ink-4 sm:inline-flex">
                    <KbdGroup>
                        <Kbd>Ctrl</Kbd>
                        <Kbd>Entrée</Kbd>
                    </KbdGroup>
                    pour lancer
                </span>
                <div className="ml-auto flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={onClose} disabled={sending}>
                        Annuler
                    </Button>
                    <Button type="submit" form={FORM_ID} variant="ai" disabled={!canSend}>
                        {sending ? <Loader2 className="motion-safe:animate-spin" aria-hidden /> : <AiMark aria-hidden />}
                        Lancer
                    </Button>
                </div>
            </SheetFooter>
        </>
    );
}
