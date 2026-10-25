"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, ArchiveRestore, Copy, ListOrdered, MoreHorizontal, Pause, Play, Trash2, UserPlus } from "lucide-react";
import {
    Button,
    Callout,
    Card,
    ConfirmModal,
    ContextMenu,
    EmptyState,
    IconButton,
    Skeleton,
    Tabs,
    useToast,
} from "@/components/ui";
import EmailHubPage from "@/components/email/EmailHubPage";
import { ApiError, apiJson, errorMessage } from "./api";
import { BackLink, EngineHealthCallout, TonePill } from "./SequenceBits";
import {
    SEQUENCE_STATUS_META,
    findBracketPlaceholders,
    formatDateTime,
    formatRelative,
    mailboxHealth,
    pct,
    plural,
    type EnrollmentRow,
    type SequenceDetail,
    type SequenceStatus,
} from "./types";
import { draftErrors, draftFromDetail, draftSignature, draftToPayload, type SequenceDraft } from "./editor/draft";
import { SettingsPanel } from "./editor/SettingsPanel";
import { StepsWorkspace } from "./editor/StepsWorkspace";
import { ActivationChecklist, type ChecklistItem } from "./detail/ActivationChecklist";
import { EnrollDrawer } from "./detail/EnrollDrawer";
import { EnrollmentsTab } from "./detail/EnrollmentsTab";
import { StatsTab } from "./detail/StatsTab";
import { useSequenceOptions } from "./useSequenceOptions";
import { useUnsavedChangesGuard } from "./useUnsavedChangesGuard";

type TabId = "steps" | "contacts" | "stats" | "settings";
const TAB_IDS: TabId[] = ["steps", "contacts", "stats", "settings"];

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
    return (
        <div className="min-w-0 rounded-xl border border-line bg-surface px-4 py-3">
            <p className="text-xs text-ink-3">{label}</p>
            <p className="mt-0.5 text-lg font-bold tracking-tight text-ink">
                {typeof value === "number" ? value.toLocaleString("fr-FR") : value}
                {sub && <span className="ml-1.5 text-xs font-medium text-ink-3">{sub}</span>}
            </p>
        </div>
    );
}

