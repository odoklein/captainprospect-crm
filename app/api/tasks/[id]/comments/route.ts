import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canEditTask, TASK_ACCESS_INCLUDE } from "@/lib/tasks/access";

// GET /api/tasks/[id]/comments
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, error: "Non autorisé" }, { status: 401 });
        }

        const { id } = await params;

        const comments = await prisma.taskComment.findMany({
            where: { taskId: id },
            include: {
                user: { select: { id: true, name: true, email: true } },
            },
            orderBy: { createdAt: "asc" },
        });

        return NextResponse.json({ success: true, data: comments });
    } catch (error) {
        console.error("GET /api/tasks/[id]/comments error:", error);
        return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 });
    }
}

// POST /api/tasks/[id]/comments
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, error: "Non autorisé" }, { status: 401 });
        }

        const { id } = await params;
        const body = await req.json();
        const { content } = body;

        if (!content?.trim()) {
            return NextResponse.json({ success: false, error: "Contenu requis" }, { status: 400 });
        }

        const task = await prisma.task.findUnique({
            where: { id },
            select: {
                id: true, projectId: true, title: true,
                createdById: true, assigneeId: true, audienceRole: true,
                ...TASK_ACCESS_INCLUDE,
            },
        });

        if (!task) {
            return NextResponse.json({ success: false, error: "Tâche non trouvée" }, { status: 404 });
        }

        if (!canEditTask(session.user, task)) {
            return NextResponse.json({ success: false, error: "Accès refusé" }, { status: 403 });
        }

        const comment = await prisma.taskComment.create({
            data: {
                taskId: id,
                userId: session.user.id,
                content: content.trim(),
            },
            include: {
                user: { select: { id: true, name: true, email: true } },
            },
        });

        // Log activity
        if (task.projectId) {
            await prisma.projectActivity.create({
                data: {
                    projectId: task.projectId,
                    taskId: id,
                    userId: session.user.id,
                    action: "commented",
                    details: { preview: content.trim().slice(0, 100) },
                },
            });
        }

        return NextResponse.json({ success: true, data: comment });
    } catch (error) {
        console.error("POST /api/tasks/[id]/comments error:", error);
        return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 });
    }
}
