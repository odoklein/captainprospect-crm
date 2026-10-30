import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/api-utils";
import { addDay, capTasks, overdueDays, parisDay, parisMidnight, sortTodayTasks } from "./today-rules";
import {
    getBillingTodayItems,
    getPendingCompanySubmissionsCount,
    getWeeklyBilanTodos,
    type BillingTodayItem,
    type WeeklyBilanTodo,
} from "./today-slots";

// ============================================
// « TÂCHES DU JOUR » — the manager home's top block
// JF: « toutes les tâches qui sont à faire de la journée ». Open tasks due
// today or late (onboarding steps included), invoices to issue, weekly
// bilans to publish and SDR additions to validate. Every source is
// independent: one failing never blanks the others.
// ============================================

export interface TodayTask {
    id: string;
    title: string;
    dueDay: string;
    overdueDays: number;
    priority: string;
    isOnboarding: boolean;
    section: string | null;
    /** null for a personal task outside any project */
    project: { id: string; name: string } | null;
    client: { id: string; name: string } | null;
}

export interface TodayPayload {
    day: string;
    tasks: TodayTask[];
    moreTasks: number;
    billing: BillingTodayItem[] | null;
    bilans: WeeklyBilanTodo[];
    pendingCompanySubmissions: number;
    errors: string[];
}

async function loadTasks(userId: string, today: string): Promise<{ tasks: TodayTask[]; more: number }> {
    const rows = await prisma.task.findMany({
        where: {
            status: { not: "DONE" },
            dueDate: { lt: parisMidnight(addDay(today, 1)) },
            AND: [
                { OR: [{ projectId: null }, { project: { archivedAt: null, status: { not: "ARCHIVED" } } }] },
                {
                    OR: [
                        { assigneeId: userId },
                        { assigneeId: null, OR: [{ createdById: userId }, { project: { ownerId: userId } }] },
                    ],
                },
            ],
        },
        select: {
            id: true,
            title: true,
            dueDate: true,
            priority: true,
            labels: true,
            parentTask: { select: { title: true } },
            client: { select: { id: true, name: true } },
            project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
        },
        take: 200,
    });

    const tasks: TodayTask[] = rows.map((row) => {
        const dueDay = parisDay(row.dueDate!);
        const isOnboarding = row.labels.includes("onboarding");
        return {
            id: row.id,
            title: row.title,
            dueDay,
            overdueDays: overdueDays(dueDay, today),
            priority: row.priority,
            isOnboarding,
            section: isOnboarding ? (row.parentTask?.title ?? null) : null,
            project: row.project ? { id: row.project.id, name: row.project.name } : null,
            client: row.client ?? row.project?.client ?? null,
        };
    });
    const { shown, more } = capTasks(sortTodayTasks(tasks, today));
    return { tasks: shown, more };
}

export async function getTodayPayload(user: { id: string; role: string }, now: Date = new Date()): Promise<TodayPayload> {
    const today = parisDay(now);
    const canBill = await userHasPermission("pages.billing", user.id, user.role);

    const [tasks, billing, bilans, pending] = await Promise.allSettled([
        loadTasks(user.id, today),
        canBill ? getBillingTodayItems(today) : Promise.resolve(null),
        getWeeklyBilanTodos(user.id, now),
        getPendingCompanySubmissionsCount(user.id),
    ]);

    const errors: string[] = [];
    const value = <T,>(r: PromiseSettledResult<T>, name: string, fallback: T): T => {
        if (r.status === "fulfilled") return r.value;
        console.error(`[manager-home/today] ${name} failed`, r.reason);
        errors.push(name);
        return fallback;
    };

    const taskResult = value(tasks, "tasks", { tasks: [], more: 0 });
    return {
        day: today,
        tasks: taskResult.tasks,
        moreTasks: taskResult.more,
        billing: value(billing, "billing", canBill ? [] : null),
        bilans: value(bilans, "bilans", []),
        pendingCompanySubmissions: value(pending, "submissions", 0),
        errors,
    };
}
