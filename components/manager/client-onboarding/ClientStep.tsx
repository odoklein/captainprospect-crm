"use client";

import { useEffect, useState } from "react";
import { Building2, Plus, StickyNote, Trash2, UserRound } from "lucide-react";
import Button from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Checkbox } from "@/components/ui/Checkbox";
import { IconButton } from "@/components/ui/IconButton";
import { FIELD_BASE } from "@/components/ui/recipes";
import { cn } from "@/lib/utils";
import { emptyContact, INDUSTRY_SUGGESTIONS, isAiValue, type ContactDraft, type FormErrors, type OnboardingForm } from "./form";
import { AiHint, Section, SourcePeek, TextAreaField, TextField } from "./ui";

interface SimilarClient {
    id: string;
    name: string;
    createdAt: string;
}

interface StepProps {
    form: OnboardingForm;
    set: <K extends keyof OnboardingForm>(field: K, value: OnboardingForm[K]) => void;
    ai: Partial<OnboardingForm> | null;
    errors: FormErrors;
    sourceText: string;
}

/** Existing clients with a close name, checked while typing. */
function useSimilarClients(name: string): SimilarClient[] {
    const [similar, setSimilar] = useState<SimilarClient[]>([]);
    useEffect(() => {
        const q = name.trim();
        if (q.length < 2) {
            setSimilar([]);
            return;
        }
        const controller = new AbortController();
        const t = setTimeout(async () => {
            try {
                const res = await fetch(`/api/clients/similar?name=${encodeURIComponent(q)}`, { signal: controller.signal });
                const json = await res.json();
                if (json.success) setSimilar(json.data);
            } catch {
                // a failed duplicate check never blocks the form
            }
        }, 400);
        return () => {
            clearTimeout(t);
            controller.abort();
        };
    }, [name]);
    return similar;
}

export function ClientStep({ form, set, ai, errors, sourceText }: StepProps) {
    const similar = useSimilarClients(form.name);
    const isAi = (f: keyof OnboardingForm) => isAiValue(form, ai, f);

    const updateContact = (key: string, patch: Partial<ContactDraft>) =>
        set("contacts", form.contacts.map((c) => (c.key === key ? { ...c, ...patch } : c)));
    const makeMain = (c: ContactDraft) => {
        set("email", c.email);
        set("phone", c.phone);
    };

    return (
        <div className="space-y-5">
            <SourcePeek text={sourceText} />

            <Section title="Entreprise" icon={Building2}>
                <TextField
                    label="Nom de l'entreprise"
                    required
                    value={form.name}
                    onChange={(v) => set("name", v)}
                    ai={isAi("name")}
                    error={errors.name}
                    placeholder="Acme"
                    autoFocus={!form.name}
                />
                {similar.length > 0 && (
                    <Callout tone="warning" title="Un client au nom proche existe déjà">
                        {similar.map((s) => `${s.name} (créé le ${new Date(s.createdAt).toLocaleDateString("fr-FR")})`).join(" · ")}. Vérifiez qu&apos;il ne s&apos;agit pas d&apos;un doublon.
                    </Callout>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                    <TextField label="Secteur d'activité" value={form.industry} onChange={(v) => set("industry", v)} ai={isAi("industry")} suggestions={INDUSTRY_SUGGESTIONS} placeholder="SaaS / Tech" />
                    <TextField label="Site web" value={form.website} onChange={(v) => set("website", v)} ai={isAi("website")} error={errors.website} placeholder="acme.fr" />
                    <TextField label="Email de contact" type="email" value={form.email} onChange={(v) => set("email", v)} ai={isAi("email")} error={errors.email} placeholder="contact@acme.fr" />
                    <TextField label="Téléphone" type="tel" value={form.phone} onChange={(v) => set("phone", v)} ai={isAi("phone")} placeholder="+33 1 23 45 67 89" />
                </div>
            </Section>

            <Section
                title="Contacts côté client"
                description="Les interlocuteurs cochés sont créés pour recevoir les RDV ; le premier devient l'interlocuteur par défaut de la mission."
                icon={UserRound}
                action={
                    <div className="flex items-center gap-2">
                        <AiHint show={isAi("contacts")} />
                        <Button size="xs" variant="secondary" leftIcon={<Plus className="size-3.5" aria-hidden />} onClick={() => set("contacts", [...form.contacts, emptyContact()])}>
                            Ajouter
                        </Button>
                    </div>
                }
            >
                {errors.contacts && <p className="text-xs font-medium text-danger-ink">{errors.contacts}</p>}
                {form.contacts.length === 0 ? (
                    <p className="text-sm text-ink-3">Aucun contact. Ajoutez au moins la personne qui recevra les RDV.</p>
                ) : (
                    <ul className="space-y-3">
                        {form.contacts.map((c) => {
                            const isMain = !!c.email && c.email === form.email;
                            return (
                                <li key={c.key} className="rounded-control border border-line bg-surface-2 p-3">
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <ContactInput label="Nom" value={c.name} onChange={(v) => updateContact(c.key, { name: v })} placeholder="Prénom Nom" />
                                        <ContactInput label="Fonction" value={c.role} onChange={(v) => updateContact(c.key, { role: v })} placeholder="Directeur commercial" />
                                        <ContactInput label="Email" type="email" value={c.email} onChange={(v) => updateContact(c.key, { email: v })} placeholder="prenom@acme.fr" />
                                        <ContactInput label="Téléphone" type="tel" value={c.phone} onChange={(v) => updateContact(c.key, { phone: v })} placeholder="06 12 34 56 78" />
                                    </div>
                                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                        <Checkbox
                                            label="Interlocuteur RDV"
                                            checked={c.asInterlocuteur}
                                            onChange={(e) => updateContact(c.key, { asInterlocuteur: e.target.checked })}
                                        />
                                        <div className="flex items-center gap-1">
                                            {isMain ? (
                                                <span className="px-2 text-xs font-medium text-success-ink">Contact principal</span>
                                            ) : (
                                                <Button size="xs" variant="ghost" onClick={() => makeMain(c)} disabled={!c.email && !c.phone}>
                                                    Définir comme contact principal
                                                </Button>
                                            )}
                                            <IconButton
                                                icon={Trash2}
                                                label={`Retirer ${c.name || "ce contact"}`}
                                                size="sm"
                                                variant="danger"
                                                onClick={() => set("contacts", form.contacts.filter((x) => x.key !== c.key))}
                                            />
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </Section>

            <Section title="Notes internes" icon={StickyNote} description="Contexte, différenciateurs, concurrents, engagements pris pendant l'appel.">
                <TextAreaField label="Notes" value={form.notes} onChange={(v) => set("notes", v)} ai={isAi("notes")} rows={6} placeholder="Ce qu'il faut savoir avant de lancer la mission…" />
            </Section>
        </div>
    );
}

function ContactInput({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
    return (
        <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-3">{label}</span>
            <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cn(FIELD_BASE, "h-9 px-3 text-[13px]")} />
        </label>
    );
}
