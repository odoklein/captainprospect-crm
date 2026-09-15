/**
 * Accès — the credential vault, expressed as tools.
 *
 * The work happens in `lib/vault`, which the Coffre d'accès page also calls, so
 * an access created by chat and one created by hand are the same row with the
 * same audit trail. This file is only the model-facing contract.
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { VaultCredentialType } from "@prisma/client";
import {
    createCredential,
    deleteCredential,
    generateStrongPassword,
    listCredentials,
    listVaultAudit,
    revealCredential,
    rotateCredential,
} from "@/lib/vault/service";
import {
    createPortalAccountForInterlocuteur,
    primaryEmailOf,
    proposeEmailAddresses,
} from "@/lib/vault/portalAccounts";
import { sendCredentialsEmail } from "@/lib/vault/credentialsEmail";
import { VAULT_TYPE_LABELS } from "@/lib/vault/types";
import { requireProject } from "../context";
import {
    defineConfirmTool,
    defineReadTool,
    defineSafeWriteTool,
    NO_PARAMS,
    params,
} from "../helpers";

const credentialType = z.enum([
    "PORTAL",
    "EMAIL",
    "CALENDAR",
    "CRM_EXTERNAL",
    "LINKEDIN",
    "PHONE_TOOL",
    "OTHER",
]);

const TYPE_VALUES = [
    "PORTAL",
    "EMAIL",
    "CALENDAR",
    "CRM_EXTERNAL",
    "LINKEDIN",
    "PHONE_TOOL",
    "OTHER",
];

/**
 * Loads a credential and proves it belongs to the bound project.
 *
 * Every confirm tool below starts here: an id the model produced is not
 * evidence of anything until the row's own clientId matches the binding.
 */
async function requireProjectCredential(credentialId: string, clientId: string) {
    const credential = await prisma.vaultCredential.findUnique({
        where: { id: credentialId },
        select: {
            id: true,
            label: true,
            login: true,
            clientId: true,
            userId: true,
            lastSentAt: true,
            lastSentTo: true,
            client: { select: { name: true } },
            user: { select: { email: true } },
        },
    });
    if (!credential) throw new Error("Accès introuvable");
    if (credential.clientId !== clientId) {
        throw new Error("Cet accès n'appartient pas au projet actif.");
    }
    return credential;
}

// ============================================
// READS
// ============================================

export const listProjectCredentials = defineReadTool({
    name: "list_credentials",
    label: "Accès enregistrés",
    description:
        "Les accès stockés dans le coffre pour le projet actif : libellé, type, identifiant, propriétaire, dernière consultation. Ne renvoie JAMAIS de mot de passe, seulement hasPassword.",
    parameters: params({
        type: { type: "string", enum: TYPE_VALUES },
        search: { type: "string", description: "Texte libre sur le libellé ou l'identifiant" },
    }),
    schema: z.object({ type: credentialType.optional(), search: z.string().max(120).optional() }),
    execute: async (args, ctx) => {
        const project = requireProject(ctx);
        // Client-wide on purpose, even when a mission is bound: a portal account
        // is filed under the client and would vanish from a mission-only list.
        const credentials = await listCredentials({
            clientId: project.clientId,
            type: args.type as VaultCredentialType | undefined,
            search: args.search,
            limit: 100,
        });

        return {
            acces: credentials.map((c) => ({
                credentialId: c.id,
                type: c.type,
                typeLisible: VAULT_TYPE_LABELS[c.type],
                libelle: c.label,
                identifiant: c.login,
                hasPassword: c.hasPassword,
                mission: c.mission?.name ?? null,
                proprietaire: c.interlocuteur?.name ?? null,
                derniereConsultation: c.lastRevealedAt,
                dernierEnvoi: c.lastSentAt,
            })),
        };
    },
});

