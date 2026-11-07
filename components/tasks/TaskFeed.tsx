"use client";

/**
 * Unified task list — every to-do of the viewer in one place, whatever its origin:
 * manual tasks, onboarding steps, client-session to-dos, tickets (devs and
 * managers), and the manager's invoices / bilans / SDR additions. SDR callbacks
 * are a single "urgent" count that leads to the Rappels page, never a list.
 *
 * Data: GET /api/tasks/feed (lib/tasks/feed.ts). Stored tasks are ticked here and
 * open in the TaskDetailDrawer; read-only rows link to the page that handles them.
 */

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Check, CheckCircle2, ListChecks, PhoneCall, Plus, TriangleAlert, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui";
import { TaskDetailDrawer } from "@/components/tasks/TaskDetailDrawer";
import {
    AccueilCard,
    BADGE,
    CARD_HOVER,
    EmptyBlock,
    FOCUS,
    Initials,
    PILL,
    PRIMARY_BUTTON,
    SectionHeader,
    SegmentedControl,
    SelectField,
    Shimmer,
    TextLink,
} from "@/components/accueil/AccueilUI";
import { groupByDue, groupByEntity } from "@/lib/tasks/grouping";
import {
    SOURCE_LABELS,
    type CallbackCount,
    type FeedScope,
    type TaskFeedPayload,
    type WorkItem,
    type WorkSource,
} from "@/lib/tasks/feed-types";

type Status = "open" | "done";
type GroupBy = "due" | "client" | "project";

export const TASK_FEED_KEY = ["tasks-feed"] as const;

const SOURCE_ORDER: WorkSource[] = ["SYSTEM", "MANUAL", "ONBOARDING", "SESSION", "AI", "TICKET"];

function shortDay(day: string): string {
    return new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

function lateDays(day: string, today: string): number {
    return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000);
}

// ── Header blocks ───────────────────────────────────────────────────────────

function MyCallbacksCard({ count, href }: { count: CallbackCount; href: string | null }) {
    const calm = count.urgent === 0;
    const body = (
        <div className={cn("flex items-center gap-4 rounded-2xl border px-4 py-3.5", calm ? "bg-surface border-line" : "bg-amber-50/70 border-amber-200/80", href && CARD_HOVER)}>
            <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", calm ? BADGE.emerald : BADGE.amber)}>
                <PhoneCall className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold text-ink">
                    {calm ? "Aucun rappel urgent" : `${count.urgent} rappel${count.urgent > 1 ? "s" : ""} urgent${count.urgent > 1 ? "s" : ""}`}
                </p>
                <p className="text-xs font-semibold text-ink-3">
                    {calm
                        ? "Rien en retard ni prévu pour aujourd'hui."
                        : count.late > 0
                          ? `Dont ${count.late} en retard · le reste est prévu aujourd'hui`
                          : "Tous prévus aujourd'hui"}
                </p>
            </div>
            {href && <ArrowUpRight className="h-4 w-4 shrink-0 text-ink-4" aria-hidden />}
        </div>
    );
    return href ? (
        <Link href={href} className={cn("block rounded-2xl", FOCUS)}>
            {body}
        </Link>
    ) : (
        body
    );
}

function TeamCallbacksCard({ counts }: { counts: CallbackCount[] }) {
    const total = counts.reduce((n, c) => n + c.urgent, 0);
    return (
        <AccueilCard className="p-5 space-y-3">
            <SectionHeader icon={PhoneCall} tone="amber" title="Rappels urgents par SDR" count={total} subtitle="En retard ou prévus aujourd'hui" size="sm" />
            {counts.length === 0 ? (
                <p className="text-xs font-semibold text-ink-3">Aucun rappel en retard dans l'équipe.</p>
            ) : (
                <ul className="flex flex-wrap gap-2">
                    {counts.map((c) => (
                        <li key={c.sdrId} className={cn("inline-flex items-center gap-2 h-8 pl-1 pr-3 rounded-full border text-xs font-bold", c.late > 0 ? PILL.rose : PILL.amber)}>
                            <Initials name={c.sdrName} size="sm" />
                            <span className="text-ink">{c.sdrName}</span>
                            <span className="tabular-nums">{c.urgent}</span>
                            {c.late > 0 && <span className="font-semibold">· {c.late} en retard</span>}
                        </li>
                    ))}
                </ul>
            )}
        </AccueilCard>
    );
}

