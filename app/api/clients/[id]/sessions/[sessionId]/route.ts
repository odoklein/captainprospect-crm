import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  successResponse,
  errorResponse,
  requireRole,
  withErrorHandler,
  validateRequest,
} from '@/lib/api-utils';
import { z } from 'zod';
import { SESSION_TASKS_INCLUDE, createSessionTasks, toSessionTaskDto, toggleSessionTask } from '@/lib/tasks/session-tasks';

const updateSessionSchema = z.object({
  type: z.string().min(1).optional(),
  date: z.string().optional(),
  crMarkdown: z.string().optional(),
  summaryEmail: z.string().optional(),
  toggleTaskId: z.string().optional(),
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
    .optional(),
});

export const PATCH = withErrorHandler(
  async (
    request: NextRequest,
    context: { params: Promise<{ id: string; sessionId: string }> },
  ) => {
    const sessionUser = await requireRole(['MANAGER', 'BUSINESS_DEVELOPER'], request);

    const { id: clientId, sessionId } = await context.params;
    const body = await validateRequest(request, updateSessionSchema);

    const session = await prisma.clientSession.findFirst({
      where: { id: sessionId, clientId },
    });
    if (!session) return errorResponse('Session introuvable', 404);

    // Toggle task done/undone (the id is the session to-do's Task id)
    if (body.toggleTaskId) {
      const toggled = await toggleSessionTask(sessionId, body.toggleTaskId);
      if (!toggled) return errorResponse('Tâche introuvable', 404);
      return successResponse({ taskId: body.toggleTaskId, doneAt: toggled.doneAt?.toISOString() ?? null });
    }

    // Update session fields
    const updated = await prisma.clientSession.update({
      where: { id: sessionId },
      data: {
        type: body.type ?? session.type,
        date: body.date ? new Date(body.date) : session.date,
        crMarkdown: body.crMarkdown ?? session.crMarkdown,
        summaryEmail: body.summaryEmail ?? session.summaryEmail,
      },
    });

    // Add new tasks from edit modal
    let projectId: string | null = null;
    if (body.tasks && body.tasks.length > 0) {
      const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { name: true },
      });
      if (client) {
        projectId = await createSessionTasks({
          clientId,
          clientName: client.name,
          sessionId,
          sessionType: null,
          userId: sessionUser.user.id,
          tasks: body.tasks,
        });
      }
    }

    // Re-fetch with tasks
    const full = await prisma.clientSession.findUnique({
      where: { id: sessionId },
      include: SESSION_TASKS_INCLUDE,
    });

    return successResponse({
      id: updated.id,
      type: updated.type,
      date: updated.date.toISOString(),
      crMarkdown: updated.crMarkdown,
      summaryEmail: updated.summaryEmail,
      projectId,
      tasks: full?.workTasks.map(toSessionTaskDto) ?? [],
    });
  },
);

export const DELETE = withErrorHandler(
  async (
    request: NextRequest,
    context: { params: Promise<{ id: string; sessionId: string }> },
  ) => {
    await requireRole(['MANAGER', 'BUSINESS_DEVELOPER'], request);

    const { id: clientId, sessionId } = await context.params;

    const session = await prisma.clientSession.findFirst({
      where: { id: sessionId, clientId },
    });
    if (!session) return errorResponse('Session introuvable', 404);

    await prisma.clientSession.delete({
      where: { id: sessionId },
    });

    return successResponse({ deleted: true });
  },
);
