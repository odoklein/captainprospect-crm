import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canEditTask, TASK_ACCESS_INCLUDE } from "@/lib/tasks/access";

// PATCH /api/tasks/bulk - Bulk update tasks
export async function PATCH(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, error: "Non autorisé" }, { status: 401 });
        }

        const body = await req.json();
        const { taskIds, status, priority, assigneeId } = body;

        if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
            return NextResponse.json({ success: false, error: "taskIds requis" }, { status: 400 });
        }

        if (!status && !priority && assigneeId === undefined) {
            return NextResponse.json({ success: false, error: "Au moins un champ à modifier" }, { status: 400 });
        }

        const updateData: any = {};
        if (status) updateData.status = status;
        if (priority) updateData.priority = priority;
        if (assigneeId !== undefined) updateData.assigneeId = assigneeId || null;

        // Auto-set completedAt for bulk status change
        if (status === "DONE") {
            updateData.completedAt = new Date();
        } else if (status && status !== "DONE") {
            updateData.completedAt = null;
        }

        // Only the tasks this user may edit are touched; the rest are skipped silently.
        const candidates = await prisma.task.findMany({
            where: { id: { in: taskIds } },
            select: {
                id: true, projectId: true,
                createdById: true, assigneeId: true, audienceRole: true,
                ...TASK_ACCESS_INCLUDE,
            },
        });
        const tasks = candidates.filter((t) => canEditTask(session.user, t));

        const result = await prisma.task.updateMany({
            where: { id: { in: tasks.map((t) => t.id) } },
            data: updateData,
        });

        // Log activities
        if (status) {
            const projectIds = [...new Set(tasks.map((t) => t.projectId).filter((p): p is string => !!p))];
            for (const projectId of projectIds) {
                await prisma.projectActivity.create({
                    data: {
                        projectId,
                        userId: session.user.id,
                        action: "bulk_status_change",
                        details: { taskCount: tasks.length, status },
                    },
                });
            }
        }

        return NextResponse.json({ success: true, data: { count: result.count } });
    } catch (error) {
        console.error("PATCH /api/tasks/bulk error:", error);
        return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 });
    }
}