function QuickAdd({ clients, onCreated }: { clients: { id: string; name: string }[]; onCreated: () => void }) {
    const { error: showError } = useToast();
    const [title, setTitle] = useState("");
    const [dueDay, setDueDay] = useState("");
    const [clientId, setClientId] = useState("");
    const [saving, setSaving] = useState(false);

    async function submit(e: FormEvent) {
        e.preventDefault();
        if (!title.trim() || saving) return;
        setSaving(true);
        const res = await fetch("/api/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: title.trim(),
                dueDate: dueDay ? `${dueDay}T12:00:00` : null,
                clientId: clientId || null,
            }),
        }).catch(() => null);
        setSaving(false);
        if (!res?.ok) {
            showError("Tâche non créée", "Réessayez dans un instant.");
            return;
        }
        setTitle("");
        setDueDay("");
        setClientId("");
        onCreated();
    }

    return (
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ajouter une tâche…"
                aria-label="Titre de la nouvelle tâche"
                className={cn("h-11 w-full min-w-0 rounded-2xl border border-line bg-surface px-4 text-sm sm:flex-1 font-semibold text-ink placeholder:text-ink-4 shadow-2xs", FOCUS)}
            />
            <div className="flex gap-2">
                <input
                    type="date"
                    value={dueDay}
                    onChange={(e) => setDueDay(e.target.value)}
                    aria-label="Échéance"
                    className={cn("h-11 min-w-0 flex-1 rounded-2xl border border-line bg-surface px-3 text-xs font-bold text-ink-2 shadow-2xs sm:w-40 sm:flex-none", FOCUS)}
                />
                {clients.length > 0 && (
                    <SelectField value={clientId} onChange={setClientId} ariaLabel="Client" className="min-w-0 flex-1 sm:w-44 sm:flex-none [&_select]:h-11 [&_select]:rounded-2xl">
                        <option value="">Sans client</option>
                        {clients.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name}
                            </option>
                        ))}
                    </SelectField>
                )}
                <button type="submit" disabled={!title.trim() || saving} className={cn(PRIMARY_BUTTON, "shrink-0")}>
                    <Plus className="h-4 w-4" aria-hidden />
                    <span className="hidden sm:inline">Ajouter</span>
                </button>
            </div>
        </form>
    );
}

// ── Rows ────────────────────────────────────────────────────────────────────

function DueTag({ item, today }: { item: WorkItem; today: string }) {
    if (item.done) return <span className={cn("inline-flex h-6 items-center rounded-full border px-2 text-[11px] font-bold", PILL.emerald)}>Fait</span>;
    if (!item.dueDay) return null;
    if (item.dueDay < today) {
        return <span className={cn("inline-flex h-6 items-center rounded-full border px-2 text-[11px] font-bold tabular-nums", PILL.rose)}>+{lateDays(item.dueDay, today)} j</span>;
    }
    if (item.dueDay === today) return <span className={cn("inline-flex h-6 items-center rounded-full border px-2 text-[11px] font-bold", PILL.amber)}>Aujourd'hui</span>;
    return <span className="text-[11px] font-bold text-ink-3 whitespace-nowrap">{shortDay(item.dueDay)}</span>;
}

