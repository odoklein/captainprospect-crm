"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, ExternalLink, UserPlus } from "lucide-react";
import { Button, Callout, Input, Modal, ModalFooter, RadioCardGroup, Select, Textarea, useToast } from "@/components/ui";
import type { RadioCardOption } from "@/components/ui";
import { DUPLICATE_REASON_LABELS, type DuplicateMatch } from "@/lib/prospect-submissions/matching";
import type { ProspectCreationMode, ProspectReferrer, ProspectSource } from "@/lib/prospect-submissions/types";

export interface ProspectSubmissionContext {
    mode: ProspectCreationMode;
    missionId: string;
    missionName: string;
    lists: Array<{ id: string; name: string }>;
    defaultListId: string | null;
    referrer: ProspectReferrer | null;
}

interface OtherMissionMatch {
    companyId: string;
    companyName: string;
    missionName: string;
}

interface NewProspectDialogProps {
    isOpen: boolean;
    onClose: () => void;
    context: ProspectSubmissionContext;
    fromCompanyId: string | null;
    fromContactId: string | null;
    /** A company/contact was created (DIRECT) or queued (VALIDATION). */
    onSubmitted: (result: { outcome: "CREATED" | "PENDING"; companyId?: string; contactId?: string | null }) => void;
    /** Jump to an existing sheet instead of creating a duplicate. */
    onOpenCompany?: (companyId: string, contactId?: string | null) => void;
}

const EMPTY = {
    companyName: "",
    companyPhone: "",
    website: "",
    city: "",
    civility: "",
    firstName: "",
    lastName: "",
    title: "",
    contactPhone: "",
    email: "",
    note: "",
};

type FormState = typeof EMPTY;

