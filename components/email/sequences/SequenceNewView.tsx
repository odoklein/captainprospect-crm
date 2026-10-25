"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Callout, Card, Input, Skeleton, Textarea, useToast } from "@/components/ui";
import EmailHubPage from "@/components/email/EmailHubPage";
import { apiJson, errorMessage } from "./api";
import { BackLink } from "./SequenceBits";
import { DEFAULT_SETTINGS, draftErrors, draftSignature, draftToPayload, newStep, type SequenceDraft } from "./editor/draft";
import { SettingsPanel } from "./editor/SettingsPanel";
import { StepsWorkspace } from "./editor/StepsWorkspace";
import { useSequenceOptions } from "./useSequenceOptions";
import { useUnsavedChangesGuard } from "./useUnsavedChangesGuard";

function SectionTitle({ n, title, description }: { n: number; title: string; description: string }) {
    return (
        <div className="mb-3 flex items-start gap-3">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-bold text-primary-700">{n}</span>
            <div>
                <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
                <p className="text-[13px] text-ink-3">{description}</p>
            </div>
        </div>
    );
}

export default function SequenceNewView() {
    const router = useRouter();
    const toast = useToast();
    const { options, error: optionsError, reload } = useSequenceOptions();

    const [draft, setDraft] = useState<SequenceDraft>(() => ({ settings: { ...DEFAULT_SETTINGS }, steps: [newStep(0), newStep(1)] }));
    const initial = useRef<string>(draftSignature(draft));
    const [isSaving, setIsSaving] = useState(false);
    const [showErrors, setShowErrors] = useState(false);
    const [saved, setSaved] = useState(false);

    // Preselect the best mailbox: an active SMTP/OAuth one before ReachInbox.
    useEffect(() => {
        if (!options || draft.settings.mailboxId) return;
        const active = options.mailboxes.filter((m) => m.isActive);
        const best = active.find((m) => m.provider !== "REACHINBOX") ?? active[0];
        if (best) {
            setDraft((d) => {
                const next = { ...d, settings: { ...d.settings, mailboxId: best.id } };
                initial.current = draftSignature(next);
                return next;
            });
        }
    }, [options, draft.settings.mailboxId]);

    const dirty = !saved && draftSignature(draft) !== initial.current;
    const { confirmNode } = useUnsavedChangesGuard(dirty);
    const errors = useMemo(() => draftErrors(draft), [draft]);
    const mailbox = options?.mailboxes.find((m) => m.id === draft.settings.mailboxId) ?? null;

    const setSettings = (patch: Partial<SequenceDraft["settings"]>) => setDraft((d) => ({ ...d, settings: { ...d.settings, ...patch } }));

    const create = async () => {
        if (errors.length > 0) {
            setShowErrors(true);
            return;
        }
        setIsSaving(true);
        try {
            const { data } = await apiJson<{ id: string }>("/api/email/sequences", { method: "POST", json: draftToPayload(draft) });
            setSaved(true);
            toast.success("Séquence créée", "Inscrivez maintenant les contacts qui la recevront.");
            router.push(`/manager/emails/sequences/${data.id}?tab=contacts&enroll=1`);
        } catch (e) {
            toast.error("La séquence n'a pas été créée", errorMessage(e));
            setIsSaving(false);
        }
    };

    return (
        <EmailHubPage
            eyebrow={<BackLink href="/manager/emails/sequences">Séquences</BackLink>}
            title="Nouvelle séquence"
            description="Écrivez vos emails, réglez quand ils partent, puis inscrivez des contacts. Rien n'est envoyé tant que la séquence n'est pas activée."
            actions={
                <>
                    <Link href="/manager/emails/sequences">
                        <Button variant="ghost">Annuler</Button>
                    </Link>
                    <Button onClick={create} isLoading={isSaving}>
                        Créer la séquence
                    </Button>
                </>
            }
        >
            <div className="space-y-8">
                {optionsError && (
                    <Callout tone="danger" title="Les boîtes d'envoi n'ont pas pu être chargées" action={<Button size="sm" variant="secondary" onClick={reload}>Réessayer</Button>}>
                        {optionsError}
                    </Callout>
                )}

                {showErrors && errors.length > 0 && (
                    <Callout tone="danger" title="Il manque quelques informations">
                        <ul className="list-disc pl-4">
                            {errors.map((e) => (
                                <li key={e}>{e}</li>
                            ))}
                        </ul>
                    </Callout>
                )}

                <section>
                    <SectionTitle n={1} title="Nom" description="Pour la retrouver dans la liste. Les contacts ne le voient pas." />
                    <Card padding="sm" className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                        <Input
                            label="Nom de la séquence"
                            placeholder="Ex. : Relance salons — directeurs commerciaux"
                            value={draft.settings.name}
                            onChange={(e) => setSettings({ name: e.target.value })}
                            maxLength={120}
                            required
                            autoFocus
                            error={showErrors && !draft.settings.name.trim() ? "Donnez un nom à la séquence" : undefined}
                        />
                        <Textarea
                            label="Description (facultatif)"
                            rows={1}
                            value={draft.settings.description}
                            onChange={(e) => setSettings({ description: e.target.value })}
                            placeholder="Cible, objectif, mission concernée…"
                        />
                    </Card>
                </section>

                <section>
                    <SectionTitle
                        n={2}
                        title="Emails"
                        description="Le premier part à l'inscription (dans le créneau d'envoi), les relances suivent après le délai choisi."
                    />
                    <StepsWorkspace
                        steps={draft.steps}
                        onChange={(steps) => setDraft((d) => ({ ...d, steps }))}
                        mailbox={mailbox}
                        timezone={draft.settings.timezone}
                        stopOnReply={draft.settings.stopOnReply}
                        myEmail={options?.me?.email}
                    />
                </section>

                <section>
                    <SectionTitle n={3} title="Réglages d'envoi" description="Depuis quelle boîte, à quels moments, et quand s'arrêter." />
                    {options ? (
                        <SettingsPanel settings={draft.settings} onChange={setSettings} mailboxes={options.mailboxes} />
                    ) : (
                        <Skeleton className="h-64 w-full rounded-2xl" />
                    )}
                </section>

                <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-5">
                    <p className="mr-auto text-[13px] text-ink-3">
                        Étape suivante : inscrire des contacts, puis activer la séquence.
                    </p>
                    <Link href="/manager/emails/sequences">
                        <Button variant="ghost">Annuler</Button>
                    </Link>
                    <Button onClick={create} isLoading={isSaving}>
                        Créer la séquence
                    </Button>
                </div>
            </div>
            {confirmNode}
        </EmailHubPage>
    );
}
