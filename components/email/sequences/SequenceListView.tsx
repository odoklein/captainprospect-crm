"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    Archive,
    ArchiveRestore,
    Copy,
    ExternalLink,
    ListOrdered,
    MoreHorizontal,
    Pause,
    Play,
    Plus,
    Search,
    Trash2,
} from "lucide-react";
import {
    Button,
    Callout,
    Card,
    ConfirmModal,
    ContextMenu,
    EmptyState,
    IconButton,
    Input,
    SegmentedControl,
    Skeleton,
    useToast,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import EmailHubPage from "@/components/email/EmailHubPage";
import { apiJson, errorMessage } from "./api";
import { EngineHealthCallout, TonePill } from "./SequenceBits";
import {
    SEQUENCE_STATUS_META,
    formatRelative,
    mailboxHealth,
    mailboxLabel,
    pct,
    plural,
    type EngineStatus,
    type SequenceListItem,
    type SequenceStatus,
} from "./types";

type Filter = "ALL" | SequenceStatus;

const FILTERS: { value: Filter; label: string }[] = [
    { value: "ALL", label: "Toutes" },
    { value: "ACTIVE", label: "Actives" },
    { value: "DRAFT", label: "Brouillons" },
    { value: "PAUSED", label: "En pause" },
    { value: "ARCHIVED", label: "Archivées" },
];

const GRID = "md:grid md:grid-cols-[minmax(0,2.4fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_auto] md:items-center md:gap-4";

export default function SequenceListView() {
    const router = useRouter();
    const toast = useToast();

    const [sequences, setSequences] = useState<SequenceListItem[] | null>(null);
    const [engine, setEngine] = useState<EngineStatus | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState<Filter>("ALL");
    const [search, setSearch] = useState("");
    const [busyId, setBusyId] = useState<string | null>(null);
    const [menu, setMenu] = useState<{ seq: SequenceListItem; x: number; y: number } | null>(null);
    const [toDelete, setToDelete] = useState<SequenceListItem | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const load = useCallback(async () => {
        setIsLoading(true);
        setLoadError(null);
        try {
            const { data, meta } = await apiJson<SequenceListItem[]>("/api/email/sequences");
            setSequences(data ?? []);
            setEngine(meta?.engine ?? null);
        } catch (error) {
            setLoadError(errorMessage(error, "Impossible de charger les séquences"));
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const counts = useMemo(() => {
        const c: Record<Filter, number> = { ALL: 0, ACTIVE: 0, DRAFT: 0, PAUSED: 0, ARCHIVED: 0 };
        for (const s of sequences ?? []) {
            c[s.status]++;
            if (s.status !== "ARCHIVED") c.ALL++;
        }
        return c;
    }, [sequences]);

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        return (sequences ?? []).filter((s) => {
            if (filter === "ALL" ? s.status === "ARCHIVED" : s.status !== filter) return false;
            if (!q) return true;
            return (
                s.name.toLowerCase().includes(q) ||
                (s.description ?? "").toLowerCase().includes(q) ||
                (s.mailbox?.email ?? "").toLowerCase().includes(q)
            );
        });
    }, [sequences, filter, search]);

    const patchLocal = (id: string, patch: Partial<SequenceListItem>) =>
        setSequences((prev) => prev?.map((s) => (s.id === id ? { ...s, ...patch } : s)) ?? prev);

    const changeStatus = async (seq: SequenceListItem, status: SequenceStatus, success: string) => {
        setBusyId(seq.id);
        const previous = seq.status;
        patchLocal(seq.id, { status });
        try {
            await apiJson(`/api/email/sequences/${seq.id}`, { method: "PATCH", json: { status } });
            toast.success(success);
        } catch (error) {
            patchLocal(seq.id, { status: previous });
            toast.error("Changement de statut impossible", errorMessage(error));
        } finally {
            setBusyId(null);
        }
    };

    const duplicate = async (seq: SequenceListItem) => {
        try {
            const { data } = await apiJson<{ id: string }>(`/api/email/sequences/${seq.id}/duplicate`, { method: "POST" });
            toast.success("Séquence dupliquée", "La copie est en brouillon.");
            router.push(`/manager/emails/sequences/${data.id}`);
        } catch (error) {
            toast.error("Duplication impossible", errorMessage(error));
        }
    };

    const confirmDelete = async () => {
        if (!toDelete) return;
        setIsDeleting(true);
        try {
            await apiJson(`/api/email/sequences/${toDelete.id}`, { method: "DELETE" });
            setSequences((prev) => prev?.filter((s) => s.id !== toDelete.id) ?? prev);
            toast.success("Séquence supprimée");
            setToDelete(null);
        } catch (error) {
            toast.error("Suppression impossible", errorMessage(error));
        } finally {
            setIsDeleting(false);
        }
    };

    const hasActive = (sequences ?? []).some((s) => s.status === "ACTIVE");
    const isEmpty = !isLoading && !loadError && (sequences?.length ?? 0) === 0;

    return (
        <EmailHubPage
            title="Séquences"
            description="Une série d'emails envoyés automatiquement à vos contacts, espacés dans le temps, qui s'arrête dès qu'ils répondent."
            actions={
                <Link href="/manager/emails/sequences/new">
                    <Button leftIcon={<Plus className="size-4" />}>Nouvelle séquence</Button>
                </Link>
            }
        >
            <div className="space-y-4">
                <EngineHealthCallout engine={engine} hasActive={hasActive} />

                {!isEmpty && (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <SegmentedControl
                            ariaLabel="Filtrer par statut"
                            value={filter}
                            onChange={setFilter}
                            options={FILTERS.map((f) => ({ value: f.value, label: f.label, count: counts[f.value] }))}
                            className="max-w-full overflow-x-auto"
                        />
                        <div className="w-full sm:w-72">
                            <Input
                                size="sm"
                                placeholder="Rechercher une séquence…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                icon={<Search className="size-4" />}
                                aria-label="Rechercher une séquence"
                            />
                        </div>
                    </div>
                )}

                {loadError && (
                    <Callout
                        tone="danger"
                        title="Les séquences n'ont pas pu être chargées"
                        action={<Button size="sm" variant="secondary" onClick={load}>Réessayer</Button>}
                    >
                        {loadError}
                    </Callout>
                )}

                {isLoading && (
                    <Card padding="none" className="divide-y divide-line-subtle">
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="flex items-center gap-4 px-5 py-4">
                                <div className="flex-1 space-y-2">
                                    <Skeleton className="h-4 w-56" />
                                    <Skeleton className="h-3 w-40" />
                                </div>
                                <Skeleton className="hidden h-4 w-24 md:block" />
                                <Skeleton className="hidden h-4 w-24 md:block" />
                                <Skeleton className="h-6 w-20" />
                            </div>
                        ))}
                    </Card>
                )}

                {isEmpty && (
                    <EmptyState
                        icon={ListOrdered}
                        title="Aucune séquence pour l'instant"
                        description="Une séquence envoie plusieurs emails espacés de quelques jours à une liste de contacts, et arrête automatiquement les relances quand quelqu'un répond."
                        action={
                            <Link href="/manager/emails/sequences/new">
                                <Button leftIcon={<Plus className="size-4" />}>Créer une séquence</Button>
                            </Link>
                        }
                    />
                )}

                {!isLoading && !loadError && !isEmpty && visible.length === 0 && (
                    <EmptyState
                        variant="inline"
                        icon={Search}
                        title="Aucune séquence ne correspond"
                        description={search ? "Essayez un autre mot-clé." : "Aucune séquence avec ce statut."}
                        action={
                            <Button size="sm" variant="secondary" onClick={() => { setSearch(""); setFilter("ALL"); }}>
                                Tout afficher
                            </Button>
                        }
                    />
                )}

                {!isLoading && !loadError && visible.length > 0 && (
                    <Card padding="none" className="overflow-hidden">
                        <div className={cn(GRID, "hidden border-b border-line bg-surface-2 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-4")}>
                            <span>Séquence</span>
                            <span>Étapes</span>
                            <span>Contacts</span>
                            <span>Réponses</span>
                            <span>Prochain envoi</span>
                            <span className="w-[214px] text-right">Statut</span>
                        </div>
                        <ul className="divide-y divide-line-subtle">
                            {visible.map((seq) => (
                                <SequenceRow
                                    key={seq.id}
                                    seq={seq}
                                    busy={busyId === seq.id}
                                    onOpen={() => router.push(`/manager/emails/sequences/${seq.id}`)}
                                    onStatus={(status, msg) => changeStatus(seq, status, msg)}
                                    onMenu={(x, y) => setMenu({ seq, x, y })}
                                />
                            ))}
                        </ul>
                    </Card>
                )}
            </div>

            <ContextMenu
                position={menu ? { x: menu.x, y: menu.y } : null}
                onClose={() => setMenu(null)}
                items={
                    menu
                        ? [
                            { label: "Ouvrir", icon: <ExternalLink className="size-4" />, onClick: () => router.push(`/manager/emails/sequences/${menu.seq.id}`) },
                            { label: "Dupliquer", icon: <Copy className="size-4" />, onClick: () => duplicate(menu.seq) },
                            menu.seq.status === "ARCHIVED"
                                ? { label: "Désarchiver", icon: <ArchiveRestore className="size-4" />, onClick: () => changeStatus(menu.seq, "PAUSED", "Séquence désarchivée (en pause)") }
                                : {
                                    label: "Archiver",
                                    icon: <Archive className="size-4" />,
                                    disabled: menu.seq.status === "ACTIVE",
                                    onClick: () => changeStatus(menu.seq, "ARCHIVED", "Séquence archivée"),
                                },
                            { label: "Supprimer", icon: <Trash2 className="size-4" />, variant: "danger" as const, divider: true, onClick: () => setToDelete(menu.seq) },
                        ]
                        : []
                }
            />

            <ConfirmModal
                isOpen={!!toDelete}
                onClose={() => setToDelete(null)}
                onConfirm={confirmDelete}
                isLoading={isDeleting}
                variant="danger"
                title="Supprimer la séquence ?"
                confirmText="Supprimer"
                message={
                    toDelete
                        ? `« ${toDelete.name} » et ses ${plural(toDelete.stepsCount, "étape")} seront supprimées définitivement${toDelete.enrolled ? `, ainsi que le suivi de ${plural(toDelete.enrolled, "contact inscrit", "contacts inscrits")}` : ""}. Les emails déjà envoyés restent dans la boîte de réception.`
                        : ""
                }
            />
        </EmailHubPage>
    );
}

