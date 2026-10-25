"use client";

// ============================================
// TEMPLATE EDITOR — split view: form on the left, live preview on the right.
// Variables are inserted at the cursor of the last focused field (objet or corps).
// "Texte" mode is converted to <p>/<br> on save (bodyHtml is what quick-send sends).
// ============================================

import { useEffect, useMemo, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { Code2, Copy, Save, Trash2, Type } from "lucide-react";
import {
    AiMark,
    Button,
    Callout,
    Checkbox,
    ConfirmModal,
    Drawer,
    Field,
    IconButton,
    Input,
    Modal,
    ModalFooter,
    MultiSelect,
    SegmentedControl,
    Select,
    StatusDot,
    Switch,
    Textarea,
    useToast,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import { SUPPORTED_TEMPLATE_VARIABLES } from "@/lib/email/constants";
import { TEMPLATE_CATEGORIES, normalizeTemplateCategory, templateCategoryLabel, type TemplateCategory } from "./template-categories";
import {
    htmlToText,
    isSimpleHtml,
    previewDocument,
    stripHtml,
    substituteSample,
    textToHtml,
    unknownVariables,
} from "./template-utils";
import type { EmailTemplateRow, MissionOption } from "./types";

type BodyMode = "text" | "html";

interface FormState {
    name: string;
    category: TemplateCategory;
    isShared: boolean;
    subject: string;
    mode: BodyMode;
    body: string;
    missionIds: string[];
}

const VARIABLE_GROUPS: { id: string; label: string }[] = [
    { id: "contact", label: "Contact" },
    { id: "company", label: "Entreprise" },
    { id: "sender", label: "Expéditeur" },
    { id: "date", label: "Date" },
];

const STATUS_SUFFIX: Record<string, string> = {
    PAUSED: " (en pause)",
    DRAFT: " (brouillon)",
    COMPLETED: " (terminée)",
    ARCHIVED: " (archivée)",
};

function initialForm(template: EmailTemplateRow | null, initialMissionIds: string[]): FormState {
    if (!template) {
        return { name: "", category: "OUTREACH", isShared: true, subject: "", mode: "text", body: "", missionIds: initialMissionIds };
    }
    const simple = isSimpleHtml(template.bodyHtml);
    return {
        name: template.name,
        category: normalizeTemplateCategory(template.category),
        isShared: template.isShared,
        subject: template.subject,
        mode: simple ? "text" : "html",
        body: simple ? htmlToText(template.bodyHtml) : template.bodyHtml,
        missionIds: template.missionTemplates.map((mt) => mt.missionId),
    };
}

function fingerprint(form: FormState): string {
    return JSON.stringify({ ...form, missionIds: [...form.missionIds].sort() });
}

interface TemplateEditorProps {
    template: EmailTemplateRow | null;
    missions: MissionOption[];
    initialMissionIds: string[];
    onClose: () => void;
    onSaved: (template: EmailTemplateRow) => void;
    onDuplicate?: () => void;
    onDelete?: () => void;
}

export function TemplateEditor({ template, missions, initialMissionIds, onClose, onSaved, onDuplicate, onDelete }: TemplateEditorProps) {
    const toast = useToast();
    const [initial] = useState(() => initialForm(template, initialMissionIds));
    const [form, setForm] = useState<FormState>(initial);
    const [errors, setErrors] = useState<{ name?: string; subject?: string; body?: string }>({});
    const [saveError, setSaveError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
    const [confirmStripHtml, setConfirmStripHtml] = useState(false);
    const [aiOpen, setAiOpen] = useState(false);

    const subjectRef = useRef<HTMLInputElement>(null);
    const bodyRef = useRef<HTMLTextAreaElement>(null);
    const lastField = useRef<"subject" | "body">("body");

    const dirty = fingerprint(form) !== fingerprint(initial);
    const isNew = !template;

    const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
        setForm((prev) => ({ ...prev, [key]: value }));
        if (key === "name" || key === "subject" || key === "body") setErrors((prev) => ({ ...prev, [key]: undefined }));
    };

    // ---------- leave guard ----------
    const guard = (action: () => void) => {
        if (dirty) setPendingLeave(() => action);
        else action();
    };

    useEffect(() => {
        if (!dirty) return;
        const onBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = "";
        };
        window.addEventListener("beforeunload", onBeforeUnload);
        return () => window.removeEventListener("beforeunload", onBeforeUnload);
    }, [dirty]);

    // ---------- body helpers ----------
    const bodyHtml = form.mode === "text" ? textToHtml(form.body) : form.body;
    const bodyText = form.mode === "text" ? form.body.trim() : stripHtml(form.body);
    const unknown = useMemo(() => unknownVariables(`${form.subject} ${form.body}`), [form.subject, form.body]);

    const switchMode = (mode: BodyMode) => {
        if (mode === form.mode) return;
        if (mode === "html") {
            setForm((prev) => ({ ...prev, mode: "html", body: textToHtml(prev.body) }));
        } else if (isSimpleHtml(form.body)) {
            setForm((prev) => ({ ...prev, mode: "text", body: htmlToText(prev.body) }));
        } else {
            setConfirmStripHtml(true);
        }
    };

    const insertVariable = (name: string) => {
        const token = `{{${name}}}`;
        const field = lastField.current;
        const el = field === "subject" ? subjectRef.current : bodyRef.current;
        const value = field === "subject" ? form.subject : form.body;
        const start = el?.selectionStart ?? value.length;
        const end = el?.selectionEnd ?? value.length;
        update(field, value.slice(0, start) + token + value.slice(end));
        requestAnimationFrame(() => {
            el?.focus();
            el?.setSelectionRange(start + token.length, start + token.length);
        });
    };

    // ---------- missions ----------
    const missionOptions = useMemo(() => {
        const byId = new Map<string, MissionOption>();
        for (const m of missions) byId.set(m.id, m);
        // Keep assignments to missions outside the list (completed, archived) visible and removable.
        for (const mt of template?.missionTemplates ?? []) if (!byId.has(mt.missionId)) byId.set(mt.missionId, mt.mission);
        return [...byId.values()]
            .sort((a, b) => a.name.localeCompare(b.name, "fr"))
            .map((m) => ({
                value: m.id,
                label: `${m.name}${m.client?.name ? ` · ${m.client.name}` : ""}${STATUS_SUFFIX[m.status] ?? ""}`,
            }));
    }, [missions, template]);

    // ---------- save ----------
    const save = async () => {
        const nextErrors: typeof errors = {};
        if (!form.name.trim()) nextErrors.name = "Donnez un nom au template.";
        if (!form.subject.trim()) nextErrors.subject = "L'objet est obligatoire.";
        if (!stripHtml(bodyHtml).trim()) nextErrors.body = "Le corps de l'email est vide.";
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) return;

        setIsSaving(true);
        setSaveError(null);
        const payload = {
            name: form.name.trim(),
            subject: form.subject.trim(),
            bodyHtml,
            bodyText,
            category: form.category,
            isShared: form.isShared,
        };
        try {
            let saved: EmailTemplateRow;
            if (isNew) {
                const res = await fetch("/api/email/templates", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...payload, missionIds: form.missionIds }),
                });
                const json = await res.json();
                if (!res.ok || !json.success) throw new Error(json.error || "Création impossible");
                saved = json.data;
            } else {
                const res = await fetch(`/api/email/templates/${template.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                const json = await res.json();
                if (!res.ok || !json.success) throw new Error(json.error || "Enregistrement impossible");
                saved = json.data;

                const before = [...initial.missionIds].sort().join(",");
                const after = [...form.missionIds].sort().join(",");
                if (before !== after) {
                    const mRes = await fetch(`/api/email/templates/${template.id}/missions`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ missionIds: form.missionIds }),
                    });
                    const mJson = await mRes.json();
                    if (!mRes.ok || !mJson.success) {
                        onSaved(saved);
                        throw new Error(`Contenu enregistré, mais les missions n'ont pas pu être mises à jour : ${mJson.error || "erreur inconnue"}`);
                    }
                    saved = { ...saved, missionTemplates: mJson.data.missionTemplates };
                }
            }
            toast.success(isNew ? "Template créé" : "Template enregistré", saved.name);
            onSaved(saved);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Enregistrement impossible";
            setSaveError(message);
            toast.error("Enregistrement impossible", message);
        } finally {
            setIsSaving(false);
        }
    };

    // Ctrl/Cmd + S
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                e.preventDefault();
                if (!isSaving) void save();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    });

    const assignedMissions = missionOptions.filter((o) => form.missionIds.includes(o.value));
    const aiContextMission = (template?.missionTemplates ?? []).find((mt) => form.missionIds.includes(mt.missionId))?.mission
        ?? missions.find((m) => form.missionIds.includes(m.id));

    return (
        <>
            <Drawer
                isOpen
                onClose={() => guard(onClose)}
                size="full"
                className="max-w-[1320px]"
                title={isNew ? "Nouveau template" : form.name || "Template sans nom"}
                description={isNew ? "Email type réutilisable par les SDR" : templateCategoryLabel(form.category)}
                headerActions={
                    !isNew ? (
                        <>
                            {onDuplicate && <IconButton icon={Copy} label="Dupliquer (version enregistrée)" size="sm" onClick={() => guard(onDuplicate)} />}
                            {onDelete && <IconButton icon={Trash2} label="Supprimer" size="sm" variant="danger" onClick={onDelete} />}
                        </>
                    ) : undefined
                }
                footer={
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="flex items-center gap-2 text-xs text-ink-3">
                            {dirty ? (
                                <>
                                    <StatusDot tone="warning" />
                                    Modifications non enregistrées
                                </>
                            ) : (
                                "Ctrl + S pour enregistrer"
                            )}
                        </p>
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" onClick={() => guard(onClose)} disabled={isSaving}>
                                Annuler
                            </Button>
                            <Button onClick={save} isLoading={isSaving} leftIcon={<Save className="size-4" />}>
                                {isNew ? "Créer le template" : "Enregistrer"}
                            </Button>
                        </div>
                    </div>
                }
            >
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
                    {/* ---------- Form ---------- */}
                    <div className="min-w-0 space-y-5">
                        {saveError && <Callout tone="danger">{saveError}</Callout>}

                        <Input
                            label="Nom du template"
                            required
                            value={form.name}
                            onChange={(e) => update("name", e.target.value)}
                            placeholder="Ex. : Relance après appel sans réponse"
                            error={errors.name}
                            autoFocus={isNew}
                        />

                        <div className="grid gap-4 sm:grid-cols-2">
                            <Select
                                label="Catégorie"
                                value={form.category}
                                onChange={(v) => update("category", v as TemplateCategory)}
                                options={TEMPLATE_CATEGORIES.map((c) => ({ value: c.value, label: c.label, title: c.hint }))}
                            />
                            <div className="flex items-end pb-1">
                                <Switch
                                    checked={form.isShared}
                                    onChange={(v) => update("isShared", v)}
                                    label="Partagé avec l'équipe"
                                    description={form.isShared ? "Visible par tous les managers." : "Visible par vous seul."}
                                    className="w-full"
                                />
                            </div>
                        </div>

                        <Input
                            ref={subjectRef}
                            label="Objet"
                            required
                            value={form.subject}
                            onFocus={() => (lastField.current = "subject")}
                            onChange={(e) => update("subject", e.target.value)}
                            placeholder="{{firstName}}, suite à notre échange"
                            error={errors.subject}
                        />

                        <div>
                            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                                <span className="text-[13px] font-medium text-ink-2">
                                    Corps<span className="ml-0.5 text-accent" aria-hidden>*</span>
                                </span>
                                <div className="flex items-center gap-2">
                                    <Button variant="soft" size="xs" leftIcon={<AiMark className="size-3.5" />} onClick={() => setAiOpen(true)}>
                                        Générer avec l&apos;IA
                                    </Button>
                                    <SegmentedControl<BodyMode>
                                        ariaLabel="Format du corps"
                                        size="sm"
                                        value={form.mode}
                                        onChange={switchMode}
                                        options={[
                                            { value: "text", label: "Texte", icon: Type },
                                            { value: "html", label: "HTML", icon: Code2 },
                                        ]}
                                    />
                                </div>
                            </div>
                            <Textarea
                                ref={bodyRef}
                                value={form.body}
                                onFocus={() => (lastField.current = "body")}
                                onChange={(e) => update("body", e.target.value)}
                                rows={form.mode === "html" ? 18 : 14}
                                className={cn(form.mode === "html" && "font-mono text-[13px]")}
                                placeholder={
                                    form.mode === "text"
                                        ? "Bonjour {{firstName}},\n\nJe me permets de revenir vers vous suite à notre appel…"
                                        : "<p>Bonjour {{firstName}},</p>\n<p>…</p>"
                                }
                                error={errors.body}
                                hint={
                                    form.mode === "text"
                                        ? "Une ligne vide sépare deux paragraphes. Pour une mise en forme (gras, liens, boutons), passez en HTML."
                                        : "HTML d'email : préférez les styles en ligne (style=\"…\"), les balises <style> sont mal gérées par certaines messageries."
                                }
                            />
                        </div>

                        <div className="rounded-panel border border-line bg-surface-2 p-3">
                            <p className="text-xs font-semibold text-ink-2">
                                Variables <span className="font-normal text-ink-3">— cliquez pour insérer à l&apos;emplacement du curseur</span>
                            </p>
                            <div className="mt-2 space-y-2">
                                {VARIABLE_GROUPS.map((group) => (
                                    <div key={group.id} className="flex flex-wrap items-center gap-1.5">
                                        <span className="w-20 shrink-0 text-[11px] font-medium text-ink-3">{group.label}</span>
                                        {SUPPORTED_TEMPLATE_VARIABLES.filter((v) => v.category === group.id).map((v) => (
                                            <button
                                                key={v.name}
                                                type="button"
                                                title={v.description}
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={() => insertVariable(v.name)}
                                                className="h-6 rounded-md border border-line bg-surface px-1.5 font-mono text-[11px] text-ink-2 transition-colors hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                                            >
                                                {`{{${v.name}}}`}
                                            </button>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {unknown.length > 0 && (
                            <Callout tone="warning" title="Variables non reconnues">
                                {unknown.map((v) => `{{${v}}}`).join(", ")} ne {unknown.length > 1 ? "seront" : "sera"} pas
                                {unknown.length > 1 ? " remplacées" : " remplacée"} à l&apos;envoi : le texte apparaîtra vide à cet endroit.
                            </Callout>
                        )}

                        <Field
                            label="Missions"
                            hint={
                                assignedMissions.length > 0
                                    ? `Les SDR de ${assignedMissions.length > 1 ? `ces ${assignedMissions.length} missions` : "cette mission"} retrouvent ce template dans l'envoi rapide de l'écran d'appel.`
                                    : undefined
                            }
                        >
                            <MultiSelect
                                options={missionOptions}
                                value={form.missionIds}
                                onChange={(v) => update("missionIds", v)}
                                placeholder="Choisir les missions…"
                            />
                            {assignedMissions.length === 0 && (
                                <p className="mt-1.5 text-xs font-medium text-warning-ink">
                                    Sans mission, ce template n&apos;apparaît pas dans l&apos;écran d&apos;appel des SDR.
                                </p>
                            )}
                        </Field>

                        {template && (
                            <p className="text-xs text-ink-3">
                                Créé par {template.createdBy?.name ?? "—"} · modifié{" "}
                                {formatDistanceToNow(new Date(template.updatedAt), { addSuffix: true, locale: fr })} ·{" "}
                                {template.useCount > 0
                                    ? `${template.useCount} envoi${template.useCount > 1 ? "s" : ""}`
                                    : "jamais envoyé"}
                            </p>
                        )}
                    </div>

                    {/* ---------- Preview ---------- */}
                    <div className="min-w-0">
                        <div className="lg:sticky lg:top-0">
                            <div className="mb-2 flex items-baseline justify-between gap-2">
                                <h3 className="text-sm font-semibold text-ink">Aperçu</h3>
                                <span className="text-[11px] text-ink-3">Contact fictif : Jean Dupont, Acme SAS</span>
                            </div>
                            <div className="overflow-hidden rounded-panel border border-line bg-surface shadow-2xs">
                                <div className="space-y-1 border-b border-line bg-surface-2 px-4 py-2.5 text-xs">
                                    <p>
                                        <span className="text-ink-3">À : </span>
                                        <span className="text-ink-2">Jean Dupont &lt;jean.dupont@exemple.fr&gt;</span>
                                    </p>
                                    <p className="text-sm">
                                        <span className="text-ink-3">Objet : </span>
                                        <span className="font-semibold text-ink">{substituteSample(form.subject) || <span className="font-normal italic text-ink-4">(vide)</span>}</span>
                                    </p>
                                </div>
                                <iframe
                                    title="Aperçu de l'email"
                                    sandbox=""
                                    srcDoc={previewDocument(substituteSample(bodyHtml))}
                                    className="block h-[min(560px,60vh)] w-full bg-surface"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </Drawer>

            <ConfirmModal
                isOpen={Boolean(pendingLeave)}
                onClose={() => setPendingLeave(null)}
                onConfirm={() => {
                    const action = pendingLeave;
                    setPendingLeave(null);
                    action?.();
                }}
                variant="warning"
                title="Quitter sans enregistrer ?"
                message="Vos modifications sur ce template seront perdues."
                confirmText="Quitter sans enregistrer"
                cancelText="Continuer l'édition"
            />

            <ConfirmModal
                isOpen={confirmStripHtml}
                onClose={() => setConfirmStripHtml(false)}
                onConfirm={() => {
                    setForm((prev) => ({ ...prev, mode: "text", body: stripHtml(prev.body) }));
                    setConfirmStripHtml(false);
                }}
                variant="warning"
                title="Passer en texte simple ?"
                message="Ce corps contient une mise en forme HTML (styles, liens, tableaux). Elle sera retirée et seul le texte sera conservé."
                confirmText="Passer en texte"
            />

            <AiGenerateModal
                isOpen={aiOpen}
                onClose={() => setAiOpen(false)}
                hasBody={Boolean(stripHtml(bodyHtml).trim())}
                context={{
                    subject: form.subject,
                    category: templateCategoryLabel(form.category),
                    missionName: aiContextMission?.name,
                    clientName: aiContextMission?.client?.name,
                    currentBody: bodyHtml,
                }}
                onResult={({ bodyHtml: html, suggestedSubject }) => {
                    setForm((prev) => ({
                        ...prev,
                        mode: "html",
                        body: html,
                        subject: prev.subject.trim() ? prev.subject : suggestedSubject ?? prev.subject,
                    }));
                    setErrors({});
                }}
            />
        </>
    );
}

// ============================================
// AI GENERATION (POST /api/ai/mistral/email-template)
// ============================================

function AiGenerateModal({
    isOpen,
    onClose,
    hasBody,
    context,
    onResult,
}: {
    isOpen: boolean;
    onClose: () => void;
    hasBody: boolean;
    context: { subject: string; category: string; missionName?: string; clientName?: string; currentBody: string };
    onResult: (r: { bodyHtml: string; suggestedSubject?: string }) => void;
}) {
    const toast = useToast();
    const [instruction, setInstruction] = useState("");
    const [improve, setImprove] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);

    const generate = async () => {
        if (!instruction.trim()) return;
        setIsGenerating(true);
        try {
            const res = await fetch("/api/ai/mistral/email-template", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    instruction: instruction.trim(),
                    subject: context.subject || undefined,
                    category: context.category,
                    missionName: context.missionName,
                    clientName: context.clientName,
                    currentBody: hasBody && improve ? context.currentBody : undefined,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.success || !json.data?.bodyHtml) throw new Error(json.error || "Génération impossible");
            onResult(json.data);
            toast.success("Corps généré", "Relisez-le avant d'enregistrer.");
            setInstruction("");
            onClose();
        } catch (err) {
            toast.error("Génération impossible", err instanceof Error ? err.message : undefined);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={() => !isGenerating && onClose()}
            title="Générer le corps avec l'IA"
            description={
                context.missionName
                    ? `Contexte : mission ${context.missionName}${context.clientName ? ` (${context.clientName})` : ""}.`
                    : "Assignez une mission au template pour donner plus de contexte à l'IA."
            }
            size="md"
        >
            <div className="space-y-4">
                <Textarea
                    label="Que doit dire cet email ?"
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    rows={4}
                    placeholder="Ex. : relance courte après un appel sans réponse, proposer un créneau de 15 minutes la semaine prochaine."
                    autoFocus
                />
                {hasBody && (
                    <Checkbox
                        checked={improve}
                        onChange={(e) => setImprove(e.target.checked)}
                        label="Partir du corps actuel"
                        description="L'IA améliore le texte existant au lieu d'en écrire un nouveau."
                    />
                )}
                <p className="text-xs text-ink-3">Le résultat remplace le corps actuel (en HTML). Vous pourrez le modifier avant d&apos;enregistrer.</p>
            </div>
            <ModalFooter>
                <Button variant="ghost" onClick={onClose} disabled={isGenerating}>
                    Annuler
                </Button>
                <Button
                    variant="accent"
                    onClick={generate}
                    isLoading={isGenerating}
                    disabled={!instruction.trim()}
                    leftIcon={<AiMark className="size-4" />}
                >
                    Générer
                </Button>
            </ModalFooter>
        </Modal>
    );
}

export default TemplateEditor;
