import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
    successResponse,
    errorResponse,
    requireRole,
    requireAuth,
    withErrorHandler,
    validateRequest,
    getPaginationParams,
} from '@/lib/api-utils';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

// ============================================
// GET /api/users - List users
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
    // Allow all authenticated users to search (needed for direct messages)
    const session = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(searchParams);

    const roleFilter = searchParams.get('role');
    const search = searchParams.get('search');
    const excludeSelf = searchParams.get('excludeSelf') !== 'false'; // Default to true for backward compatibility

    const where: any = {};
    const statusFilter = searchParams.get('status'); // 'active', 'inactive', 'all'

    if (roleFilter) {
        if (roleFilter.includes(',')) {
            where.role = { in: roleFilter.split(',') };
        } else {
            where.role = roleFilter;
        }
    }

    if (statusFilter === 'active') {
        where.isActive = true;
    } else if (statusFilter === 'inactive') {
        where.isActive = false;
    }

    if (search) {
        where.OR = [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
        ];
    }

    // Exclude current user from search results (can't message yourself)
    // But managers always see all users including themselves for management purposes
    if (excludeSelf && session.user.role !== 'MANAGER') {
        where.id = { not: session.user.id };
    }
    // If manager, they see all users regardless of excludeSelf parameter

    const [users, total] = await Promise.all([
        prisma.user.findMany({
            where,
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
                lastSignInAt: true,
                lastSignInIp: true,
                lastSignInCountry: true,
                lastConnectedAt: true,
                avatar: true,
                phone: true,
                timezone: true,
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
            orderBy: { name: 'asc' },
            skip,
            take: limit,
        }),
        prisma.user.count({ where }),
    ]);

    return successResponse({
        users,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
    });
});

// ============================================
// POST /api/users - Create user (SDR)
// ============================================