export function NewProspectDialog({
    isOpen,
    onClose,
    context,
    fromCompanyId,
    fromContactId,
    onSubmitted,
    onOpenCompany,
}: NewProspectDialogProps) {
    const { success, error: showError } = useToast();
    const [form, setForm] = useState<FormState>(EMPTY);
    const [source, setSource] = useState<ProspectSource>(context.referrer ? "REFERRAL" : "CLIENT_INBOUND");
    const [listId, setListId] = useState<string>(context.defaultListId ?? context.lists[0]?.id ?? "");
    const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
    const [otherMatches, setOtherMatches] = useState<OtherMissionMatch[]>([]);
    const [blocked, setBlocked] = useState<string | null>(null);
    const [fieldError, setFieldError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setForm(EMPTY);
        setSource(context.referrer ? "REFERRAL" : "CLIENT_INBOUND");
        setListId(context.defaultListId ?? context.lists[0]?.id ?? "");
        setDuplicates([]);
        setOtherMatches([]);
        setBlocked(null);
        setFieldError(null);
    }, [isOpen, context.referrer, context.defaultListId, context.lists]);

    const IDENTIFYING: Array<keyof FormState> = ["companyName", "companyPhone", "website", "contactPhone", "email"];
    const set = (key: keyof FormState) => (value: string) => {
        setForm((f) => ({ ...f, [key]: value }));
        // An edited identity invalidates the last check; the next blur re-runs it.
        if (IDENTIFYING.includes(key)) {
            setDuplicates([]);
            setBlocked(null);
        }
    };

    const sourceOptions: RadioCardOption<ProspectSource>[] = useMemo(
        () => [
            {
                value: "REFERRAL",
                title: "Recommandé par l'interlocuteur",
                description: context.referrer ? `Orienté par ${context.referrer.label}` : "Un prospect vous a orienté vers un confrère",
            },
            {
                value: "CLIENT_INBOUND",
                title: "Lead entrant du client",
                description: "Le client vous a transmis ce contact",
            },
            { value: "OTHER", title: "Autre", description: "Précisez dans la note" },
        ],
        [context.referrer],
    );

    const hasContact = !!(form.firstName.trim() || form.lastName.trim() || form.contactPhone.trim() || form.email.trim());

    function payload(extra: { dryRun?: boolean; existingCompanyId?: string | null } = {}) {
        return {
            missionId: context.missionId,
            listId,
            source,
            note: form.note.trim() || null,
            fromCompanyId: source === "REFERRAL" ? fromCompanyId : null,
            fromContactId: source === "REFERRAL" ? fromContactId : null,
            company: {
                name: form.companyName.trim(),
                phone: form.companyPhone.trim() || null,
                website: form.website.trim() || null,
                city: form.city.trim() || null,
            },
            contact: hasContact
                ? {
                      civility: form.civility === "M." || form.civility === "Mme" ? form.civility : null,
                      firstName: form.firstName.trim() || null,
                      lastName: form.lastName.trim() || null,
                      title: form.title.trim() || null,
                      phone: form.contactPhone.trim() || null,
                      email: form.email.trim() || null,
                  }
                : null,
            existingCompanyId: extra.existingCompanyId ?? null,
            dryRun: extra.dryRun ?? false,
        };
    }

    /** Live duplicate check when an identifying field loses focus. */
    async function liveCheck() {
        if (form.companyName.trim().length < 2) return;
        try {
            const res = await fetch("/api/sdr/prospect-submissions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload({ dryRun: true })),
            });
            const json = await res.json();
            if (!json.success) return; // validation errors are shown on submit
            setDuplicates(json.data.duplicates ?? []);
            setOtherMatches(json.data.otherMissionMatches ?? []);
            setBlocked(json.data.outcome === "BLACKLISTED" ? "Cette société est sur la BlackList de ce client : elle ne peut pas être ajoutée." : null);
        } catch {
            /* the real submit re-checks */
        }
    }

    function validate(): string | null {
        if (form.companyName.trim().length < 2) return "Indiquez le nom de la société.";
        if (!listId) return "Choisissez la liste où ajouter la société.";
        if (hasContact) {
            if (!form.firstName.trim() && !form.lastName.trim()) return "Indiquez le nom du contact.";
            if (!form.contactPhone.trim() && !form.email.trim()) return "Indiquez le téléphone ou l'e-mail du contact.";
        }
        if (source === "OTHER" && !form.note.trim()) return "Précisez l'origine dans la note.";
        return null;
    }

    async function submit(existingCompanyId: string | null = null) {
        const problem = validate();
        if (problem && !existingCompanyId) {
            setFieldError(problem);
            return;
        }
        if (existingCompanyId && !hasContact) {
            setFieldError("Renseignez le contact à ajouter à cette société.");
            return;
        }
        setFieldError(null);
        setSubmitting(true);
        try {
            const res = await fetch("/api/sdr/prospect-submissions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload({ existingCompanyId })),
            });
            const json = await res.json();
            if (res.status === 201) {
                success(
                    existingCompanyId ? "Contact ajouté" : "Société ajoutée",
                    "Elle apparaît dans votre file d'appels.",
                );
                onSubmitted({ outcome: "CREATED", companyId: json.data.companyId, contactId: json.data.contactId });
                onClose();
                return;
            }
            if (res.status === 202) {
                success("Envoyée en validation", "Vous serez notifié dès qu'un manager l'aura traitée.");
                onSubmitted({ outcome: "PENDING" });
                onClose();
                return;
            }
            if (res.status === 409 && json.data?.duplicates) {
                setDuplicates(json.data.duplicates);
                return;
            }
            if (res.status === 422) {
                setBlocked(json.error);
                return;
            }
            showError("Ajout impossible", json.error || "Réessayez dans un instant.");
        } catch {
            showError("Ajout impossible", "Vérifiez votre connexion et réessayez.");
        } finally {
            setSubmitting(false);
        }
    }

    const listOptions = context.lists.map((l) => ({ value: l.id, label: l.name }));
    const isValidation = context.mode === "VALIDATION";

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="lg"
            title="Nouvelle société"
            description={
                isValidation
                    ? `${context.missionName} · un manager valide chaque ajout avant qu'il n'entre dans la file.`
                    : `${context.missionName} · la société entre directement dans la file d'appels.`
            }
        >
            <div className="space-y-5">
                <RadioCardGroup name="prospect-source" options={sourceOptions} value={source} onChange={setSource} columns={3} />

                <section className="space-y-3">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                        <Building2 className="h-4 w-4 text-ink-3" aria-hidden /> Société
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Input
                            label="Nom"
                            required
                            value={form.companyName}
                            onChange={(e) => set("companyName")(e.target.value)}
                            onBlur={liveCheck}
                            placeholder="Cabinet Martin"
                        />
                        <Input
                            label="Téléphone (standard)"
                            value={form.companyPhone}
                            onChange={(e) => set("companyPhone")(e.target.value)}
                            onBlur={liveCheck}
                            inputMode="tel"
                        />
                        <Input
                            label="Site web"
                            value={form.website}
                            onChange={(e) => set("website")(e.target.value)}
                            onBlur={liveCheck}
                            placeholder="cabinet-martin.fr"
                        />
                        <Input label="Ville" value={form.city} onChange={(e) => set("city")(e.target.value)} />
                    </div>
                </section>

                <section className="space-y-3">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                        <UserPlus className="h-4 w-4 text-ink-3" aria-hidden /> Contact
                        <span className="text-xs font-normal text-ink-3">facultatif sans interlocuteur nommé</span>
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-[110px_1fr_1fr]">
                        <Select
                            label="Civilité"
                            options={[
                                { value: "", label: "—" },
                                { value: "M.", label: "M." },
                                { value: "Mme", label: "Mme" },
                            ]}
                            value={form.civility}
                            onChange={set("civility")}
                        />
                        <Input label="Prénom" value={form.firstName} onChange={(e) => set("firstName")(e.target.value)} />
                        <Input label="Nom" value={form.lastName} onChange={(e) => set("lastName")(e.target.value)} />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                        <Input label="Fonction" value={form.title} onChange={(e) => set("title")(e.target.value)} />
                        <Input
                            label="Téléphone"
                            value={form.contactPhone}
                            onChange={(e) => set("contactPhone")(e.target.value)}
                            onBlur={liveCheck}
                            inputMode="tel"
                        />
                        <Input
                            label="E-mail"
                            type="email"
                            value={form.email}
                            onChange={(e) => set("email")(e.target.value)}
                            onBlur={liveCheck}
                        />
                    </div>
                </section>

                <div className="grid gap-3 sm:grid-cols-2">
                    <Select label="Liste" options={listOptions} value={listId} onChange={setListId} />
                    <Textarea
                        label={source === "OTHER" ? "Note (obligatoire)" : "Note"}
                        value={form.note}
                        onChange={(e) => set("note")(e.target.value)}
                        rows={2}
                        placeholder="Ex. : rappeler après 14 h, de la part de M. Dupont"
                    />
                </div>

                {blocked && <Callout tone="danger">{blocked}</Callout>}

                {duplicates.length > 0 && (
                    <Callout tone="warning" title="Ce prospect est déjà dans la base de la mission">
                        <ul className="mt-2 space-y-2">
                            {duplicates.slice(0, 4).map((d) => (
                                <li
                                    key={`${d.kind}:${d.contactId ?? d.id}`}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2"
                                >
                                    <div className="min-w-0 text-sm">
                                        <p className="truncate font-medium text-ink">{d.label}</p>
                                        <p className="text-xs text-ink-3">
                                            {d.kind === "PENDING"
                                                ? `Déjà proposée par ${d.sdrName ?? "un SDR"}, en attente de validation`
                                                : `${d.listName ?? ""} · ${DUPLICATE_REASON_LABELS[d.reason]}`}
                                        </p>
                                    </div>
                                    {d.kind !== "PENDING" && d.companyId && (
                                        <div className="flex gap-2">
                                            {onOpenCompany && (
                                                <Button
                                                    size="xs"
                                                    variant="secondary"
                                                    leftIcon={<ExternalLink className="h-3.5 w-3.5" aria-hidden />}
                                                    onClick={() => {
                                                        onOpenCompany(d.companyId!, d.contactId);
                                                        onClose();
                                                    }}
                                                >
                                                    Ouvrir la fiche
                                                </Button>
                                            )}
                                            {d.kind === "COMPANY" && hasContact && (
                                                <Button
                                                    size="xs"
                                                    variant="soft"
                                                    isLoading={submitting}
                                                    onClick={() => submit(d.companyId)}
                                                >
                                                    Ajouter le contact à cette société
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </Callout>
                )}

                {otherMatches.length > 0 && duplicates.length === 0 && (
                    <Callout tone="info" title="Déjà travaillée sur une autre mission de ce client">
                        {otherMatches.map((m) => `${m.companyName} (${m.missionName})`).join(", ")}. Vous pouvez quand même l'ajouter.
                    </Callout>
                )}

                {fieldError && <p className="text-sm text-danger">{fieldError}</p>}
            </div>

            <ModalFooter>
                <Button variant="ghost" onClick={onClose}>
                    Annuler
                </Button>
                <Button
                    variant="primary"
                    isLoading={submitting}
                    disabled={!!blocked || duplicates.length > 0}
                    onClick={() => submit(null)}
                >
                    {isValidation ? "Envoyer en validation" : "Ajouter à la file"}
                </Button>
            </ModalFooter>
        </Modal>
    );
}
