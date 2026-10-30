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
import { SESSION_TASKS_INCLUDE, toSessionTaskDto } from '@/lib/tasks/session-tasks';
import { createClientSession, findSessionClient } from '@/lib/client-sessions/create';

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

    const client = await findSessionClient(clientId);
    if (!client) return errorResponse('Client introuvable', 404);

    const body = await validateRequest(request, createSessionSchema);

    // Row, CR tasks and optional summary e-mail: lib/client-sessions/create.ts
    // (shared with the agent's publish_weekly_bilan).
    const { session: result, emailSent, projectId } = await createClientSession({
      client,
      input: body,
      userId: sessionUser.user.id,
    });

    return NextResponse.json({ success: true, data: result, emailSent, projectId }, { status: 201 });
  },
);
