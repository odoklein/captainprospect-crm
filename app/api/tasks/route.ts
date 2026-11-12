import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createTaskAssignmentNotification } from "@/lib/notifications";

// GET /api/tasks - List tasks with advanced filtering
export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, error: "Non autorisé" }, { status: 401 });
        }

        const userId = session.user.id;
        const { searchParams } = new URL(req.url);
        const projectId = searchParams.get("projectId");
        const status = searchParams.get("status");
        const priority = searchParams.get("priority");
        const assigneeId = searchParams.get("assigneeId");
        const milestoneId = searchParams.get("milestoneId");
        const search = searchParams.get("search");
        const labels = searchParams.get("labels"); // comma-separated
        const sortBy = searchParams.get("sortBy") || "position";
        const sortOrder = searchParams.get("sortOrder") || "asc";
        const parentOnly = searchParams.get("parentOnly"); // "true" = exclude subtasks
        const dueBefore = searchParams.get("dueBefore");
        const dueAfter = searchParams.get("dueAfter");

        let whereClause: any = {};

        if (projectId) {
            whereClause.projectId = projectId;
        }

        if (status) {
            if (status.includes(",")) {
                whereClause.status = { in: status.split(",") };
            } else {
                whereClause.status = status;
            }
        }

        if (priority) {
            if (priority.includes(",")) {
                whereClause.priority = { in: priority.split(",") };
            } else {
                whereClause.priority = priority;
            }
        }

        if (assigneeId) {
            whereClause.assigneeId = assigneeId === "unassigned" ? null : assigneeId;
        }

        if (milestoneId) {
            whereClause.milestoneId = milestoneId;
        }

        if (parentOnly === "true") {
            whereClause.parentTaskId = null;
        }

        if (labels) {
            whereClause.labels = { hasSome: labels.split(",") };
        }

        if (search) {
            whereClause.AND = [
                ...(whereClause.AND || []),
                {
                    OR: [
                        { title: { contains: search, mode: "insensitive" } },
                        { description: { contains: search, mode: "insensitive" } },
                    ],
                },
            ];
        }

        if (dueBefore) {
            whereClause.dueDate = { ...(whereClause.dueDate || {}), lte: new Date(dueBefore) };
        }
        if (dueAfter) {
            whereClause.dueDate = { ...(whereClause.dueDate || {}), gte: new Date(dueAfter) };
        }

        // Default: if no project filter, show user's tasks
        if (!projectId) {
            whereClause.OR = [
                { assigneeId: userId },
                { createdById: userId },
            ];
        }

        // Build orderBy
        const orderByMap: Record<string, any> = {
            position: [{ position: sortOrder }, { createdAt: "desc" }],
            dueDate: { dueDate: sortOrder },
            priority: { priority: sortOrder },
            createdAt: { createdAt: sortOrder },
            title: { title: sortOrder },
            status: { status: sortOrder },
        };
        const orderBy = orderByMap[sortBy] || [{ position: "asc" }, { createdAt: "desc" }];

        const tasks = await prisma.task.findMany({
            where: whereClause,
            include: {
                project: { select: { id: true, name: true, color: true } },
                assignee: { select: { id: true, name: true, email: true } },
                createdBy: { select: { id: true, name: true } },
                subtasks: {
                    select: { id: true, status: true, title: true },
                },
                _count: { select: { comments: true, subtasks: true, files: true } },
            },
            orderBy,
        });

        return NextResponse.json({ success: true, data: tasks });
    } catch (error) {
        console.error("GET /api/tasks error:", error);
        return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 });
    }
}

// POST /api/tasks - Create task
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, error: "Non autorisé" }, { status: 401 });
        }

        const body = await req.json();
        const {
            projectId, clientId, title, description, priority, dueDate, startDate,
            assigneeId, parentTaskId, labels, estimatedHours, milestoneId, position
        } = body;

        if (!title?.trim()) {
            return NextResponse.json({ success: false, error: "Titre requis" }, { status: 400 });
        }

        if (session.user.role === "CLIENT") {
            return NextResponse.json({ success: false, error: "Accès refusé" }, { status: 403 });
        }

        // No project = personal / inbox task, optionally tied to a client.
        let taskClientId: string | null = clientId || null;
        if (projectId) {
            const project = await prisma.project.findUnique({
                where: { id: projectId },
                include: { members: true },
            });

            if (!project) {
                return NextResponse.json({ success: false, error: "Projet non trouvé" }, { status: 404 });
            }

            const isMember = project.members.some((m) => m.userId === session.user.id);
            const isOwner = project.ownerId === session.user.id;
            const isManager = session.user.role === "MANAGER";

            if (!isMember && !isOwner && !isManager) {
                return NextResponse.json({ success: false, error: "Accès refusé" }, { status: 403 });
            }

            taskClientId = taskClientId ?? project.clientId;
        }

        // Auto position: get max position in project (or in the creator's inbox) for this status
        let taskPosition = position;
        if (taskPosition === undefined || taskPosition === null) {
            const lastTask = await prisma.task.findFirst({
                where: projectId
                    ? { projectId, status: "TODO", parentTaskId: null }
                    : { projectId: null, createdById: session.user.id, status: "TODO", parentTaskId: null },
                orderBy: { position: "desc" },
                select: { position: true },
            });
            taskPosition = (lastTask?.position ?? -1) + 1;
        }

        const task = await prisma.task.create({
            data: {
                projectId: projectId || null,
                clientId: taskClientId,
                title: title.trim(),
                description: description?.trim() || null,
                priority: priority || "MEDIUM",
                dueDate: dueDate ? new Date(dueDate) : null,
                startDate: startDate ? new Date(startDate) : null,
                assigneeId: assigneeId || null,
                createdById: session.user.id,
                parentTaskId: parentTaskId || null,
                labels: labels || [],
                estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
                milestoneId: milestoneId || null,
                position: taskPosition,
            },
            include: {
                project: { select: { id: true, name: true, color: true } },
                assignee: { select: { id: true, name: true, email: true } },
                createdBy: { select: { id: true, name: true } },
                subtasks: { select: { id: true, status: true, title: true } },
                _count: { select: { comments: true, subtasks: true, files: true } },
            },
        });

        // Log activity
        if (projectId) {
            await prisma.projectActivity.create({
                data: {
                    projectId,
                    taskId: task.id,
                    userId: session.user.id,
                    action: "task_created",
                    details: { title: task.title, priority: task.priority },
                },
            });
        }

        // Notify assignee
        if (assigneeId && assigneeId !== session.user.id) {
            await createTaskAssignmentNotification({
                assigneeId,
                taskTitle: task.title,
                projectName: task.project?.name ?? null,
                assignedByName: session.user.name || "Un utilisateur",
            });
        }

        return NextResponse.json({ success: true, data: task });
    } catch (error) {
        console.error("POST /api/tasks error:", error);
        return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 });
    }
}
