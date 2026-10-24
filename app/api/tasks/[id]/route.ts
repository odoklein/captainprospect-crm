import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createTaskReassignmentNotification } from "@/lib/notifications";
import { syncSectionStatus } from "@/lib/onboarding/checklist-service";

// GET /api/tasks/[id] - Get task details
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, error: "Non autorisé" }, { status: 401 });
        }

        const { id } = await params;

        const task = await prisma.task.findUnique({
            where: { id },
            include: {
                project: {
                    include: {
                        members: {
                            include: {
                                user: { select: { id: true, name: true, email: true } },
                            },
                        },
                    },
                },
                assignee: { select: { id: true, name: true, email: true } },
                createdBy: { select: { id: true, name: true } },
                parentTask: { select: { id: true, title: true } },
                subtasks: {
                    include: {
                        assignee: { select: { id: true, name: true } },
                    },
                    orderBy: { position: "asc" },
                },
                comments: {
                    include: {
                        user: { select: { id: true, name: true } },
                    },
                    orderBy: { createdAt: "asc" },
                },
                files: {
                    select: { id: true, name: true, originalName: true, mimeType: true, size: true, url: true, createdAt: true },
                    orderBy: { createdAt: "desc" },
                },
                dependentOn: {
                    include: {
                        dependsOnTask: { select: { id: true, title: true, status: true } },
                    },
                },
                blockedBy: {
                    include: {
                        task: { select: { id: true, title: true, status: true } },
                    },
                },
                timeEntries: {
                    include: {
                        user: { select: { id: true, name: true } },
                    },
                    orderBy: { date: "desc" },
                },
                milestone: { select: { id: true, title: true } },
                activities: {
                    include: {
                        user: { select: { id: true, name: true } },
                    },
                    orderBy: { createdAt: "desc" },
                    take: 30,
                },
            },
        });

        if (!task) {
            return NextResponse.json({ success: false, error: "Tâche non trouvée" }, { status: 404 });
        }

        return NextResponse.json({ success: true, data: task });
    } catch (error) {
        console.error("GET /api/tasks/[id] error:", error);
        return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 });
    }
}

// PATCH /api/tasks/[id] - Update task with activity logging
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, error: "Non autorisé" }, { status: 401 });
        }

        const { id } = await params;
        const body = await req.json();
        const {
            title, description, status, priority, dueDate, startDate,
            assigneeId, labels, estimatedHours, loggedHours, position,
            milestoneId
        } = body;

        const task = await prisma.task.findUnique({
            where: { id },
            include: {
                project: { include: { members: true } },
            },
        });

        if (!task) {
            return NextResponse.json({ success: false, error: "Tâche non trouvée" }, { status: 404 });
        }

        const previousAssigneeId = task.assigneeId;
        const previousStatus = task.status;

        const updateData: any = {};
        if (title !== undefined) updateData.title = title.trim();
        if (description !== undefined) updateData.description = description?.trim() || null;
        if (status !== undefined) updateData.status = status;
        if (priority !== undefined) updateData.priority = priority;
        if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
        if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null;
        if (assigneeId !== undefined) updateData.assigneeId = assigneeId || null;
        if (labels !== undefined) updateData.labels = labels;
        if (estimatedHours !== undefined) updateData.estimatedHours = estimatedHours ? parseFloat(estimatedHours) : null;
        if (loggedHours !== undefined) updateData.loggedHours = loggedHours ? parseFloat(loggedHours) : null;
        if (position !== undefined) updateData.position = position;
        if (milestoneId !== undefined) updateData.milestoneId = milestoneId || null;

        // Auto-set completedAt
        if (status === "DONE" && previousStatus !== "DONE") {
            updateData.completedAt = new Date();
        } else if (status && status !== "DONE" && previousStatus === "DONE") {
            updateData.completedAt = null;
        }

        const updated = await prisma.task.update({
            where: { id },
            data: updateData,
            include: {
                project: { select: { id: true, name: true, color: true } },
                assignee: { select: { id: true, name: true, email: true } },
                createdBy: { select: { id: true, name: true } },
                subtasks: { select: { id: true, status: true, title: true } },
                _count: { select: { comments: true, subtasks: true, files: true } },
            },
        });

        // Onboarding checklist: a step ticked from the Kanban or the home keeps its section in sync.
        if (status !== undefined && updated.parentTaskId && task.labels.includes("onboarding")) {
            await syncSectionStatus(updated.parentTaskId);
        }

        // Log activity for significant changes
        const activities: any[] = [];

        if (status && status !== previousStatus) {
            activities.push({
                projectId: task.projectId,
                taskId: id,
                userId: session.user.id,
                action: "status_changed",
                details: { from: previousStatus, to: status },
            });
        }

        if (assigneeId !== undefined && assigneeId !== previousAssigneeId) {
            activities.push({
                projectId: task.projectId,
                taskId: id,
                userId: session.user.id,
                action: "assigned",
                details: { from: previousAssigneeId, to: assigneeId },
            });
        }

        if (priority && priority !== task.priority) {
            activities.push({
                projectId: task.projectId,
                taskId: id,
                userId: session.user.id,
                action: "priority_changed",
                details: { from: task.priority, to: priority },
            });
        }

        if (activities.length > 0) {
            await prisma.projectActivity.createMany({ data: activities });
        }

        // Notify on reassignment
        if (
            assigneeId !== undefined &&
            assigneeId !== previousAssigneeId &&
            assigneeId !== session.user.id &&
            assigneeId
        ) {
            await createTaskReassignmentNotification({
                assigneeId,
                taskTitle: updated.title,
                projectName: updated.project.name,
                assignedByName: session.user.name || "Un utilisateur",
            });
        }

        return NextResponse.json({ success: true, data: updated });
    } catch (error) {
        console.error("PATCH /api/tasks/[id] error:", error);
        return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 });
    }
}

// DELETE /api/tasks/[id] - Delete task
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, error: "Non autorisé" }, { status: 401 });
        }

        const { id } = await params;

        const task = await prisma.task.findUnique({
            where: { id },
            include: {
                project: { include: { members: true } },
            },
        });

        if (!task) {
            return NextResponse.json({ success: false, error: "Tâche non trouvée" }, { status: 404 });
        }

        const isCreator = task.createdById === session.user.id;
        const isAssignee = task.assigneeId === session.user.id;
        const isProjectOwner = task.project.ownerId === session.user.id;
        const isProjectAdmin = task.project.members.some(
            (m) => m.userId === session.user.id && ["owner", "admin"].includes(m.role)
        );
        const isManager = session.user.role === "MANAGER";

        if (!isCreator && !isAssignee && !isProjectOwner && !isProjectAdmin && !isManager) {
            return NextResponse.json({ success: false, error: "Accès refusé" }, { status: 403 });
        }

        // Log before deleting
        await prisma.projectActivity.create({
            data: {
                projectId: task.projectId,
                userId: session.user.id,
                action: "task_deleted",
                details: { title: task.title },
            },
        });

        await prisma.task.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("DELETE /api/tasks/[id] error:", error);
        return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 });
    }
}
