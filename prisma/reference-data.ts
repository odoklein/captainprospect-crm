// ============================================
// REFERENCE DATA — the rows every instance needs, shared by prisma/seed.ts
// (local demo database) and prisma/seed-instance.ts (fresh white-label
// instance) so the two cannot drift. Every seeder is an idempotent upsert.
// ============================================

import type { PrismaClient, UserRole } from "@prisma/client";

// ============================================
// PERMISSION DEFINITIONS
// ============================================

export interface PermissionDef {
    code: string;
    name: string;
    description: string;
    category: string;
}

export const PERMISSIONS: PermissionDef[] = [
    // Pages - Manager
    { code: "pages.dashboard", name: "Dashboard", description: "Accès au tableau de bord", category: "pages" },
    { code: "pages.clients", name: "Clients", description: "Accès à la gestion des clients", category: "pages" },
    { code: "pages.missions", name: "Missions", description: "Accès à la gestion des missions", category: "pages" },
    { code: "pages.campaigns", name: "Campagnes", description: "Accès à la gestion des campagnes", category: "pages" },
    { code: "pages.lists", name: "Listes", description: "Accès à la gestion des listes", category: "pages" },
    { code: "pages.analytics", name: "Analytics", description: "Accès aux statistiques et analytics", category: "pages" },
    { code: "pages.planning", name: "Planning", description: "Accès au planning des SDRs", category: "pages" },
    { code: "pages.files", name: "Fichiers", description: "Accès à la gestion des fichiers", category: "pages" },
    { code: "pages.users", name: "Utilisateurs", description: "Accès à la gestion des utilisateurs", category: "pages" },
    { code: "pages.sdrs", name: "SDRs", description: "Accès à la liste des SDRs", category: "pages" },
    { code: "pages.projects", name: "Projets", description: "Accès à la gestion des projets", category: "pages" },
    
    // Pages - Email Hub
    { code: "pages.email", name: "Email Hub", description: "Accès au hub email", category: "pages" },
    { code: "pages.comms", name: "Communication", description: "Accès au module de communication", category: "pages" },
    
    // Pages - SDR/BD
    { code: "pages.action", name: "Actions", description: "Accès à la page d'actions SDR", category: "pages" },
    { code: "pages.opportunities", name: "Opportunités", description: "Accès aux opportunités", category: "pages" },
    { code: "pages.settings", name: "Paramètres", description: "Accès aux paramètres personnels", category: "pages" },
    { code: "pages.portfolio", name: "Portfolio", description: "Accès au portfolio BD", category: "pages" },
    { code: "pages.onboarding", name: "Onboarding", description: "Accès à l'onboarding client", category: "pages" },
    
    // Features - Mission Management
    { code: "features.create_mission", name: "Créer mission", description: "Peut créer de nouvelles missions", category: "features" },
    { code: "features.edit_mission", name: "Modifier mission", description: "Peut modifier les missions existantes", category: "features" },
    { code: "features.delete_mission", name: "Supprimer mission", description: "Peut supprimer des missions", category: "features" },
    { code: "features.assign_sdr", name: "Assigner SDR", description: "Peut assigner des SDRs aux missions", category: "features" },
    
    // Features - List Management
    { code: "features.create_list", name: "Créer liste", description: "Peut créer de nouvelles listes", category: "features" },
    { code: "features.edit_list", name: "Modifier liste", description: "Peut modifier les listes existantes", category: "features" },
    { code: "features.delete_list", name: "Supprimer liste", description: "Peut supprimer des listes", category: "features" },
    { code: "features.import_lists", name: "Importer listes", description: "Peut importer des listes CSV/Excel", category: "features" },
    { code: "features.export_data", name: "Exporter données", description: "Peut exporter les données", category: "features" },
    
    // Features - Campaign Management
    { code: "features.create_campaign", name: "Créer campagne", description: "Peut créer de nouvelles campagnes", category: "features" },
    { code: "features.edit_campaign", name: "Modifier campagne", description: "Peut modifier les campagnes", category: "features" },
    { code: "features.delete_campaign", name: "Supprimer campagne", description: "Peut supprimer des campagnes", category: "features" },
    
    // Features - Client Management
    { code: "features.create_client", name: "Créer client", description: "Peut créer de nouveaux clients", category: "features" },
    { code: "features.edit_client", name: "Modifier client", description: "Peut modifier les clients", category: "features" },
    { code: "features.delete_client", name: "Supprimer client", description: "Peut supprimer des clients", category: "features" },
    
    // Features - User Management
    { code: "features.create_user", name: "Créer utilisateur", description: "Peut créer de nouveaux utilisateurs", category: "features" },
    { code: "features.edit_user", name: "Modifier utilisateur", description: "Peut modifier les utilisateurs", category: "features" },
    { code: "features.delete_user", name: "Supprimer utilisateur", description: "Peut supprimer des utilisateurs", category: "features" },
    { code: "features.manage_permissions", name: "Gérer permissions", description: "Peut gérer les permissions des utilisateurs", category: "features" },
    { code: "features.ban_user", name: "Bannir utilisateur", description: "Peut bannir/débannir des utilisateurs", category: "features" },
    
    // Features - File Management
    { code: "features.upload_files", name: "Téléverser fichiers", description: "Peut téléverser des fichiers", category: "features" },
    { code: "features.delete_files", name: "Supprimer fichiers", description: "Peut supprimer des fichiers", category: "features" },
    { code: "features.manage_folders", name: "Gérer dossiers", description: "Peut créer/modifier/supprimer des dossiers", category: "features" },
    
    // Actions - SDR Operations
    { code: "actions.make_calls", name: "Passer appels", description: "Peut effectuer des appels", category: "actions" },
    { code: "actions.send_emails", name: "Envoyer emails", description: "Peut envoyer des emails", category: "actions" },
    { code: "actions.send_linkedin", name: "Envoyer LinkedIn", description: "Peut envoyer des messages LinkedIn", category: "actions" },
    { code: "actions.book_meetings", name: "Réserver RDV", description: "Peut réserver des rendez-vous", category: "actions" },
    { code: "actions.create_opportunity", name: "Créer opportunité", description: "Peut créer des opportunités", category: "actions" },
    { code: "actions.edit_contacts", name: "Modifier contacts", description: "Peut modifier les informations de contact", category: "actions" },
    
    // Billing Module
    { code: "pages.billing", name: "Facturation", description: "Accès à la gestion de la facturation", category: "pages" },
    { code: "features.create_invoice", name: "Créer facture", description: "Peut créer de nouvelles factures", category: "features" },
    { code: "features.validate_invoice", name: "Valider facture", description: "Peut valider et générer des factures", category: "features" },
    { code: "features.sync_payments", name: "Synchroniser paiements", description: "Peut synchroniser les paiements Qonto", category: "features" },
    { code: "features.confirm_payment", name: "Confirmer paiement", description: "Peut confirmer les paiements détectés", category: "features" },
    
    // Prospect Orchestration Engine
    { code: "pages.prospects", name: "Prospects", description: "Accès à la gestion des prospects", category: "pages" },
    { code: "features.manage_prospect_rules", name: "Gérer règles prospects", description: "Peut créer et modifier les règles de prospects", category: "features" },
    { code: "features.review_prospects", name: "Réviser prospects", description: "Peut approuver ou rejeter les prospects", category: "features" },
    { code: "features.configure_prospect_sources", name: "Configurer sources prospects", description: "Peut configurer les sources de prospects", category: "features" },
    { code: "features.activate_prospects", name: "Activer prospects", description: "Peut activer manuellement les prospects", category: "features" },

    // Support Technique — development tickets
    { code: "pages.tickets", name: "Support technique", description: "Accès aux tickets de développement", category: "pages" },
    { code: "pages.client_roadmap", name: "Roadmap client", description: "Accès à la roadmap et aux nouveautés côté client", category: "pages" },
    { code: "features.create_ticket", name: "Créer ticket", description: "Peut créer des tickets de développement", category: "features" },
    { code: "features.assign_ticket", name: "Assigner ticket", description: "Peut assigner un ticket à un développeur", category: "features" },
    { code: "features.publish_ticket_roadmap", name: "Publier sur la roadmap", description: "Peut publier un ticket sur la roadmap client", category: "features" },
    { code: "features.delete_ticket", name: "Supprimer ticket", description: "Peut supprimer un ticket", category: "features" },

    // HR module (/manager/rh)
    { code: "pages.hr", name: "Page RH", description: "Accès à la gestion RH et tableau de bord de l'équipe", category: "pages" },
    { code: "features.hr_view", name: "Consulter les données RH", description: "Consulter le tableau mensuel et les métriques de l'équipe", category: "features" },
    { code: "features.hr_configure", name: "Configurer les profils RH", description: "Modifier le salaire fixe, le quota et la prime variable", category: "features" },
    { code: "features.hr_calculate", name: "Calculer les mois RH", description: "Calculer ou recalculer les montants dus pour un mois", category: "features" },
    { code: "features.hr_validate", name: "Valider les mois RH", description: "Valider et verrouiller un mois RH", category: "features" },
    { code: "features.hr_day_decision", name: "Décider sur journées sous quota", description: "Marquer payé ou non payé avec motif", category: "features" },
    { code: "features.hr_reopen", name: "Réouvrir un mois RH", description: "Déverrouiller un mois précédemment validé", category: "features" },
];

