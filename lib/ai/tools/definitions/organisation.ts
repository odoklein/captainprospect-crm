/**
 * Organisation — tasks and notes on the project.
 *
 * Both are `safe_write`: internal, visible immediately, deleted in one click.
 * This is the tier that makes the assistant feel like it does things rather
 * than just answers, without putting anything outside the CRM at risk.
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireProject } from "../context";
import { defineReadTool, defineSafeWriteTool, frDate, params } from "../helpers";

export const createTask = defineSafeWriteTool({
    name: "create_task",
    label: "Création d'une tâche",
    description:
        "Crée une tâche sur un tableau du client. Récupère d'abord les tableaux avec list_task_boards. Réversible : la tâche se supprime d'un clic.",
    parameters: params(
        {
            projectId: { type: "string", description: "Id du tableau, via list_task_boards" },
            title: { type: "string" },
            description: { type: "string" },
            priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "URGENT"] },
            dueDate: { type: "string", description: "Date ISO, ex : 2026-10-15" },
            assigneeId: { type: "string", description: "Id du SDR, via get_project_overview" },
        },
        ["projectId", "title"],
    ),
    schema: z.object({
        projectId: z.string().min(1),
        title: z.string().min(1).max(200),
        description: z.string().max(4000).optional(),
        priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
        dueDate: z.string().optional(),
        assigneeId: z.string().optional().nullable(),
    }),
    execute: async (args, ctx) => {
        const project = requireProject(ctx);

        const board = await prisma.project.findUnique({
            where: { id: args.projectId },
            select: { id: true, name: true, clientId: true },
        });
        if (!board) throw new Error("Tableau introuvable");
        if (board.clientId !== project.clientId) {
            throw new Error("Ce tableau n'appartient pas au projet actif.");
        }

        // An invalid date string must not become "due today" silently.
        let dueDate: Date | null = null;
        if (args.dueDate) {
            const parsed = new Date(args.dueDate);
            if (Number.isNaN(parsed.getTime())) {
                throw new Error(`Date d'échéance invalide : ${args.dueDate}`);
            }
            dueDate = parsed;
        }

        if (args.assigneeId) {
            const assignee = await prisma.user.findUnique({
                where: { id: args.assigneeId },
                select: { id: true },
            });
            if (!assignee) throw new Error("Utilisateur assigné introuvable");
        }

        const task = await prisma.task.create({
            data: {
                projectId: board.id,
                title: args.title,
                description: args.description ?? null,
                priority: args.priority ?? "MEDIUM",
                dueDate,
                assigneeId: args.assigneeId ?? null,
                createdById: ctx.userId,
            },
            select: { id: true, title: true, dueDate: true },
        });

        return {
            message: `Tâche « ${task.title} » créée sur ${board.name}${
                task.dueDate ? `, échéance ${frDate(task.dueDate)}` : ""
            }.`,
            refresh: true,
        };
    },
});

export const listTasks = defineReadTool({
    name: "list_tasks",
    label: "Tâches du projet",
    description: "Les tâches ouvertes sur les tableaux du client, avec responsable, priorité et échéance.",
    parameters: params({
        includeDone: { type: "boolean", description: "Inclure les tâches terminées" },
    }),
    schema: z.object({ includeDone: z.boolean().optional() }),
    execute: async (args, ctx) => {
        const project = requireProject(ctx);

        const tasks = await prisma.task.findMany({
            where: {
                project: { clientId: project.clientId },
                ...(args.includeDone ? {} : { status: { not: "DONE" } }),
            },
            orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
            take: 40,
            select: {
                id: true,
                title: true,
                status: true,
                priority: true,
                dueDate: true,
                project: { select: { name: true } },
                assignee: { select: { name: true } },
            },
        });

        return {
            taches: tasks.map((t) => ({
                taskId: t.id,
                titre: t.title,
                tableau: t.project.name,
                statut: t.status,
                priorite: t.priority,
                echeance: frDate(t.dueDate),
                responsable: t.assignee?.name ?? null,
                enRetard: !!t.dueDate && t.dueDate < new Date() && t.status !== "DONE",
            })),
        };
    },
});