export const listAccessGaps = defineReadTool({
    name: "list_access_gaps",
    label: "Trous dans les accès",
    description:
        "Audit du projet : commerciaux sans compte portail, accès enregistrés sans mot de passe, comptes portail désactivés. À utiliser pour « qui n'a pas encore ses accès ? ».",
    parameters: NO_PARAMS,
    schema: z.object({}),
    execute: async (_args, ctx) => {
        const project = requireProject(ctx);

        const [interlocuteurs, credentials] = await Promise.all([
            prisma.clientInterlocuteur.findMany({
                where: { clientId: project.clientId, isActive: true },
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    emails: true,
                    portalUser: { select: { email: true, isActive: true } },
                },
            }),
            listCredentials({ clientId: project.clientId, limit: 200 }),
        ]);

        const sansCompte = interlocuteurs
            .filter((i) => !i.portalUser)
            .map((i) => ({
                interlocuteurId: i.id,
                nom: `${i.firstName} ${i.lastName}`.trim(),
                email: primaryEmailOf(i.emails),
                emailManquant: !primaryEmailOf(i.emails),
            }));

        return {
            commerciauxSansComptePortail: sansCompte,
            comptesDesactives: interlocuteurs
                .filter((i) => i.portalUser && !i.portalUser.isActive)
                .map((i) => `${i.firstName} ${i.lastName}`.trim()),
            accesSansMotDePasse: credentials
                .filter((c) => !c.hasPassword)
                .map((c) => ({ credentialId: c.id, libelle: c.label })),
            resume: {
                commerciaux: interlocuteurs.length,
                sansCompte: sansCompte.length,
                accesEnregistres: credentials.length,
            },
        };
    },
});

export const proposeEmails = defineReadTool({
    name: "propose_email_addresses",
    label: "Adresses email disponibles",
    description:
        "Propose des adresses libres pour une personne sur un domaine (prenom.nom@, pnom@…), en écartant celles déjà utilisées dans le CRM. Ne crée aucune boîte mail.",
    parameters: params(
        {
            firstName: { type: "string" },
            lastName: { type: "string" },
            domain: { type: "string", description: "Domaine sans @, ex : acme.fr" },
        },
        ["firstName", "lastName", "domain"],
    ),
    schema: z.object({
        firstName: z.string().default(""),
        lastName: z.string().default(""),
        domain: z.string().min(2),
    }),
    execute: async (args) => {
        const result = await proposeEmailAddresses(args);
        return {
            ...result,
            note: "Propositions uniquement. La boîte mail se crée chez le fournisseur, puis s'enregistre avec save_credential.",
        };
    },
});

export const listAccessActivity = defineReadTool({
    name: "list_access_activity",
    label: "Journal des accès",
    description:
        "Historique du coffre pour le projet : créations, consultations de mot de passe, régénérations, envois. Répond à « qui a vu ce mot de passe ? ».",
    parameters: params({ limit: { type: "number" } }),
    schema: z.object({ limit: z.number().int().min(1).max(50).optional() }),
    execute: async (args, ctx) => {
        const project = requireProject(ctx);
        const events = await listVaultAudit({ clientId: project.clientId, limit: args.limit ?? 20 });
        return {
            evenements: events.map((e) => ({
                action: e.action,
                resume: e.summary,
                par: e.actor?.name ?? "Inconnu",
                le: e.createdAt,
            })),
        };
    },
});

// ============================================
// SAFE WRITE
// ============================================

