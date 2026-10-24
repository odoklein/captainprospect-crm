"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CalendarCheck, FileText, Receipt } from "lucide-react";
import { Checkbox, useToast } from "@/components/ui";
import { AccueilCard, SectionHeader, StatusPill } from "./AccueilUI";
import type { TodayPayload, TodayTask } from "@/lib/manager-home/today";

export const MANAGER_HOME_TODAY_KEY = ["manager-home-today"] as const;

function fullDay(day: string): string {
    return new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function GroupTitle({ children }: { children: React.ReactNode }) {
    return <h3 className="mt-4 mb-1 text-[11px] font-bold uppercase tracking-wide text-ink-3">{children}</h3>;
}

/**
 * « Tâches du jour » — top of the manager home. What has to be done today:
 * late and due tasks (onboarding steps included), invoices to issue, weekly
 * bilans to publish, SDR additions to validate.
 */
export function TodayTasksCard() {
    const queryClient = useQueryClient();
    const { success, error: showError } = useToast();
    const [hidden, setHidden] = useState<Set<string>>(new Set());

    const { data, isLoading } = useQuery<TodayPayload | null>({
        queryKey: MANAGER_HOME_TODAY_KEY,
        queryFn: async () => {
            const res = await fetch("/api/manager/home/today");
            const json = await res.json();
            return json.success ? json.data : null;
        },
        refetchInterval: 5 * 60_000,
    });

    async function setDone(task: TodayTask, done: boolean): Promise<boolean> {
        const res = await fetch(`/api/tasks/${task.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: done ? "DONE" : "TODO" }),
        }).catch(() => null);
        const ok = !!res && res.ok;
        if (!ok) showError("Tâche non mise à jour", "Réessayez dans un instant.");
        return ok;
    }

    async function complete(task: TodayTask) {
        setHidden((h) => new Set(h).add(task.id));
        if (!(await setDone(task, true))) {
            setHidden((h) => {
                const next = new Set(h);
                next.delete(task.id);
                return next;
            });
            return;
        }
        success("Tâche terminée", task.title);
        queryClient.invalidateQueries({ queryKey: ["onboarding-checklist"] });
        // Refresh a little later so the row doesn't jump back while the list re-sorts.
        window.setTimeout(() => queryClient.invalidateQueries({ queryKey: MANAGER_HOME_TODAY_KEY }), 6000);
    }

    if (isLoading || !data) return null;

    const tasks = data.tasks.filter((t) => !hidden.has(t.id));
    const late = tasks.filter((t) => t.overdueDays > 0);
    const dueToday = tasks.filter((t) => t.overdueDays === 0);
    const billing = data.billing ?? [];
    const total = tasks.length + data.moreTasks + billing.length + data.bilans.length + (data.pendingCompanySubmissions > 0 ? 1 : 0);

    const renderTask = (task: TodayTask) => (
        <li key={task.id} className="flex items-start gap-3 py-2">
            <Checkbox checked={false} onChange={() => complete(task)} aria-label={`Terminer « ${task.title} »`} className="mt-0.5" />
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{task.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
                    <span>{task.client?.name ?? task.project.name}</span>
                    {task.isOnboarding && <span>· Onboarding{task.section ? ` · ${task.section}` : ""}</span>}
                </p>
            </div>
            {task.overdueDays > 0 && (
                <StatusPill tone="rose">En retard de {task.overdueDays} j</StatusPill>
            )}
        </li>
    );

    return (
        <AccueilCard>
            <SectionHeader
                icon={CalendarCheck}
                tone="indigo"
                title="Tâches du jour"
                count={total || undefined}
                subtitle={fullDay(data.day)}
            />

            {total === 0 ? (
                <div className="py-6 text-center">
                    <p className="text-sm font-semibold text-ink">Tout est à jour pour aujourd&apos;hui.</p>
                    <p className="mt-1 text-xs text-ink-3">Aucune tâche en retard ni facture à émettre.</p>
                </div>
            ) : (
                <div className="grid gap-x-8 lg:grid-cols-2">
                    <div>
                        {late.length > 0 && (
                            <>
                                <GroupTitle>En retard</GroupTitle>
                                <ul className="divide-y divide-line-subtle">{late.map(renderTask)}</ul>
                            </>
                        )}
                        {dueToday.length > 0 && (
                            <>
                                <GroupTitle>Aujourd&apos;hui</GroupTitle>
                                <ul className="divide-y divide-line-subtle">{dueToday.map(renderTask)}</ul>
                            </>
                        )}
                        {data.moreTasks > 0 && (
                            <Link href="/manager/projects" className="mt-2 inline-block text-xs font-semibold text-link hover:underline">
                                + {data.moreTasks} autres
                            </Link>
                        )}
                    </div>

                    <div>
                        {billing.length > 0 && (
                            <>
                                <GroupTitle>Facturation</GroupTitle>
                                <ul className="divide-y divide-line-subtle">
                                    {billing.map((item) => (
                                        <li key={`${item.clientId}:${item.key}`} className="flex items-center gap-3 py-2">
                                            <Receipt className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
                                            <Link href="/manager/billing/echeancier" className="min-w-0 flex-1 truncate text-sm text-ink hover:underline">
                                                {item.clientName}
                                            </Link>
                                            <StatusPill tone={item.status === "LATE" ? "rose" : "amber"}>
                                                {item.status === "SETUP_TO_INVOICE"
                                                    ? "Setup à facturer"
                                                    : item.status === "TO_INVOICE"
                                                      ? "À facturer"
                                                      : item.lateReason === "UNPAID"
                                                        ? "En retard : impayé"
                                                        : "En retard : non facturé"}
                                            </StatusPill>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                        {data.bilans.length > 0 && (
                            <>
                                <GroupTitle>Bilans de la semaine</GroupTitle>
                                <ul className="divide-y divide-line-subtle">
                                    {data.bilans.map((b) => (
                                        <li key={b.clientId} className="flex items-center gap-3 py-2">
                                            <FileText className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
                                            <Link href={b.href} className="min-w-0 flex-1 truncate text-sm text-ink hover:underline">
                                                {b.clientName}
                                            </Link>
                                            <span className="text-xs text-ink-3">
                                                {b.meetings} RDV · {b.calls} appels
                                            </span>
                                            {b.overdue && <StatusPill tone="rose">En retard</StatusPill>}
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                        {data.pendingCompanySubmissions > 0 && (
                            <>
                                <GroupTitle>À valider</GroupTitle>
                                <Link href="/manager/propositions-sdr" className="flex items-center gap-3 py-2 text-sm text-ink hover:underline">
                                    <Building2 className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
                                    {data.pendingCompanySubmissions === 1
                                        ? "1 société proposée par un SDR"
                                        : `${data.pendingCompanySubmissions} sociétés proposées par les SDR`}
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            )}

            {data.errors.length > 0 && (
                <p className="mt-3 text-xs text-ink-3">Certaines informations n&apos;ont pas pu être chargées.</p>
            )}
        </AccueilCard>
    );
}
