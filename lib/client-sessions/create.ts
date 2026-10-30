/**
 * Creating a client session (CR): the row, its action items as project tasks,
 * and the optional summary e-mail to the client.
 *
 * Extracted from POST /api/clients/[id]/sessions so the agent's
 * `publish_weekly_bilan` publishes a « Reporting » session exactly like a
 * manager does from the client page. Behaviour is unchanged: same SMTP
 * transport (SYSTEM_SMTP_*), same subject, `emailSentAt` set only when the
 * mail left, a failed mail never fails the session.
 */

import { prisma } from "@/lib/prisma";
import { SESSION_TASKS_INCLUDE, createSessionTasks, toSessionTaskDto } from "@/lib/tasks/session-tasks";

export interface SessionClient {
    id: string;
    name: string;
    email: string | null;
}

export interface SessionTaskInput {
    label: string;
    assignee?: string;
    assigneeId?: string;
    assigneeRole?: "SDR" | "MANAGER" | "DEV" | "ALWAYS";
    priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    dueDate?: string;
}

export interface CreateClientSessionInput {
    type: string;
    date?: string | Date;
    leexiId?: string;
    recordingUrl?: string;
    crMarkdown?: string;
    summaryEmail?: string;
    notifyByEmail?: boolean;
    tasks?: SessionTaskInput[];
}

export interface CreatedClientSession {
    id: string;
    type: string;
    date: string;
    leexiId: string | null;
    recordingUrl: string | null;
    crMarkdown: string | null;
    summaryEmail: string | null;
    emailSentAt: string | null;
    tasks: ReturnType<typeof toSessionTaskDto>[];
    createdAt: string;
}

export async function findSessionClient(clientId: string): Promise<SessionClient | null> {
    return prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true, email: true } });
}

export async function createClientSession(params: {
    client: SessionClient;
    input: CreateClientSessionInput;
    userId: string;
}): Promise<{ session: CreatedClientSession; emailSent: boolean; projectId: string | null }> {
    const { client, input } = params;
    const clientId = client.id;

    const session = await prisma.clientSession.create({
        data: {
            clientId,
            type: input.type,
            date: input.date ? new Date(input.date) : new Date(),
            leexiId: input.leexiId,
            recordingUrl: input.recordingUrl,
            crMarkdown: input.crMarkdown,
            summaryEmail: input.summaryEmail,
        },
    });

    // The CR's action items become Tasks of the client's project (lib/tasks/session-tasks.ts).
    const projectId = await createSessionTasks({
        clientId,
        clientName: client.name,
        sessionId: session.id,
        sessionType: input.type ?? null,
        userId: params.userId,
        tasks: (input.tasks ?? []).map((t) => ({ ...t, assigneeRole: t.assigneeRole ?? "ALWAYS", priority: t.priority ?? "MEDIUM" })),
    });
    const sessionTasks = await prisma.task.findMany({
        where: { sessionId: session.id },
        select: SESSION_TASKS_INCLUDE.workTasks.select,
        orderBy: SESSION_TASKS_INCLUDE.workTasks.orderBy,
    });

    let emailSent = false;

    // Send summary email if requested and client has an email
    if (input.notifyByEmail && client.email && input.summaryEmail) {
        try {
            const nodemailer = (await import("nodemailer")).default;
            const transporter = nodemailer.createTransport({
                host: process.env.SYSTEM_SMTP_HOST,
                port: Number(process.env.SYSTEM_SMTP_PORT ?? 587),
                secure: false,
                auth: {
                    user: process.env.SYSTEM_SMTP_USER,
                    pass: process.env.SYSTEM_SMTP_PASS,
                },
            });

            await transporter.sendMail({
                from: process.env.SYSTEM_SMTP_FROM ?? process.env.SYSTEM_SMTP_USER,
                to: client.email,
                subject: `Synthèse de notre session ${input.type} — ${client.name}`,
                text: input.summaryEmail,
            });

            await prisma.clientSession.update({
                where: { id: session.id },
                data: { emailSentAt: new Date() },
            });

            emailSent = true;
        } catch (err) {
            console.error("Session email send failed:", err);
        }
    }

    return {
        session: {
            id: session.id,
            type: session.type,
            date: session.date.toISOString(),
            leexiId: session.leexiId,
            recordingUrl: session.recordingUrl,
            crMarkdown: session.crMarkdown,
            summaryEmail: session.summaryEmail,
            emailSentAt: emailSent ? new Date().toISOString() : null,
            tasks: sessionTasks.map(toSessionTaskDto),
            createdAt: session.createdAt.toISOString(),
        },
        emailSent,
        projectId,
    };
}
