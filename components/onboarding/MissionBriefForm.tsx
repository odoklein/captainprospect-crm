"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { Textarea } from "@/components/ui/Textarea";
import { missionBriefSchema, type MissionBrief } from "@/lib/onboarding/self-service-schema";
import { emptyAnswers, type Answers } from "@/lib/client-onboarding/questionnaire";
import { OfferScreen, PitchScreen, ValueScreen } from "@/components/client-onboarding/screens";

const STEPS = [
    { label: "La mission", keys: ["name", "objective", "channels", "startDate", "endDate", "targetMeetings"] },
    { label: "Votre cible", keys: ["targetAudience", "geography", "exclusions"] },
    { label: "Votre offre", keys: ["offer", "differentiators"] },
];
const CHANNELS = { CALL: "Appel", EMAIL: "Email", LINKEDIN: "LinkedIn" } as const;

export function MissionBriefForm({ initial, missionId, onSaved }: { initial?: Partial<MissionBrief>; missionId?: string; onSaved: () => void }) {
    const [step, setStep] = useState(0);
    const heading = useRef<HTMLHeadingElement>(null);
    useEffect(() => { heading.current?.focus(); }, [step]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [form, setForm] = useState<MissionBrief>(() => ({
        name: "", objective: "", channels: ["CALL"], startDate: "", endDate: "", targetMeetings: null,
        targetAudience: "", geography: "", offer: "", differentiators: "", exclusions: "", ...initial,
        questionnaire: initial?.questionnaire ?? { ...emptyAnswers(), company: { ...emptyAnswers().company, pitch: initial?.offer ?? "" }, message: { ...emptyAnswers().message, proof: initial?.differentiators ?? "" } },
    }));
    const updateQuestionnaire = useCallback((edit: (answers: Answers) => void) => {
        setForm((previous) => {
            const questionnaire = structuredClone(previous.questionnaire ?? emptyAnswers());
            edit(questionnaire);
            const message = questionnaire.message;
            return { ...previous, questionnaire,
                offer: [questionnaire.company.pitch, questionnaire.company.offer].filter(Boolean).join("\n\n"),
                differentiators: [message.valueProposition, ...message.benefits, message.proof].filter(Boolean).join("\n\n"),
            };
        });
        setErrors((previous) => ({ ...previous, offer: "", differentiators: "" }));
    }, []);
    function update<K extends keyof MissionBrief>(key: K, value: MissionBrief[K]) {
        setForm((previous) => ({ ...previous, [key]: value }));
        setErrors((previous) => ({ ...previous, [key]: "" }));
    }
    function validate(onlyStep?: number) {
        const result = missionBriefSchema.safeParse(form);
        if (result.success) { setErrors({}); return result.data; }
        const issues = result.error.issues.filter((issue) => onlyStep === undefined || STEPS[onlyStep].keys.includes(String(issue.path[0])));
        setErrors(Object.fromEntries(issues.map((issue) => [issue.path[0], issue.message])));
        if (!issues.length) return form;
        if (onlyStep === undefined) setStep(Math.max(0, STEPS.findIndex((step) => step.keys.includes(String(issues[0].path[0])))));
        return null;
    }
    async function submit(event: FormEvent) {
        event.preventDefault();
        if (step < 2) { if (validate(step)) setStep((current) => current + 1); return; }
        const input = validate();
        if (!input) return;
        setBusy(true); setError("");
        try {
            const response = await fetch(`/api/client/missions${missionId ? `/${encodeURIComponent(missionId)}` : ""}`, {
                method: missionId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
            });
            const json = await response.json();
            if (!response.ok || !json.success) throw new Error(json.error || "Impossible d’enregistrer la mission.");
            onSaved();
        } catch (error) { setError(error instanceof Error ? error.message : "Une erreur est survenue."); }
        finally { setBusy(false); }
    }

    return <form className="ss-brief-form" onSubmit={submit} noValidate>
        <ol className="ss-progress" aria-label="Étapes du brief">
            {STEPS.map((item, index) => <li key={item.label} aria-current={step === index ? "step" : undefined} data-done={index < step}><span>{index < step ? <Check size={14} /> : index + 1}</span>{item.label}</li>)}
        </ol>
        <div className="ss-form" key={step}>
            <h3 tabIndex={-1} ref={heading}>{STEPS[step].label}</h3>
            {step === 0 && <>
                <Input label="Nom de la mission" value={form.name} onChange={(event) => update("name", event.target.value)} maxLength={200} required error={errors.name} placeholder="Ex. Développer notre présence en Île-de-France" />
                <Textarea label="Quel résultat souhaitez-vous obtenir ?" value={form.objective} onChange={(event) => update("objective", event.target.value)} maxLength={5000} required error={errors.objective} placeholder="Décrivez vos objectifs commerciaux et ce qui fera le succès de cette mission." />
                <fieldset><legend className="ss-label">Canaux de prospection</legend><div className="ss-channel-options">
                    {(Object.entries(CHANNELS) as [MissionBrief["channels"][number], string][]).map(([channel, label]) => <label key={channel}>
                        <input type="checkbox" checked={form.channels.includes(channel)} onChange={(event) => update("channels", event.target.checked ? [...form.channels, channel] : form.channels.filter((item) => item !== channel))} />{label}
                    </label>)}
                </div>{errors.channels && <p className="ss-error" role="alert">{errors.channels}</p>}</fieldset>
                <div className="ss-field-pair">
                    <Input label="Date de début souhaitée" type="date" value={form.startDate} onChange={(event) => update("startDate", event.target.value)} required error={errors.startDate} />
                    <Input label="Date de fin souhaitée" type="date" min={form.startDate || undefined} value={form.endDate} onChange={(event) => update("endDate", event.target.value)} required error={errors.endDate} />
                </div>
                <Input label="Nombre de rendez-vous visés (facultatif)" type="number" min={1} max={100000} value={form.targetMeetings ?? ""} onChange={(event) => update("targetMeetings", event.target.value ? Number(event.target.value) : null)} error={errors.targetMeetings} />
            </>}
            {step === 1 && <>
                <Textarea label="Qui souhaitez-vous toucher ?" value={form.targetAudience} onChange={(event) => update("targetAudience", event.target.value)} maxLength={10000} required error={errors.targetAudience} placeholder="Secteurs, taille d’entreprise, fonctions et profils décisionnaires…" rows={6} />
                <Input label="Zone géographique (facultatif)" value={form.geography} onChange={(event) => update("geography", event.target.value)} maxLength={2000} error={errors.geography} placeholder="Ex. France, Belgique francophone" />
                <Textarea label="Entreprises ou profils à exclure (facultatif)" value={form.exclusions} onChange={(event) => update("exclusions", event.target.value)} maxLength={10000} error={errors.exclusions} placeholder="Clients existants, concurrents, secteurs à éviter…" />
            </>}
            {step === 2 && <>
                <PitchScreen answers={form.questionnaire!} update={updateQuestionnaire} clientName="Votre mission" />
                <OfferScreen answers={form.questionnaire!} update={updateQuestionnaire} clientName="Votre mission" />
                <ValueScreen answers={form.questionnaire!} update={updateQuestionnaire} clientName="Votre mission" />
                {errors.offer && <p className="ss-error" role="alert">{errors.offer}</p>}
                <div className="ss-note"><Check size={18} aria-hidden /><p>Votre mission sera enregistrée en brouillon. L’agence reprend votre brief, prépare la campagne et valide le lancement avec vous.</p></div>
            </>}
        </div>
        {error && <p className="ss-error" role="alert">{error}</p>}
        <div className="ss-form-actions">
            <Button type="button" variant="ghost" disabled={busy || step === 0} onClick={() => setStep((current) => current - 1)} leftIcon={<ArrowLeft size={16} />}>Retour</Button>
            <Button type="submit" isLoading={busy} rightIcon={<ArrowRight size={16} />}>{step < 2 ? "Continuer" : missionId ? "Enregistrer les modifications" : "Enregistrer ma mission"}</Button>
        </div>
    </form>;
}
