"use client";

// ============================================
// ADD MAILBOX — Gmail / Outlook (OAuth redirect), IMAP/SMTP (form + test),
// ReachInbox (one connect flow only: the Campagnes tab, by API key).
// ============================================

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, ChevronRight, Mail, Megaphone, PlugZap, Server, XCircle, type LucideIcon } from "lucide-react";
import { Button, Callout, Input, Modal, ModalFooter, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";

type Step = "select" | "imap";

interface ProviderChoice {
    id: "gmail" | "outlook" | "imap" | "reachinbox";
    name: string;
    description: string;
    icon: LucideIcon;
}

const PROVIDERS: ProviderChoice[] = [
    { id: "gmail", name: "Gmail / Google Workspace", description: "Connexion sécurisée via Google", icon: Mail },
    { id: "outlook", name: "Outlook / Microsoft 365", description: "Connexion sécurisée via Microsoft", icon: Mail },
    { id: "imap", name: "IMAP / SMTP", description: "Tout autre fournisseur (OVH, Titan, Ionos…)", icon: Server },
    { id: "reachinbox", name: "ReachInbox", description: "Campagnes d'emailing : se connecte par clé API dans l'onglet Campagnes", icon: Megaphone },
];

const EMPTY_IMAP = { email: "", password: "", displayName: "", imapHost: "", imapPort: "993", smtpHost: "", smtpPort: "587" };

export function AddMailboxModal({ isOpen, onClose, onAdded }: { isOpen: boolean; onClose: () => void; onAdded: () => void }) {
    const router = useRouter();
    const toast = useToast();
    const [step, setStep] = useState<Step>("select");
    const [form, setForm] = useState(EMPTY_IMAP);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [test, setTest] = useState<{ imapOk: boolean; smtpOk: boolean; error?: string } | null>(null);

    const close = () => {
        setStep("select");
        setForm(EMPTY_IMAP);
        setError(null);
        setTest(null);
        onClose();
    };

    const choose = (id: ProviderChoice["id"]) => {
        if (id === "gmail") window.location.href = "/api/email/oauth/gmail/connect";
        else if (id === "outlook") window.location.href = "/api/email/oauth/outlook/connect";
        else if (id === "imap") setStep("imap");
        else {
            close();
            router.push("/manager/emails/campaigns?connect=1");
        }
    };

    const set = (key: keyof typeof EMPTY_IMAP, value: string) => {
        setForm((prev) => ({ ...prev, [key]: value }));
        setTest(null);
    };

    const config = () => ({
        email: form.email.trim(),
        password: form.password,
        imapHost: form.imapHost.trim(),
        imapPort: parseInt(form.imapPort, 10) || 993,
        smtpHost: form.smtpHost.trim(),
        smtpPort: parseInt(form.smtpPort, 10) || 587,
    });

    const runTest = async () => {
        setIsTesting(true);
        setError(null);
        try {
            const res = await fetch("/api/email/mailboxes/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(config()),
            });
            const json = await res.json();
            setTest({ imapOk: Boolean(json.imapOk), smtpOk: Boolean(json.smtpOk), error: json.error });
        } catch {
            setTest({ imapOk: false, smtpOk: false, error: "Test impossible (réseau)" });
        } finally {
            setIsTesting(false);
        }
    };

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setError(null);
        try {
            const res = await fetch("/api/email/mailboxes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    provider: "CUSTOM",
                    displayName: form.displayName.trim() || form.email.split("@")[0],
                    ...config(),
                }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error || "Connexion impossible");
            toast.success("Boîte mail connectée", form.email);
            onAdded();
            close();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Connexion impossible");
        } finally {
            setIsSaving(false);
        }
    };

    const canTest = form.email && form.password && form.imapHost && form.smtpHost;

    return (
        <Modal
            isOpen={isOpen}
            onClose={close}
            title={step === "select" ? "Ajouter une boîte mail" : "Connexion IMAP / SMTP"}
            description={step === "select" ? "Choisissez le fournisseur du compte à connecter." : "Les paramètres sont fournis par votre hébergeur de messagerie."}
            size={step === "select" ? "md" : "lg"}
        >
            {step === "select" ? (
                <div className="space-y-2">
                    {PROVIDERS.map((p) => (
                        <button
                            key={p.id}
                            type="button"
                            onClick={() => choose(p.id)}
                            className="flex w-full items-center gap-3 rounded-panel border border-line bg-surface p-3.5 text-left transition-colors hover:border-line-strong hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                        >
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-control border border-line bg-surface-3 text-ink-2">
                                <p.icon className="size-5" aria-hidden />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-semibold text-ink">{p.name}</span>
                                <span className="block text-xs text-ink-3">{p.description}</span>
                            </span>
                            <ChevronRight className="size-4 shrink-0 text-ink-4" aria-hidden />
                        </button>
                    ))}
                </div>
            ) : (
                <form onSubmit={submit} className="space-y-4">
                    {error && <Callout tone="danger">{error}</Callout>}
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Input label="Adresse email" type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="prenom@domaine.fr" />
                        <Input label="Nom d'affichage" value={form.displayName} onChange={(e) => set("displayName", e.target.value)} placeholder="Prénom Nom" />
                        <div className="sm:col-span-2">
                            <Input
                                label="Mot de passe (ou mot de passe d'application)"
                                type="password"
                                required
                                value={form.password}
                                onChange={(e) => set("password", e.target.value)}
                                autoComplete="new-password"
                                hint="Stocké chiffré. Avec la double authentification, créez un mot de passe d'application."
                            />
                        </div>
                        <Input label="Serveur IMAP" required value={form.imapHost} onChange={(e) => set("imapHost", e.target.value)} placeholder="imap.domaine.fr" />
                        <Input label="Port IMAP" required inputMode="numeric" value={form.imapPort} onChange={(e) => set("imapPort", e.target.value)} />
                        <Input label="Serveur SMTP" required value={form.smtpHost} onChange={(e) => set("smtpHost", e.target.value)} placeholder="smtp.domaine.fr" />
                        <Input label="Port SMTP" required inputMode="numeric" value={form.smtpPort} onChange={(e) => set("smtpPort", e.target.value)} />
                    </div>

                    {test && (
                        <div className="flex flex-wrap items-center gap-4 rounded-panel border border-line bg-surface-2 px-4 py-3 text-sm">
                            {(["imapOk", "smtpOk"] as const).map((k) => (
                                <span key={k} className={cn("inline-flex items-center gap-1.5 font-medium", test[k] ? "text-success-ink" : "text-danger-ink")}>
                                    {test[k] ? <CheckCircle2 className="size-4" aria-hidden /> : <XCircle className="size-4" aria-hidden />}
                                    {k === "imapOk" ? "Réception (IMAP)" : "Envoi (SMTP)"}
                                </span>
                            ))}
                            {test.error && <span className="w-full text-xs text-danger-ink">{test.error}</span>}
                        </div>
                    )}

                    <ModalFooter className="justify-between">
                        <Button type="button" variant="ghost" leftIcon={<ArrowLeft className="size-4" />} onClick={() => setStep("select")}>
                            Retour
                        </Button>
                        <div className="flex gap-2">
                            <Button type="button" variant="secondary" leftIcon={<PlugZap className="size-4" />} onClick={runTest} isLoading={isTesting} disabled={!canTest}>
                                Tester
                            </Button>
                            <Button type="submit" isLoading={isSaving}>
                                Connecter
                            </Button>
                        </div>
                    </ModalFooter>
                </form>
            )}
        </Modal>
    );
}

export default AddMailboxModal;
