import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/api-utils";
import { countUrgentCallbacks } from "@/lib/callbacks/urgent";
import { addDay, parisDay, parisMidnight } from "@/lib/manager-home/today-rules";
import { getBillingTodayItems, getPendingCompanySubmissionsCount, getWeeklyBilanTodos } from "@/lib/manager-home/today-slots";
import { audienceRolesFor, type TaskAudienceRole } from "./access";
import type { CallbackCount, FeedScope, TaskFeedPayload, WorkItem, WorkPriority, WorkSource } from "./feed-types";

// ============================================
// UNIFIED TASK LIST — the server side of /<role>/tasks.
// One list of WorkItems from independent sources; one failing never blanks
// the others (same rule as the manager home's « Tâches du jour »):
//   - stored tasks (Task: manual, onboarding, session, assistant)
//   - tickets, for DEVELOPER and MANAGER only
//   - system to-dos (invoices, weekly bilans, SDR additions), MANAGER only
//   - urgent callbacks as counts: the SDR's own, or per SDR in the manager's team view
// ============================================

export type FeedStatus = "open" | "done";

export interface FeedUser {
    id: string;
    role: string;
}

/** Done rows are shown for this many days after completion. */
const DONE_WINDOW_DAYS = 14;
const TASK_LIMIT = 1000;

const AUDIENCE_LABELS: Record<TaskAudienceRole, string> = {
    SDR: "Équipe SDR",
    MANAGER: "Managers",
    DEV: "Développeurs",
    ALWAYS: "Tout le monde",
};

export function canSeeTeam(role: string): boolean {
    return role === "MANAGER";
}

function ticketsHref(role: string): string {
    return role === "DEVELOPER" ? "/developer/tickets" : "/manager/tickets";
}

const TASK_SELECT = {
    id: true,
    title: true,
    dueDate: true,
    priority: true,
    status: true,
    source: true,
    assigneeLabel: true,
    audienceRole: true,
    assignee: { select: { id: true, name: true } },
    client: { select: { id: true, name: true } },
    project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
    parentTask: { select: { title: true } },
} satisfies Prisma.TaskSelect;

async function loadTasks(user: FeedUser, scope: FeedScope, status: FeedStatus, today: string): Promise<WorkItem[]> {
    const where: Prisma.TaskWhereInput = {
        // Leaves only: an onboarding section or a parent task shows through its steps.
        subtasks: { none: {} },
        AND: [
            { OR: [{ projectId: null }, { project: { archivedAt: null, status: { not: "ARCHIVED" } } }] },
            status === "open"
                ? { status: { not: "DONE" } }
                : { status: "DONE", completedAt: { gte: parisMidnight(addDay(today, -DONE_WINDOW_DAYS)) } },
        ],
    };
    if (scope === "mine") {
        (where.AND as Prisma.TaskWhereInput[]).push({
            OR: [
                { assigneeId: user.id },
                {
                    assigneeId: null,
                    OR: [
                        { createdById: user.id },
                        { project: { ownerId: user.id } },
                        { audienceRole: { in: audienceRolesFor(user.role) } },
                    ],
                },
            ],
        });
    }

    const rows = await prisma.task.findMany({
        where,
        select: TASK_SELECT,
        orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
        take: TASK_LIMIT,
    });

    return rows.map((t) => ({
        id: `task:${t.id}`,
        kind: "task",
        source: t.source as WorkSource,
        title: t.title,
        dueDay: t.dueDate ? parisDay(t.dueDate) : null,
        priority: t.priority as WorkPriority,
        done: t.status === "DONE",
        owner: t.assignee,
        ownerLabel: t.assignee ? null : (t.assigneeLabel ?? (t.audienceRole ? AUDIENCE_LABELS[t.audienceRole] : null)),
        client: t.client ?? t.project?.client ?? null,
        project: t.project ? { id: t.project.id, name: t.project.name } : null,
        context: t.parentTask?.title ?? null,
        href: null,
        taskId: t.id,
    }));
}

const TICKET_CATEGORY_LABELS: Record<string, string> = {
    BUG: "Bug",
    IMPROVEMENT: "Amélioration",
    FEATURE_REQUEST: "Nouvelle fonctionnalité",
    TECHNICAL_SUPPORT: "Support",
};