// Role-based default permissions
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
    MANAGER: [
        // Full access to all pages
        "pages.dashboard", "pages.clients", "pages.missions", "pages.campaigns", 
        "pages.lists", "pages.analytics", "pages.planning", "pages.files", 
        "pages.users", "pages.sdrs", "pages.projects", "pages.settings", "pages.email", "pages.comms",
        // Full access to all features
        "features.create_mission", "features.edit_mission", "features.delete_mission", "features.assign_sdr",
        "features.create_list", "features.edit_list", "features.delete_list", "features.import_lists", "features.export_data",
        "features.create_campaign", "features.edit_campaign", "features.delete_campaign",
        "features.create_client", "features.edit_client", "features.delete_client",
        "features.create_user", "features.edit_user", "features.delete_user", "features.manage_permissions", "features.ban_user",
        "features.upload_files", "features.delete_files", "features.manage_folders",
        // Billing features
        "pages.billing", "features.create_invoice", "features.validate_invoice", "features.sync_payments", "features.confirm_payment",
        // Prospect Orchestration Engine
        "pages.prospects", "features.manage_prospect_rules", "features.review_prospects",
        "features.configure_prospect_sources", "features.activate_prospects",
        // Support Technique
        "pages.tickets", "features.create_ticket", "features.assign_ticket",
        "features.publish_ticket_roadmap", "features.delete_ticket",
        // HR module
        "pages.hr", "features.hr_view", "features.hr_configure", "features.hr_calculate",
        "features.hr_validate", "features.hr_day_decision", "features.hr_reopen",
        // All actions
        "actions.make_calls", "actions.send_emails", "actions.send_linkedin", 
        "actions.book_meetings", "actions.create_opportunity", "actions.edit_contacts",
    ],
    SDR: [
        // Limited pages
        "pages.dashboard", "pages.action", "pages.lists", "pages.opportunities", "pages.settings", "pages.email", "pages.comms",
        // Limited features
        "features.export_data",
        // SDR actions
        "actions.make_calls", "actions.send_emails", "actions.send_linkedin", 
        "actions.book_meetings", "actions.create_opportunity", "actions.edit_contacts",
    ],
    BOOKER: [
        // Same as SDR: lists, action, callbacks, meetings
        "pages.dashboard", "pages.action", "pages.lists", "pages.opportunities", "pages.settings",
        "features.export_data",
        "actions.make_calls", "actions.send_emails", "actions.send_linkedin",
        "actions.book_meetings", "actions.create_opportunity", "actions.edit_contacts",
    ],
    COMMERCIAL: [
        // Client portal: meetings, contacts, settings (access enforced by route/session)
        "pages.dashboard",
    ],
    BUSINESS_DEVELOPER: [
        // BD pages (superset of SDR)
        "pages.dashboard", "pages.action", "pages.lists", "pages.opportunities", "pages.settings", "pages.email", "pages.comms",
        "pages.portfolio", "pages.onboarding", "pages.clients", "pages.missions", "pages.campaigns", "pages.projects",
        // BD features
        "features.create_mission", "features.edit_mission",
        "features.create_list", "features.edit_list", "features.import_lists", "features.export_data",
        "features.create_campaign", "features.edit_campaign",
        "features.create_client", "features.edit_client",
        // All actions
        "actions.make_calls", "actions.send_emails", "actions.send_linkedin", 
        "actions.book_meetings", "actions.create_opportunity", "actions.edit_contacts",
    ],
    CLIENT: [
        // Client pages only
        "pages.dashboard", "pages.analytics", "pages.files",
        // Read-only roadmap + changelog (no access to the internal ticket board)
        "pages.client_roadmap",
        // No features
        // No actions
    ],
    DEVELOPER: [
        // Developer pages
        "pages.dashboard", "pages.projects", "pages.settings", "pages.files", "pages.comms",
        "pages.tickets",
        // Developer features
        "features.upload_files", "features.manage_folders",
        // No actions
    ],
};

