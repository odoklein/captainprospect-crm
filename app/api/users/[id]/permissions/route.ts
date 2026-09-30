import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
    successResponse,
    errorResponse,
    requireAuth,
    requireRole,
    withErrorHandler,
    validateRequest,
} from '@/lib/api-utils';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';

// ============================================
// GET /api/users/[id]/permissions - Get user's effective permissions
// ============================================

export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireAuth(request);
    const { id } = await params;
    
    // Users can only fetch their own permissions, unless they're a manager
    if (session.user.id !== id && session.user.role !== 'MANAGER') {
        return errorResponse('Non autorisé', 403);
    }

    // Get the user with their role
    const user = await prisma.user.findUnique({
        where: { id },
        select: { id: true, role: true, isActive: true },
    });

    if (!user) {
        return errorResponse('Utilisateur non trouvé', 404);
    }

    // Get role-based permissions
    const rolePermissions = await prisma.rolePermission.findMany({
        where: {
            role: user.role,
            granted: true,
        },
        include: {
            permission: true,
        },
    });

    // Get user-specific permission overrides
    const userPermissions = await prisma.userPermission.findMany({
        where: { userId: id },
        include: {
            permission: true,
        },
    });

    // Build effective permissions set
    // Start with role permissions
    const effectivePermissions = new Set<string>(
        rolePermissions.map(rp => rp.permission.code)
    );

    // Apply user-specific overrides
    for (const up of userPermissions) {
        if (up.granted) {
            effectivePermissions.add(up.permission.code);
        } else {
            effectivePermissions.delete(up.permission.code);
        }
    }

    // Return as array for JSON serialization
    return successResponse(Array.from(effectivePermissions));
});

// ============================================
// PUT /api/users/[id]/permissions - Update user's permissions
// ============================================

const updatePermissionsSchema = z.object({
    permissions: z.array(z.object({
        code: z.string(),
        granted: z.boolean(),
    })),
});

export const PUT = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireRole(['MANAGER'], request);
    const { id } = await params;
    const data = await validateRequest(request, updatePermissionsSchema);

    // Check user exists
    const user = await prisma.user.findUnique({
        where: { id },
        select: { id: true, role: true, name: true },
    });

    if (!user) {
        return errorResponse('Utilisateur non trouvé', 404);
    }

    // Get all permissions to validate codes
    const allPermissions = await prisma.permission.findMany();
    const permissionMap = new Map(allPermissions.map(p => [p.code, p.id]));

    // Get role default permissions
    const rolePermissions = await prisma.rolePermission.findMany({
        where: { role: user.role, granted: true },
        include: { permission: true },
    });
    const rolePermissionCodes = new Set(rolePermissions.map(rp => rp.permission.code));

    // Effective permissions BEFORE this change, so the audit entry can record
    // exactly which codes were gained/lost.
    const existingOverrides = await prisma.userPermission.findMany({
        where: { userId: id },
        include: { permission: true },
    });
    const effectiveBefore = new Set<string>(rolePermissionCodes);
    for (const up of existingOverrides) {
        if (up.granted) effectiveBefore.add(up.permission.code);
        else effectiveBefore.delete(up.permission.code);
    }

    // Process each permission update
    const operations = [];
    
    for (const { code, granted } of data.permissions) {
        const permissionId = permissionMap.get(code);
        if (!permissionId) continue;

        const isRoleDefault = rolePermissionCodes.has(code);

        if (granted === isRoleDefault) {
            // Remove override if it matches role default
            operations.push(
                prisma.userPermission.deleteMany({
                    where: { userId: id, permissionId },
                })
            );
        } else {
            // Create or update override
            operations.push(
                prisma.userPermission.upsert({
                    where: {
                        userId_permissionId: { userId: id, permissionId },
                    },
                    update: { granted },
                    create: { userId: id, permissionId, granted },
                })
            );
        }
    }

    await prisma.$transaction(operations);

    // Return updated effective permissions
    const updatedRolePerms = await prisma.rolePermission.findMany({
        where: { role: user.role, granted: true },
        include: { permission: true },
    });

    const updatedUserPerms = await prisma.userPermission.findMany({
        where: { userId: id },
        include: { permission: true },
    });

    const effectivePermissions = new Set<string>(
        updatedRolePerms.map(rp => rp.permission.code)
    );

    for (const up of updatedUserPerms) {
        if (up.granted) {
            effectivePermissions.add(up.permission.code);
        } else {
            effectivePermissions.delete(up.permission.code);
        }
    }

    const granted = [...effectivePermissions].filter(c => !effectiveBefore.has(c));
    const revoked = [...effectiveBefore].filter(c => !effectivePermissions.has(c));
    if (granted.length > 0 || revoked.length > 0) {
        audit(request, session, {
            action: AUDIT_ACTIONS.PERMISSION_CHANGE,
            entityType: 'User',
            entityId: id,
            summary: `Permissions de ${user.name} : +${granted.length} / −${revoked.length}`,
            before: { permissions: [...effectiveBefore].sort() },
            after: { permissions: [...effectivePermissions].sort() },
            metadata: { granted, revoked },
        });
    }

    return successResponse({
        message: 'Permissions mises à jour',
        permissions: Array.from(effectivePermissions),
    });
});
