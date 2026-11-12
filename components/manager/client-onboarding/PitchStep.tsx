"use client";

import { Database, Mail, MessageSquareText, Plus, Target, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { IconButton } from "@/components/ui/IconButton";
import { FIELD_BASE } from "@/components/ui/recipes";
import { cn } from "@/lib/utils";
import { COMPANY_SIZE_SUGGESTIONS, emptyEmail, isAiValue, TAG_SUGGESTIONS, type EmailDraft, type OnboardingForm } from "./form";
import { AiHint, Section, SourcePeek, TagField, TextAreaField, TextField } from "./ui";

interface StepProps {
    form: OnboardingForm;
    set: <K extends keyof OnboardingForm>(field: K, value: OnboardingForm[K]) => void;
    ai: Partial<OnboardingForm> | null;
    sourceText: string;
}

const SEQUENCE_LABELS = ["J1", "J+3", "J+6", "J+10"];

export function PitchStep({ form, set, ai, sourceText }: StepProps) {
    const isAi = (f: keyof OnboardingForm) => isAiValue(form, ai, f);
    const updateEmail = (key: string, patch: Partial<EmailDraft>) =>
        set("emails", form.emails.map((e) => (e.key === key ? { ...e, ...patch } : e)));
    const included = form.emails.filter((e) => e.include && (e.subject.trim() || e.body.trim())).length;

    return (
        <div className="space-y-5">
            <SourcePeek text={sourceText} />

            <Section title="Cible" icon={Target} description="Qui les SDR vont appeler pour ce client.">
                <TextAreaField
                    label="Profil client idéal"
                    value={form.icp}
                    onChange={(v) => set("icp", v)}
                    ai={isAi("icp")}
                    rows={3}
                    placeholder="PME industrielles de 50 à 500 salariés en Auvergne-Rhône-Alpes qui…"
                />
                <TagField label="Fonctions ciblées" values={form.targetJobTitles} onChange={(v) => set("targetJobTitles", v)} suggestions={TAG_SUGGESTIONS.targetJobTitles} ai={isAi("targetJobTitles")} />
                <TagField label="Secteurs ciblés" values={form.targetIndustries} onChange={(v) => set("targetIndustries", v)} suggestions={TAG_SUGGESTIONS.targetIndustries} ai={isAi("targetIndustries")} />
                <div className="grid gap-4 sm:grid-cols-2">
                    <TagField label="Zones" values={form.targetGeographies} onChange={(v) => set("targetGeographies", v)} suggestions={TAG_SUGGESTIONS.targetGeographies} ai={isAi("targetGeographies")} />
                    <TextField label="Taille d'entreprise" value={form.targetCompanySize} onChange={(v) => set("targetCompanySize", v)} suggestions={COMPANY_SIZE_SUGGESTIONS} ai={isAi("targetCompanySize")} placeholder="51-200 employés" />
                </div>
            </Section>

            <Section title="Base de données" icon={Database} description="D'où viendront les contacts à appeler.">
                <TagField label="Sources" values={form.listingSources} onChange={(v) => set("listingSources", v)} suggestions={TAG_SUGGESTIONS.listingSources} />
                <div className="grid gap-4 sm:grid-cols-2">
                    <TextField label="Volume estimé" value={form.estimatedContacts} onChange={(v) => set("estimatedContacts", v)} placeholder="800 à 1 200 contacts" />
                    <TextField label="Critères de liste" value={form.listingCriteria} onChange={(v) => set("listingCriteria", v)} placeholder="Hors clients existants, CA > 2 M€…" />
                </div>
            </Section>

            <Section title="Discours" icon={MessageSquareText} description="Repris dans la campagne de la mission : c'est ce que les SDR liront en appel.">
                <TextAreaField label="Pitch" value={form.pitch} onChange={(v) => set("pitch", v)} ai={isAi("pitch")} rows={3} placeholder="En deux ou trois phrases : ce que fait le client et pourquoi le prospect devrait l'écouter." />
                <TextAreaField label="Accroche (30 premières secondes)" value={form.introScript} onChange={(v) => set("introScript", v)} ai={isAi("introScript")} rows={4} placeholder="Bonjour {{firstName}}, …" />
                <div className="grid gap-4 lg:grid-cols-2">
                    <TextAreaField label="Qualification" value={form.discoveryScript} onChange={(v) => set("discoveryScript", v)} ai={isAi("discoveryScript")} rows={7} placeholder="Les questions pour savoir si le prospect est dans la cible." />
                    <TextAreaField label="Prise de RDV" value={form.closingScript} onChange={(v) => set("closingScript", v)} ai={isAi("closingScript")} rows={7} placeholder="Comment proposer le rendez-vous et le caler." />
                </div>
                <TextAreaField label="Objections et réponses" value={form.objectionScript} onChange={(v) => set("objectionScript", v)} ai={isAi("objectionScript")} rows={6} placeholder={"« On a déjà un prestataire »\n→ …"} />
            </Section>

            <Section
                title="Séquence email"
                icon={Mail}
                description={
                    included
                        ? `${included} email${included > 1 ? "s" : ""} créé${included > 1 ? "s" : ""} comme modèles partagés de la mission. Variables : {{firstName}}, {{companyName}}, {{senderName}}.`
                        : "Facultatif : les emails cochés deviennent des modèles de la mission."
                }
                action={
                    <div className="flex items-center gap-2">
                        <AiHint show={isAi("emails")} />
                        <Button size="xs" variant="secondary" leftIcon={<Plus className="size-3.5" aria-hidden />} onClick={() => set("emails", [...form.emails, emptyEmail()])}>
                            Ajouter
                        </Button>
                    </div>
                }
            >
                {form.emails.length === 0 ? (
                    <p className="text-sm text-ink-3">Aucun email.</p>
                ) : (
                    <ol className="space-y-3">
                        {form.emails.map((e, i) => (
                            <li key={e.key} className={cn("rounded-control border p-3 transition-opacity", e.include ? "border-line bg-surface-2" : "border-dashed border-line bg-surface opacity-60")}>
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <Checkbox
                                        label={`Email ${i + 1}${SEQUENCE_LABELS[i] ? ` · ${SEQUENCE_LABELS[i]}` : ""}`}
                                        checked={e.include}
                                        onChange={(ev) => updateEmail(e.key, { include: ev.target.checked })}
                                    />
                                    <IconButton icon={Trash2} label={`Supprimer l'email ${i + 1}`} size="sm" variant="danger" onClick={() => set("emails", form.emails.filter((x) => x.key !== e.key))} />
                                </div>
                                <input
                                    value={e.subject}
                                    onChange={(ev) => updateEmail(e.key, { subject: ev.target.value })}
                                    aria-label={`Objet de l'email ${i + 1}`}
                                    placeholder="Objet"
                                    className={cn(FIELD_BASE, "mb-2 h-9 px-3 text-[13px] font-medium")}
                                />
                                <textarea
                                    value={e.body}
                                    onChange={(ev) => updateEmail(e.key, { body: ev.target.value })}
                                    aria-label={`Corps de l'email ${i + 1}`}
                                    rows={6}
                                    placeholder="Bonjour {{firstName}}, …"
                                    className={cn(FIELD_BASE, "resize-y px-3 py-2 text-[13px] leading-relaxed")}
                                />
                            </li>
                        ))}
                    </ol>
                )}
            </Section>
        </div>
    );
}