export async function seedPermissions(prisma: PrismaClient) {
    console.log("\n📋 Seeding permissions...");
    
    // Create all permissions
    for (const perm of PERMISSIONS) {
        await prisma.permission.upsert({
            where: { code: perm.code },
            update: {
                name: perm.name,
                description: perm.description,
                category: perm.category,
            },
            create: perm,
        });
    }
    console.log(`✅ Created ${PERMISSIONS.length} permissions`);
    
    // Create role permissions
    let rolePermCount = 0;
    for (const [role, permCodes] of Object.entries(ROLE_PERMISSIONS)) {
        for (const code of permCodes) {
            const permission = await prisma.permission.findUnique({ where: { code } });
            if (permission) {
                await prisma.rolePermission.upsert({
                    where: {
                        role_permissionId: {
                            role: role as UserRole,
                            permissionId: permission.id,
                        },
                    },
                    update: { granted: true },
                    create: {
                        role: role as UserRole,
                        permissionId: permission.id,
                        granted: true,
                    },
                });
                rolePermCount++;
            }
        }
    }
    console.log(`✅ Created ${rolePermCount} role-permission mappings`);
}

// GLOBAL action status definitions (mirrors current ActionResult enum + workflow behavior)
export const RESULT_CATEGORY_MAP: Record<string, string> = {
    NO_RESPONSE: "NO_RESPONSE",
    BAD_CONTACT: "OTHER",
    BARRAGE_STANDARD: "OTHER",
    NUMERO_KO: "OTHER",
    INTERESTED: "INTERESTED",
    CALLBACK_REQUESTED: "CALLBACK_REQUESTED",
    MEETING_BOOKED: "MEETING_BOOKED",
    MEETING_CANCELLED: "OTHER",
    INVALIDE: "OTHER",
    DISQUALIFIED: "DISQUALIFIED",
    ENVOIE_MAIL: "OTHER",
    CONNECTION_SENT: "OTHER",
    MESSAGE_SENT: "OTHER",
    REPLIED: "OTHER",
    NOT_INTERESTED: "OTHER",
    REFUS: "DISQUALIFIED",
    REFUS_ARGU: "DISQUALIFIED",
    REFUS_CATEGORIQUE: "DISQUALIFIED",
    RELANCE: "CALLBACK_REQUESTED",
    RAPPEL: "CALLBACK_REQUESTED",
    GERE_PAR_SIEGE: "OTHER",
    FAUX_NUMERO: "OTHER",
    PROJET_A_SUIVRE: "INTERESTED",
    MAUVAIS_INTERLOCUTEUR: "OTHER",
    MAIL_UNIQUEMENT: "OTHER",
    BARRAGE_SECRETAIRE: "OTHER",
    MAIL_DOC: "OTHER",
    HORS_CIBLE: "DISQUALIFIED",
};

