import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole, successResponse, errorResponse, withErrorHandler } from '@/lib/api-utils';
import { generateApiKey, getAvailableEndpoints, validateRateLimits } from '@/lib/api-keys';
import { READ_SCOPES, allowedEndpointsForScopes } from '@/lib/api-v1/scopes';
import { z } from 'zod';

// ============================================
// API KEY MANAGEMENT ENDPOINTS
// GET  /api/manager/api-keys       - List all API keys
// POST /api/manager/api-keys       - Create new API key
// ============================================

// Schema for creating API key
const createApiKeySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long').trim(),
  role: z.enum(['MANAGER', 'SDR', 'CLIENT', 'DEVELOPER', 'BUSINESS_DEVELOPER', 'COMMERCIAL', 'BOOKER']).default('CLIENT'),
  clientId: z.string().cuid().optional().nullable(),
  missionId: z.string().cuid().optional().nullable(),
  // Legacy keys list endpoints; public API (/api/v1, MCP) keys list read scopes instead.
  allowedEndpoints: z.array(z.string().min(1).max(500)).max(50, 'Too many endpoints').default([]),
  scopes: z.array(z.enum(READ_SCOPES)).max(READ_SCOPES.length).optional(),
  rateLimitPerMinute: z.number().int().min(1).max(1000).default(60),
  rateLimitPerHour: z.number().int().min(1).max(10000).default(3600),
  expiresAt: z.string().datetime().optional().nullable(),
});

// GET /api/manager/api-keys
export const GET = withErrorHandler(async (request: NextRequest) => {
  const session = await requireRole(['MANAGER'], request);

  const keys = await prisma.apiKey.findMany({
    where: {
      // Only show keys created by this manager or their team
      createdById: session.user.id,
    },
    include: {
      client: { select: { id: true, name: true } },
      mission: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      _count: {
        select: { usageLogs: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 100, // Limit results
  });

  // Format for display (don't expose keyHash)
  const formattedKeys = keys.map(key => ({
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    role: key.role,
    client: key.client,
    mission: key.mission,
    allowedEndpoints: key.allowedEndpoints,
    rateLimitPerMinute: key.rateLimitPerMinute,
    rateLimitPerHour: key.rateLimitPerHour,
    isActive: key.isActive,
    lastUsedAt: key.lastUsedAt?.toISOString() || null,
    expiresAt: key.expiresAt?.toISOString() || null,
    createdBy: key.createdBy,
    createdAt: key.createdAt.toISOString(),
    usageCount: key._count.usageLogs,
  }));

  return successResponse(formattedKeys);
});

// POST /api/manager/api-keys
export const POST = withErrorHandler(async (request: NextRequest) => {
  const session = await requireRole(['MANAGER'], request);

  let body;
  try {
    body = await request.json();
  } catch (error) {
    return errorResponse('Invalid JSON in request body', 400);
  }

  // Validate input
  let validated;
  try {
    validated = createApiKeySchema.parse(body);
  } catch (error: any) {
    return errorResponse(error.errors?.[0]?.message || 'Invalid input', 400);
  }

  // Validate rate limits
  const rateLimitValidation = validateRateLimits(
    validated.rateLimitPerMinute,
    validated.rateLimitPerHour
  );
  if (!rateLimitValidation.valid) {
    return errorResponse(rateLimitValidation.error!, 400);
  }

  // Check for duplicate name
  const existingKey = await prisma.apiKey.findFirst({
    where: {
      name: validated.name,
      createdById: session.user.id,
      isActive: true,
    },
  });
  if (existingKey) {
    return errorResponse('An active API key with this name already exists', 409);
  }

  // Validate that client exists if provided
  if (validated.clientId) {
    const client = await prisma.client.findUnique({
      where: { id: validated.clientId },
      select: { id: true },
    });
    if (!client) {
      return errorResponse('Client not found', 404);
    }
  }

  // Validate that mission exists if provided
  if (validated.missionId) {
    const mission = await prisma.mission.findUnique({
      where: { id: validated.missionId },
      select: { id: true },
    });
    if (!mission) {
      return errorResponse('Mission not found', 404);
    }
  }

  // Public API keys (scopes) must be bound to a client: that is the tenant they can read.
  const isV1Key = !!validated.scopes?.length;
  if (isV1Key && !validated.clientId) {
    return errorResponse('clientId is required for keys with scopes (tenant isolation)', 400);
  }
  if (!isV1Key && validated.allowedEndpoints.length === 0) {
    return errorResponse('At least one endpoint (or scope) required', 400);
  }
  const allowedEndpoints = isV1Key ? allowedEndpointsForScopes(validated.scopes!) : validated.allowedEndpoints;

  // Validate endpoints exist and are enabled
  const endpoints = isV1Key ? [] : await prisma.externalEndpoint.findMany({
    where: {
      path: { in: validated.allowedEndpoints },
      isEnabled: true,
    },
    select: { path: true },
  });

  if (!isV1Key && endpoints.length !== validated.allowedEndpoints.length) {
    const validPaths = endpoints.map(e => e.path);
    const invalidPaths = validated.allowedEndpoints.filter(p => !validPaths.includes(p));
    return errorResponse(
      `Invalid or disabled endpoints: ${invalidPaths.join(', ')}`,
      400
    );
  }

  // Generate the API key
  const { fullKey, keyHash, keyPrefix } = generateApiKey();

  // Parse expiration date if provided
  let expiresAt: Date | null = null;
  if (validated.expiresAt) {
    try {
      expiresAt = new Date(validated.expiresAt);
      // Validate it's in the future
      if (expiresAt <= new Date()) {
        return errorResponse('Expiration date must be in the future', 400);
      }
      // Limit to max 5 years
      const maxExpiration = new Date();
      maxExpiration.setFullYear(maxExpiration.getFullYear() + 5);
      if (expiresAt > maxExpiration) {
        return errorResponse('Expiration date cannot be more than 5 years in the future', 400);
      }
    } catch (error) {
      return errorResponse('Invalid expiration date format', 400);
    }
  }

  // Create the record
  const apiKey = await prisma.apiKey.create({
    data: {
      name: validated.name,
      keyHash,
      keyPrefix,
      role: validated.role,
      clientId: validated.clientId || null,
      missionId: validated.missionId || null,
      allowedEndpoints,
      rateLimitPerMinute: validated.rateLimitPerMinute,
      rateLimitPerHour: validated.rateLimitPerHour,
      expiresAt,
      createdById: session.user.id,
    },
  });

  // Return the key (fullKey is shown ONLY ONCE)
  return successResponse({
    id: apiKey.id,
    name: apiKey.name,
    apiKey: fullKey, // NOTE: this is the ONLY time the full key is shown
    keyPrefix: apiKey.keyPrefix,
    role: apiKey.role,
    clientId: apiKey.clientId,
    missionId: apiKey.missionId,
    allowedEndpoints: apiKey.allowedEndpoints,
    rateLimitPerMinute: apiKey.rateLimitPerMinute,
    rateLimitPerHour: apiKey.rateLimitPerHour,
    expiresAt: apiKey.expiresAt?.toISOString() || null,
    createdAt: apiKey.createdAt.toISOString(),
  }, 201);
});
