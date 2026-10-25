"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, FileText, Send } from "lucide-react";
import { Button, Callout, Card, Checkbox, Chip, Input, Select, Skeleton, Textarea, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { apiJson, errorMessage } from "../api";
import { findBracketPlaceholders, mailboxLabel, type MailboxInfo } from "../types";
import type { DraftStep } from "./draft";
import { ALL_VARIABLES, PRIMARY_VARIABLES } from "./variables";
import { TemplatePickerModal } from "./TemplatePickerModal";

interface StepEditorProps {
    step: DraftStep;
    index: number;
    total: number;
    onChange: (patch: Partial<DraftStep>) => void;
    mailbox: MailboxInfo | null;
    timezone: string;
    stopOnReply: boolean;
    myEmail?: string | null;
    previewContacts?: { id: string; label: string }[];
}

interface PreviewData {
    subject: string;
    bodyHtml: string;
    bodyText: string;
    contactLabel: string;
    isSample: boolean;
    emptyVariables: string[];
    unknownVariables: string[];
}

export function StepEditor({ step, index, total, onChange, mailbox, timezone, stopOnReply, myEmail, previewContacts }: StepEditorProps) {
    const toast = useToast();
    const subjectRef = useRef<HTMLInputElement>(null);
    const bodyRef = useRef<HTMLTextAreaElement>(null);
    const lastField = useRef<"subject" | "body">("body");
    const [showAllVars, setShowAllVars] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [previewContactId, setPreviewContactId] = useState("");

    const isFirst = index === 0;
    const placeholders = findBracketPlaceholders(`${step.subject}\n${step.body}`);
    const preview = useStepPreview(step.subject, step.body, previewContactId, mailbox?.id ?? "", timezone);

    const insertAtCursor = (token: string) => {
        const field = lastField.current;
        const el = field === "subject" ? subjectRef.current : bodyRef.current;
        const value = field === "subject" ? step.subject : step.body;
        const start = el?.selectionStart ?? value.length;
        const end = el?.selectionEnd ?? value.length;
        const next = value.slice(0, start) + token + value.slice(end);
        onChange(field === "subject" ? { subject: next } : { body: next });
        requestAnimationFrame(() => {
            if (!el) return;
            el.focus();
            const pos = start + token.length;
            el.setSelectionRange(pos, pos);
        });
    };

    /** Selects the next occurrence of a "[Prénom]" placeholder so a variable chip can replace it. */
    const selectPlaceholder = (placeholder: string) => {
        const inSubject = step.subject.indexOf(placeholder);
        if (inSubject >= 0 && step.body.indexOf(placeholder) < 0) {
            lastField.current = "subject";
            subjectRef.current?.focus();
            subjectRef.current?.setSelectionRange(inSubject, inSubject + placeholder.length);
            return;
        }
        const el = bodyRef.current;
        if (!el) return;
        const from = el.selectionEnd ?? 0;
        let at = step.body.indexOf(placeholder, from);
        if (at < 0) at = step.body.indexOf(placeholder);
        if (at < 0) return;
        lastField.current = "body";
        el.focus();
        el.setSelectionRange(at, at + placeholder.length);
    };

    const sendTest = async () => {
        if (!mailbox) {
            toast.warning("Choisissez d'abord une boîte d'envoi", "Dans les réglages de la séquence.");
            return;
        }
        setIsTesting(true);
        try {
            const { data } = await apiJson<{ to: string }>("/api/email/sequences/test-send", {
                method: "POST",
                json: { mailboxId: mailbox.id, subject: step.subject, body: step.body, contactId: previewContactId || undefined },
            });
            toast.success("Email de test envoyé", `Vérifiez la boîte ${data.to}.`);
        } catch (error) {
            toast.error("Le test n'est pas parti", errorMessage(error));
        } finally {
            setIsTesting(false);
        }
    };

    const chips = showAllVars ? ALL_VARIABLES : PRIMARY_VARIABLES;

    return (
        <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
            {/* ---------- WRITE ---------- */}
            <Card padding="none" className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-subtle px-5 py-3">
                    <p className="text-sm font-semibold text-ink">
                        Email {index + 1} <span className="font-normal text-ink-4">sur {total}</span>
                    </p>
                    <div className="flex items-center gap-1.5">
                        <Button size="xs" variant="secondary" leftIcon={<FileText className="size-3.5" />} onClick={() => setPickerOpen(true)}>
                            Partir d'un modèle
                        </Button>
                        <Button
                            size="xs"
                            variant="secondary"
                            leftIcon={<Send className="size-3.5" />}
                            isLoading={isTesting}
                            disabled={!step.body.trim()}
                            onClick={sendTest}
                            title={myEmail ? `Envoyé à ${myEmail}` : undefined}
                        >
                            M'envoyer un test
                        </Button>
                    </div>
                </div>

                <div className="space-y-4 px-5 py-4">
                    {/* Delay */}
                    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-[13px] text-ink-2">
                        <span>Envoyer</span>
                        <NumberBox value={step.delayDays} max={365} onChange={(v) => onChange({ delayDays: v })} label="jours" />
                        <span>jour{step.delayDays > 1 ? "s" : ""} et</span>
                        <NumberBox value={step.delayHours} max={23} onChange={(v) => onChange({ delayHours: v })} label="heures" />
                        <span>h {isFirst ? "après l'inscription du contact" : "après l'email précédent"}</span>
                    </div>

                    <Input
                        ref={subjectRef}
                        label="Objet"
                        value={step.subject}
                        placeholder={isFirst ? "Ex. : Une idée pour {{companyName}}" : "Laisser vide pour répondre dans le même fil (Re: …)"}
                        onChange={(e) => onChange({ subject: e.target.value })}
                        onFocus={() => (lastField.current = "subject")}
                        hint={!isFirst && !step.subject.trim() ? "Cet email partira en réponse au précédent, dans la même conversation." : undefined}
                        error={isFirst && !step.subject.trim() && step.body.trim() ? "Le premier email a besoin d'un objet" : undefined}
                    />

                    <div>
                        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                            <span className="mr-1 text-xs font-medium text-ink-3">Insérer :</span>
                            {chips.map((v) => (
                                <span key={v.name} onMouseDown={(e) => e.preventDefault()}>
                                    <Chip onClick={() => insertAtCursor(`{{${v.name}}}`)}>{v.label}</Chip>
                                </span>
                            ))}
                            <button
                                type="button"
                                className="text-xs font-medium text-link hover:underline"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => setShowAllVars((v) => !v)}
                            >
                                {showAllVars ? "Moins" : `+ ${ALL_VARIABLES.length - PRIMARY_VARIABLES.length} autres`}
                            </button>
                        </div>
                        <Textarea
                            ref={bodyRef}
                            aria-label="Texte de l'email"
                            rows={13}
                            value={step.body}
                            onChange={(e) => onChange({ body: e.target.value })}
                            onFocus={() => (lastField.current = "body")}
                            placeholder="Écrivez votre message. Les retours à la ligne sont conservés tels quels."
                            className="font-[inherit]"
                        />
                        <p className="mt-1.5 text-xs text-ink-4">
                            Astuce : <code className="rounded bg-surface-3 px-1">{"{{firstName|Madame, Monsieur}}"}</code> affiche le texte après « | » quand
                            la valeur manque. La signature de la boîte d'envoi est ajoutée automatiquement.
                        </p>
                    </div>

                    {placeholders.length > 0 && (
                        <Callout tone="warning" title="Des champs sont à compléter à la main">
                            <p className="mb-2">Ils partiraient tels quels. Cliquez sur un champ pour le sélectionner, puis sur une variable pour le remplacer.</p>
                            <div className="flex flex-wrap gap-1.5">
                                {placeholders.map((p) => (
                                    <span key={p} onMouseDown={(e) => e.preventDefault()}>
                                        <Chip onClick={() => selectPlaceholder(p)}>{p}</Chip>
                                    </span>
                                ))}
                            </div>
                        </Callout>
                    )}

                    {!isFirst && (
                        <div className="space-y-2 border-t border-line-subtle pt-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-ink-4">Conditions d'envoi</p>
                            <Checkbox
                                checked={step.skipIfOpened}
                                onChange={(e) => onChange({ skipIfOpened: e.target.checked })}
                                label="Ne pas envoyer si le contact a déjà ouvert un email"
                            />
                            <Checkbox
                                checked={step.skipIfClicked}
                                onChange={(e) => onChange({ skipIfClicked: e.target.checked })}
                                label="Ne pas envoyer si le contact a déjà cliqué sur un lien"
                            />
                            <Checkbox
                                checked={step.skipIfReplied}
                                onChange={(e) => onChange({ skipIfReplied: e.target.checked })}
                                label="Ne pas envoyer si le contact a répondu"
                                description={stopOnReply ? "Déjà couvert : la séquence s'arrête à la première réponse." : undefined}
                            />
                        </div>
                    )}
                </div>
            </Card>

            {/* ---------- PREVIEW ---------- */}
            <Card padding="none" className="min-w-0 self-start">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-subtle px-5 py-3">
                    <p className="text-sm font-semibold text-ink">Aperçu</p>
                    {previewContacts && previewContacts.length > 0 ? (
                        <div className="w-56">
                            <Select
                                value={previewContactId}
                                onChange={setPreviewContactId}
                                options={[{ value: "", label: "Contact exemple" }, ...previewContacts.map((c) => ({ value: c.id, label: c.label }))]}
                                searchable={previewContacts.length > 8}
                            />
                        </div>
                    ) : (
                        <span className="text-xs text-ink-4">avec un contact exemple</span>
                    )}
                </div>
                <div className="space-y-3 px-5 py-4">
                    <dl className="space-y-1 text-[13px]">
                        <div className="flex gap-2">
                            <dt className="w-10 shrink-0 text-ink-4">De</dt>
                            <dd className="min-w-0 truncate text-ink-2">{mailbox ? mailboxLabel(mailbox) : <span className="text-warning-ink">Aucune boîte choisie</span>}</dd>
                        </div>
                        <div className="flex gap-2">
                            <dt className="w-10 shrink-0 text-ink-4">À</dt>
                            <dd className="min-w-0 truncate text-ink-2">{preview.data?.contactLabel ?? "…"}</dd>
                        </div>
                        <div className="flex gap-2">
                            <dt className="w-10 shrink-0 text-ink-4">Objet</dt>
                            <dd className="min-w-0 font-semibold text-ink">
                                {preview.data ? preview.data.subject || (isFirst ? <span className="text-ink-4">Sans objet</span> : "Re: (objet de l'email précédent)") : "…"}
                            </dd>
                        </div>
                    </dl>
                    <div className="rounded-xl border border-line bg-surface">
                        {preview.loading && !preview.data ? (
                            <div className="space-y-2 p-4">
                                <Skeleton className="h-3 w-3/4" />
                                <Skeleton className="h-3 w-full" />
                                <Skeleton className="h-3 w-2/3" />
                            </div>
                        ) : preview.error ? (
                            <p className="p-4 text-sm text-danger-ink">{preview.error}</p>
                        ) : preview.data?.bodyHtml ? (
                            <PreviewFrame html={preview.data.bodyHtml} dimmed={preview.loading} />
                        ) : (
                            <p className="p-4 text-sm text-ink-4">L'email est vide.</p>
                        )}
                    </div>
                    {preview.data && (preview.data.unknownVariables.length > 0 || preview.data.emptyVariables.length > 0) && (
                        <div className="space-y-1.5 text-xs">
                            {preview.data.unknownVariables.length > 0 && (
                                <p className="flex items-start gap-1.5 text-danger-ink">
                                    <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
                                    Variable inconnue : {preview.data.unknownVariables.map((v) => `{{${v}}}`).join(", ")} — elle sera remplacée par du vide.
                                </p>
                            )}
                            {preview.data.emptyVariables.length > 0 && (
                                <p className="flex items-start gap-1.5 text-warning-ink">
                                    <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
                                    Vide pour ce contact : {preview.data.emptyVariables.map((v) => `{{${v}}}`).join(", ")}. Ajoutez une valeur de secours avec « | ».
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </Card>

            <TemplatePickerModal
                isOpen={pickerOpen}
                onClose={() => setPickerOpen(false)}
                willReplace={!!step.body.trim()}
                onPick={(t) => {
                    onChange({ subject: t.subject || step.subject, body: t.body });
                    toast.success(`Modèle « ${t.name} » inséré`);
                }}
            />
        </div>
    );
}

function NumberBox({ value, max, onChange, label }: { value: number; max: number; onChange: (v: number) => void; label: string }) {
    return (
        <input
            type="number"
            inputMode="numeric"
            min={0}
            max={max}
            value={value}
            aria-label={label}
            onChange={(e) => {
                const n = Math.floor(Number(e.target.value));
                onChange(Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0);
            }}
            className="h-8 w-16 rounded-lg border border-line bg-surface px-2 text-center text-sm text-ink focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
        />
    );
}

/** Rendered email in an isolated frame (no scripts), auto-sized to its content. */
function PreviewFrame({ html, dimmed }: { html: string; dimmed?: boolean }) {
    const ref = useRef<HTMLIFrameElement>(null);
    const [height, setHeight] = useState(160);
    // The frame can't see the app's CSS variables: hand it the resolved token colours.
    const [colors, setColors] = useState({ ink: "inherit", link: "inherit" });
    useEffect(() => {
        const root = getComputedStyle(document.documentElement);
        setColors({
            ink: root.getPropertyValue("--color-ink").trim() || "inherit",
            link: root.getPropertyValue("--color-link").trim() || "inherit",
        });
    }, []);
    const doc = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:${colors.ink};word-wrap:break-word}a{color:${colors.link}}p{margin:0 0 12px}</style></head><body>${html}</body></html>`;
    return (
        <iframe
            ref={ref}
            title="Aperçu de l'email"
            sandbox="allow-same-origin"
            srcDoc={doc}
            onLoad={() => {
                const h = ref.current?.contentDocument?.body?.scrollHeight;
                if (h) setHeight(Math.min(Math.max(h + 4, 120), 900));
            }}
            className={cn("block w-full rounded-xl bg-surface transition-opacity", dimmed && "opacity-60")}
            style={{ height }}
        />
    );
}

/** Debounced server-side render (same renderer as the sending engine). */
function useStepPreview(subject: string, body: string, contactId: string, mailboxId: string, timezone: string) {
    const [state, setState] = useState<{ data: PreviewData | null; loading: boolean; error: string | null }>({
        data: null,
        loading: true,
        error: null,
    });

    useEffect(() => {
        let cancelled = false;
        setState((s) => ({ ...s, loading: true }));
        const t = setTimeout(async () => {
            try {
                const { data } = await apiJson<PreviewData>("/api/email/sequences/preview", {
                    method: "POST",
                    json: { subject, body, contactId: contactId || undefined, mailboxId: mailboxId || undefined, timezone },
                });
                if (!cancelled) setState({ data, loading: false, error: null });
            } catch (error) {
                if (!cancelled) setState({ data: null, loading: false, error: errorMessage(error, "Aperçu indisponible") });
            }
        }, 450);
        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    }, [subject, body, contactId, mailboxId, timezone]);

    return state;
}