export const GLOBAL_STATUS_DEFINITIONS = [
    { code: "NO_RESPONSE", label: "Pas de réponse", sortOrder: 1, requiresNote: false, priorityLabel: "RETRY" as const, priorityOrder: 4, triggersOpportunity: false, triggersCallback: false },
    { code: "BAD_CONTACT", label: "Standard / Mauvais contact", sortOrder: 2, requiresNote: false, priorityLabel: "SKIP" as const, priorityOrder: 999, triggersOpportunity: false, triggersCallback: false },
    { code: "BARRAGE_STANDARD", label: "Barrage standard", sortOrder: 3, requiresNote: false, priorityLabel: "SKIP" as const, priorityOrder: 999, triggersOpportunity: false, triggersCallback: false },
    { code: "NUMERO_KO", label: "NUMERO KO", sortOrder: 4, requiresNote: false, priorityLabel: "SKIP" as const, priorityOrder: 999, triggersOpportunity: false, triggersCallback: false },
    { code: "INTERESTED", label: "Intéressé", sortOrder: 5, requiresNote: true, priorityLabel: "FOLLOW_UP" as const, priorityOrder: 2, triggersOpportunity: true, triggersCallback: false },
    { code: "CALLBACK_REQUESTED", label: "Rappel demandé", sortOrder: 6, requiresNote: true, priorityLabel: "CALLBACK" as const, priorityOrder: 1, triggersOpportunity: false, triggersCallback: true },
    { code: "MEETING_BOOKED", label: "Meeting booké", sortOrder: 7, requiresNote: false, priorityLabel: "SKIP" as const, priorityOrder: 999, triggersOpportunity: true, triggersCallback: false },
    { code: "MEETING_CANCELLED", label: "Meeting annulé", sortOrder: 8, requiresNote: false, priorityLabel: "RETRY" as const, priorityOrder: 4, triggersOpportunity: false, triggersCallback: false },
    { code: "INVALIDE", label: "Invalide", sortOrder: 9, requiresNote: false, priorityLabel: "RETRY" as const, priorityOrder: 4, triggersOpportunity: false, triggersCallback: false },
    { code: "DISQUALIFIED", label: "Disqualifié", sortOrder: 10, requiresNote: false, priorityLabel: "SKIP" as const, priorityOrder: 999, triggersOpportunity: false, triggersCallback: false },
    { code: "ENVOIE_MAIL", label: "Envoie mail", sortOrder: 11, requiresNote: true, priorityLabel: "SKIP" as const, priorityOrder: 999, triggersOpportunity: false, triggersCallback: false },
    { code: "REFUS", label: "Refus", sortOrder: 12, requiresNote: false, priorityLabel: "SKIP" as const, priorityOrder: 999, triggersOpportunity: false, triggersCallback: false },
    { code: "REFUS_ARGU", label: "Refus argu", sortOrder: 13, requiresNote: false, priorityLabel: "SKIP" as const, priorityOrder: 999, triggersOpportunity: false, triggersCallback: false },
    { code: "REFUS_CATEGORIQUE", label: "Refus catégorique", sortOrder: 14, requiresNote: false, priorityLabel: "SKIP" as const, priorityOrder: 999, triggersOpportunity: false, triggersCallback: false },
    { code: "RELANCE", label: "Relance", sortOrder: 15, requiresNote: true, priorityLabel: "CALLBACK" as const, priorityOrder: 1, triggersOpportunity: false, triggersCallback: true },
    { code: "RAPPEL", label: "Rappel", sortOrder: 16, requiresNote: true, priorityLabel: "CALLBACK" as const, priorityOrder: 1, triggersOpportunity: false, triggersCallback: true },
    { code: "GERE_PAR_SIEGE", label: "Géré par le siège", sortOrder: 17, requiresNote: false, priorityLabel: "SKIP" as const, priorityOrder: 999, triggersOpportunity: false, triggersCallback: false },
    { code: "FAUX_NUMERO", label: "Faux numéro", sortOrder: 18, requiresNote: false, priorityLabel: "SKIP" as const, priorityOrder: 999, triggersOpportunity: false, triggersCallback: false },
    { code: "PROJET_A_SUIVRE", label: "Projet à suivre", sortOrder: 19, requiresNote: true, priorityLabel: "FOLLOW_UP" as const, priorityOrder: 2, triggersOpportunity: true, triggersCallback: false },
    { code: "MAUVAIS_INTERLOCUTEUR", label: "Mauvais interlocuteur", sortOrder: 20, requiresNote: false, priorityLabel: "SKIP" as const, priorityOrder: 999, triggersOpportunity: false, triggersCallback: false },
    { code: "MAIL_UNIQUEMENT", label: "Mail uniquement", sortOrder: 21, requiresNote: false, priorityLabel: "SKIP" as const, priorityOrder: 999, triggersOpportunity: false, triggersCallback: false },
    { code: "BARRAGE_SECRETAIRE", label: "Barrage secrétaire", sortOrder: 22, requiresNote: false, priorityLabel: "SKIP" as const, priorityOrder: 999, triggersOpportunity: false, triggersCallback: false },
    { code: "MAIL_DOC", label: "Mail doc", sortOrder: 23, requiresNote: true, priorityLabel: "SKIP" as const, priorityOrder: 999, triggersOpportunity: false, triggersCallback: false },
    { code: "HORS_CIBLE", label: "Hors cible", sortOrder: 24, requiresNote: false, priorityLabel: "SKIP" as const, priorityOrder: 999, triggersOpportunity: false, triggersCallback: false },
];

