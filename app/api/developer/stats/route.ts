import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, error: "Non autorisé" }, { status: 401 });
        }

        const userId = session.user.id;

        const [projectCount, taskCount, pendingTaskCount, emailCount, ticketCount, pendingTicketCount] = await Promise.all([
            // Projects: Owner or Member
            prisma.project.count({
                where: {
                    OR: [
                        { ownerId: userId },
                        { members: { some: { userId } } },
                    ],
                },
            }),
            // Total Tasks assigned
            prisma.task.count({
                where: { assigneeId: userId },
            }),
            // Pending Tasks
            prisma.task.count({
                where: {
                    assigneeId: userId,
                    status: { not: "DONE" }
                },
            }),
            // Email Accounts
            prisma.emailAccount.count({
                where: { userId },
            }),
            // Support Tickets assigned to user or created by user
            prisma.ticket.count({
                where: {
                    OR: [
                        { assigneeId: userId },
                        { authorId: userId },
                    ],
                },
            }),
            // Pending Support Tickets
            prisma.ticket.count({
                where: {
                    OR: [
                        { assigneeId: userId },
                        { authorId: userId },
                    ],
                    status: { notIn: ["RESOLVED", "CLOSED"] },
                },
            }),
        ]);

        return NextResponse.json({
            success: true,
            data: {
                projects: projectCount,
                tasks: taskCount,
                pendingTasks: pendingTaskCount,
                emailAccounts: emailCount,
                tickets: ticketCount,
                pendingTickets: pendingTicketCount,
            },
        });
    } catch (error) {
        console.error("GET /api/developer/stats error:", error);
        return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 });
    }
}