export default function SequenceDetailView({ id }: { id: string }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const toast = useToast();
    const { options } = useSequenceOptions();

    const [detail, setDetail] = useState<SequenceDetail | null>(null);
    const [loadError, setLoadError] = useState<{ message: string; status: number } | null>(null);
    const [draft, setDraft] = useState<SequenceDraft | null>(null);
    const baseline = useRef<string>("");
    const [tab, setTab] = useState<TabId>(() => {
        const t = searchParams.get("tab") as TabId | null;
        return t && TAB_IDS.includes(t) ? t : "steps";
    });
    const [enrollOpen, setEnrollOpen] = useState(searchParams.get("enroll") === "1");
    const [enrollRefresh, setEnrollRefresh] = useState(0);
    const [saving, setSaving] = useState(false);
    const [statusBusy, setStatusBusy] = useState(false);
    const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [previewContacts, setPreviewContacts] = useState<{ id: string; label: string }[]>([]);

    const applyDetail = useCallback((data: SequenceDetail, resetDraft: boolean) => {
        setDetail(data);
        if (resetDraft) {
            const d = draftFromDetail(data);
            setDraft(d);
            baseline.current = draftSignature(d);
        }
    }, []);

    const load = useCallback(
        async (resetDraft = true) => {
            try {
                const { data } = await apiJson<SequenceDetail>(`/api/email/sequences/${id}`);
                applyDetail(data, resetDraft);
                setLoadError(null);
            } catch (e) {
                setLoadError({ message: errorMessage(e, "Séquence introuvable"), status: e instanceof ApiError ? e.status : 0 });
            }
        },
        [id, applyDetail],
    );

    useEffect(() => {
        load(true);
    }, [load]);

    // A few enrolled contacts to preview the emails with real data.
    useEffect(() => {
        apiJson<EnrollmentRow[]>(`/api/email/sequences/${id}/enrollments?page=1`)
            .then(({ data }) =>
                setPreviewContacts(
                    (data ?? []).slice(0, 25).map((r) => ({
                        id: r.contact.id,
                        label: [r.contact.name || r.contact.email, r.contact.companyName].filter(Boolean).join(" · "),
                    })),
                ),
            )
            .catch(() => undefined);
    }, [id, enrollRefresh]);

    const changeTab = (t: string) => {
        setTab(t as TabId);
        const params = new URLSearchParams(searchParams.toString());
        params.set("tab", t);
        params.delete("enroll");
        router.replace(`?${params.toString()}`, { scroll: false });
    };

    const dirty = !!draft && draftSignature(draft) !== baseline.current;
    const { confirmNode } = useUnsavedChangesGuard(dirty);

    const mailbox = useMemo(() => {
        if (!draft) return detail?.mailbox ?? null;
        return options?.mailboxes.find((m) => m.id === draft.settings.mailboxId) ?? (detail?.mailboxId === draft.settings.mailboxId ? detail?.mailbox ?? null : null);
    }, [draft, options, detail]);

    // ============================================
    // SAVE / STATUS
    // ============================================

    const save = async (extra?: { status?: SequenceStatus }) => {
        if (!draft) return false;
        const errors = draftErrors(draft);
        if (errors.length) {
            toast.error("Enregistrement impossible", errors[0]);
            return false;
        }
        setSaving(true);
        try {
            const { data } = await apiJson<SequenceDetail>(`/api/email/sequences/${id}`, {
                method: "PATCH",
                json: { ...draftToPayload(draft), ...extra },
            });
            applyDetail(data, true);
            return true;
        } catch (e) {
            toast.error(extra?.status ? "La séquence n'a pas été activée" : "Modifications non enregistrées", errorMessage(e));
            // Settings may have been partly applied before a refused status change: resync counts only.
            if (extra?.status) load(false);
            return false;
        } finally {
            setSaving(false);
        }
    };

    const setStatus = async (status: SequenceStatus, success: string) => {
        setStatusBusy(true);
        try {
            if (dirty) {
                if (await save({ status })) toast.success(success, "Vos modifications ont aussi été enregistrées.");
                return;
            }
            const { data } = await apiJson<SequenceDetail>(`/api/email/sequences/${id}`, { method: "PATCH", json: { status } });
            applyDetail(data, false);
            toast.success(success);
        } catch (e) {
            toast.error("Changement de statut impossible", errorMessage(e));
        } finally {
            setStatusBusy(false);
        }
    };

    const duplicate = async () => {
        try {
            const { data } = await apiJson<{ id: string }>(`/api/email/sequences/${id}/duplicate`, { method: "POST" });
            toast.success("Séquence dupliquée", "La copie est en brouillon.");
            router.push(`/manager/emails/sequences/${data.id}`);
        } catch (e) {
            toast.error("Duplication impossible", errorMessage(e));
        }
    };

    const doDelete = async () => {
        setDeleting(true);
        try {
            await apiJson(`/api/email/sequences/${id}`, { method: "DELETE" });
            toast.success("Séquence supprimée");
            baseline.current = draft ? draftSignature(draft) : "";
            router.push("/manager/emails/sequences");
        } catch (e) {
            toast.error("Suppression impossible", errorMessage(e));
            setDeleting(false);
            setConfirmDelete(false);
        }
    };

    // ============================================
    // RENDER
    // ============================================

    if (loadError && !detail) {
        return (
            <EmailHubPage eyebrow={<BackLink href="/manager/emails/sequences">Séquences</BackLink>} title="Séquence">
                {loadError.status === 404 ? (
                    <EmptyState
                        icon={ListOrdered}
                        title="Cette séquence n'existe plus"
                        description="Elle a peut-être été supprimée."
                        action={<Button onClick={() => router.push("/manager/emails/sequences")}>Voir les séquences</Button>}
                    />
                ) : (
                    <Callout tone="danger" title="La séquence n'a pas pu être chargée" action={<Button size="sm" variant="secondary" onClick={() => load(true)}>Réessayer</Button>}>
                        {loadError.message}
                    </Callout>
                )}
            </EmailHubPage>
        );
    }

    if (!detail || !draft) {
        return (
            <EmailHubPage eyebrow={<BackLink href="/manager/emails/sequences">Séquences</BackLink>}>
                <div className="space-y-4">
                    <Skeleton className="h-8 w-72" />
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                            <Skeleton key={i} className="h-16 rounded-xl" />
                        ))}
                    </div>
                    <Skeleton className="h-96 w-full rounded-2xl" />
                </div>
            </EmailHubPage>
        );
    }

    const status = detail.status;
    const statusMeta = SEQUENCE_STATUS_META[status];
    const { stats, counts } = detail;
    const health = mailboxHealth(mailbox);
    const waiting = counts.ACTIVE ?? 0;
    const placeholdersLeft = draft.steps.some((s) => findBracketPlaceholders(`${s.subject}\n${s.body}`).length > 0);
    const stepsComplete =
        draft.steps.length > 0 && !!draft.steps[0].subject.trim() && draft.steps.every((s) => s.body.trim().length > 0);

    const checklist: ChecklistItem[] = [
        {
            id: "mailbox",
            label: "Boîte d'envoi connectée",
            done: !!mailbox?.isActive,
            blocking: true,
            hint: mailbox ? health.detail ?? health.label : "Aucune boîte choisie.",
            action: { label: "Choisir la boîte", onClick: () => changeTab("settings") },
        },
        {
            id: "steps",
            label: draft.steps.length > 1 ? `${draft.steps.length} emails complets (objet et texte)` : "Au moins un email complet (objet et texte)",
            done: stepsComplete,
            blocking: true,
            action: { label: "Compléter les emails", onClick: () => changeTab("steps") },
        },
        {
            id: "contacts",
            label: waiting > 0 ? `${plural(waiting, "contact")} en attente d'envoi` : "Au moins un contact inscrit",
            done: waiting > 0,
            blocking: true,
            action: { label: "Inscrire des contacts", onClick: () => setEnrollOpen(true) },
        },
        {
            id: "placeholders",
            label: "Aucun champ [à compléter] dans les emails",
            done: !placeholdersLeft,
            blocking: true,
            hint: "Des textes comme [Prénom] partiraient tels quels.",
            action: { label: "Corriger", onClick: () => changeTab("steps") },
        },
        {
            id: "engine",
            label: "Moteur d'envoi en marche",
            done: !!options?.engine.healthy,
            blocking: false,
            hint: "Sans lui, la séquence restera active sans rien envoyer.",
        },
    ];

    const activeOrDraftHeader = (
        <>
            {dirty && (
                <Button variant="ghost" onClick={() => draft && detail && applyDetail(detail, true)} disabled={saving}>
                    Annuler les modifications
                </Button>
            )}
            {dirty && (
                <Button onClick={async () => { if (await save()) toast.success("Modifications enregistrées"); }} isLoading={saving}>
                    Enregistrer
                </Button>
            )}
            {status === "ACTIVE" && (
                <Button variant="secondary" leftIcon={<Pause className="size-4" />} isLoading={statusBusy} onClick={() => setStatus("PAUSED", "Séquence mise en pause")}>
                    Mettre en pause
                </Button>
            )}
            {status === "ARCHIVED" && (
                <Button variant="secondary" leftIcon={<ArchiveRestore className="size-4" />} isLoading={statusBusy} onClick={() => setStatus("PAUSED", "Séquence désarchivée (en pause)")}>
                    Désarchiver
                </Button>
            )}
            {status !== "ARCHIVED" && (
                <Button variant="secondary" leftIcon={<UserPlus className="size-4" />} onClick={() => setEnrollOpen(true)}>
                    Inscrire des contacts
                </Button>
            )}
            <IconButton
                icon={MoreHorizontal}
                label="Plus d'actions"
                variant="outline"
                onClick={(e) => {
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setMenu({ x: r.right - 190, y: r.bottom + 4 });
                }}
            />
        </>
    );

    return (
        <EmailHubPage
            eyebrow={<BackLink href="/manager/emails/sequences">Séquences</BackLink>}
            title={detail.name}
            description={
                <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                    <TonePill tone={statusMeta.tone}>{statusMeta.label}</TonePill>
                    <span>{plural(detail.steps.length, "email")}</span>
                    {status === "ACTIVE" && detail.nextSendAt && (
                        <span title={formatDateTime(detail.nextSendAt, detail.timezone)}>· prochain envoi {formatRelative(detail.nextSendAt)}</span>
                    )}
                    {dirty && <span className="font-medium text-warning-ink">· modifications non enregistrées</span>}
                </span>
            }
            actions={activeOrDraftHeader}
        >
            <div className="space-y-5">
                {status === "ACTIVE" && <EngineHealthCallout engine={options?.engine} hasActive />}
                {status === "ACTIVE" && mailbox && !mailbox.isActive && (
                    <Callout tone="danger" title="La boîte d'envoi est désactivée">
                        Aucun email ne part. Reconnectez la boîte ou choisissez-en une autre dans les réglages.
                    </Callout>
                )}

                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                    <Kpi label="Inscrits" value={stats.enrolled} />
                    <Kpi label="En cours" value={waiting} />
                    <Kpi label="Emails envoyés" value={stats.sent} />
                    <Kpi label="Ouvertures" value={detail.trackOpens ? pct(stats.opened, stats.sent) : "—"} sub={detail.trackOpens && stats.opened ? `${stats.opened}` : undefined} />
                    <Kpi label="Réponses" value={stats.replied} sub={pct(stats.replied, stats.contacted)} />
                    <Kpi label="Rebonds" value={stats.bounced} sub={stats.bounced ? pct(stats.bounced, stats.sent) : undefined} />
                </div>

                {(status === "DRAFT" || status === "PAUSED") && (
                    <ActivationChecklist
                        items={checklist}
                        isPaused={status === "PAUSED"}
                        dirty={dirty}
                        activating={statusBusy}
                        onActivate={() => setStatus("ACTIVE", status === "PAUSED" ? "Séquence relancée" : "Séquence activée")}
                    />
                )}

                <Tabs
                    activeTab={tab}
                    onTabChange={changeTab}
                    tabs={[
                        { id: "steps", label: "Étapes", badge: draft.steps.length },
                        { id: "contacts", label: "Contacts inscrits", badge: counts.total || undefined },
                        { id: "stats", label: "Statistiques" },
                        { id: "settings", label: "Réglages" },
                    ]}
                />

                {tab === "steps" && (
                    <div className="space-y-4">
                        {status === "ACTIVE" && waiting > 0 && (
                            <Callout tone="info">
                                Les modifications s'appliquent aux prochains envois, y compris pour les {plural(waiting, "contact")} déjà en cours. Les emails déjà envoyés
                                ne peuvent pas être supprimés.
                            </Callout>
                        )}
                        <StepsWorkspace
                            steps={draft.steps}
                            onChange={(steps) => setDraft((d) => (d ? { ...d, steps } : d))}
                            mailbox={mailbox}
                            timezone={draft.settings.timezone}
                            stopOnReply={draft.settings.stopOnReply}
                            myEmail={options?.me?.email}
                            previewContacts={previewContacts}
                        />
                    </div>
                )}

                {tab === "contacts" && (
                    <EnrollmentsTab
                        sequenceId={id}
                        sequenceStatus={status}
                        stepsCount={detail.steps.length}
                        counts={counts}
                        timezone={detail.timezone}
                        refreshKey={enrollRefresh}
                        onOpenEnroll={() => setEnrollOpen(true)}
                        onChanged={() => load(false)}
                    />
                )}

                {tab === "stats" && <StatsTab detail={detail} />}

                {tab === "settings" && (
                    <div className="max-w-3xl">
                        {options ? (
                            <SettingsPanel
                                settings={draft.settings}
                                onChange={(patch) => setDraft((d) => (d ? { ...d, settings: { ...d.settings, ...patch } } : d))}
                                mailboxes={options.mailboxes}
                                showIdentity
                                hasActiveContacts={waiting > 0}
                            />
                        ) : (
                            <Card padding="md">
                                <Skeleton className="h-48 w-full" />
                            </Card>
                        )}
                    </div>
                )}

                {dirty && (
                    <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-raised">
                        <p className="text-[13px] text-ink-2">Vous avez des modifications non enregistrées.</p>
                        <div className="flex gap-2">
                            <Button variant="ghost" size="sm" onClick={() => applyDetail(detail, true)} disabled={saving}>
                                Annuler
                            </Button>
                            <Button size="sm" onClick={async () => { if (await save()) toast.success("Modifications enregistrées"); }} isLoading={saving}>
                                Enregistrer
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            <EnrollDrawer
                isOpen={enrollOpen}
                onClose={() => setEnrollOpen(false)}
                sequenceId={id}
                sequenceStatus={status}
                missions={options?.missions ?? []}
                onEnrolled={() => {
                    setEnrollRefresh((n) => n + 1);
                    load(false);
                    if (tab !== "contacts") changeTab("contacts");
                }}
            />

            <ContextMenu
                position={menu}
                onClose={() => setMenu(null)}
                items={[
                    { label: "Dupliquer", icon: <Copy className="size-4" />, onClick: duplicate },
                    status === "ARCHIVED"
                        ? { label: "Désarchiver", icon: <ArchiveRestore className="size-4" />, onClick: () => setStatus("PAUSED", "Séquence désarchivée (en pause)") }
                        : {
                            label: "Archiver",
                            icon: <Archive className="size-4" />,
                            disabled: status === "ACTIVE",
                            onClick: () => setStatus("ARCHIVED", "Séquence archivée"),
                        },
                    status === "PAUSED"
                        ? { label: "Repasser en brouillon", icon: <Pause className="size-4" />, onClick: () => setStatus("DRAFT", "Séquence repassée en brouillon") }
                        : null,
                    { label: "Supprimer", icon: <Trash2 className="size-4" />, variant: "danger" as const, divider: true, onClick: () => setConfirmDelete(true) },
                ].filter((x): x is NonNullable<typeof x> => !!x)}
            />

            <ConfirmModal
                isOpen={confirmDelete}
                onClose={() => setConfirmDelete(false)}
                onConfirm={doDelete}
                isLoading={deleting}
                variant="danger"
                title="Supprimer la séquence ?"
                confirmText="Supprimer"
                message={`« ${detail.name} », ses ${plural(detail.steps.length, "étape")} et le suivi de ${plural(counts.total, "contact inscrit", "contacts inscrits")} seront supprimés définitivement. Les emails déjà envoyés restent dans la boîte de réception.`}
            />
            {confirmNode}
        </EmailHubPage>
    );
}
