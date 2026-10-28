import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  successResponse,
  errorResponse,
  requireRole,
  withErrorHandler,
  validateRequest,
} from '@/lib/api-utils';
import { z } from 'zod';
import { SESSION_TASKS_INCLUDE, createSessionTasks, toSessionTaskDto } from '@/lib/tasks/session-tasks';

// ============================================
// GET /api/clients/[id]/sessions
// Returns all sessions for a client, newest first.
// ============================================

export const GET = withErrorHandler(
  async (
    _request: NextRequest,
    context: { params: Promise<{ id: string }> },
  ) => {
    await requireRole(['MANAGER', 'BUSINESS_DEVELOPER'], _request);

    const { id: clientId } = await context.params;

    const sessions = await prisma.clientSession.findMany({
      where: { clientId },
      include: SESSION_TASKS_INCLUDE,
      orderBy: { date: 'desc' },
    });

    // Find the active project for this client (for "View Project" links)
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { name: true },
    });
    const activeProject = client
      ? await prisma.project.findFirst({
          where: { clientId, name: client.name, status: 'ACTIVE' },
          select: { id: true },
        })
      : null;

    const formatted = sessions.map((s) => ({
      id: s.id,
      type: s.type,
      date: s.date.toISOString(),
      leexiId: s.leexiId,
      recordingUrl: s.recordingUrl,
      crMarkdown: s.crMarkdown,
      summaryEmail: s.summaryEmail,
      emailSentAt: s.emailSentAt?.toISOString() ?? null,
      projectId: s.workTasks[0]?.projectId ?? activeProject?.id ?? null,
      tasks: s.workTasks.map(toSessionTaskDto),
      createdAt: s.createdAt.toISOString(),
    }));

    return successResponse(formatted);
  },
);

// ============================================
// POST /api/clients/[id]/sessions
// Creates a new session (CR) for a client.
// If notifyByEmail is true, sends summary email via SMTP.
// ============================================

const createSessionSchema = z.object({
  type: z.string().min(1),
  date: z.string().optional(),
  leexiId: z.string().optional(),
  recordingUrl: z.string().optional(),
  crMarkdown: z.string().optional(),
  summaryEmail: z.string().optional(),
  notifyByEmail: z.boolean().optional().default(false),
  tasks: z
    .array(
      z.object({
        label: z.string().min(1),
        assignee: z.string().optional(),
        assigneeId: z.string().optional(),
        assigneeRole: z.enum(['SDR', 'MANAGER', 'DEV', 'ALWAYS']).optional().default('ALWAYS'),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional().default('MEDIUM'),
        dueDate: z.string().optional(),
      }),
    )
    .optional()
    .default([]),
});

export const POST = withErrorHandler(
  async (
    request: NextRequest,
    context: { params: Promise<{ id: string }> },
  ) => {
    const sessionUser = await requireRole(['MANAGER', 'BUSINESS_DEVELOPER'], request);

    const { id: clientId } = await context.params;

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, name: true, email: true },
    });
    if (!client) return errorResponse('Client introuvable', 404);

    const body = await validateRequest(request, createSessionSchema);

    const session = await prisma.clientSession.create({
      data: {
        clientId,
        type: body.type,
        date: body.date ? new Date(body.date) : new Date(),
        leexiId: body.leexiId,
        recordingUrl: body.recordingUrl,
        crMarkdown: body.crMarkdown,
        summaryEmail: body.summaryEmail,
      },
    });

    // The CR's action items become Tasks of the client's project (lib/tasks/session-tasks.ts).
    const projectId = await createSessionTasks({
      clientId,
      clientName: client.name,
      sessionId: session.id,
      sessionType: body.type ?? null,
      userId: sessionUser.user.id,
      tasks: body.tasks ?? [],
    });
    const sessionTasks = await prisma.task.findMany({
      where: { sessionId: session.id },
      select: SESSION_TASKS_INCLUDE.workTasks.select,
      orderBy: SESSION_TASKS_INCLUDE.workTasks.orderBy,
    });

    let emailSent = false;

    // Send summary email if requested and client has an email
    if (body.notifyByEmail && client.email && body.summaryEmail) {
      try {
        const nodemailer = (await import('nodemailer')).default;
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
          subject: `Synthèse de notre session ${body.type} — ${client.name}`,
          text: body.summaryEmail,
        });

        await prisma.clientSession.update({
          where: { id: session.id },
          data: { emailSentAt: new Date() },
        });

        emailSent = true;
      } catch (err) {
        console.error('Session email send failed:', err);
      }
    }

    const result = {
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
    };

    return NextResponse.json({ success: true, data: result, emailSent, projectId }, { status: 201 });
  },
);
