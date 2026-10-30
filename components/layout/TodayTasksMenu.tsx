"use client";

/**
 * « Tâches d'aujourd'hui » — the manager's day, one click away from any page.
 *
 * A topbar button opens a CheckboxTodoList card: tasks ranked by what should
 * be done first (late, then urgent, then onboarding), a hint naming the first
 * one, and the other things owed today — invoices, weekly bilans, SDR
 * proposals — as shortcuts rather than checkboxes, since they are done
 * elsewhere.
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Building2, ChevronDown, FileText, ListChecks, Receipt, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui";
import { CheckboxTodoList, type TodoListItem } from "@/components/ui/CheckboxTodoList";
import type { TodayPayload, TodayTask } from "@/lib/manager-home/today";

export const MANAGER_HOME_TODAY_KEY = ["manager-home-today"] as const;

const PRIORITY_WEIGHT: Record<string, number> = { URGENT: 30, HIGH: 20, MEDIUM: 10, LOW: 0 };

/** Higher = do it sooner. Lateness dominates; priority breaks ties; onboarding nudges up. */
function urgency(task: TodayTask): number {
    return task.overdueDays * 10 + (PRIORITY_WEIGHT[task.priority] ?? 10) + (task.isOnboarding ? 5 : 0);
}

function fullDay(day: string): string {
    return new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function billingLabel(item: NonNullable<TodayPayload["billing"]>[number]): string {
    if (item.status === "SETUP_TO_INVOICE") return "Setup à facturer";
    if (item.status === "TO_INVOICE") return "À facturer";
    return item.lateReason === "UNPAID" ? "Impayé" : "Non facturé";
}

function toItem(task: TodayTask, completed: boolean): TodoListItem {
    return {
        id: task.id,
        text: task.title,
        completed,
        meta: [task.client?.name ?? task.project?.name, task.isOnboarding && "Onboarding", task.section]
            .filter(Boolean)
            .join(" · "),
        tag:
            task.overdueDays > 0
                ? { label: `+${task.overdueDays} j`, tone: "rose" }
                : task.priority === "URGENT"
                  ? { label: "Urgent", tone: "amber" }
                  : undefined,
    };
}

export function TodayTasksMenu() {
    const queryClient = useQueryClient();
    const { error: showError } = useToast();
    const [open, setOpen] = useState(false);
    // Ticked this session: they stay in the list, struck through, until cleared.
    const [done, setDone] = useState<Map<string, TodayTask>>(new Map());
    const [cleared, setCleared] = useState<Set<string>>(new Set());
    const rootRef = useRef<HTMLDivElement>(null);

    const { data } = useQuery<TodayPayload | null>({
        queryKey: MANAGER_HOME_TODAY_KEY,
        queryFn: async () => {
            const res = await fetch("/api/manager/home/today");
            const json = await res.json();
            return json.success ? json.data : null;
        },
        refetchInterval: 5 * 60_000,
    });

    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
        document.addEventListener("mousedown", onClick);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onClick);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const ranked = useMemo(
        () => (data?.tasks ?? []).filter((t) => !done.has(t.id)).sort((a, b) => urgency(b) - urgency(a)),
        [data, done]
    );
    const items = useMemo(
        () => [
            ...ranked.map((t) => toItem(t, false)),
            ...[...done.values()].filter((t) => !cleared.has(t.id)).map((t) => toItem(t, true)),
        ],
        [ranked, done, cleared]
    );

    if (!data) return null;

    const billing = data.billing ?? [];
    const badge = ranked.length + data.moreTasks + billing.length + data.bilans.length + (data.pendingCompanySubmissions > 0 ? 1 : 0);

    const lateBilling = billing.filter((b) => b.status === "LATE").length;
    const top = ranked[0];
    const focus = top
        ? top.overdueDays > 0
            ? `Commencez par « ${top.title} » : en retard de ${top.overdueDays} j.`
            : `Commencez par « ${top.title} »${top.priority === "URGENT" ? " (urgent)" : ""}.`
        : lateBilling > 0
          ? `${lateBilling} facture${lateBilling > 1 ? "s" : ""} en retard à régulariser en priorité.`
          : billing.length > 0
            ? `Aucune tâche en attente : ${billing.length} facture${billing.length > 1 ? "s" : ""} à émettre.`
            : null;

    async function toggle(id: string, checked: boolean) {
        const task = checked ? data?.tasks.find((t) => t.id === id) : done.get(id);
        if (!task) return;
        const apply = (on: boolean) =>
            setDone((prev) => {
                const next = new Map(prev);
                if (on) next.set(task.id, task);
                else next.delete(task.id);
                return next;
            });

        apply(checked);
        const res = await fetch(`/api/tasks/${task.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: checked ? "DONE" : "TODO" }),
        }).catch(() => null);
        if (!res?.ok) {
            apply(!checked);
            showError("Tâche non mise à jour", "Réessayez dans un instant.");
            return;
        }
        queryClient.invalidateQueries({ queryKey: ["onboarding-checklist"] });
    }

    function clearCompleted() {
        setCleared((prev) => new Set([...prev, ...done.keys()]));
        queryClient.invalidateQueries({ queryKey: MANAGER_HOME_TODAY_KEY });
    }

    const close = () => setOpen(false);

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-haspopup="dialog"
                className={cn(
                    "inline-flex h-7.5 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold text-white shadow-xs transition-colors",
                    "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1"
                )}
            >
                <ListChecks className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">Tâches d&apos;aujourd&apos;hui</span>
                {badge > 0 && <span className="rounded-md bg-white/20 px-1.5 text-[11px] tabular-nums">{badge}</span>}
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden />
            </button>

            {open && (
                <div
                    role="dialog"
                    aria-label="Tâches d'aujourd'hui"
                    className="absolute right-0 top-full z-[80] mt-2 flex max-h-[min(720px,calc(100vh-80px))] w-[min(480px,calc(100vw-24px))] flex-col animate-in fade-in-50 zoom-in-95 duration-150"
                >
                    <CheckboxTodoList
                        className="max-h-full shadow-2xl"
                        title="Tâches d'aujourd'hui"
                        subtitle={fullDay(data.day)}
                        icon={ListChecks}
                        items={items}
                        onToggle={(id, checked) => void toggle(id, checked)}
                        onClearCompleted={clearCompleted}
                        emptyLabel="Aucune tâche pour aujourd'hui"
                        beforeList={
                            focus && (
                                <p className="flex items-start gap-2 rounded-xl bg-violet-50 px-3 py-2 text-xs text-violet-900">
                                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600" aria-hidden />
                                    <span>{focus}</span>
                                </p>
                            )
                        }
                        afterList={
                            <>
                                {data.moreTasks > 0 && (
                                    <Link
                                        href="/manager/tasks"
                                        onClick={close}
                                        className="block text-xs font-semibold text-indigo-600 hover:underline"
                                    >
                                        + {data.moreTasks} autres tâches à voir
                                    </Link>
                                )}

                                {billing.length > 0 && (
                                    <Group title="Facturation">
                                        {billing.map((item) => (
                                            <ShortcutRow
                                                key={`${item.clientId}:${item.key}`}
                                                href="/manager/billing/echeancier"
                                                icon={Receipt}
                                                label={item.clientName}
                                                meta={billingLabel(item)}
                                                alert={item.status === "LATE"}
                                                onNavigate={close}
                                            />
                                        ))}
                                    </Group>
                                )}

                                {data.bilans.length > 0 && (
                                    <Group title="Bilans de la semaine">
                                        {data.bilans.map((b) => (
                                            <ShortcutRow
                                                key={b.clientId}
                                                href={b.href}
                                                icon={FileText}
                                                label={b.clientName}
                                                meta={`${b.meetings} RDV · ${b.calls} appels`}
                                                alert={b.overdue}
                                                onNavigate={close}
                                            />
                                        ))}
                                    </Group>
                                )}

                                {data.pendingCompanySubmissions > 0 && (
                                    <Group title="À valider">
                                        <ShortcutRow
                                            href="/manager/propositions-sdr"
                                            icon={Building2}
                                            label={
                                                data.pendingCompanySubmissions === 1
                                                    ? "1 société proposée par un SDR"
                                                    : `${data.pendingCompanySubmissions} sociétés proposées par les SDR`
                                            }
                                            onNavigate={close}
                                        />
                                    </Group>
                                )}

                                {data.errors.length > 0 && (
                                    <p className="text-xs text-slate-400">Certaines informations n&apos;ont pas pu être chargées.</p>
                                )}
                            </>
                        }
                        footerAction={
                            <Link
                                href="/manager/tasks"
                                onClick={close}
                                className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline"
                            >
                                Toutes les tâches
                                <ArrowRight className="h-3 w-3" aria-hidden />
                            </Link>
                        }
                    />
                </div>
            )}
        </div>
    );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">{title}</p>
            <ul className="space-y-1.5">{children}</ul>
        </div>
    );
}

function ShortcutRow({
    href,
    icon: Icon,
    label,
    meta,
    alert = false,
    onNavigate,
}: {
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    meta?: string;
    alert?: boolean;
    onNavigate: () => void;
}) {
    return (
        <li>
            <Link
                href={href}
                onClick={onNavigate}
                className="group flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 transition-colors hover:border-indigo-200 hover:bg-indigo-50/30"
            >
                <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{label}</span>
                {meta && (
                    <span
                        className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            alert ? "bg-rose-50 text-rose-700" : "bg-violet-50 text-violet-700"
                        )}
                    >
                        {meta}
                    </span>
                )}
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300 transition-colors group-hover:text-indigo-500" />
            </Link>
        </li>
    );
}