export const fileCredentialUnderMission = defineSafeWriteTool({
    name: "set_credential_mission",
    label: "Rattachement d'un accès",
    description:
        "Range un accès existant sous une mission précise du projet (ou le remet au niveau client si missionId est vide). Réversible.",
    parameters: params(
        {
            credentialId: { type: "string" },
            missionId: { type: "string", description: "Vide = accès client, toutes missions" },
        },
        ["credentialId"],
    ),
    schema: z.object({
        credentialId: z.string().min(1),
        missionId: z.string().optional().nullable(),
    }),
    execute: async (args, ctx) => {
        const project = requireProject(ctx);
        const credential = await requireProjectCredential(args.credentialId, project.clientId);

        if (args.missionId) {
            const mission = await prisma.mission.findUnique({
                where: { id: args.missionId },
                select: { clientId: true, name: true },
            });
            if (!mission || mission.clientId !== project.clientId) {
                throw new Error("Cette mission n'appartient pas au projet actif.");
            }
        }

        await prisma.vaultCredential.update({
            where: { id: credential.id },
            data: { missionId: args.missionId || null, updatedById: ctx.userId },
        });

        return {
            message: args.missionId
                ? `« ${credential.label} » est maintenant rattaché à cette mission.`
                : `« ${credential.label} » est repassé au niveau client.`,
            refresh: true,
        };
    },
});

// ============================================
// CONFIRM
// ============================================

export const createPortalAccount = defineConfirmTool({
    name: "create_portal_account",
    label: "Création d'un compte portail",
    description:
        "Crée le compte portail Captain Prospect d'un commercial du client et enregistre ses identifiants dans le coffre. Le mot de passe est généré automatiquement.",
    parameters: params(
        {
            interlocuteurId: { type: "string", description: "Id obtenu via get_project_overview" },
            email: { type: "string", description: "Par défaut, l'email principal du commercial" },
        },
        ["interlocuteurId"],
    ),
    schema: z.object({
        interlocuteurId: z.string().min(1),
        email: z.string().email().optional(),
    }),
    describe: async (args, ctx) => {
        const project = requireProject(ctx);
        const interlocuteur = await prisma.clientInterlocuteur.findUnique({
            where: { id: args.interlocuteurId },
            select: {
                firstName: true,
                lastName: true,
                emails: true,
                clientId: true,
                portalUser: { select: { email: true } },
            },
        });
        if (!interlocuteur) throw new Error("Commercial introuvable");
        if (interlocuteur.clientId !== project.clientId) {
            throw new Error("Ce commercial n'appartient pas au projet actif.");
        }

        const email = args.email || primaryEmailOf(interlocuteur.emails) || "—";

        return {
            title: "Créer un compte portail",
            details: [
                { label: "Commercial", value: `${interlocuteur.firstName} ${interlocuteur.lastName}`.trim() },
                { label: "Client", value: project.clientName },
                { label: "Email de connexion", value: email },
                { label: "Rôle", value: "COMMERCIAL (portail commercial)" },
                { label: "Mot de passe", value: "Généré automatiquement, rangé dans le coffre" },
            ],
            warning: interlocuteur.portalUser
                ? `Ce commercial a déjà un compte (${interlocuteur.portalUser.email}) — rien ne sera créé.`
                : null,
            confirmLabel: "Créer le compte",
            danger: false,
        };
    },
    execute: async (args, ctx) => {
        const project = requireProject(ctx);
        const result = await createPortalAccountForInterlocuteur(args.interlocuteurId, ctx.userId, {
            email: args.email,
            missionId: project.missionId,
        });
        return {
            message: result.message,
            secret:
                result.created && result.password
                    ? {
                        label: result.credential?.label ?? "Portail Captain Prospect",
                        login: result.user.email,
                        password: result.password,
                    }
                    : null,
            refresh: true,
        };
    },
});