export const RESULT_CATEGORIES = [
    { code: "MEETING_BOOKED", label: "RDV pris", color: "#059669", sortOrder: 1, description: "Rendez-vous obtenu" },
    { code: "CALLBACK_REQUESTED", label: "Rappel demandé", color: "#d97706", sortOrder: 2, description: "Le contact a demandé un rappel" },
    { code: "INTERESTED", label: "Intéressé", color: "#4f46e5", sortOrder: 3, description: "Contact intéressé, à suivre" },
    { code: "NO_RESPONSE", label: "Pas de réponse", color: "#64748b", sortOrder: 4, description: "Aucune réponse obtenue" },
    { code: "DISQUALIFIED", label: "Disqualifié", color: "#dc2626", sortOrder: 5, description: "Contact ou lead disqualifié" },
    { code: "OTHER", label: "Autre", color: "#94a3b8", sortOrder: 99, description: "Autres résultats" },
];

export async function seedResultCategories(prisma: PrismaClient) {
    for (const cat of RESULT_CATEGORIES) {
        await prisma.resultCategory.upsert({
            where: { code: cat.code },
            update: { label: cat.label, color: cat.color, sortOrder: cat.sortOrder, description: cat.description ?? null },
            create: { code: cat.code, label: cat.label, color: cat.color, sortOrder: cat.sortOrder, description: cat.description ?? null },
        });
    }
    console.log("✅ Seeded result categories");
}