function ItemRow({
    item,
    today,
    showOwner,
    hideClient,
    onToggle,
    onOpen,
}: {
    item: WorkItem;
    today: string;
    showOwner: boolean;
    /** Inside a client group the client name would repeat on every row. */
    hideClient?: boolean;
    onToggle: (item: WorkItem) => void;
    onOpen: (item: WorkItem) => void;
}) {
    const meta = [hideClient ? null : item.client?.name, item.project && item.project.name !== item.client?.name ? item.project.name : null, item.context, !showOwner ? item.ownerLabel : null]
        .filter(Boolean)
        .join(" · ");
    const owner = item.owner?.name ?? item.ownerLabel;

    const main = (
        <>
            <span className="min-w-0 flex-1">
                <span className={cn("flex items-center gap-2 text-sm font-bold", item.done ? "text-ink-4 line-through" : "text-ink")}>
                    <span className="truncate">{item.title}</span>
                    {item.priority === "URGENT" && !item.done && (
                        <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide", BADGE.rose)}>Urgent</span>
                    )}
                </span>
                {meta && <span className="mt-0.5 block truncate text-xs font-semibold text-ink-3">{meta}</span>}
            </span>
            {showOwner && owner && (
                <span className="hidden md:flex max-w-[160px] items-center gap-1.5 text-xs font-semibold text-ink-2">
                    {item.owner && <Initials name={owner} size="sm" />}
                    <span className="truncate">{owner}</span>
                </span>
            )}
            <span className="flex shrink-0 items-center gap-2">
                <DueTag item={item} today={today} />
                {item.href && <ArrowUpRight className="h-4 w-4 text-ink-4" aria-hidden />}
            </span>
        </>
    );

    return (
        <li className={cn("group flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-colors", item.done ? "border-line-subtle bg-surface-2/60" : "border-line bg-surface hover:border-line-strong")}>
            {item.kind === "task" ? (
                <button
                    type="button"
                    role="checkbox"
                    aria-checked={item.done}
                    aria-label={item.done ? `Rouvrir « ${item.title} »` : `Terminer « ${item.title} »`}
                    onClick={() => onToggle(item)}
                    className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                        FOCUS,
                        item.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-line-strong bg-surface hover:border-primary-400",
                    )}
                >
                    <Check strokeWidth={3} className={cn("h-3.5 w-3.5 transition-transform", item.done ? "scale-100" : "scale-0")} aria-hidden />
                </button>
            ) : (
                <span aria-hidden className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md", item.kind === "ticket" ? BADGE.violet : BADGE.amber)}>
                    <ListChecks className="h-3 w-3" />
                </span>
            )}
            {item.href ? (
                <Link href={item.href} className={cn("flex min-w-0 flex-1 items-center gap-3 rounded-lg", FOCUS)}>
                    {main}
                </Link>
            ) : (
                <button type="button" onClick={() => onOpen(item)} className={cn("flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left", FOCUS)}>
                    {main}
                </button>
            )}
        </li>
    );
}

// ── Page ────────────────────────────────────────────────────────────────────

