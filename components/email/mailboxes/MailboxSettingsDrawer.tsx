"use client";

// ============================================
// MAILBOX SETTINGS DRAWER — opened with ?mailbox=<id>
// Status + sync, identity (name, signature), sending (limit, tracking domain),
// usage (default mailbox of missions/clients), team access, disconnect.
// ============================================

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink, RefreshCw, Target, Trash2, Building2, X } from "lucide-react";
import {
    Badge,
    Button,
    Callout,
    Checkbox,
    ConfirmModal,
    Drawer,
    IconButton,
    Input,
    Select,
    Skeleton,
    StatusText,
    Textarea,
    useToast,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import { htmlToText, isSimpleHtml, textToHtml } from "@/components/email/templates/template-utils";
import {
    PROVIDER_META,
    mailboxHealth,
    relative,
    type MailboxDetail,
    type MailboxRow,
    type MailboxUsage,
} from "./mailbox-utils";

interface TeamUser {
    id: string;
    name: string;
    email: string;
    role: string;
}

interface Permission {
    userId: string;
    canRead: boolean;
    canSend: boolean;
    canSendAs: boolean;
    requiresApproval: boolean;
}

const ROLE_LABEL: Record<string, string> = {
    MANAGER: "Manager",
    SDR: "SDR",
    DEVELOPER: "Développeur",
    BUSINESS_DEVELOPER: "Business developer",
};

const STATUS_SUFFIX: Record<string, string> = { PAUSED: " (en pause)", DRAFT: " (brouillon)" };

function Section({ title, description, children, className }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
    return (
        <section className={cn("border-t border-line-subtle pt-5", className)}>
            <h3 className="text-sm font-semibold text-ink">{title}</h3>
            {description && <p className="mt-0.5 text-xs text-ink-3">{description}</p>}
            <div className="mt-3">{children}</div>
        </section>
    );
}

interface Props {
    mailbox: MailboxRow;
    onClose: () => void;
    /** Something changed (settings, sync, usage): refresh the list. */
    onChanged: () => void;
    onDeleted: () => void;
}

export function MailboxSettingsDrawer({ mailbox, onClose, onChanged, onDeleted }: Props) {
    const toast = useToast();
    const [detail, setDetail] = useState<MailboxDetail | null>(null);
    const [usage, setUsage] = useState<MailboxUsage | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    // settings form
    const [form, setForm] = useState({ displayName: "", signature: "", signatureMode: "text" as "text" | "html", dailySendLimit: "", trackingDomain: "" });
    const [initial, setInitial] = useState(form);
    const [isSaving, setIsSaving] = useState(false);

    // actions
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [missionToAdd, setMissionToAdd] = useState("");
    const [usageBusy, setUsageBusy] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    // team access
    const [users, setUsers] = useState<TeamUser[] | null>(null);
    const [permissions, setPermissions] = useState<Record<string, Permission>>({});
    const [initialPermissions, setInitialPermissions] = useState<Record<string, Permission>>({});
    const [accessError, setAccessError] = useState<string | null>(null);
    const [isSavingAccess, setIsSavingAccess] = useState(false);

    const meta = PROVIDER_META[mailbox.provider] ?? PROVIDER_META.CUSTOM;

    const loadDetail = useCallback(async (resetAccess = true) => {
        try {
            const res = await fetch(`/api/email/mailboxes/${mailbox.id}`);
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error || "Chargement impossible");
            const d: MailboxDetail = json.data;
            setDetail(d);
            const simple = !d.signatureHtml || isSimpleHtml(d.signatureHtml);
            const next = {
                displayName: d.displayName ?? "",
                signature: d.signatureHtml ? (simple ? htmlToText(d.signatureHtml) : d.signatureHtml) : d.signature ?? "",
                signatureMode: (simple ? "text" : "html") as "text" | "html",
                dailySendLimit: String(d.dailySendLimit),
                trackingDomain: d.trackingDomain ?? "",
            };
            setForm(next);
            setInitial(next);
            if (!resetAccess) return;
            const map: Record<string, Permission> = {};
            for (const p of (json.data.permissions ?? []) as Permission[]) {
                map[p.userId] = { userId: p.userId, canRead: p.canRead, canSend: p.canSend, canSendAs: p.canSendAs, requiresApproval: p.requiresApproval };
            }
            setPermissions(map);
            setInitialPermissions(map);
        } catch (err) {
            setLoadError(err instanceof Error ? err.message : "Chargement impossible");
        }
    }, [mailbox.id]);

    const loadUsage = useCallback(async () => {
        try {
            const res = await fetch(`/api/email/mailboxes/${mailbox.id}/usage?withOptions=1`);
            const json = await res.json();
            if (res.ok && json.success) setUsage(json.data);
        } catch {
            // Usage is a hint: the drawer works without it.
        }
    }, [mailbox.id]);

    useEffect(() => {
        loadDetail();
        loadUsage();
        (async () => {
            try {
                const res = await fetch("/api/users?role=MANAGER,SDR,DEVELOPER,BUSINESS_DEVELOPER&status=active&limit=200&excludeSelf=false");
                const json = await res.json();
                if (!json.success) throw new Error(json.error || "Utilisateurs indisponibles");
                setUsers(json.data?.users ?? []);
            } catch (err) {
                setAccessError(err instanceof Error ? err.message : "Utilisateurs indisponibles");
                setUsers([]);
            }
        })();
    }, [loadDetail, loadUsage]);

    const settingsDirty = JSON.stringify(form) !== JSON.stringify(initial);
    const accessDirty = JSON.stringify(permissions) !== JSON.stringify(initialPermissions);
    const shown = detail ?? mailbox;
    const sentToday = detail ? detail.sentTodayEffective : mailbox.sentToday;
    const health = mailboxHealth(shown, sentToday);

    // ---------- settings ----------
    const saveSettings = async () => {
        const limit = parseInt(form.dailySendLimit, 10);
        if (!Number.isFinite(limit) || limit < 1 || limit > 500) {
            toast.error("Limite invalide", "Entre 1 et 500 emails par jour.");
            return;
        }
        setIsSaving(true);
        try {
            const signatureHtml = form.signature.trim()
                ? form.signatureMode === "text" ? textToHtml(form.signature) : form.signature
                : "";
            const res = await fetch(`/api/email/mailboxes/${mailbox.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    displayName: form.displayName,
                    signature: form.signatureMode === "text" ? form.signature.trim() : form.signature.replace(/<[^>]+>/g, "").trim(),
                    signatureHtml,
                    dailySendLimit: limit,
                    trackingDomain: form.trackingDomain,
                }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error || "Enregistrement impossible");
            toast.success("Paramètres enregistrés", mailbox.email);
            await loadDetail(false);
            onChanged();
        } catch (err) {
            toast.error("Enregistrement impossible", err instanceof Error ? err.message : undefined);
        } finally {
            setIsSaving(false);
        }
    };

    // ---------- sync ----------
    const sync = async () => {
        setIsSyncing(true);
        setSyncError(null);
        try {
            const res = await fetch(`/api/email/mailboxes/${mailbox.id}/sync`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ maxThreads: 100 }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.success) throw new Error(json.error || "Synchronisation impossible");
            const d = json.data ?? {};
            toast.success(
                "Synchronisation terminée",
                `${d.threadsProcessed ?? 0} conversation(s), ${d.messagesProcessed ?? 0} message(s)${d.duration ? ` en ${Math.round(d.duration / 1000)} s` : ""}.`,
            );
        } catch (err) {
            const message = err instanceof Error ? err.message : "Synchronisation impossible";
            setSyncError(message);
            toast.error("Synchronisation impossible", message);
        } finally {
            setIsSyncing(false);
            await loadDetail(false);
            onChanged();
        }
    };

    // ---------- usage ----------
    const setDefault = async (missionId: string, isDefault: boolean) => {
        setUsageBusy(missionId);
        try {
            const res = await fetch(`/api/email/mailboxes/${mailbox.id}/usage`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ missionId, isDefault }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error || "Modification impossible");
            toast.success(isDefault ? "Boîte par défaut définie" : "Mission retirée", json.data?.name);
            setMissionToAdd("");
            await loadUsage();
            onChanged();
        } catch (err) {
            toast.error("Modification impossible", err instanceof Error ? err.message : undefined);
        } finally {
            setUsageBusy(null);
        }
    };

    const missionOptions = useMemo(
        () =>
            (usage?.missionOptions ?? [])
                .filter((m) => m.defaultMailboxId !== mailbox.id)
                .map((m) => ({
                    value: m.id,
                    label: `${m.name}${m.client?.name ? ` · ${m.client.name}` : ""}${STATUS_SUFFIX[m.status] ?? ""}${m.defaultMailboxId ? " — a déjà une boîte" : ""}`,
                })),
        [usage, mailbox.id],
    );

    // ---------- access ----------
    const ownerId = detail?.ownerId ?? mailbox.ownerId;
    const editableUsers = (users ?? []).filter((u) => u.id !== ownerId);
    const getPerm = (userId: string): Permission =>
        permissions[userId] ?? { userId, canRead: false, canSend: false, canSendAs: false, requiresApproval: false };

    const setPerm = (userId: string, patch: Partial<Permission>) => {
        setPermissions((prev) => {
            const next = { ...getPerm(userId), ...patch };
            if (patch.canRead === false) Object.assign(next, { canSend: false, canSendAs: false, requiresApproval: false });
            if (patch.canSend === true) next.canRead = true;
            if (patch.canSend === false) Object.assign(next, { canSendAs: false, requiresApproval: false });
            return { ...prev, [userId]: next };
        });
    };

    const saveAccess = async () => {
        setIsSavingAccess(true);
        setAccessError(null);
        try {
            const res = await fetch(`/api/email/mailboxes/${mailbox.id}/permissions`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ permissions: editableUsers.map((u) => getPerm(u.id)) }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error || "Enregistrement impossible");
            setInitialPermissions(permissions);
            toast.success("Accès enregistrés");
        } catch (err) {
            const message = err instanceof Error ? err.message : "Enregistrement impossible";
            setAccessError(message);
            toast.error("Accès non enregistrés", message);
        } finally {
            setIsSavingAccess(false);
        }
    };

    // ---------- delete ----------
    const disconnect = async () => {
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/email/mailboxes/${mailbox.id}`, { method: "DELETE" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.success) throw new Error(json.error || "Déconnexion impossible");
            toast.success("Boîte mail déconnectée", mailbox.email);
            setConfirmDelete(false);
            onDeleted();
        } catch (err) {
            toast.error("Déconnexion impossible", err instanceof Error ? err.message : undefined);
        } finally {
            setIsDeleting(false);
        }
    };

    const webhookUrl = typeof window === "undefined" ? "/api/email/webhooks/reachinbox" : `${window.location.origin}/api/email/webhooks/reachinbox`;
    const copyWebhook = async () => {
        try {
            await navigator.clipboard.writeText(webhookUrl);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
        } catch {
            toast.error("Copie impossible", "Sélectionnez l'adresse et copiez-la manuellement.");
        }
    };

    const limitNumber = parseInt(form.dailySendLimit, 10) || shown.dailySendLimit;
    const pct = Math.min(100, Math.round((sentToday / Math.max(1, limitNumber)) * 100));

    return (
        <>
            <Drawer
                isOpen
                onClose={onClose}
                size="lg"
                title={shown.displayName || shown.email}
                description={`${meta.label} · ${shown.email}`}
                footer={
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-ink-3">{settingsDirty ? "Modifications non enregistrées" : ""}</span>
                        <div className="flex gap-2">
                            <Button variant="ghost" onClick={onClose}>Fermer</Button>
                            <Button onClick={saveSettings} isLoading={isSaving} disabled={!settingsDirty || !detail}>
                                Enregistrer
                            </Button>
                        </div>
                    </div>
                }
            >
                {loadError ? (
                    <Callout tone="danger" title="Impossible de charger cette boîte mail" action={<Button size="sm" variant="secondary" onClick={() => { setLoadError(null); loadDetail(); }}>Réessayer</Button>}>
                        {loadError}
                    </Callout>
                ) : (
                    <div className="space-y-5">
                        {/* ---------- Status ---------- */}
                        <section>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <StatusText tone={health.tone} pulse={health.pulse}>{health.label}</StatusText>
                                {mailbox.provider === "REACHINBOX" ? (
                                    <Link href="/manager/emails/campaigns" className="inline-flex items-center gap-1 text-xs font-semibold text-link hover:underline">
                                        Ouvrir les campagnes <ExternalLink className="size-3" aria-hidden />
                                    </Link>
                                ) : (
                                    <Button size="sm" variant="secondary" leftIcon={<RefreshCw className="size-3.5" />} onClick={sync} isLoading={isSyncing}>
                                        Synchroniser maintenant
                                    </Button>
                                )}
                            </div>
                            {(syncError || (shown.syncStatus === "ERROR" && shown.lastError)) && (
                                <Callout tone="danger" className="mt-3" title="Dernière erreur">
                                    <p className="break-words">{syncError || shown.lastError}</p>
                                    {detail?.lastFailureAt && <p className="mt-1 text-xs">Survenue {relative(detail.lastFailureAt)}{detail.consecutiveFailures > 1 ? ` · ${detail.consecutiveFailures} échecs consécutifs` : ""}</p>}
                                    {detail?.disabledReason && <p className="mt-1 text-xs">Désactivée automatiquement : {detail.disabledReason}</p>}
                                </Callout>
                            )}
                            <dl className="mt-4 grid grid-cols-3 gap-2">
                                <div className="rounded-panel border border-line bg-surface-2 px-3 py-2.5">
                                    <dt className="text-[11px] text-ink-3">Envois aujourd&apos;hui</dt>
                                    <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">
                                        {sentToday} <span className="font-normal text-ink-3">/ {shown.dailySendLimit}</span>
                                    </dd>
                                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3">
                                        <div className={cn("h-full rounded-full", pct >= 100 ? "bg-warning" : "bg-primary-600")} style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                                <div className="rounded-panel border border-line bg-surface-2 px-3 py-2.5">
                                    <dt className="text-[11px] text-ink-3">Conversations</dt>
                                    <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{shown._count.threads.toLocaleString("fr-FR")}</dd>
                                </div>
                                <div className="rounded-panel border border-line bg-surface-2 px-3 py-2.5">
                                    <dt className="text-[11px] text-ink-3">Emails</dt>
                                    <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{shown._count.emails.toLocaleString("fr-FR")}</dd>
                                </div>
                            </dl>
                        </section>

                        {/* ---------- Identity ---------- */}
                        <Section title="Identité" description="Ce que voient les destinataires.">
                            {!detail ? (
                                <Skeleton className="h-40 rounded-panel" />
                            ) : (
                                <div className="space-y-4">
                                    <Input label="Nom d'affichage" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder={shown.email.split("@")[0]} />
                                    <Textarea
                                        label="Signature"
                                        value={form.signature}
                                        onChange={(e) => setForm({ ...form, signature: e.target.value })}
                                        rows={form.signatureMode === "html" ? 6 : 4}
                                        className={cn(form.signatureMode === "html" && "font-mono text-[13px]")}
                                        placeholder={"Prénom Nom\nFonction · Société\n06 12 34 56 78"}
                                        hint={form.signatureMode === "html" ? "Signature en HTML (mise en forme conservée)." : "Ajoutée sous chaque email envoyé depuis le CRM."}
                                    />
                                </div>
                            )}
                        </Section>

                        {/* ---------- Sending ---------- */}
                        <Section title="Envoi">
                            {!detail ? (
                                <Skeleton className="h-24 rounded-panel" />
                            ) : (
                                <div className="space-y-4">
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <Input
                                            label="Limite d'envoi quotidienne"
                                            type="number"
                                            min={1}
                                            max={500}
                                            value={form.dailySendLimit}
                                            onChange={(e) => setForm({ ...form, dailySendLimit: e.target.value })}
                                            hint="Au-delà, les envois sont refusés jusqu'au lendemain. Entre 1 et 500."
                                        />
                                        <Input
                                            label="Domaine de suivi"
                                            value={form.trackingDomain}
                                            onChange={(e) => setForm({ ...form, trackingDomain: e.target.value })}
                                            placeholder="https://track.mondomaine.fr"
                                            hint="Facultatif. Sert aux liens et pixels de suivi d'ouverture."
                                        />
                                    </div>
                                    <p className="text-xs text-ink-3">
                                        Préchauffage : le CRM n&apos;envoie pas d&apos;emails de préchauffage. Pour réchauffer une boîte, utilisez le warmup de ReachInbox.
                                    </p>
                                </div>
                            )}
                        </Section>

                        {/* ---------- Usage ---------- */}
                        <Section title="Utilisation" description="Boîte proposée par défaut à l'envoi rapide des SDR pour ces missions.">
                            {!usage ? (
                                <Skeleton className="h-16 rounded-panel" />
                            ) : (
                                <div className="space-y-3">
                                    {usage.missions.length === 0 && usage.clients.length === 0 ? (
                                        <p className="text-sm text-ink-3">Aucune mission ni aucun client n&apos;utilise cette boîte par défaut.</p>
                                    ) : (
                                        <ul className="divide-y divide-line-subtle rounded-panel border border-line">
                                            {usage.missions.map((m) => (
                                                <li key={m.id} className="flex items-center gap-2 px-3 py-2">
                                                    <Target className="size-3.5 shrink-0 text-ink-4" aria-hidden />
                                                    <Link href={`/manager/missions/${m.id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-ink hover:text-link hover:underline">
                                                        {m.name}
                                                        {m.client?.name && <span className="font-normal text-ink-3"> · {m.client.name}</span>}
                                                    </Link>
                                                    <IconButton icon={X} label="Ne plus utiliser par défaut" size="xs" onClick={() => setDefault(m.id, false)} isLoading={usageBusy === m.id} />
                                                </li>
                                            ))}
                                            {usage.clients.map((c) => (
                                                <li key={c.id} className="flex items-center gap-2 px-3 py-2">
                                                    <Building2 className="size-3.5 shrink-0 text-ink-4" aria-hidden />
                                                    <Link href={`/manager/clients/${c.id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-ink hover:text-link hover:underline">
                                                        {c.name}
                                                    </Link>
                                                    <Badge size="sm">Client</Badge>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    {mailbox.provider !== "REACHINBOX" && (
                                        <div className="flex flex-wrap items-end gap-2">
                                            <Select
                                                className="min-w-0 flex-1"
                                                value={missionToAdd}
                                                onChange={setMissionToAdd}
                                                options={missionOptions}
                                                placeholder="Choisir une mission…"
                                                searchable
                                            />
                                            <Button
                                                variant="secondary"
                                                onClick={() => setDefault(missionToAdd, true)}
                                                disabled={!missionToAdd}
                                                isLoading={usageBusy === missionToAdd && Boolean(missionToAdd)}
                                            >
                                                Définir par défaut
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </Section>

                        {/* ---------- Team access ---------- */}
                        <Section title="Accès équipe" description={`Le propriétaire (${detail?.owner?.name ?? mailbox.owner?.name ?? "—"}) a tous les droits. Les managers voient toutes les boîtes.`}>
                            {accessError && <Callout tone="danger" className="mb-3">{accessError}</Callout>}
                            {users === null || !detail ? (
                                <Skeleton className="h-32 rounded-panel" />
                            ) : editableUsers.length === 0 ? (
                                <p className="text-sm text-ink-3">Aucun autre utilisateur actif.</p>
                            ) : (
                                <>
                                    <div className="max-h-80 overflow-y-auto rounded-panel border border-line">
                                        <table className="w-full text-left text-sm">
                                            <thead className="sticky top-0 bg-surface-2 text-[11px] font-semibold text-ink-3">
                                                <tr>
                                                    <th className="px-3 py-2">Utilisateur</th>
                                                    <th className="px-2 py-2 text-center">Lire</th>
                                                    <th className="px-2 py-2 text-center">Envoyer</th>
                                                    <th className="px-2 py-2 text-center" title="Envoyer au nom du propriétaire">En son nom</th>
                                                    <th className="px-2 py-2 text-center" title="Chaque envoi doit être validé">Validation</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {editableUsers.map((u) => {
                                                    const p = getPerm(u.id);
                                                    return (
                                                        <tr key={u.id} className="border-t border-line-subtle">
                                                            <td className="max-w-0 px-3 py-2">
                                                                <p className="truncate font-medium text-ink">{u.name}</p>
                                                                <p className="truncate text-xs text-ink-3">{ROLE_LABEL[u.role] ?? u.role}</p>
                                                            </td>
                                                            <td className="px-2 py-2 text-center"><Checkbox aria-label={`Lire — ${u.name}`} checked={p.canRead} onChange={(e) => setPerm(u.id, { canRead: e.target.checked })} /></td>
                                                            <td className="px-2 py-2 text-center"><Checkbox aria-label={`Envoyer — ${u.name}`} checked={p.canSend} onChange={(e) => setPerm(u.id, { canSend: e.target.checked })} /></td>
                                                            <td className="px-2 py-2 text-center"><Checkbox aria-label={`En son nom — ${u.name}`} checked={p.canSendAs} disabled={!p.canSend} onChange={(e) => setPerm(u.id, { canSendAs: e.target.checked })} /></td>
                                                            <td className="px-2 py-2 text-center"><Checkbox aria-label={`Validation — ${u.name}`} checked={p.requiresApproval} disabled={!p.canSend} onChange={(e) => setPerm(u.id, { requiresApproval: e.target.checked })} /></td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="mt-3 flex justify-end">
                                        <Button size="sm" variant="secondary" onClick={saveAccess} isLoading={isSavingAccess} disabled={!accessDirty}>
                                            Enregistrer les accès
                                        </Button>
                                    </div>
                                </>
                            )}
                        </Section>

                        {mailbox.provider === "REACHINBOX" && (
                            <Section title="Webhook ReachInbox" description="À renseigner dans ReachInbox pour recevoir les réponses et les statuts en temps réel.">
                                <div className="flex items-center gap-2">
                                    <code className="min-w-0 flex-1 truncate rounded-control border border-line bg-surface-2 px-3 py-2 text-xs text-ink-2">{webhookUrl}</code>
                                    <Button size="sm" variant="secondary" leftIcon={copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} onClick={copyWebhook}>
                                        {copied ? "Copié" : "Copier"}
                                    </Button>
                                </div>
                            </Section>
                        )}

                        {/* ---------- Danger ---------- */}
                        <Section title="Déconnecter">
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-danger-line bg-danger-soft px-4 py-3">
                                <p className="min-w-0 flex-1 text-xs text-danger-ink">
                                    Retire la boîte du CRM avec ses conversations et emails synchronisés. Le compte de messagerie lui-même n&apos;est pas touché.
                                </p>
                                <Button size="sm" variant="danger" leftIcon={<Trash2 className="size-3.5" />} onClick={() => setConfirmDelete(true)}>
                                    Déconnecter
                                </Button>
                            </div>
                        </Section>
                    </div>
                )}
            </Drawer>

            <ConfirmModal
                isOpen={confirmDelete}
                onClose={() => !isDeleting && setConfirmDelete(false)}
                onConfirm={disconnect}
                isLoading={isDeleting}
                variant="danger"
                title="Déconnecter cette boîte mail ?"
                message={`${mailbox.email} sera retirée du CRM avec ses ${shown._count.threads.toLocaleString("fr-FR")} conversations et ${shown._count.emails.toLocaleString("fr-FR")} emails synchronisés. Les missions qui l'utilisent par défaut n'auront plus de boîte par défaut.`}
                confirmText="Déconnecter"
            />
        </>
    );
}

export default MailboxSettingsDrawer;
