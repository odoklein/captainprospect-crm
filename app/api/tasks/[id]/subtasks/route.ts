import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canEditTask, TASK_ACCESS_INCLUDE } from "@/lib/tasks/access";

// GET /api/tasks/[id]/subtasks
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, error: "Non autorisé" }, { status: 401 });
        }

        const { id } = await params;

        const subtasks = await prisma.task.findMany({
            where: { parentTaskId: id },
            include: {
                assignee: { select: { id: true, name: true } },
            },
            orderBy: { position: "asc" },
        });

        return NextResponse.json({ success: true, data: subtasks });
    } catch (error) {
        console.error("GET /api/tasks/[id]/subtasks error:", error);
        return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 });
    }
}

// POST /api/tasks/[id]/subtasks - Create a subtask
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, error: "Non autorisé" }, { status: 401 });
        }

        const { id } = await params;
        const body = await req.json();
        const { title, description, priority, assigneeId, dueDate, estimatedHours } = body;

        if (!title?.trim()) {
            return NextResponse.json({ success: false, error: "Titre requis" }, { status: 400 });
        }

        const parentTask = await prisma.task.findUnique({
            where: { id },
            select: {
                id: true, projectId: true, clientId: true,
                createdById: true, assigneeId: true, audienceRole: true,
                ...TASK_ACCESS_INCLUDE,
            },
        });

        if (!parentTask) {
            return NextResponse.json({ success: false, error: "Tâche parente non trouvée" }, { status: 404 });
        }

        if (!canEditTask(session.user, parentTask)) {
            return NextResponse.json({ success: false, error: "Accès refusé" }, { status: 403 });
        }

        // Get next position
        const lastSubtask = await prisma.task.findFirst({
            where: { parentTaskId: id },
            orderBy: { position: "desc" },
            select: { position: true },
        });

        const subtask = await prisma.task.create({
            data: {
                projectId: parentTask.projectId,
                clientId: parentTask.clientId,
                parentTaskId: id,
                title: title.trim(),
                description: description?.trim() || null,
                priority: priority || "MEDIUM",
                assigneeId: assigneeId || null,
                dueDate: dueDate ? new Date(dueDate) : null,
                estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
                position: (lastSubtask?.position ?? -1) + 1,
                createdById: session.user.id,
            },
            include: {
                assignee: { select: { id: true, name: true } },
            },
        });

        // Log activity
        if (parentTask.projectId) {
            await prisma.projectActivity.create({
                data: {
                    projectId: parentTask.projectId,
                    taskId: id,
                    userId: session.user.id,
                    action: "subtask_created",
                    details: { subtaskTitle: subtask.title },
                },
            });
        }

        return NextResponse.json({ success: true, data: subtask });
    } catch (error) {
        console.error("POST /api/tasks/[id]/subtasks error:", error);
        return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 });
    }
}
