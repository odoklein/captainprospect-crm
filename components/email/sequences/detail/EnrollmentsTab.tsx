"use client";

import { useCallback, useEffect, useState } from "react";
import { Pause, Play, Search, UserMinus, UserPlus, Users } from "lucide-react";
import { Button, Callout, Card, ConfirmModal, EmptyState, IconButton, Input, SegmentedControl, Skeleton, Tooltip, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { apiJson, errorMessage } from "../api";
import { TonePill } from "../SequenceBits";
import {
    ENROLLMENT_STATUS_META,
    formatDateTime,
    formatRelative,
    type EnrollmentRow,
    type EnrollmentStatus,
    type SequenceStatus,
} from "../types";

type Filter = "ALL" | EnrollmentStatus;

const FILTERS: { value: Filter; label: string }[] = [
    { value: "ALL", label: "Tous" },
    { value: "ACTIVE", label: "En cours" },
    { value: "PAUSED", label: "En pause" },
    { value: "REPLIED", label: "Ont répondu" },
    { value: "COMPLETED", label: "Terminés" },
    { value: "BOUNCED", label: "Rebonds" },
    { value: "MANUAL_EXIT", label: "Retirés" },
];

const GRID = "md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,0.9fr)_minmax(0,0.7fr)_minmax(0,1fr)_minmax(0,1.3fr)_auto] md:items-center md:gap-4";

interface EnrollmentsTabProps {
    sequenceId: string;
    sequenceStatus: SequenceStatus;
    stepsCount: number;
    counts: Record<string, number>;
    timezone: string;
    onOpenEnroll: () => void;
    onChanged: () => void;
    /** Bumped by the parent after an enrolment so the table reloads. */
    refreshKey: number;
}

function lastEvent(row: EnrollmentRow): { text: string; tone: "danger" | "warning" | "success" | "muted" } {
    if (row.lastError && row.status === "ACTIVE") return { text: `Échec d'envoi, nouvel essai prévu : ${row.lastError}`, tone: "warning" };
    if (row.status === "PAUSED" && row.exitReason) return { text: row.exitReason, tone: "warning" };
    if (row.status === "REPLIED") return { text: `A répondu ${formatRelative(row.repliedAt ?? row.exitedAt)}`, tone: "success" };
    if (row.status === "BOUNCED") return { text: row.exitReason ?? "Adresse rejetée", tone: "danger" };
    if ((row.status === "MANUAL_EXIT" || row.status === "UNSUBSCRIBED") && row.exitReason) return { text: row.exitReason, tone: "muted" };
    const e = row.lastEmail;
    if (!e) return { text: `Inscrit ${formatRelative(row.enrolledAt)}`, tone: "muted" };
    if (e.clickCount > 0) return { text: `A cliqué · envoyé ${formatRelative(e.sentAt)}`, tone: "success" };
    if (e.openCount > 0) return { text: `Ouvert ${formatRelative(e.firstOpenedAt ?? e.sentAt)}`, tone: "success" };
    return { text: `Envoyé ${formatRelative(e.sentAt)}`, tone: "muted" };
}

export function EnrollmentsTab({ sequenceId, sequenceStatus, stepsCount, counts, timezone, onOpenEnroll, onChanged, refreshKey }: EnrollmentsTabProps) {
    const toast = useToast();
    const [filter, setFilter] = useState<Filter>("ALL");
    const [query, setQuery] = useState("");
    const [debounced, setDebounced] = useState("");
    const [page, setPage] = useState(1);
    const [rows, setRows] = useState<EnrollmentRow[] | null>(null);
    const [total, setTotal] = useState(0);
    const [pageSize, setPageSize] = useState(50);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [toRemove, setToRemove] = useState<EnrollmentRow | null>(null);

    useEffect(() => {
        const t = setTimeout(() => setDebounced(query.trim()), 300);
        return () => clearTimeout(t);
    }, [query]);

    useEffect(() => setPage(1), [filter, debounced]);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ page: String(page) });
            if (filter !== "ALL") params.set("status", filter);
            if (debounced) params.set("q", debounced);
            const { data, meta } = await apiJson<EnrollmentRow[]>(`/api/email/sequences/${sequenceId}/enrollments?${params}`);
            setRows(data ?? []);
            setTotal(meta?.total ?? 0);
            setPageSize(meta?.pageSize ?? 50);
        } catch (e) {
            setError(errorMessage(e, "Impossible de charger les contacts inscrits"));
        } finally {
            setLoading(false);
        }
    }, [sequenceId, filter, debounced, page]);

    useEffect(() => {
        load();
    }, [load, refreshKey]);

    const act = async (row: EnrollmentRow, action: "pause" | "resume") => {
        setBusyId(row.id);
        try {
            await apiJson(`/api/email/sequences/${sequenceId}/enrollments/${row.id}`, { method: "PATCH", json: { action } });
            toast.success(action === "pause" ? "Contact mis en pause" : "Contact relancé");
            await load();
            onChanged();
        } catch (e) {
            toast.error("Action impossible", errorMessage(e));
        } finally {
            setBusyId(null);
        }
    };

    const remove = async () => {
        if (!toRemove) return;
        setBusyId(toRemove.id);
        try {
            const { data } = await apiJson<{ outcome: "deleted" | "stopped" }>(`/api/email/sequences/${sequenceId}/enrollments/${toRemove.id}`, { method: "DELETE" });
            toast.success(data.outcome === "deleted" ? "Contact retiré de la séquence" : "Contact sorti de la séquence", data.outcome === "stopped" ? "Ses emails déjà envoyés restent dans les statistiques." : undefined);
            setToRemove(null);
            await load();
            onChanged();
        } catch (e) {
            toast.error("Impossible de retirer ce contact", errorMessage(e));
        } finally {
            setBusyId(null);
        }
    };

    const totalAll = counts.total ?? 0;
    const pages = Math.max(1, Math.ceil(total / pageSize));

    if (totalAll === 0 && !loading && filter === "ALL" && !debounced) {
        return (
            <EmptyState
                icon={Users}
                title="Aucun contact inscrit"
                description="Inscrivez les contacts d'une mission ou d'une liste : chacun recevra les emails de la séquence, l'un après l'autre, jusqu'à ce qu'il réponde."
                action={<Button leftIcon={<UserPlus className="size-4" />} onClick={onOpenEnroll}>Inscrire des contacts</Button>}
            />
        );
    }

    return (
        <div className="space-y-4">
            {sequenceStatus !== "ACTIVE" && (counts.ACTIVE ?? 0) > 0 && (
                <Callout tone="info">
                    {sequenceStatus === "DRAFT" ? "La séquence est en brouillon" : "La séquence est en pause"} : {counts.ACTIVE} contact
                    {counts.ACTIVE > 1 ? "s attendent" : " attend"} son activation pour recevoir {counts.ACTIVE > 1 ? "leur" : "son"} prochain email.
                </Callout>
            )}

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <SegmentedControl
                    ariaLabel="Filtrer les contacts par statut"
                    size="sm"
                    value={filter}
                    onChange={setFilter}
                    options={FILTERS.map((f) => ({
                        value: f.value,
                        label: f.label,
                        count: f.value === "ALL" ? totalAll : counts[f.value] ?? 0,
                    }))}
                    className="max-w-full overflow-x-auto"
                />
                <div className="flex items-center gap-2">
                    <div className="w-full sm:w-64">
                        <Input size="sm" placeholder="Rechercher un contact…" value={query} onChange={(e) => setQuery(e.target.value)} icon={<Search className="size-4" />} aria-label="Rechercher un contact" />
                    </div>
                    <Button size="sm" leftIcon={<UserPlus className="size-4" />} onClick={onOpenEnroll}>
                        Inscrire
                    </Button>
                </div>
            </div>

            {error && (
                <Callout tone="danger" action={<Button size="sm" variant="secondary" onClick={load}>Réessayer</Button>}>
                    {error}
                </Callout>
            )}

            <Card padding="none" className="overflow-hidden">
                <div className={cn(GRID, "hidden border-b border-line bg-surface-2 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-4")}>
                    <span>Contact</span>
                    <span>Statut</span>
                    <span>Étape</span>
                    <span>Prochain envoi</span>
                    <span>Dernier événement</span>
                    <span className="w-16" />
                </div>

                {loading && !rows ? (
                    <div className="space-y-3 p-5">
                        {[0, 1, 2, 3].map((i) => (
                            <Skeleton key={i} className="h-10 w-full" />
                        ))}
                    </div>
                ) : rows && rows.length === 0 ? (
                    <EmptyState variant="inline" icon={Search} title="Aucun contact" description="Aucun contact inscrit ne correspond à ce filtre." />
                ) : (
                    <ul className={cn("divide-y divide-line-subtle", loading && "opacity-60")}>
                        {(rows ?? []).map((row) => {
                            const meta = ENROLLMENT_STATUS_META[row.status];
                            const ev = lastEvent(row);
                            const stepShown = Math.min(row.currentStep + (row.status === "ACTIVE" || row.status === "PAUSED" ? 1 : 0), stepsCount);
                            return (
                                <li key={row.id} className={cn(GRID, "flex flex-col gap-2 px-5 py-3")}>
                                    <div className="min-w-0">
                                        <p className="truncate text-[13px] font-semibold text-ink">
                                            {row.contact.name || row.contact.email || "Contact"}
                                            {row.contact.companyName && <span className="font-normal text-ink-3"> · {row.contact.companyName}</span>}
                                        </p>
                                        <p className="truncate text-xs text-ink-3">{row.contact.email}</p>
                                    </div>
                                    <div>
                                        <TonePill tone={meta.tone}>{meta.label}</TonePill>
                                    </div>
                                    <div className="text-[13px] text-ink-2">
                                        <span className="text-ink-4 md:hidden">Étape : </span>
                                        {stepShown} / {stepsCount}
                                    </div>
                                    <div className="text-[13px] text-ink-2">
                                        <span className="text-ink-4 md:hidden">Prochain envoi : </span>
                                        {row.status === "ACTIVE" && row.nextStepAt ? (
                                            sequenceStatus === "ACTIVE" ? (
                                                <span title={formatDateTime(row.nextStepAt, timezone)}>{formatRelative(row.nextStepAt)}</span>
                                            ) : (
                                                <span className="text-ink-4">À l'activation</span>
                                            )
                                        ) : (
                                            <span className="text-ink-4">—</span>
                                        )}
                                    </div>
                                    <p
                                        className={cn(
                                            "min-w-0 truncate text-xs",
                                            ev.tone === "danger" ? "text-danger-ink" : ev.tone === "warning" ? "text-warning-ink" : ev.tone === "success" ? "text-success-ink" : "text-ink-3",
                                        )}
                                        title={ev.text}
                                    >
                                        {ev.text}
                                    </p>
                                    <div className="flex items-center justify-end gap-1 md:w-16">
                                        {row.status === "ACTIVE" && (
                                            <Tooltip content="Mettre en pause ce contact">
                                                <IconButton icon={Pause} label="Mettre en pause" size="xs" variant="ghost" isLoading={busyId === row.id} onClick={() => act(row, "pause")} />
                                            </Tooltip>
                                        )}
                                        {row.status === "PAUSED" && (
                                            <Tooltip content="Reprendre les envois">
                                                <IconButton icon={Play} label="Reprendre" size="xs" variant="ghost" isLoading={busyId === row.id} onClick={() => act(row, "resume")} />
                                            </Tooltip>
                                        )}
                                        {(row.status === "ACTIVE" || row.status === "PAUSED") && (
                                            <Tooltip content="Retirer de la séquence">
                                                <IconButton icon={UserMinus} label="Retirer" size="xs" variant="danger" onClick={() => setToRemove(row)} />
                                            </Tooltip>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}

                {pages > 1 && (
                    <div className="flex items-center justify-between border-t border-line bg-surface-2 px-5 py-2.5 text-xs text-ink-3">
                        <span>
                            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} sur {total.toLocaleString("fr-FR")}
                        </span>
                        <div className="flex gap-2">
                            <Button size="xs" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Précédent</Button>
                            <Button size="xs" variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Suivant</Button>
                        </div>
                    </div>
                )}
            </Card>

            <ConfirmModal
                isOpen={!!toRemove}
                onClose={() => setToRemove(null)}
                onConfirm={remove}
                isLoading={!!toRemove && busyId === toRemove.id}
                variant="warning"
                title="Retirer ce contact ?"
                confirmText="Retirer"
                message={
                    toRemove
                        ? `${toRemove.contact.name || toRemove.contact.email} ne recevra plus aucun email de cette séquence.${toRemove.emailsSent ? " Les emails déjà envoyés restent comptés dans les statistiques." : ""}`
                        : ""
                }
            />
        </div>
    );
}
