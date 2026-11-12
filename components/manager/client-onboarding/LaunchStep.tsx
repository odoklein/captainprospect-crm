"use client";

import { CalendarDays, Check, ClipboardCheck, ListChecks, Rocket } from "lucide-react";
import { Checkbox } from "@/components/ui/Checkbox";
import { Chip } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";
import { FOCUS_RING } from "@/components/ui/recipes";
import { addMonths } from "@/lib/onboarding/client-create";
import { cn } from "@/lib/utils";
import { CHANNEL_LABELS, isAiValue, missingItems, type Channel, type MissingItem, type OnboardingForm, type SourceMode } from "./form";
import { NumberField, Section, TextField } from "./ui";

interface StepProps {
    form: OnboardingForm;
    set: <K extends keyof OnboardingForm>(field: K, value: OnboardingForm[K]) => void;
    ai: Partial<OnboardingForm> | null;
    today: string;
    mode: SourceMode;
    onJump: (step: MissingItem["step"]) => void;
}

const CHANNELS: Channel[] = ["CALL", "EMAIL", "LINKEDIN"];

function fmtDay(day: string): string {
    return new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export function LaunchStep({ form, set, ai, today, mode, onJump }: StepProps) {
    const isAi = (f: keyof OnboardingForm) => isAiValue(form, ai, f);
    const start = form.targetLaunchDate || today;
    const end = addMonths(new Date(`${start}T12:00:00Z`), form.missionDurationMonths || 3).toISOString().slice(0, 10);
    const past = !!form.targetLaunchDate && form.targetLaunchDate < today;
    const toggleChannel = (c: Channel) => {
        const has = form.missionChannels.includes(c);
        const next = has ? form.missionChannels.filter((x) => x !== c) : [...form.missionChannels, c];
        set("missionChannels", next.length ? CHANNELS.filter((x) => next.includes(x)) : [c]);
    };

    const interlocuteurs = form.contacts.filter((c) => c.asInterlocuteur && c.name.trim()).length;
    const emails = form.emails.filter((e) => e.include && (e.subject.trim() || e.body.trim())).length;
    const hasCampaign = !!(form.introScript.trim() || form.discoveryScript.trim() || form.closingScript.trim() || form.objectionScript.trim() || form.icp.trim() || form.pitch.trim());
    const missing = missingItems(form);

    const created: string[] = [`Client « ${form.name.trim() || "—"} » et sa fiche d'onboarding`];
    if (interlocuteurs) created.push(`${interlocuteurs} interlocuteur${interlocuteurs > 1 ? "s" : ""} RDV`);
    if (form.createMission) {
        created.push(
            `Mission « ${form.missionName.trim() || `Mission ${form.name.trim()}`} » · ${form.missionChannels.map((c) => CHANNEL_LABELS[c]).join(" + ")} · du ${fmtDay(start)} au ${fmtDay(end)}`,
        );
        if (hasCampaign) created.push("Campagne avec la cible, le pitch et les scripts");
        if (emails) created.push(`${emails} modèle${emails > 1 ? "s" : ""} d'email rattaché${emails > 1 ? "s" : ""} à la mission`);
    }
    if (form.startChecklist) created.push(`Checklist d'onboarding démarrée (J0 = ${fmtDay(form.checklistStartDay || today)}), étapes assignées à vous`);
    if (mode !== "manual") created.push(mode === "leexi" ? "Appel Leexi archivé avec ce qui en a été extrait" : "Récap archivé avec ce qui en a été extrait");

    return (
        <div className="space-y-5">
            <Section title="Mission" icon={Rocket}>
                <Checkbox
                    label="Créer la mission maintenant"
                    description="Avec sa campagne (cible, pitch, scripts) et les modèles d'email : les SDR peuvent être planifiés dessus."
                    checked={form.createMission}
                    onChange={(e) => set("createMission", e.target.checked)}
                />
                {form.createMission && (
                    <div className="space-y-4 border-t border-line-subtle pt-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <TextField
                                label="Nom de la mission"
                                value={form.missionName}
                                onChange={(v) => set("missionName", v)}
                                placeholder={`Mission ${form.name.trim() || "Client"}`}
                                ai={isAi("missionName")}
                            />
                            <TextField
                                label="Date de lancement"
                                type="date"
                                value={form.targetLaunchDate}
                                onChange={(v) => set("targetLaunchDate", v)}
                                ai={isAi("targetLaunchDate")}
                                hint={past ? "Cette date est passée." : form.targetLaunchDate ? "Début de la mission et premier jour d'appels prévu." : "Vide : la mission démarre aujourd'hui."}
                            />
                        </div>
                        <Field label="Canaux">
                            <div className="flex flex-wrap gap-2" role="group" aria-label="Canaux de la mission">
                                {CHANNELS.map((c) => (
                                    <Chip key={c} selected={form.missionChannels.includes(c)} onClick={() => toggleChannel(c)}>
                                        {form.missionChannels.includes(c) && <Check className="size-3.5" aria-hidden />}
                                        {CHANNEL_LABELS[c]}
                                    </Chip>
                                ))}
                            </div>
                        </Field>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <NumberField label="Durée (mois)" value={form.missionDurationMonths} onChange={(v) => set("missionDurationMonths", v)} min={1} max={36} ai={isAi("missionDurationMonths")} />
                            <NumberField label="Jours SDR / mois" value={form.missionWorkingDays} onChange={(v) => set("missionWorkingDays", v)} min={0} max={23} ai={isAi("missionWorkingDays")} />
                            <NumberField label="Objectif RDV / mois" value={form.missionRdvTarget} onChange={(v) => set("missionRdvTarget", v)} min={0} max={500} ai={isAi("missionRdvTarget")} />
                        </div>
                        <p className="text-xs text-ink-3">
                            {form.missionWorkingDays > 0
                                ? `${form.missionWorkingDays * (form.missionDurationMonths || 3)} jours SDR au contrat · `
                                : ""}
                            fin prévue le {fmtDay(end)}
                        </p>
                        <TextField label="Objectif" value={form.missionObjective} onChange={(v) => set("missionObjective", v)} placeholder="Générer des RDV qualifiés avec les DAF de PME industrielles" />
                    </div>
                )}
            </Section>

            <Section title="Checklist d'onboarding" icon={ListChecks}>
                <Checkbox
                    label="Démarrer la checklist"
                    description="Contractualisation, cadrage, équipe, lancement : chaque étape a son échéance et apparaît dans vos tâches du jour."
                    checked={form.startChecklist}
                    onChange={(e) => set("startChecklist", e.target.checked)}
                />
                {form.startChecklist && (
                    <div className="max-w-xs">
                        <TextField
                            label="Jour J0"
                            type="date"
                            value={form.checklistStartDay}
                            onChange={(v) => set("checklistStartDay", v || today)}
                            hint="Envoi du pack contractuel ; les échéances suivent."
                        />
                    </div>
                )}
            </Section>

            <Section title="Ce qui va être créé" icon={ClipboardCheck}>
                <ul className="space-y-2">
                    {created.map((line) => (
                        <li key={line} className="flex items-start gap-2 text-sm text-ink-2">
                            <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                            {line}
                        </li>
                    ))}
                </ul>
                {missing.length > 0 && (
                    <div className="rounded-control border border-warning-line bg-warning-soft px-3 py-2.5">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-warning-ink">
                            <CalendarDays className="size-3.5" aria-hidden />À compléter (maintenant ou après création)
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {missing.map((m) => (
                                <button
                                    key={m.label}
                                    type="button"
                                    onClick={() => onJump(m.step)}
                                    className={cn("h-6 rounded-chip border border-warning-line bg-surface px-2 text-2xs font-medium text-warning-ink hover:bg-warning-soft", FOCUS_RING)}
                                >
                                    {m.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </Section>
        </div>
    );
}
