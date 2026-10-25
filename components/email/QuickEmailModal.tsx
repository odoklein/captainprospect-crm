"use client";

// ============================================
// QUICK EMAIL MODAL — one-shot email from the call screen / CRM drawers.
// Sends through /api/email/quick-send (template variables resolved for the
// contact server-side, thread linked to contact + mission from birth).
// ============================================

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Send, User, Building2, Inbox, FileText, RefreshCw } from "lucide-react";
import { AiMark } from "@/components/ui/AiMark";
import { Button, Callout, Chip, EmptyState, Modal, ModalFooter, Skeleton, useToast } from "@/components/ui";
import { AiEmailDraftDialog } from "@/components/email/AiEmailDraftDialog";
import { inboxPathForRole, threadHref } from "@/components/email/inbox/inbox-utils";

// ============================================
// TYPES
// ============================================

interface Contact {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    title?: string | null;
    company?: {
        id: string;
        name: string;
    };
}

interface Company {
    id: string;
    name: string;
    phone?: string | null;
}

interface SendableMailbox {
    id: string;
    email: string;
    displayName: string | null;
    isOwn: boolean;
    isMissionDefault: boolean;
    owner: { id: string; name: string } | null;
}

interface TemplateOption {
    id: string;
    name: string;
    subject: string;
    bodyHtml: string;
    source: "mission" | "library";
}

interface QuickEmailModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSent?: (result?: { threadId?: string; emailId?: string }) => void;
    contact?: Contact | null;
    company?: Company | null;
    missionId?: string | null;
    missionName?: string | null;
    /** Preferred mailbox id (e.g. client default mailbox) */
    preferredMailboxId?: string;
}

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const VAR_RE = /\{\{\s*(\w+(?:\.\w+)?)\s*\}\}/g;

// ============================================
// QUICK EMAIL MODAL
// ============================================