export const saveCredential = defineConfirmTool({
    name: "save_credential",
    label: "Enregistrement d'un accès",
    description:
        "Enregistre un accès externe dans le coffre du projet (boîte email, agenda, CRM du client…). generatePassword=true laisse le système générer un mot de passe fort.",
    parameters: params(
        {
            type: { type: "string", enum: TYPE_VALUES },
            login: { type: "string" },
            label: { type: "string" },
            password: { type: "string", description: "Mot de passe fourni par l'utilisateur" },
            generatePassword: { type: "boolean" },
            url: { type: "string" },
            notes: { type: "string" },
            interlocuteurId: { type: "string", description: "Commercial à qui appartient l'accès" },
        },
        ["type", "login"],
    ),
    schema: z.object({
        type: credentialType,
        login: z.string().min(1).max(320),
        label: z.string().max(200).optional(),
        password: z.string().max(500).optional(),
        generatePassword: z.boolean().optional(),
        url: z.string().max(500).optional(),
        notes: z.string().max(2000).optional(),
        interlocuteurId: z.string().optional().nullable(),
    }),
    describe: async (args, ctx) => {
        const project = requireProject(ctx);
        return {
            title: "Enregistrer un accès dans le coffre",
            details: [
                { label: "Client", value: project.clientName },
                ...(project.missionName ? [{ label: "Mission", value: project.missionName }] : []),
                { label: "Type", value: VAULT_TYPE_LABELS[args.type as VaultCredentialType] },
                { label: "Identifiant", value: args.login },
                {
                    label: "Mot de passe",
                    value: args.generatePassword
                        ? "Généré automatiquement"
                        : args.password
                            ? "Fourni (stocké chiffré)"
                            : "Aucun",
                },
                ...(args.url ? [{ label: "URL", value: args.url }] : []),
            ],
            warning: null,
            confirmLabel: "Enregistrer",
            danger: false,
        };
    },
    execute: async (args, ctx) => {
        const project = requireProject(ctx);
        const password = args.generatePassword ? generateStrongPassword() : args.password;

        const credential = await createCredential(
            {
                clientId: project.clientId,
                missionId: project.missionId,
                interlocuteurId: args.interlocuteurId ?? null,
                type: args.type as VaultCredentialType,
                label: args.label,
                login: args.login,
                password,
                url: args.url,
                notes: args.notes,
            },
            ctx.userId,
        );

        return {
            message: `Accès « ${credential.label} » enregistré dans le coffre.`,
            // Only a generated password comes back: one the manager typed is
            // already in their hands.
            secret: args.generatePassword && password
                ? { label: credential.label, login: credential.login, password }
                : null,
            refresh: true,
        };
    },
});

export const revealPassword = defineConfirmTool({
    name: "reveal_password",
    label: "Affichage d'un mot de passe",
    description: "Affiche le mot de passe d'un accès du projet. L'action est tracée (qui, quand).",
    parameters: params({ credentialId: { type: "string" } }, ["credentialId"]),
    schema: z.object({ credentialId: z.string().min(1) }),
    describe: async (args, ctx) => {
        const project = requireProject(ctx);
        const credential = await requireProjectCredential(args.credentialId, project.clientId);
        return {
            title: "Afficher le mot de passe",
            details: [
                { label: "Accès", value: credential.label },
                { label: "Client", value: credential.client.name },
                { label: "Identifiant", value: credential.login },
            ],
            warning: "L'accès sera tracé (ton nom et l'horodatage).",
            confirmLabel: "Afficher",
            danger: false,
        };
    },
    execute: async (args, ctx) => {
        const project = requireProject(ctx);
        await requireProjectCredential(args.credentialId, project.clientId);
        const result = await revealCredential(args.credentialId, ctx.userId);
        return {
            message: `Mot de passe de « ${result.label} ».`,
            secret: { label: result.label, login: result.login, password: result.password },
            refresh: true,
        };
    },
});

