import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findOrCreateClientProject } from "@/lib/projects/client-project";

// ============================================
// CLIENT-SESSION TO-DOS — stored as Task (source SESSION, sessionId set).
// They used to live in SessionTask, mirrored into a Task; since the unified
// task list the Task is the only row. The session APIs still answer with the
// old SessionTask shape (SessionTaskDto) so the client page, the client drawer
// and the client portal read them unchanged.
// ============================================

export type SessionAudience = "SDR" | "MANAGER" | "DEV" | "ALWAYS";

export interface SessionTaskInput {
    label: string;
    assignee?: string;
    assigneeId?: string;
    assigneeRole?: SessionAudience;
    priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    dueDate?: string;
}

export interface SessionTaskDto {
    id: string;
    label: string;
    assignee: string | null;
    assigneeRole: SessionAudience;
    priority: string;
    dueDate: string | null;
    doneAt: string | null;
    /** Same as id since the Task is the session to-do itself (kept for older callers). */
    taskId: string;
    projectId: string | null;
}

export const SESSION_TASK_SELECT = {
    id: true,
    title: true,
    assigneeLabel: true,
    audienceRole: true,
    priority: true,
    dueDate: true,
    status: true,
    completedAt: true,
    projectId: true,
} satisfies Prisma.TaskSelect;

type SessionTaskRow = Prisma.TaskGetPayload<{ select: typeof SESSION_TASK_SELECT }>;

/** Session to-dos of a session, oldest first (the order they were written in the CR). */
export const SESSION_TASKS_INCLUDE = {
    workTasks: { select: SESSION_TASK_SELECT, orderBy: [{ createdAt: "asc" }, { position: "asc" }] },
} satisfies Prisma.ClientSessionInclude;

export function toSessionTaskDto(t: SessionTaskRow): SessionTaskDto {
    return {
        id: t.id,
        label: t.title,
        assignee: t.assigneeLabel,
        assigneeRole: (t.audienceRole ?? "ALWAYS") as SessionAudience,
        priority: t.priority,
        dueDate: t.dueDate?.toISOString() ?? null,
        doneAt: t.status === "DONE" ? (t.completedAt ?? new Date(0)).toISOString() : null,
        taskId: t.id,
        projectId: t.projectId,
    };
}

/** Creates a session's to-dos in the client's project. Returns that project's id (null when there were none). */
export async function createSessionTasks(args: {
    clientId: string;
    clientName: string;
    sessionId: string;
    sessionType: string | null;
    userId: string;
    tasks: SessionTaskInput[];
}): Promise<string | null> {
    if (args.tasks.length === 0) return null;
    const project = await findOrCreateClientProject(args.clientId, args.userId, {
        description: args.sessionType
            ? `Projet créé automatiquement à partir des sessions client (${args.sessionType}).`
            : "Projet créé automatiquement à partir des sessions client.",
    });
    const description = args.sessionType
        ? `Tâche issue de la session "${args.sessionType}" pour le client ${args.clientName}.`
        : `Tâche issue d'une session pour le client ${args.clientName}.`;

    await prisma.task.createMany({
        data: args.tasks.map((t, i) => ({
            position: i,
            projectId: project.id,
            clientId: args.clientId,
            source: "SESSION" as const,
            sessionId: args.sessionId,
            audienceRole: t.assigneeRole ?? "ALWAYS",
            assigneeLabel: t.assignee || null,
            title: t.label,
            description,
            status: "TODO" as const,
            priority: t.priority ?? "MEDIUM",
            dueDate: t.dueDate ? new Date(t.dueDate) : null,
            assigneeId: t.assigneeId || null,
            createdById: args.userId,
        })),
    });
    return project.id;
}

/** Ticks or reopens a session to-do. Null when it does not belong to that session. */
export async function toggleSessionTask(sessionId: string, taskId: string): Promise<{ doneAt: Date | null } | null> {
    const task = await prisma.task.findFirst({ where: { id: taskId, sessionId }, select: { status: true } });
    if (!task) return null;
    const doneAt = task.status === "DONE" ? null : new Date();
    await prisma.task.update({
        where: { id: taskId },
        data: { status: doneAt ? "DONE" : "TODO", completedAt: doneAt },
    });
    return { doneAt };
}