export function QuickEmailModal({
    isOpen,
    onClose,
    onSent,
    contact,
    company,
    missionId,
    missionName,
    preferredMailboxId,
}: QuickEmailModalProps) {
    const router = useRouter();
    const { data: session } = useSession();
    const role = session?.user?.role ?? null;
    const toast = useToast();

    const [mailboxes, setMailboxes] = useState<SendableMailbox[]>([]);
    const [mailboxId, setMailboxId] = useState("");
    const [mailboxesLoading, setMailboxesLoading] = useState(true);
    const [mailboxesError, setMailboxesError] = useState(false);
    const [templates, setTemplates] = useState<TemplateOption[]>([]);
    const [templatesLoading, setTemplatesLoading] = useState(false);
    const [templateId, setTemplateId] = useState<string>("");
    const [recipient, setRecipient] = useState("");
    const [subject, setSubject] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showAi, setShowAi] = useState(false);
    const [bodyVersion, setBodyVersion] = useState(0);
    const editorRef = useRef<HTMLDivElement>(null);

    const companyName = contact?.company?.name || company?.name || "";
    const fullName = [contact?.firstName, contact?.lastName].filter(Boolean).join(" ");

    // ---- Reset on open --------------------------------------------------
    useEffect(() => {
        if (!isOpen) return;
        setError(null);
        setTemplateId("");
        setSubject("");
        setRecipient(contact?.email?.trim() || "");
        if (editorRef.current) editorRef.current.innerHTML = "";
        setBodyVersion((n) => n + 1);
    }, [isOpen, contact?.id, contact?.email]);

    // ---- Mailboxes the user can send from (mission default first) -------
    const loadMailboxes = useCallback(async () => {
        setMailboxesLoading(true);
        setMailboxesError(false);
        try {
            const qs = missionId ? `&missionId=${encodeURIComponent(missionId)}` : "";
            const res = await fetch(`/api/email/mailboxes?scope=sendable${qs}`, { cache: "no-store" });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error);
            const list: SendableMailbox[] = json.data || [];
            setMailboxes(list);
            const preferred = preferredMailboxId && list.find((m) => m.id === preferredMailboxId);
            setMailboxId(preferred ? preferred.id : list.find((m) => m.isMissionDefault)?.id ?? list[0]?.id ?? "");
        } catch {
            setMailboxesError(true);
        } finally {
            setMailboxesLoading(false);
        }
    }, [missionId, preferredMailboxId]);

    useEffect(() => {
        if (isOpen) loadMailboxes();
    }, [isOpen, loadMailboxes]);

    // ---- Templates: mission first, then the library ----------------------
    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        setTemplatesLoading(true);
        Promise.allSettled([
            missionId
                ? fetch(`/api/missions/${missionId}/templates`).then((r) => r.json())
                : Promise.resolve({ success: true, data: [] }),
            fetch("/api/email/templates").then((r) => r.json()),
        ])
            .then(([m, lib]) => {
                if (cancelled) return;
                const out: TemplateOption[] = [];
                const seen = new Set<string>();
                if (m.status === "fulfilled" && m.value?.success) {
                    for (const mt of m.value.data as { template?: TemplateOption }[]) {
                        if (!mt.template || seen.has(mt.template.id)) continue;
                        seen.add(mt.template.id);
                        out.push({ ...mt.template, source: "mission" });
                    }
                }
                if (lib.status === "fulfilled" && lib.value?.success) {
                    for (const t of lib.value.data as TemplateOption[]) {
                        if (seen.has(t.id)) continue;
                        seen.add(t.id);
                        out.push({ id: t.id, name: t.name, subject: t.subject, bodyHtml: t.bodyHtml, source: "library" });
                    }
                }
                setTemplates(out);
            })
            .finally(() => !cancelled && setTemplatesLoading(false));
        return () => {
            cancelled = true;
        };
    }, [isOpen, missionId]);

    // ---- Variables (preview; the server resolves the rest) --------------
    const variables = useMemo(() => {
        const v: Record<string, string> = {};
        const set = (k: string, val?: string | null) => val?.trim() && (v[k] = val.trim());
        set("firstName", contact?.firstName);
        set("lastName", contact?.lastName);
        set("fullName", fullName);
        set("title", contact?.title);
        set("email", contact?.email);
        set("company", companyName);
        set("companyName", companyName);
        return v;
    }, [contact, fullName, companyName]);

    const substitute = (text: string) => text.replace(VAR_RE, (m, name: string) => variables[name] ?? m);

    const applyTemplate = (t: TemplateOption) => {
        setTemplateId(t.id);
        setSubject(substitute(t.subject));
        if (editorRef.current) editorRef.current.innerHTML = substitute(t.bodyHtml);
        setBodyVersion((n) => n + 1);
    };

    const bodyHtml = () => editorRef.current?.innerHTML ?? "";
    const bodyEmpty = useMemo(() => {
        void bodyVersion;
        return !(editorRef.current?.innerText?.trim());
    }, [bodyVersion]);

    const unresolved = useMemo(() => {
        void bodyVersion;
        const names = new Set<string>();
        for (const m of `${subject} ${editorRef.current?.innerHTML ?? ""}`.matchAll(VAR_RE)) names.add(m[1]);
        return Array.from(names);
    }, [subject, bodyVersion]);

    // ---- Send --------------------------------------------------------------
    const recipientValid = EMAIL_RE.test(recipient.trim());
    const canSend = !!mailboxId && recipientValid && subject.trim().length > 0 && !bodyEmpty && !isSending;

    const handleSend = async () => {
        if (!canSend) return;
        setIsSending(true);
        setError(null);
        try {
            const res = await fetch("/api/email/quick-send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    mailboxId,
                    templateId: templateId || undefined,
                    to: [{ email: recipient.trim() }],
                    contactId: contact?.id,
                    companyId: company?.id || contact?.company?.id,
                    missionId: missionId ?? undefined,
                    customSubject: subject,
                    customBodyHtml: bodyHtml(),
                }),
            });
            const json = await res.json();
            if (!json.success) {
                setError(json.error || "L'envoi a échoué");
                return;
            }
            const threadId: string | undefined = json.data?.threadId;
            toast.addToast({
                type: "success",
                title: "Email envoyé",
                message: `À ${recipient.trim()}`,
                ...(threadId && {
                    action: { label: "Voir la conversation", onClick: () => router.push(threadHref(role, threadId)) },
                }),
            });
            onClose();
            onSent?.({ threadId, emailId: json.data?.emailId });
        } catch {
            setError("Erreur de connexion. Réessayez.");
        } finally {
            setIsSending(false);
        }
    };

    const noMailbox = !mailboxesLoading && !mailboxesError && mailboxes.length === 0;
    const missionTemplates = templates.filter((t) => t.source === "mission");
    const libraryTemplates = templates.filter((t) => t.source === "library");

    return (
        <>
            <Modal
                isOpen={isOpen}
                onClose={onClose}
                title="Envoyer un email"
                description={missionName ? `Mission ${missionName}` : undefined}
                size="lg"
            >
                {mailboxesError ? (
                    <Callout
                        tone="danger"
                        title="Impossible de charger vos boîtes d'envoi"
                        action={<Button size="sm" variant="secondary" leftIcon={<RefreshCw className="size-3.5" />} onClick={loadMailboxes}>Réessayer</Button>}
                    >
                        Vérifiez votre connexion et réessayez.
                    </Callout>
                ) : noMailbox ? (
                    <EmptyState
                        variant="inline"
                        icon={Inbox}
                        title="Aucune boîte d'envoi disponible"
                        description={
                            missionId
                                ? "Cette mission n'a pas de boîte mail par défaut et vous n'en avez pas connecté. Demandez à votre manager d'en définir une, ou connectez la vôtre."
                                : "Connectez une boîte mail pour envoyer des emails depuis le CRM."
                        }
                        action={
                            <Button size="sm" onClick={() => router.push(inboxPathForRole(role))}>
                                Connecter une boîte mail
                            </Button>
                        }
                    />
                ) : (
                    <div className="space-y-4">
                        {(contact || company) && (
                            <div className="flex items-center gap-3 rounded-panel border border-line bg-surface-2 px-3 py-2.5">
                                <span className="flex size-9 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                                    {contact ? <User className="size-4" aria-hidden /> : <Building2 className="size-4" aria-hidden />}
                                </span>
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-ink">{fullName || company?.name || "Contact"}</p>
                                    <p className="truncate text-xs text-ink-3">
                                        {[contact?.title, companyName].filter(Boolean).join(" · ")}
                                    </p>
                                </div>
                            </div>
                        )}

                        {error && <Callout tone="danger">{error}</Callout>}

                        {/* From */}
                        <div className="grid gap-1.5">
                            <label htmlFor="qe-from" className="text-xs font-medium text-ink-2">Envoyer depuis</label>
                            {mailboxesLoading ? (
                                <Skeleton className="h-10 w-full" />
                            ) : (
                                <select
                                    id="qe-from"
                                    value={mailboxId}
                                    onChange={(e) => setMailboxId(e.target.value)}
                                    className="h-10 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink shadow-2xs outline-none hover:border-line-strong focus:border-primary-400 focus:ring-4 focus:ring-primary-500/12"
                                >
                                    {mailboxes.map((m) => (
                                        <option key={m.id} value={m.id}>
                                            {m.displayName ? `${m.displayName} <${m.email}>` : m.email}
                                            {m.isMissionDefault ? " — boîte de la mission" : !m.isOwn && m.owner ? ` — ${m.owner.name}` : ""}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>

                        {/* To */}
                        <div className="grid gap-1.5">
                            <label htmlFor="qe-to" className="text-xs font-medium text-ink-2">Destinataire</label>
                            <input
                                id="qe-to"
                                type="email"
                                value={recipient}
                                onChange={(e) => setRecipient(e.target.value)}
                                placeholder="prenom.nom@entreprise.fr"
                                autoComplete="off"
                                className={cn(
                                    "h-10 w-full rounded-control border bg-surface px-3 text-sm text-ink shadow-2xs outline-none placeholder:text-ink-4 focus:ring-4",
                                    recipient && !recipientValid
                                        ? "border-danger focus:border-danger focus:ring-danger/15"
                                        : "border-line hover:border-line-strong focus:border-primary-400 focus:ring-primary-500/12",
                                )}
                            />
                            {recipient && !recipientValid && <p className="text-xs text-danger-ink">Adresse email incomplète ou invalide.</p>}
                            {!contact?.email && !recipient && <p className="text-xs text-ink-4">Ce contact n&apos;a pas d&apos;adresse email enregistrée.</p>}
                        </div>

                        {/* Templates */}
                        <div className="grid gap-1.5">
                            <p className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
                                <FileText className="size-3.5" aria-hidden />
                                Modèles
                            </p>
                            {templatesLoading ? (
                                <div className="flex gap-2"><Skeleton className="h-8 w-32" /><Skeleton className="h-8 w-40" /></div>
                            ) : templates.length === 0 ? (
                                <p className="text-xs text-ink-4">Aucun modèle disponible : rédigez librement ci-dessous.</p>
                            ) : (
                                <div className="space-y-2">
                                    {missionTemplates.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5">
                                            {missionTemplates.map((t) => (
                                                <Chip key={t.id} selected={templateId === t.id} onClick={() => applyTemplate(t)}>{t.name}</Chip>
                                            ))}
                                        </div>
                                    )}
                                    {libraryTemplates.length > 0 && (
                                        <select
                                            value={libraryTemplates.some((t) => t.id === templateId) ? templateId : ""}
                                            onChange={(e) => {
                                                const t = libraryTemplates.find((x) => x.id === e.target.value);
                                                if (t) applyTemplate(t);
                                            }}
                                            aria-label="Autres modèles"
                                            className="h-8 w-full rounded-control border border-line bg-surface px-2.5 text-xs text-ink-2 outline-none hover:border-line-strong focus:border-primary-400"
                                        >
                                            <option value="">{missionTemplates.length ? "Autres modèles…" : "Choisir un modèle…"}</option>
                                            {libraryTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                                        </select>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Subject */}
                        <div className="grid gap-1.5">
                            <label htmlFor="qe-subject" className="text-xs font-medium text-ink-2">Objet</label>
                            <input
                                id="qe-subject"
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                className="h-10 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink shadow-2xs outline-none hover:border-line-strong focus:border-primary-400 focus:ring-4 focus:ring-primary-500/12"
                            />
                        </div>

                        {/* Body */}
                        <div className="grid gap-1.5">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-ink-2">Message</span>
                                <Button size="xs" variant="ghost" leftIcon={<AiMark className="size-3.5" />} onClick={() => setShowAi(true)}>
                                    Rédiger avec l&apos;IA
                                </Button>
                            </div>
                            <div
                                ref={editorRef}
                                contentEditable
                                suppressContentEditableWarning
                                role="textbox"
                                aria-multiline="true"
                                aria-label="Message"
                                onInput={() => setBodyVersion((n) => n + 1)}
                                className="min-h-[180px] max-h-[320px] overflow-y-auto rounded-control border border-line bg-surface px-3 py-2.5 text-sm leading-relaxed text-ink shadow-2xs outline-none email-scrollbar hover:border-line-strong focus:border-primary-400 focus:ring-4 focus:ring-primary-500/12 [&_a]:text-primary-700 [&_a]:underline"
                            />
                            {unresolved.length > 0 && (
                                <p className="text-xs text-warning-ink">
                                    Variables à compléter : {unresolved.map((n) => `{{${n}}}`).join(", ")}
                                    {contact?.id ? " — remplies avec la fiche du contact à l'envoi." : " — elles partiront vides."}
                                </p>
                            )}
                            <p className="text-2xs text-ink-4">La signature de la boîte d&apos;envoi est ajoutée automatiquement.</p>
                        </div>
                    </div>
                )}

                {!noMailbox && !mailboxesError && (
                    <ModalFooter>
                        <Button variant="ghost" onClick={onClose}>Annuler</Button>
                        <Button onClick={handleSend} disabled={!canSend} isLoading={isSending} leftIcon={!isSending ? <Send className="size-4" /> : undefined}>
                            Envoyer
                        </Button>
                    </ModalFooter>
                )}
            </Modal>

            <AiEmailDraftDialog
                open={showAi}
                onClose={() => setShowAi(false)}
                subject={subject}
                context={{
                    mode: "new",
                    recipientName: fullName || undefined,
                    recipientTitle: contact?.title ?? undefined,
                    companyName: companyName || undefined,
                    missionName: missionName ?? undefined,
                }}
                onInsert={(html) => {
                    if (editorRef.current) {
                        editorRef.current.innerHTML = editorRef.current.innerText.trim() ? `${html}${editorRef.current.innerHTML}` : html;
                    }
                    setBodyVersion((n) => n + 1);
                    setShowAi(false);
                }}
            />
        </>
    );
}

export default QuickEmailModal;