export async function seedActionStatusDefinitions(prisma: PrismaClient) {
    for (const def of GLOBAL_STATUS_DEFINITIONS) {
        const resultCategoryCode = RESULT_CATEGORY_MAP[def.code] ?? "OTHER";
        await prisma.actionStatusDefinition.upsert({
            where: {
                scopeType_scopeId_code: {
                    scopeType: "GLOBAL",
                    scopeId: "",
                    code: def.code,
                },
            },
            update: {
                label: def.label,
                sortOrder: def.sortOrder,
                requiresNote: def.requiresNote,
                priorityLabel: def.priorityLabel,
                priorityOrder: def.priorityOrder,
                triggersOpportunity: def.triggersOpportunity,
                triggersCallback: def.triggersCallback,
                resultCategoryCode,
                isActive: true,
            },
            create: {
                scopeType: "GLOBAL",
                scopeId: "",
                code: def.code,
                label: def.label,
                sortOrder: def.sortOrder,
                requiresNote: def.requiresNote,
                priorityLabel: def.priorityLabel,
                priorityOrder: def.priorityOrder,
                triggersOpportunity: def.triggersOpportunity,
                triggersCallback: def.triggersCallback,
                resultCategoryCode,
                isActive: true,
            },
        });
    }
    console.log("✅ Seeded GLOBAL action status definitions");
}

