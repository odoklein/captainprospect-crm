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
import bcrypt from 'bcryptjs';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';

// ============================================
// GET /api/users/[id] - Get user details
// ============================================

export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    await requireRole(['MANAGER'], request);
    const { id } = await params;

    const user = await prisma.user.findUnique({
        where: { id },
        select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            alloPhoneNumber: true,
            createdAt: true,
            updatedAt: true,
            lastSignInAt: true,
            lastSignInIp: true,
            lastSignInCountry: true,
            lastConnectedAt: true,
            preferences: true,
            clientId: true,
            client: {
                select: {
                    id: true,
                    name: true,
                },
            },
            _count: {
                select: {
                    assignedMissions: true,
                    actions: true,
                },
            },
        },
    });

    if (!user) {
        return errorResponse('Utilisateur non trouvé', 404);
    }

    // Get user's permission overrides
    const userPermissions = await prisma.userPermission.findMany({
        where: { userId: id },
        include: {
            permission: true,
        },
    });

    return successResponse({
        ...user,
        permissionOverrides: userPermissions.map(up => ({
            code: up.permission.code,
            name: up.permission.name,
            granted: up.granted,
        })),
    });
});

// ============================================
// PUT /api/users/[id] - Update user
// ============================================

const updateUserSchema = z.object({
    name: z.string().min(2).optional(),
    email: z.string().email().optional(),
    role: z.enum(['SDR', 'MANAGER', 'CLIENT', 'DEVELOPER', 'BUSINESS_DEVELOPER']).optional(),
    password: z.string().min(6).optional(),
    clientId: z.string().nullable().optional(),
    alloPhoneNumber: z.string().nullable().optional(),
    preferences: z
        .object({
            sdrFeedback: z
                .object({
                    promptTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
                    requiredDaily: z.boolean().optional(),
                })
                .optional(),
        })
        .optional(),
});

export const PUT = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireRole(['MANAGER'], request);
    const { id } = await params;
    const data = await validateRequest(request, updateUserSchema);

    // Check user exists
    const existingUser = await prisma.user.findUnique({
        where: { id },
        select: {
            id: true,
            email: true,
            name: true,
            role: true,
            clientId: true,
            alloPhoneNumber: true,
            preferences: true,
        },
    });

    if (!existingUser) {
        return errorResponse('Utilisateur non trouvé', 404);
    }

    // Check email uniqueness if changing
    if (data.email && data.email !== existingUser.email) {
        const emailExists = await prisma.user.findUnique({
            where: { email: data.email },
        });
        if (emailExists) {
            return errorResponse('Cet email est déjà utilisé', 400);
        }
    }

    // Prepare update data
    const updateData: any = {};
    if (data.name) updateData.name = data.name;
    if (data.email) updateData.email = data.email;
    if (data.role) updateData.role = data.role;
    if (data.clientId !== undefined) updateData.clientId = data.clientId;
    if (data.alloPhoneNumber !== undefined) {
        updateData.alloPhoneNumber = data.alloPhoneNumber?.trim() || null;
    }
    if (data.password) {
        updateData.password = await bcrypt.hash(data.password, 10);
    }
    if (data.preferences?.sdrFeedback !== undefined) {
        const currentPrefs = (existingUser.preferences as Record<string, unknown> | null) ?? {};
        const currentSdrFeedback =
            (currentPrefs.sdrFeedback as Record<string, unknown> | undefined) ?? {};
        updateData.preferences = {
            ...currentPrefs,
            sdrFeedback: {
                ...currentSdrFeedback,
                ...data.preferences.sdrFeedback,
            },
        };
    }

    const updatedUser = await prisma.user.update({
        where: { id },
        data: updateData,
        select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            alloPhoneNumber: true,
            preferences: true,
            clientId: true,
            createdAt: true,
            updatedAt: true,
        },
    });

    // Audit: a role change is its own action (it's the privilege-escalation event
    // worth filtering for); everything else collapses into one UPDATE. Passwords
    // are never logged — only a passwordChanged flag.
    if (data.role && data.role !== existingUser.role) {
        audit(request, session, {
            action: AUDIT_ACTIONS.ROLE_CHANGE,
            entityType: 'User',
            entityId: id,
            summary: `Rôle de ${updatedUser.name} : ${existingUser.role} → ${updatedUser.role}`,
            before: { role: existingUser.role },
            after: { role: updatedUser.role },
        });
    }

    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    if (data.name && data.name !== existingUser.name) {
        before.name = existingUser.name;
        after.name = updatedUser.name;
    }
    if (data.email && data.email !== existingUser.email) {
        before.email = existingUser.email;
        after.email = updatedUser.email;
    }
    if (data.clientId !== undefined && data.clientId !== existingUser.clientId) {
        before.clientId = existingUser.clientId;
        after.clientId = updatedUser.clientId;
    }
    if (data.alloPhoneNumber !== undefined && updatedUser.alloPhoneNumber !== existingUser.alloPhoneNumber) {
        before.alloPhoneNumber = existingUser.alloPhoneNumber;
        after.alloPhoneNumber = updatedUser.alloPhoneNumber;
    }
    const passwordChanged = !!data.password;
    // The profile form re-sends preferences on every save — only count a real change.
    const preferencesChanged =
        data.preferences !== undefined &&
        JSON.stringify(existingUser.preferences ?? null) !== JSON.stringify(updatedUser.preferences ?? null);
    if (Object.keys(after).length > 0 || passwordChanged || preferencesChanged) {
        audit(request, session, {
            action: AUDIT_ACTIONS.UPDATE,
            entityType: 'User',
            entityId: id,
            summary: `Profil de ${updatedUser.name} modifié`,
            before: Object.keys(before).length > 0 ? before : undefined,
            after: Object.keys(after).length > 0 ? after : undefined,
            metadata: { passwordChanged, preferencesChanged },
        });
    }

    return successResponse(updatedUser);
});

// ============================================
// DELETE /api/users/[id] - Delete user
// ============================================

export const DELETE = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireRole(['MANAGER'], request);
    const { id } = await params;

    // Prevent self-deletion
    if (session.user.id === id) {
        return errorResponse('Vous ne pouvez pas supprimer votre propre compte', 400);
    }

    // Check user exists
    const user = await prisma.user.findUnique({
        where: { id },
        select: { id: true, role: true, name: true, email: true },
    });

    if (!user) {
        return errorResponse('Utilisateur non trouvé', 404);
    }

    // Prevent deleting other managers
    if (user.role === 'MANAGER') {
        return errorResponse('Impossible de supprimer un compte manager', 400);
    }

    await prisma.user.delete({
        where: { id },
    });

    audit(request, session, {
        action: AUDIT_ACTIONS.DELETE,
        entityType: 'User',
        entityId: id,
        summary: `Utilisateur "${user.name}" (${user.role}) supprimé`,
        before: { name: user.name, email: user.email, role: user.role },
    });

    return successResponse({
        message: `Utilisateur "${user.name}" supprimé`,
    });
});