/** `projectsHref`: the role's project board base (e.g. "/manager/projects"), or none to hide the link. */
export function TaskFeed({ title = "Tâches", projectsHref }: { title?: string; projectsHref?: string }) {
    const queryClient = useQueryClient();
    const { error: showError } = useToast();
    const [scope, setScope] = useState<FeedScope>("mine");
    const [status, setStatus] = useState<Status>("open");
    const [groupBy, setGroupBy] = useState<GroupBy>("due");
    const [hiddenSources, setHiddenSources] = useState<Set<WorkSource>>(new Set());
    // Ticked or reopened here, shown at once while the list refetches.
    const [flipped, setFlipped] = useState<Map<string, boolean>>(new Map());
    const [openTaskId, setOpenTaskId] = useState<string | null>(null);

    const key = [...TASK_FEED_KEY, scope, status];
    const { data, isLoading, isError, refetch } = useQuery<TaskFeedPayload>({
        queryKey: key,
        queryFn: async () => {
            const res = await fetch(`/api/tasks/feed?scope=${scope}&status=${status}`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error ?? "feed");
            return json.data;
        },
        refetchInterval: 5 * 60_000,
    });

    const isManager = !!data?.canSeeTeam;
    const { data: managerClients } = useQuery<{ id: string; name: string }[]>({
        queryKey: ["tasks-feed-clients"],
        enabled: isManager,
        queryFn: async () => {
            const res = await fetch("/api/clients?limit=100");
            const json = await res.json();
            return json.success ? json.data.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })) : [];
        },
        staleTime: 10 * 60_000,
    });

    const items = useMemo(
        () => (data?.items ?? []).map((i) => (flipped.has(i.id) ? { ...i, done: flipped.get(i.id)! } : i)),
        [data, flipped],
    );
    const sources = useMemo(() => SOURCE_ORDER.filter((s) => items.some((i) => i.source === s)), [items]);
    const visible = useMemo(() => items.filter((i) => !hiddenSources.has(i.source)), [items, hiddenSources]);
    const quickAddClients = useMemo(() => {
        if (managerClients?.length) return [...managerClients].sort((a, b) => a.name.localeCompare(b.name, "fr"));
        const map = new Map<string, string>();
        for (const i of items) if (i.client) map.set(i.client.id, i.client.name);
        return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "fr"));
    }, [managerClients, items]);

    const refresh = () => queryClient.invalidateQueries({ queryKey: TASK_FEED_KEY });

    async function toggle(item: WorkItem) {
        if (!item.taskId) return;
        const next = !item.done;
        setFlipped((prev) => new Map(prev).set(item.id, next));
        const res = await fetch(`/api/tasks/${item.taskId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: next ? "DONE" : "TODO" }),
        }).catch(() => null);
        if (!res?.ok) {
            setFlipped((prev) => {
                const m = new Map(prev);
                m.delete(item.id);
                return m;
            });
            showError("Tâche non mise à jour", res?.status === 403 ? "Vous n'avez pas accès à cette tâche." : "Réessayez dans un instant.");
        }
    }

    function toggleSource(source: WorkSource) {
        setHiddenSources((prev) => {
            const next = new Set(prev);
            if (next.has(source)) next.delete(source);
            else next.add(source);
            return next;
        });
    }

    const today = data?.day ?? "";
    const showOwner = scope === "team";
    const lateCount = visible.filter((i) => !i.done && i.dueDay && i.dueDay < today).length;
    const todayCount = visible.filter((i) => !i.done && i.dueDay === today).length;

    const rowProps = { today, showOwner, onToggle: toggle, onOpen: (i: WorkItem) => setOpenTaskId(i.taskId) };

    return (
        <div className="mx-auto w-full max-w-5xl space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                    <h1 className="text-2xl font-black tracking-tight text-ink">{title}</h1>
                    <p className="mt-0.5 text-sm font-semibold text-ink-3">
                        {status === "done"
                            ? "Terminées ces 14 derniers jours"
                            : data
                              ? `${visible.length} à faire · ${lateCount} en retard · ${todayCount} aujourd'hui`
                              : "Tout ce qui vous attend, d'où que ça vienne"}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {data?.canSeeTeam && (
                        <SegmentedControl
                            ariaLabel="Périmètre"
                            value={scope}
                            onChange={setScope}
                            options={[
                                { value: "mine", label: "Mes tâches" },
                                { value: "team", label: "Équipe" },
                            ]}
                        />
                    )}
                    <SegmentedControl
                        ariaLabel="Statut"
                        value={status}
                        onChange={setStatus}
                        options={[
                            { value: "open", label: "À faire" },
                            { value: "done", label: "Terminées" },
                        ]}
                    />
                </div>
            </div>

            {data?.myCallbacks && <MyCallbacksCard count={data.myCallbacks} href={data.callbacksHref} />}
            {data?.teamCallbacks && <TeamCallbacksCard counts={data.teamCallbacks} />}

            {status === "open" && <QuickAdd clients={quickAddClients} onCreated={refresh} />}

            <AccueilCard className="p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Origine des tâches">
                        {sources.map((s) => {
                            const on = !hiddenSources.has(s);
                            const n = items.filter((i) => i.source === s).length;
                            return (
                                <button
                                    key={s}
                                    type="button"
                                    aria-pressed={on}
                                    onClick={() => toggleSource(s)}
                                    className={cn(
                                        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-colors",
                                        FOCUS,
                                        on ? "border-line-strong bg-surface text-ink shadow-2xs" : "border-dashed border-line bg-transparent text-ink-4 hover:text-ink-2",
                                    )}
                                >
                                    {SOURCE_LABELS[s]}
                                    <span className="tabular-nums text-ink-3">{n}</span>
                                </button>
                            );
                        })}
                    </div>
                    <SegmentedControl
                        ariaLabel="Regrouper par"
                        value={groupBy}
                        onChange={setGroupBy}
                        options={[
                            { value: "due", label: "Échéance" },
                            { value: "client", label: "Client" },
                            { value: "project", label: "Projet" },
                        ]}
                    />
                </div>

                {data && data.errors.length > 0 && (
                    <p className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold", PILL.amber)}>
                        <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
                        Une partie de la liste n'a pas pu être chargée. Le reste est à jour.
                    </p>
                )}

                {isLoading ? (
                    <div className="space-y-2">
                        {Array.from({ length: 6 }, (_, i) => (
                            <Shimmer key={i} className="h-14" />
                        ))}
                    </div>
                ) : isError ? (
                    <div className="space-y-3">
                        <EmptyBlock icon={TriangleAlert} tone="rose" title="Liste indisponible" hint="Le chargement a échoué." />
                        <div className="text-center">
                            <button type="button" onClick={() => refetch()} className={cn("text-xs font-bold text-ink-2 underline underline-offset-2", FOCUS)}>
                                Réessayer
                            </button>
                        </div>
                    </div>
                ) : visible.length === 0 ? (
                    <EmptyBlock
                        icon={status === "open" ? CheckCircle2 : ListChecks}
                        tone={status === "open" ? "emerald" : "slate"}
                        title={status === "open" ? "Rien à faire pour l'instant" : "Rien de terminé ces 14 derniers jours"}
                        hint={hiddenSources.size > 0 ? "Certaines origines sont masquées par les filtres." : undefined}
                    />
                ) : groupBy === "due" ? (
                    <div className="space-y-5">
                        {groupByDue(visible, today).map((g) => (
                            <section key={g.bucket} aria-label={g.label} className="space-y-2">
                                <h2 className={cn("flex items-center gap-2 text-xs font-black uppercase tracking-wide", g.bucket === "late" ? "text-rose-600" : "text-ink-3")}>
                                    {g.label}
                                    <span className="tabular-nums font-bold text-ink-4">{g.items.length}</span>
                                </h2>
                                <ul className="space-y-1.5">
                                    {g.items.map((i) => (
                                        <ItemRow key={i.id} item={i} {...rowProps} />
                                    ))}
                                </ul>
                            </section>
                        ))}
                    </div>
                ) : (
                    <div className="space-y-5">
                        {groupByEntity(visible, groupBy, today, groupBy === "client" ? "Sans client" : "Sans projet").map((g) => (
                            <section key={g.key || "none"} aria-label={g.label} className="space-y-2">
                                <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-ink-3">
                                    {groupBy === "client" ? <Users className="h-3.5 w-3.5" aria-hidden /> : <ListChecks className="h-3.5 w-3.5" aria-hidden />}
                                    <span className="truncate">{g.label}</span>
                                    <span className="tabular-nums font-bold text-ink-4">{g.items.length}</span>
                                    {g.urgent > 0 && <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] normal-case", BADGE.rose)}>{g.urgent} à traiter</span>}
                                    {groupBy === "project" && g.key && projectsHref && (
                                        <span className="ml-auto normal-case tracking-normal">
                                            <TextLink href={`${projectsHref}/${g.key}`}>Tableau</TextLink>
                                        </span>
                                    )}
                                </h2>
                                <ul className="space-y-1.5">
                                    {g.items.map((i) => (
                                        <ItemRow key={i.id} item={i} {...rowProps} hideClient={groupBy === "client"} />
                                    ))}
                                </ul>
                            </section>
                        ))}
                    </div>
                )}
            </AccueilCard>

            <TaskDetailDrawer taskId={openTaskId} isOpen={!!openTaskId} onClose={() => setOpenTaskId(null)} onUpdate={refresh} />
        </div>
    );
}