// External API endpoint registry (manager API management page).
export const EXTERNAL_ENDPOINTS = [
    {
        path: "/api/stats",
        name: "Dashboard Statistics",
        description: "Get comprehensive dashboard statistics including actions, meetings, conversion rates, and performance metrics",
        methods: ["GET"],
        minRole: "MANAGER" as UserRole,
        supportsClientScope: true,
        supportsMissionScope: true,
        isEnabled: true,
        defaultRateLimitPerMinute: 60,
        defaultRateLimitPerHour: 1000,
    },
    {
        path: "/api/stats/missions-summary",
        name: "Missions Summary",
        description: "Get a summary of all active missions with activity metrics and performance data",
        methods: ["GET"],
        minRole: "MANAGER" as UserRole,
        supportsClientScope: true,
        supportsMissionScope: false,
        isEnabled: true,
        defaultRateLimitPerMinute: 60,
        defaultRateLimitPerHour: 1000,
    },
    {
        path: "/api/prospects/intake",
        name: "Prospect Intake",
        description: "Submit new prospects for processing and enrichment",
        methods: ["POST"],
        minRole: "CLIENT" as UserRole,
        supportsClientScope: true,
        supportsMissionScope: true,
        isEnabled: true,
        defaultRateLimitPerMinute: 30,
        defaultRateLimitPerHour: 500,
    },
    {
        path: "/api/prospects",
        name: "Prospects List",
        description: "Get a list of prospects with filtering and pagination",
        methods: ["GET"],
        minRole: "SDR" as UserRole,
        supportsClientScope: true,
        supportsMissionScope: true,
        isEnabled: true,
        defaultRateLimitPerMinute: 60,
        defaultRateLimitPerHour: 1000,
    },
    {
        path: "/api/meetings",
        name: "Meetings",
        description: "Get scheduled meetings and calendar data",
        methods: ["GET"],
        minRole: "SDR" as UserRole,
        supportsClientScope: true,
        supportsMissionScope: true,
        isEnabled: true,
        defaultRateLimitPerMinute: 60,
        defaultRateLimitPerHour: 1000,
    },
    {
        path: "/api/activities",
        name: "Activities",
        description: "Get activity logs and interaction history",
        methods: ["GET"],
        minRole: "SDR" as UserRole,
        supportsClientScope: true,
        supportsMissionScope: true,
        isEnabled: true,
        defaultRateLimitPerMinute: 60,
        defaultRateLimitPerHour: 1000,
    },
];

export async function seedExternalEndpoints(prisma: PrismaClient) {
    for (const endpoint of EXTERNAL_ENDPOINTS) {
        await prisma.externalEndpoint.upsert({
            where: { path: endpoint.path },
            update: endpoint,
            create: endpoint,
        });
    }
    console.log(`✅ Seeded ${EXTERNAL_ENDPOINTS.length} external endpoints`);
}