// ============================================
// ROW
// ============================================

function SequenceRow({
    seq,
    busy,
    onOpen,
    onStatus,
    onMenu,
}: {
    seq: SequenceListItem;
    busy: boolean;
    onOpen: () => void;
    onStatus: (status: SequenceStatus, successMessage: string) => void;
    onMenu: (x: number, y: number) => void;
}) {
    const meta = SEQUENCE_STATUS_META[seq.status];
    const health = mailboxHealth(seq.mailbox);
    const ready = seq.stepsCount > 0 && seq.enrolled > 0 && !!seq.mailbox?.isActive;
    const stop = (e: React.SyntheticEvent) => e.stopPropagation();

    return (
        <li
            className={cn(GRID, "group flex cursor-pointer flex-col gap-3 px-5 py-4 transition-colors hover:bg-surface-2")}
            onClick={onOpen}
            onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
            tabIndex={0}
            role="link"
            aria-label={`Ouvrir la séquence ${seq.name}`}
        >
            <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{seq.name}</p>
                <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-ink-3">
                    <span
                        className={cn(
                            "size-1.5 shrink-0 rounded-full",
                            health.tone === "success" ? "bg-success" : health.tone === "danger" ? "bg-danger" : "bg-warning",
                        )}
                        aria-hidden
                    />
                    <span className="truncate" title={health.detail ?? health.label}>
                        {mailboxLabel(seq.mailbox)}
                        {health.tone !== "success" && <span className="text-ink-4"> · {health.label}</span>}
                    </span>
                </p>
            </div>

            <div className="text-sm text-ink-2">
                <span className="text-ink-4 md:hidden">Étapes : </span>
                {seq.stepsCount}
            </div>

            <div className="text-sm text-ink-2">
                <span className="text-ink-4 md:hidden">Contacts : </span>
                <span className="font-medium text-ink">{seq.enrolled.toLocaleString("fr-FR")}</span>
                {seq.enrolled > 0 && <span className="text-xs text-ink-3"> · {seq.active} en cours</span>}
            </div>

            <div className="text-sm text-ink-2">
                <span className="text-ink-4 md:hidden">Réponses : </span>
                <span className="font-medium text-ink">{seq.replied}</span>
                <span className="text-xs text-ink-3"> · {pct(seq.replied, seq.contacted)}</span>
                {seq.bounced > 0 && <span className="block text-xs text-danger-ink">{plural(seq.bounced, "rebond")}</span>}
            </div>

            <div className="text-sm text-ink-2">
                <span className="text-ink-4 md:hidden">Prochain envoi : </span>
                {seq.status === "ACTIVE" && seq.nextSendAt ? (
                    <span title={new Date(seq.nextSendAt).toLocaleString("fr-FR")}>{formatRelative(seq.nextSendAt)}</span>
                ) : (
                    <span className="text-ink-4">—</span>
                )}
            </div>

            <div className="flex items-center justify-between gap-2 md:w-[214px] md:justify-end" onClick={stop}>
                <TonePill tone={meta.tone}>{meta.label}</TonePill>
                <div className="flex items-center gap-1">
                    {seq.status === "ACTIVE" && (
                        <Button size="xs" variant="secondary" isLoading={busy} leftIcon={<Pause className="size-3.5" />} onClick={() => onStatus("PAUSED", "Séquence mise en pause")}>
                            Pause
                        </Button>
                    )}
                    {seq.status === "PAUSED" && (
                        <Button size="xs" variant="secondary" isLoading={busy} leftIcon={<Play className="size-3.5" />} onClick={() => onStatus("ACTIVE", "Séquence relancée")}>
                            Reprendre
                        </Button>
                    )}
                    {seq.status === "DRAFT" &&
                        (ready ? (
                            <Button size="xs" variant="soft" isLoading={busy} leftIcon={<Play className="size-3.5" />} onClick={() => onStatus("ACTIVE", "Séquence activée")}>
                                Activer
                            </Button>
                        ) : (
                            <Button size="xs" variant="ghost" onClick={onOpen}>
                                À terminer
                            </Button>
                        ))}
                    <IconButton
                        icon={MoreHorizontal}
                        label="Plus d'actions"
                        size="xs"
                        variant="ghost"
                        onClick={(e) => {
                            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            onMenu(r.right - 180, r.bottom + 4);
                        }}
                    />
                </div>
            </div>
        </li>
    );
}
