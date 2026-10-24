"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Rocket, Trash2 } from "lucide-react";
import { Button, Callout, Checkbox, IconButton, Input, Select, useToast } from "@/components/ui";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { cn } from "@/lib/utils";
import type { ChecklistSectionView, ChecklistStepView, ChecklistView } from "@/lib/onboarding/checklist-service";

export const onboardingChecklistKey = (clientId: string) => ["onboarding-checklist", clientId] as const;

function formatDay(day: string): string {
    return new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function todayParis(): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

const AUTO_HINT: Record<string, string> = {
    "first-call": "Coché automatiquement au premier appel",
    "setup-invoiced": "Coché depuis l'échéancier de facturation",
    "setup-paid": "Coché depuis l'échéancier de facturation",
};

/**
 * Client onboarding as a plain checklist (Valentin's « Docka » flow): sections
 * of steps to tick, each with a due date relative to J0 and an owner. Steps are
 * project Tasks, so due ones also show in the home's « Tâches du jour ».
 */
export function OnboardingChecklist({ clientId }: { clientId: string }) {
    const queryClient = useQueryClient();
    const { success, error: showError } = useToast();
    const key = onboardingChecklistKey(clientId);
    const base = `/api/clients/${clientId}/onboarding-checklist`;

    const [startDay, setStartDay] = useState(todayParis());
    const [busy, setBusy] = useState(false);
    const [editing, setEditing] = useState<string | null>(null);
    const [draftTitle, setDraftTitle] = useState("");
    const [adding, setAdding] = useState<string | "section" | null>(null);
    const [newTitle, setNewTitle] = useState("");
    const [newDue, setNewDue] = useState("");

    const { data, isLoading, isError, refetch } = useQuery<ChecklistView>({
        queryKey: key,
        queryFn: async () => {
            const res = await fetch(base);
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            return json.data;
        },
    });

    const { data: managers = [] } = useQuery<Array<{ id: string; name: string }>>({
        queryKey: ["users", "managers"],
        queryFn: async () => {
            const res = await fetch("/api/users?role=MANAGER&status=active&limit=100&excludeSelf=false");
            const json = await res.json();
            return json.success ? json.data.users.map((u: { id: string; name: string }) => ({ id: u.id, name: u.name })) : [];
        },
        staleTime: 5 * 60_000,
    });

    async function call(url: string, method: string, body?: unknown, okMessage?: string): Promise<boolean> {
        setBusy(true);
        try {
            const res = await fetch(url, {
                method,
                headers: body ? { "Content-Type": "application/json" } : undefined,
                body: body ? JSON.stringify(body) : undefined,
            });
            const json = await res.json();
            if (!json.success) {
                showError("Action impossible", json.error);
                return false;
            }
            if (json.data && "sections" in json.data) queryClient.setQueryData(key, json.data);
            else queryClient.invalidateQueries({ queryKey: key });
            queryClient.invalidateQueries({ queryKey: ["manager-home-today"] });
            if (okMessage) success(okMessage);
            return true;
        } catch {
            showError("Action impossible", "Vérifiez votre connexion et réessayez.");
            return false;
        } finally {
            setBusy(false);
        }
    }

    const patchStep = (step: { id: string }, body: Record<string, unknown>) =>
        call(`${base}/steps/${step.id}`, "PATCH", body);

    if (isLoading) return <p className="text-sm text-ink-3">Chargement de l&apos;onboarding…</p>;
    if (isError || !data) {
        return (
            <Callout
                tone="danger"
                title="Impossible de charger l'onboarding"
                action={
                    <Button size="sm" variant="secondary" onClick={() => refetch()}>
                        Réessayer
                    </Button>
                }
            />
        );
    }

    if (data.sections.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-line bg-surface-2 p-6 text-center">
                <Rocket className="mx-auto h-6 w-6 text-ink-3" aria-hidden />
                <p className="mt-2 text-sm font-semibold text-ink">Aucun onboarding démarré pour ce client.</p>
                <p className="mt-1 text-xs text-ink-3">
                    Contractualisation, cadrage, équipe, lancement : chaque étape reçoit une échéance à partir de la date de démarrage.
                </p>
                <div className="mx-auto mt-4 flex max-w-sm flex-wrap items-end justify-center gap-2">
                    <div className="w-44">
                        <Input type="date" label="Date de démarrage" value={startDay} onChange={(e) => setStartDay(e.target.value)} />
                    </div>
                    <Button
                        variant="primary"
                        isLoading={busy}
                        disabled={!startDay}
                        onClick={() => call(base, "POST", { startDay }, "Onboarding démarré")}
                    >
                        Démarrer l&apos;onboarding
                    </Button>
                </div>
            </div>
        );
    }

    const managerOptions = [{ value: "", label: "Non assignée" }, ...managers.map((m) => ({ value: m.id, label: m.name }))];

    function renderStep(section: ChecklistSectionView, step: ChecklistStepView, index: number) {
        const isEditing = editing === step.id;
        return (
            <li key={step.id} className="group flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <Checkbox
                    checked={step.done}
                    disabled={busy}
                    onChange={(e) => patchStep(step, { done: e.target.checked })}
                    aria-label={step.done ? `Rouvrir « ${step.title} »` : `Cocher « ${step.title} »`}
                />
                <div className="min-w-0 flex-1">
                    {isEditing ? (
                        <form
                            className="flex gap-2"
                            onSubmit={async (e) => {
                                e.preventDefault();
                                if (await patchStep(step, { title: draftTitle })) setEditing(null);
                            }}
                        >
                            <Input size="sm" value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} autoFocus />
                            <IconButton icon={Check} label="Enregistrer" size="sm" type="submit" />
                        </form>
                    ) : (
                        <p className={cn("text-sm", step.done ? "text-ink-3 line-through" : "text-ink")}>{step.title}</p>
                    )}
                    {step.autoDetected && step.completedDay && (
                        <p className="text-xs text-ink-3">Détecté automatiquement le {formatDay(step.completedDay)}</p>
                    )}
                    {!step.done && step.auto && <p className="text-xs text-ink-3">{AUTO_HINT[step.auto]}</p>}
                </div>
                <input
                    type="date"
                    value={step.dueDay ?? ""}
                    onChange={(e) => patchStep(step, { dueDay: e.target.value || null })}
                    aria-label="Échéance"
                    className={cn(
                        "h-8 rounded-lg border bg-surface px-2 text-xs",
                        step.overdue ? "border-danger-line text-danger" : "border-line text-ink-2",
                    )}
                />
                {step.offsetDays !== null && <span className="w-10 text-right text-xs text-ink-3">J+{step.offsetDays}</span>}
                <div className="w-40">
                    <Select
                        options={managerOptions}
                        value={step.assignee?.id ?? ""}
                        onChange={(value) => patchStep(step, { assigneeId: value || null })}
                    />
                </div>
                <div className="flex gap-0.5 opacity-60 group-hover:opacity-100">
                    <IconButton
                        icon={Pencil}
                        label="Renommer"
                        size="sm"
                        onClick={() => {
                            setDraftTitle(step.title);
                            setEditing(step.id);
                        }}
                    />
                    <IconButton icon={ArrowUp} label="Monter" size="sm" disabled={index === 0} onClick={() => patchStep(step, { move: "up" })} />
                    <IconButton
                        icon={ArrowDown}
                        label="Descendre"
                        size="sm"
                        disabled={index === section.steps.length - 1}
                        onClick={() => patchStep(step, { move: "down" })}
                    />
                    <IconButton
                        icon={Trash2}
                        label="Supprimer"
                        size="sm"
                        onClick={() => {
                            if (window.confirm(`Supprimer l'étape « ${step.title} » ?`)) call(`${base}/steps/${step.id}`, "DELETE");
                        }}
                    />
                </div>
            </li>
        );
    }

    function renderAddForm(parentId: string | null) {
        return (
            <form
                className="mt-2 flex flex-wrap items-end gap-2"
                onSubmit={async (e) => {
                    e.preventDefault();
                    const ok = await call(`${base}/steps`, "POST", {
                        parentId,
                        title: newTitle,
                        dueDay: parentId ? newDue || null : null,
                    });
                    if (ok) {
                        setAdding(null);
                        setNewTitle("");
                        setNewDue("");
                    }
                }}
            >
                <div className="min-w-[220px] flex-1">
                    <Input
                        size="sm"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder={parentId ? "Nouvelle étape" : "Nouvelle section"}
                        autoFocus
                    />
                </div>
                {parentId && (
                    <div className="w-40">
                        <Input size="sm" type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} aria-label="Échéance" />
                    </div>
                )}
                <Button size="sm" variant="primary" type="submit" disabled={!newTitle.trim()} isLoading={busy}>
                    Ajouter
                </Button>
                <Button size="sm" variant="ghost" type="button" onClick={() => setAdding(null)}>
                    Annuler
                </Button>
            </form>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-[220px] flex-1">
                    <p className="text-sm font-semibold text-ink">
                        {data.progress.done}/{data.progress.total} étapes
                    </p>
                    <ProgressBar value={data.progress.done} max={Math.max(1, data.progress.total)} height="sm" tone="success" className="mt-1.5" />
                    {data.firstCallDay && <p className="mt-1 text-xs text-ink-3">Premier appel le {formatDay(data.firstCallDay)}</p>}
                </div>
                <div className="flex flex-wrap items-end gap-2">
                    <div className="w-40">
                        <Input
                            size="sm"
                            type="date"
                            label="Démarrage (J0)"
                            value={data.startDay ?? ""}
                            onChange={(e) => e.target.value && call(base, "PATCH", { startDay: e.target.value }, "Échéances décalées")}
                        />
                    </div>
                    <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => {
                            if (window.confirm("Utiliser cette checklist comme modèle pour les prochains clients ?")) {
                                call(`${base}/template`, "POST", undefined, "Modèle par défaut enregistré");
                            }
                        }}
                    >
                        Enregistrer comme modèle par défaut
                    </Button>
                </div>
            </div>

            {data.complete && data.onboardingStatus !== "ACTIVE" && (
                <Callout
                    tone="success"
                    title="Onboarding terminé"
                    action={
                        <Button size="sm" variant="primary" isLoading={busy} onClick={() => call(base, "PATCH", { activate: true }, "Client passé en Actif")}>
                            Passer le client en Actif
                        </Button>
                    }
                >
                    Toutes les étapes sont cochées.
                </Callout>
            )}

            {data.sections.map((section, sIndex) => (
                <section key={section.id} className="rounded-xl border border-line bg-surface p-4">
                    <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-ink">
                            {section.title}{" "}
                            <span className="font-normal text-ink-3">
                                · {section.done}/{section.total}
                            </span>
                        </h3>
                        <div className="flex gap-0.5">
                            <IconButton icon={ArrowUp} label="Monter la section" size="sm" disabled={sIndex === 0} onClick={() => patchStep(section, { move: "up" })} />
                            <IconButton
                                icon={ArrowDown}
                                label="Descendre la section"
                                size="sm"
                                disabled={sIndex === data.sections.length - 1}
                                onClick={() => patchStep(section, { move: "down" })}
                            />
                            <IconButton
                                icon={Trash2}
                                label="Supprimer la section"
                                size="sm"
                                onClick={() => {
                                    if (window.confirm(`Supprimer la section « ${section.title} » et ses étapes ?`)) {
                                        call(`${base}/steps/${section.id}`, "DELETE");
                                    }
                                }}
                            />
                        </div>
                    </div>
                    <ul className="mt-1 divide-y divide-line">{section.steps.map((step, i) => renderStep(section, step, i))}</ul>
                    {adding === section.id ? (
                        renderAddForm(section.id)
                    ) : (
                        <Button
                            size="xs"
                            variant="ghost"
                            className="mt-2"
                            leftIcon={<Plus className="h-3.5 w-3.5" aria-hidden />}
                            onClick={() => {
                                setNewTitle("");
                                setNewDue("");
                                setAdding(section.id);
                            }}
                        >
                            Ajouter une étape
                        </Button>
                    )}
                </section>
            ))}

            {adding === "section" ? (
                renderAddForm(null)
            ) : (
                <Button size="sm" variant="secondary" leftIcon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setAdding("section")}>
                    Ajouter une section
                </Button>
            )}
        </div>
    );
}