const createUserSchema = z.object({
    name: z.string().min(2, 'Nom requis (min 2 caractères)'),
    email: z.string().email('Email invalide'),
    password: z.string().min(6, 'Mot de passe requis (min 6 caractères)').optional(),
    role: z.enum(['SDR', 'MANAGER', 'CLIENT', 'DEVELOPER', 'BUSINESS_DEVELOPER']).default('SDR'),
    clientId: z.string().optional(),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
    await requireRole(['MANAGER'], request);
    const data = await validateRequest(request, createUserSchema);

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
        where: { email: data.email },
    });

    if (existingUser) {
        return errorResponse('Un utilisateur avec cet email existe déjà', 400);
    }

    // Generate password if not provided
    const password = data.password || Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user and assign default permissions in a transaction
    const result = await prisma.$transaction(async (tx) => {
        // Create the user
        const user = await tx.user.create({
            data: {
                name: data.name,
                email: data.email,
                password: hashedPassword,
                role: data.role,
                isActive: true,
                clientId: data.clientId,
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                isActive: true,
                createdAt: true,
            },
        });

        // Define default permissions for each role
        const ROLE_DEFAULT_PERMISSIONS: Record<string, string[]> = {
            SDR: [
                "pages.dashboard",
                "pages.action",
                "pages.lists",
                "pages.opportunities",
                "pages.settings",
                "pages.email",
                "pages.comms",
                "features.export_data",
                "actions.make_calls",
                "actions.send_emails",
                "actions.send_linkedin",
                "actions.book_meetings",
                "actions.create_opportunity",
                "actions.edit_contacts",
            ],
            BUSINESS_DEVELOPER: [
                "pages.dashboard",
                "pages.action",
                "pages.lists",
                "pages.opportunities",
                "pages.settings",
                "pages.email",
                "pages.comms",
                "pages.portfolio",
                "pages.onboarding",
                "pages.clients",
                "pages.missions",
                "pages.campaigns",
                "pages.projects",
                "features.create_mission",
                "features.edit_mission",
                "features.create_list",
                "features.edit_list",
                "features.import_lists",
                "features.export_data",
                "features.create_campaign",
                "features.edit_campaign",
                "features.create_client",
                "features.edit_client",
                "actions.make_calls",
                "actions.send_emails",
                "actions.send_linkedin",
                "actions.book_meetings",
                "actions.create_opportunity",
                "actions.edit_contacts",
            ],
            MANAGER: [
                "pages.dashboard",
                "pages.clients",
                "pages.missions",
                "pages.campaigns",
                "pages.lists",
                "pages.analytics",
                "pages.planning",
                "pages.files",
                "pages.users",
                "pages.sdrs",
                "pages.projects",
                "pages.settings",
                "pages.email",
                "pages.comms",
                "pages.billing",
                "pages.prospects",
                "features.create_mission",
                "features.edit_mission",
                "features.delete_mission",
                "features.assign_sdr",
                "features.create_list",
                "features.edit_list",
                "features.delete_list",
                "features.import_lists",
                "features.export_data",
                "features.create_campaign",
                "features.edit_campaign",
                "features.delete_campaign",
                "features.create_client",
                "features.edit_client",
                "features.delete_client",
                "features.create_user",
                "features.edit_user",
                "features.delete_user",
                "features.manage_permissions",
                "features.ban_user",
                "features.upload_files",
                "features.delete_files",
                "features.manage_folders",
                "features.create_invoice",
                "features.validate_invoice",
                "features.sync_payments",
                "features.confirm_payment",
                "features.manage_prospect_rules",
                "features.review_prospects",
                "features.configure_prospect_sources",
                "features.activate_prospects",
                "actions.make_calls",
                "actions.send_emails",
                "actions.send_linkedin",
                "actions.book_meetings",
                "actions.create_opportunity",
                "actions.edit_contacts",
            ],
            CLIENT: [
                "pages.dashboard",
                "pages.analytics",
                "pages.files",
            ],
            DEVELOPER: [
                "pages.dashboard",
                "pages.projects",
                "pages.settings",
                "pages.files",
                "features.upload_files",
                "features.manage_folders",
            ],
        };

        // Get default permissions for the role
        const defaultPermissionCodes = ROLE_DEFAULT_PERMISSIONS[data.role] || [];

        if (defaultPermissionCodes.length > 0) {
            // Permission definitions for creating missing permissions
            const PERMISSION_DEFINITIONS: Record<string, { name: string; category: string }> = {
                "pages.dashboard": { name: "Dashboard", category: "pages" },
                "pages.action": { name: "Actions", category: "pages" },
                "pages.lists": { name: "Listes", category: "pages" },
                "pages.opportunities": { name: "Opportunités", category: "pages" },
                "pages.settings": { name: "Paramètres", category: "pages" },
                "pages.email": { name: "Email Hub", category: "pages" },
                "pages.comms": { name: "Messages", category: "pages" },
                "pages.clients": { name: "Clients", category: "pages" },
                "pages.missions": { name: "Missions", category: "pages" },
                "pages.campaigns": { name: "Campagnes", category: "pages" },
                "pages.analytics": { name: "Analytics", category: "pages" },
                "pages.planning": { name: "Planning", category: "pages" },
                "pages.files": { name: "Fichiers", category: "pages" },
                "pages.users": { name: "Utilisateurs", category: "pages" },
                "pages.sdrs": { name: "SDRs", category: "pages" },
                "pages.projects": { name: "Projets", category: "pages" },
                "pages.portfolio": { name: "Portfolio", category: "pages" },
                "pages.onboarding": { name: "Onboarding", category: "pages" },
                "pages.billing": { name: "Facturation", category: "pages" },
                "pages.prospects": { name: "Prospects", category: "pages" },
                "features.export_data": { name: "Exporter données", category: "features" },
                "features.create_mission": { name: "Créer mission", category: "features" },
                "features.edit_mission": { name: "Modifier mission", category: "features" },
                "features.delete_mission": { name: "Supprimer mission", category: "features" },
                "features.assign_sdr": { name: "Assigner SDR", category: "features" },
                "features.create_list": { name: "Créer liste", category: "features" },
                "features.edit_list": { name: "Modifier liste", category: "features" },
                "features.delete_list": { name: "Supprimer liste", category: "features" },
                "features.import_lists": { name: "Importer listes", category: "features" },
                "features.create_campaign": { name: "Créer campagne", category: "features" },
                "features.edit_campaign": { name: "Modifier campagne", category: "features" },
                "features.delete_campaign": { name: "Supprimer campagne", category: "features" },
                "features.create_client": { name: "Créer client", category: "features" },
                "features.edit_client": { name: "Modifier client", category: "features" },
                "features.delete_client": { name: "Supprimer client", category: "features" },
                "features.create_user": { name: "Créer utilisateur", category: "features" },
                "features.edit_user": { name: "Modifier utilisateur", category: "features" },
                "features.delete_user": { name: "Supprimer utilisateur", category: "features" },
                "features.manage_permissions": { name: "Gérer permissions", category: "features" },
                "features.ban_user": { name: "Bannir utilisateur", category: "features" },
                "features.upload_files": { name: "Uploader fichiers", category: "features" },
                "features.delete_files": { name: "Supprimer fichiers", category: "features" },
                "features.manage_folders": { name: "Gérer dossiers", category: "features" },
                "features.create_invoice": { name: "Créer facture", category: "features" },
                "features.validate_invoice": { name: "Valider facture", category: "features" },
                "features.sync_payments": { name: "Synchroniser paiements", category: "features" },
                "features.confirm_payment": { name: "Confirmer paiement", category: "features" },
                "features.manage_prospect_rules": { name: "Gérer règles prospects", category: "features" },
                "features.review_prospects": { name: "Réviser prospects", category: "features" },
                "features.configure_prospect_sources": { name: "Configurer sources prospects", category: "features" },
                "features.activate_prospects": { name: "Activer prospects", category: "features" },
                "actions.make_calls": { name: "Passer appels", category: "actions" },
                "actions.send_emails": { name: "Envoyer emails", category: "actions" },
                "actions.send_linkedin": { name: "Envoyer LinkedIn", category: "actions" },
                "actions.book_meetings": { name: "Réserver RDV", category: "actions" },
                "actions.create_opportunity": { name: "Créer opportunité", category: "actions" },
                "actions.edit_contacts": { name: "Modifier contacts", category: "actions" },
            };

            // Ensure all required permissions exist (batch fetch, then create missing)
            const existingPermissions = await tx.permission.findMany({
                where: { code: { in: defaultPermissionCodes } },
            });
            const permissionMap = new Map<string, string>(
                existingPermissions.map((p) => [p.code, p.id])
            );

            const missingCodes = defaultPermissionCodes.filter((code) => !permissionMap.has(code));
            for (const code of missingCodes) {
                const def = PERMISSION_DEFINITIONS[code];
                if (def) {
                    const permission = await tx.permission.create({
                        data: { code, name: def.name, category: def.category },
                    });
                    permissionMap.set(code, permission.id);
                }
            }

            // Create UserPermission entries for all default role permissions
            const userPermissionsToCreate = Array.from(permissionMap.entries())
                .map(([code, permissionId]) => ({
                    userId: user.id,
                    permissionId,
                    granted: true,
                }));

            if (userPermissionsToCreate.length > 0) {
                await tx.userPermission.createMany({
                    data: userPermissionsToCreate,
                    skipDuplicates: true,
                });
            }
        }

        return user;
    }, {
        timeout: 20000, // 20s for many permissions (e.g. MANAGER)
    });

    return successResponse({
        ...result,
        generatedPassword: !data.password ? password : undefined,
    }, 201);
});
