// ============================================
// PROSPECT SOURCES API
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getBrand } from '@/lib/brand/server';
import { requireRole, withErrorHandler, validateRequest, getPaginationParams, paginatedResponse } from '@/lib/api-utils';
import { z } from 'zod';
import { ProspectSourceType } from '@prisma/client';
import crypto from 'crypto';

// ============================================
// SCHEMAS
// ============================================

const createSourceSchema = z.object({
  name: z.string().min(1, 'Name required'),
  type: z.nativeEnum(ProspectSourceType),
  clientId: z.string().optional(),
  defaultMissionId: z.string().optional(),
  autoActivate: z.boolean().default(false),
  metadata: z.record(z.any()).optional(),
});

// ============================================
// GET /api/prospects/sources
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireRole(['MANAGER'], request);
  const { searchParams } = new URL(request.url);
  const { page, limit, skip } = getPaginationParams(searchParams);

  const type = searchParams.get('type');
  const clientId = searchParams.get('clientId');

  const where: any = {};

  if (type) {
    where.type = type;
  }

  if (clientId) {
    where.clientId = clientId;
  }

  const total = await prisma.prospectSource.count({ where });

  const sources = await prisma.prospectSource.findMany({
    where,
    skip,
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      client: {
        select: {
          id: true,
          name: true,
        },
      },
      defaultMission: {
        select: {
          id: true,
          name: true,
        },
      },
      _count: {
        select: {
          events: true,
        },
      },
    },
  });

  return paginatedResponse(sources, total, page, limit);
});

// ============================================
// POST /api/prospects/sources
// ============================================

export const POST = withErrorHandler(async (request: NextRequest) => {
  await requireRole(['MANAGER'], request);
  const data = await validateRequest(request, createSourceSchema);

  // Generate API key for API sources
  let metadata = data.metadata || {};
  if (data.type === 'API' && !metadata.apiKey) {
    metadata.apiKey = crypto.randomBytes(32).toString('hex');
  }

  // Create source first to get the ID
  const source = await prisma.prospectSource.create({
    data: {
      ...data,
      metadata: metadata as any,
    },
    include: {
      client: {
        select: {
          id: true,
          name: true,
        },
      },
      defaultMission: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  // Generate webhook URL for WEB_FORM sources (after source is created)
  if (source.type === 'WEB_FORM') {
    const webhookUrl = `${(await getBrand()).appUrl}/api/prospects/intake?sourceId=${source.id}`;
    const updatedMetadata = {
      ...((source.metadata as any) || {}),
      webhookUrl,
    };
    
    await prisma.prospectSource.update({
      where: { id: source.id },
      data: { metadata: updatedMetadata as any },
    });
    
    // Update the source object to return
    source.metadata = updatedMetadata as any;
  }

  return NextResponse.json({ success: true, data: source }, { status: 201 });
});