async function loadTickets(user: FeedUser, scope: FeedScope, status: FeedStatus, today: string): Promise<WorkItem[]> {
    const where: Prisma.TicketWhereInput = {
        // A request still waiting for (or refused at) validation is not work yet.
        validation: { in: ["NOT_REQUIRED", "ACCEPTED"] },
        ...(status === "open"
            ? { status: { not: "COMPLETED" } }
            : { status: "COMPLETED", completedAt: { gte: parisMidnight(addDay(today, -DONE_WINDOW_DAYS)) } }),
        ...(scope === "mine" ? { assigneeId: user.id } : {}),
    };
    const rows = await prisma.ticket.findMany({
        where,
        select: {
            id: true,
            number: true,
            title: true,
            category: true,
            priority: true,
            status: true,
            dueDate: true,
            assignee: { select: { id: true, name: true } },
            client: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 300,
    });
    const href = ticketsHref(user.role);
    return rows.map((t) => ({
        id: `ticket:${t.id}`,
        kind: "ticket",
        source: "TICKET",
        title: t.title,
        dueDay: t.dueDate ? parisDay(t.dueDate) : null,
        priority: t.priority as WorkPriority,
        done: t.status === "COMPLETED",
        owner: t.assignee,
        ownerLabel: t.assignee ? null : "Non assigné",
        client: t.client,
        project: null,
        context: `#TC-${String(t.number).padStart(4, "0")} · ${TICKET_CATEGORY_LABELS[t.category] ?? t.category}`,
        href,
        taskId: null,
    }));
}

const BILLING_TITLES: Record<string, string> = {
    SETUP_TO_INVOICE: "Facturer le setup",
    TO_INVOICE: "Émettre la facture du cycle",
    LATE: "Relancer une facture en retard",
};

async function loadSystemItems(user: FeedUser, today: string, now: Date): Promise<WorkItem[]> {
    const system = (over: Pick<WorkItem, "id" | "title" | "dueDay" | "client" | "href"> & Partial<WorkItem>): WorkItem => ({
        kind: "system",
        source: "SYSTEM",
        priority: "MEDIUM",
        done: false,
        owner: null,
        ownerLabel: null,
        project: null,
        context: null,
        taskId: null,
        ...over,
    });

    const canBill = await userHasPermission("pages.billing", user.id, user.role);
    const [billing, bilans, submissions] = await Promise.all([
        canBill ? getBillingTodayItems(today) : Promise.resolve([]),
        getWeeklyBilanTodos(user.id, now),
        getPendingCompanySubmissionsCount(user.id),
    ]);

    const items: WorkItem[] = [];
    for (const b of billing) {
        items.push(system({
            id: `billing:${b.key}`,
            title: b.status === "LATE" && b.lateReason === "UNPAID" ? "Relancer une facture impayée" : BILLING_TITLES[b.status],
            dueDay: today,
            priority: b.status === "LATE" ? "HIGH" : "MEDIUM",
            client: { id: b.clientId, name: b.clientName },
            context: "Facturation",
            href: "/manager/billing/echeancier",
        }));
    }
    for (const b of bilans) {
        items.push(system({
            id: `bilan:${b.clientId}:${b.weekStart}`,
            title: "Publier le bilan de la semaine",
            dueDay: b.overdue ? b.weekEnd : today,
            client: { id: b.clientId, name: b.clientName },
            context: `${b.calls} appels · ${b.meetings} RDV`,
            href: b.href,
        }));
    }
    if (submissions > 0) {
        items.push(system({
            id: "submissions",
            title: submissions > 1 ? `Valider ${submissions} ajouts de SDR` : "Valider 1 ajout de SDR",
            dueDay: today,
            client: null,
            context: "Propositions SDR",
            href: "/manager/propositions-sdr",
        }));
    }
    return items;
}

export async function getTaskFeed(
    user: FeedUser,
    opts: { scope: FeedScope; status: FeedStatus },
    now: Date = new Date(),
): Promise<TaskFeedPayload> {
    const today = parisDay(now);
    const scope: FeedScope = opts.scope === "team" && canSeeTeam(user.role) ? "team" : "mine";
    const seesTickets = user.role === "MANAGER" || user.role === "DEVELOPER";
    const seesSystem = user.role === "MANAGER" && opts.status === "open";
    const ownCallbacks = user.role === "SDR" && opts.status === "open";
    const teamCallbacks = user.role === "MANAGER" && scope === "team" && opts.status === "open";

    const [tasks, tickets, system, mine, team] = await Promise.allSettled([
        loadTasks(user, scope, opts.status, today),
        seesTickets ? loadTickets(user, scope, opts.status, today) : Promise.resolve([]),
        seesSystem ? loadSystemItems(user, today, now) : Promise.resolve([]),
        ownCallbacks ? countUrgentCallbacks([user.id], now) : Promise.resolve(null),
        teamCallbacks ? countUrgentCallbacks(null, now) : Promise.resolve(null),
    ]);

    const errors: string[] = [];
    const value = <T,>(r: PromiseSettledResult<T>, name: string, fallback: T): T => {
        if (r.status === "fulfilled") return r.value;
        console.error(`[tasks/feed] ${name} failed`, r.reason);
        errors.push(name);
        return fallback;
    };

    const own = value<CallbackCount[] | null>(mine, "callbacks", null);
    return {
        day: today,
        scope,
        items: [
            ...value(tasks, "tasks", []),
            ...value(tickets, "tickets", []),
            ...value(system, "system", []),
        ],
        myCallbacks: own ? (own[0] ?? { sdrId: user.id, sdrName: "", urgent: 0, late: 0 }) : null,
        teamCallbacks: value<CallbackCount[] | null>(team, "teamCallbacks", null),
        canSeeTeam: canSeeTeam(user.role),
        callbacksHref: user.role === "SDR" ? "/sdr/callbacks" : null,
        errors,
    };
}
