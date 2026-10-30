// ============================================
// GET /api/client/sessions
// Returns all sessions for the current client (CLIENT role).
// Same data shape as GET /api/clients/[id]/sessions for manager view.
// ============================================

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  successResponse,
  requireRole,
  withErrorHandler,
} from '@/lib/api-utils';
import { SESSION_TASKS_INCLUDE, toSessionTaskDto } from '@/lib/tasks/session-tasks';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const session = await requireRole(['CLIENT'], request);
  const clientId = (session.user as { clientId?: string }).clientId;
  if (!clientId) return successResponse([]);

  const sessions = await prisma.clientSession.findMany({
    where: { clientId },
    include: SESSION_TASKS_INCLUDE,
    orderBy: { date: 'desc' },
  });

  const formatted = sessions.map((s) => ({
    id: s.id,
    type: s.type,
    date: s.date.toISOString(),
    leexiId: s.leexiId,
    recordingUrl: s.recordingUrl,
    crMarkdown: s.crMarkdown,
    summaryEmail: s.summaryEmail,
    emailSentAt: s.emailSentAt?.toISOString() ?? null,
    // The portal only needs what the client reads; no internal ids beyond the row id.
    tasks: s.workTasks.map(toSessionTaskDto).map((t) => ({
      id: t.id,
      label: t.label,
      assignee: t.assignee,
      assigneeRole: t.assigneeRole,
      priority: t.priority,
      doneAt: t.doneAt,
    })),
    createdAt: s.createdAt.toISOString(),
  }));

  return successResponse(formatted);
});