export const rotatePassword = defineConfirmTool({
    name: "rotate_password",
    label: "Régénération d'un mot de passe",
    description:
        "Génère un nouveau mot de passe pour un accès du projet. Si c'est un compte portail Captain Prospect, le compte est mis à jour dans la foulée.",
    parameters: params({ credentialId: { type: "string" } }, ["credentialId"]),
    schema: z.object({ credentialId: z.string().min(1) }),
    describe: async (args, ctx) => {
        const project = requireProject(ctx);
        const credential = await requireProjectCredential(args.credentialId, project.clientId);
        return {
            title: "Régénérer le mot de passe",
            details: [
                { label: "Accès", value: credential.label },
                { label: "Client", value: credential.client.name },
                { label: "Identifiant", value: credential.login },
            ],
            warning: credential.userId
                ? "Le compte portail sera mis à jour immédiatement : l'ancien mot de passe cessera de fonctionner."
                : "Le nouveau mot de passe devra aussi être changé chez le fournisseur — le coffre ne le fait pas à ta place.",
            confirmLabel: "Régénérer",
            danger: true,
        };
    },
    execute: async (args, ctx) => {
        const project = requireProject(ctx);
        await requireProjectCredential(args.credentialId, project.clientId);
        const result = await rotateCredential(args.credentialId, ctx.userId);
        return {
            message: result.portalSynced
                ? `Nouveau mot de passe pour « ${result.credential.label} ». Le compte portail a été mis à jour.`
                : `Nouveau mot de passe pour « ${result.credential.label} ». Pense à le changer aussi chez le fournisseur.`,
            secret: {
                label: result.credential.label,
                login: result.credential.login,
                password: result.password,
            },
            refresh: true,
        };
    },
});

export const sendCredentials = defineConfirmTool({
    name: "send_credentials_email",
    label: "Envoi des identifiants",
    description: "Envoie les identifiants d'un accès par email à son propriétaire.",
    parameters: params(
        {
            credentialId: { type: "string" },
            to: { type: "string", description: "Par défaut, l'identifiant de l'accès" },
            note: { type: "string", description: "Phrase d'introduction personnalisée" },
        },
        ["credentialId"],
    ),
    schema: z.object({
        credentialId: z.string().min(1),
        to: z.string().email().optional().nullable(),
        note: z.string().max(500).optional().nullable(),
    }),
    describe: async (args, ctx) => {
        const project = requireProject(ctx);
        const credential = await requireProjectCredential(args.credentialId, project.clientId);
        const recipient = args.to || credential.user?.email || credential.login;

        return {
            title: "Envoyer les identifiants par email",
            details: [
                { label: "Accès", value: credential.label },
                { label: "Destinataire", value: recipient },
                { label: "Contenu", value: "Identifiant, mot de passe et lien de connexion" },
            ],
            warning: credential.lastSentAt
                ? `Déjà envoyé le ${credential.lastSentAt.toLocaleDateString("fr-FR")} à ${credential.lastSentTo ?? "—"}.`
                : "Le mot de passe quittera le CRM en clair dans cet email.",
            confirmLabel: "Envoyer",
            danger: true,
        };
    },
    execute: async (args, ctx) => {
        const project = requireProject(ctx);
        await requireProjectCredential(args.credentialId, project.clientId);
        const result = await sendCredentialsEmail({
            credentialId: args.credentialId,
            actorId: ctx.userId,
            to: args.to ?? null,
            note: args.note ?? null,
        });
        return { message: result.message, refresh: true };
    },
});

export const removeCredential = defineConfirmTool({
    name: "delete_credential",
    label: "Suppression d'un accès",
    description: "Supprime un accès du coffre. Ne supprime pas le compte correspondant.",
    parameters: params({ credentialId: { type: "string" } }, ["credentialId"]),
    schema: z.object({ credentialId: z.string().min(1) }),
    describe: async (args, ctx) => {
        const project = requireProject(ctx);
        const credential = await requireProjectCredential(args.credentialId, project.clientId);
        return {
            title: "Supprimer cet accès du coffre",
            details: [
                { label: "Accès", value: credential.label },
                { label: "Client", value: credential.client.name },
                { label: "Identifiant", value: credential.login },
            ],
            warning:
                "Le mot de passe stocké sera définitivement perdu. Le compte lui-même n'est pas supprimé.",
            confirmLabel: "Supprimer",
            danger: true,
        };
    },
    execute: async (args, ctx) => {
        const project = requireProject(ctx);
        await requireProjectCredential(args.credentialId, project.clientId);
        await deleteCredential(args.credentialId, ctx.userId);
        return { message: "Accès supprimé du coffre.", refresh: true };
    },
});
