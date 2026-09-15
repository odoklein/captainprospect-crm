/**
 * Communication — drafting and sending.
 *
 * The split that matters: drafting is a `safe_write` (it creates an artifact
 * you can edit or throw away), sending is a `confirm` (it leaves the CRM and
 * cannot be recalled). Iterating on wording should be free; the click is spent
 * on the irreversible step.
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { sanitizeUntrusted } from "../redact";
import { requireProject } from "../context";
import {
    defineConfirmTool,
    defineReadTool,
    defineSafeWriteTool,
    frDateTime,
    params,
} from "../helpers";
import {
    resolveOnboardingRecipients,
    sendOnboardingEmails,
} from "@/lib/vault/onboardingEmail";

// ============================================
// DRAFTS (artifacts)
// ============================================

export const draftEmail = defineSafeWriteTool({
    name: "draft_email",
    label: "Rédaction d'un brouillon",
    description:
        "Rédige un email et l'enregistre comme brouillon sur le projet. Rien n'est envoyé. Utilise-le pour proposer un texte que le manager pourra relire, modifier, puis envoyer avec send_draft.",
    parameters: params(
        {
            title: { type: "string", description: "Nom court du brouillon, pour le retrouver" },
            subject: { type: "string", description: "Objet de l'email" },
            body: { type: "string", description: "Corps du message, en texte simple" },
        },
        ["title", "subject", "body"],
    ),
    schema: z.object({
        title: z.string().min(1).max(160),
        subject: z.string().min(1).max(300),
        body: z.string().min(1).max(12000),
    }),
    execute: async (args, ctx) => {
        const project = requireProject(ctx);

        const artifact = await prisma.assistantArtifact.create({
            data: {
                kind: "EMAIL_DRAFT",
                title: args.title,
                subject: args.subject,
                body: args.body,
                clientId: project.clientId,
                missionId: project.missionId,
                conversationId: ctx.conversationId,
                createdById: ctx.userId,
            },
            select: { id: true, title: true },
        });

        return {
            message: `Brouillon « ${artifact.title} » enregistré. Il n'est pas envoyé.`,
            artifactId: artifact.id,
            refresh: true,
        };
    },
});

export const listDrafts = defineReadTool({
    name: "list_drafts",
    label: "Brouillons du projet",
    description:
        "Les brouillons et documents produits par l'assistant sur ce projet, avec leur id, leur objet et s'ils ont déjà été envoyés.",
    parameters: params({}),
    schema: z.object({}),
    execute: async (_args, ctx) => {
        const project = requireProject(ctx);

        const artifacts = await prisma.assistantArtifact.findMany({
            where: { clientId: project.clientId },
            orderBy: { createdAt: "desc" },
            take: 25,
            select: {
                id: true,
                kind: true,
                title: true,
                subject: true,
                sentAt: true,
                recipients: true,
                createdAt: true,
                createdBy: { select: { name: true } },
            },
        });

        return {
            brouillons: artifacts.map((a) => ({
                artifactId: a.id,
                type: a.kind,
                titre: a.title,
                objet: a.subject,
                envoye: a.sentAt ? frDateTime(a.sentAt) : null,
                nombreDestinataires: Array.isArray(a.recipients) ? a.recipients.length : null,
                cree: frDateTime(a.createdAt),
                par: a.createdBy?.name ?? null,
            })),
        };
    },
});

export const readDraft = defineReadTool({
    name: "read_draft",
    label: "Lecture d'un brouillon",
    description: "Renvoie l'objet et le corps complet d'un brouillon, pour le relire ou le retravailler.",
    parameters: params({ artifactId: { type: "string" } }, ["artifactId"]),
    schema: z.object({ artifactId: z.string().min(1) }),
    execute: async (args, ctx) => {
        const project = requireProject(ctx);
        const artifact = await prisma.assistantArtifact.findUnique({
            where: { id: args.artifactId },
            select: { clientId: true, title: true, subject: true, body: true, sentAt: true },
        });
        if (!artifact) return { error: "Brouillon introuvable" };
        if (artifact.clientId !== project.clientId) {
            return { error: "Ce brouillon n'appartient pas au projet actif." };
        }

        return {
            titre: artifact.title,
            objet: artifact.subject,
            corps: sanitizeUntrusted(artifact.body, 12000),
            dejaEnvoye: !!artifact.sentAt,
        };
    },
});

// ============================================
// SENDING
// ============================================

export const sendOnboardingEmailsTool = defineConfirmTool({
    name: "send_onboarding_emails",
    label: "Envoi des accès aux commerciaux",
    description:
        "Envoie à chaque commercial du client son email d'accès : lien de connexion, identifiant, mot de passe, rappel de confirmer son calendrier et mention du chat en direct. Par défaut, tous les commerciaux ayant un compte portail.",
    parameters: params({
        interlocuteurIds: {
            type: "array",
            items: { type: "string" },
            description: "Limiter à certains commerciaux. Vide = tous ceux qui ont un compte.",
        },
        intro: {
            type: "string",
            description: "Phrase d'introduction personnalisée, ajoutée en haut du message",
        },
    }),
    schema: z.object({
        interlocuteurIds: z.array(z.string()).max(50).optional(),
        intro: z.string().max(500).optional().nullable(),
    }),
    describe: async (args, ctx) => {
        const project = requireProject(ctx);
        const { ready, skipped } = await resolveOnboardingRecipients(
            project.clientId,
            args.interlocuteurIds,
        );

        if (ready.length === 0) {
            throw new Error(
                skipped.length > 0
                    ? `Aucun destinataire prêt. ${skipped.map((s) => `${s.name} (${s.reason})`).join(", ")}.`
                    : "Aucun commercial avec un compte portail sur ce client.",
            );
        }

        return {
            title: `Envoyer l'email d'accès — ${ready.length} destinataire${ready.length > 1 ? "s" : ""}`,
            details: [
                { label: "Client", value: project.clientName },
                { label: "Objet", value: "Ton acces a la plateforme Captain Prospect" },
                {
                    label: "Contenu",
                    value: "Lien de connexion, identifiant, mot de passe, confirmation du calendrier, chat en direct",
                },
                { label: "Destinataires", value: ready.map((r) => r.email).join(" · ") },
                ...(skipped.length > 0
                    ? [{ label: "Exclus", value: skipped.map((s) => `${s.name} (${s.reason})`).join(" · ") }]
                    : []),
            ],
            warning:
                "Le mot de passe de chaque commercial part en clair dans son email. L'envoi ne peut pas être annulé.",
            confirmLabel: `Envoyer ${ready.length} email${ready.length > 1 ? "s" : ""}`,
            danger: true,
        };
    },
    execute: async (args, ctx) => {
        const project = requireProject(ctx);
        const { ready } = await resolveOnboardingRecipients(project.clientId, args.interlocuteurIds);
        if (ready.length === 0) throw new Error("Aucun destinataire prêt.");

        const outcome = await sendOnboardingEmails({
            recipients: ready,
            clientName: project.clientName,
            senderName: ctx.userName,
            intro: args.intro ?? null,
            actorId: ctx.userId,
        });

        const artifact = await prisma.assistantArtifact.create({
            data: {
                kind: "EMAIL_DRAFT",
                title: `Email d'accès — ${project.clientName}`,
                subject: "Ton acces a la plateforme Captain Prospect",
                body: "Email d'accès standard (lien, identifiant, mot de passe, calendrier, chat en direct).",
                clientId: project.clientId,
                missionId: project.missionId,
                conversationId: ctx.conversationId,
                createdById: ctx.userId,
                sentAt: new Date(),
                recipients: outcome.results as unknown as Prisma.InputJsonValue,
            },
            select: { id: true },
        });

        const failures = outcome.results.filter((r) => !r.sent);

        return {
            message:
                failures.length === 0
                    ? `${outcome.sent} email${outcome.sent > 1 ? "s" : ""} envoyé${outcome.sent > 1 ? "s" : ""}.`
                    : `${outcome.sent} envoyé(s), ${failures.length} en échec : ${failures
                        .map((f) => `${f.name} (${f.error})`)
                        .join(", ")}.`,
            artifactId: artifact.id,
            refresh: true,
        };
    },
});

export const sendDraft = defineConfirmTool({
    name: "send_draft",
    label: "Envoi d'un brouillon",
    description:
        "Envoie un brouillon existant à une liste d'adresses. Le brouillon doit avoir été créé avec draft_email et relu.",
    parameters: params(
        {
            artifactId: { type: "string" },
            to: {
                type: "array",
                items: { type: "string" },
                description: "Adresses email des destinataires",
            },
        },
        ["artifactId", "to"],
    ),
    schema: z.object({
        artifactId: z.string().min(1),
        to: z.array(z.string().email()).min(1).max(50),
    }),
    describe: async (args, ctx) => {
        const project = requireProject(ctx);
        const artifact = await prisma.assistantArtifact.findUnique({
            where: { id: args.artifactId },
            select: { clientId: true, title: true, subject: true, body: true, sentAt: true },
        });
        if (!artifact) throw new Error("Brouillon introuvable");
        if (artifact.clientId !== project.clientId) {
            throw new Error("Ce brouillon n'appartient pas au projet actif.");
        }

        return {
            title: "Envoyer ce brouillon",
            details: [
                { label: "Brouillon", value: artifact.title },
                { label: "Objet", value: artifact.subject ?? "—" },
                { label: "Destinataires", value: args.to.join(" · ") },
                { label: "Aperçu", value: artifact.body.slice(0, 220) + (artifact.body.length > 220 ? "…" : "") },
            ],
            warning: artifact.sentAt
                ? `Ce brouillon a déjà été envoyé le ${artifact.sentAt.toLocaleDateString("fr-FR")}.`
                : "L'envoi ne peut pas être annulé.",
            confirmLabel: `Envoyer à ${args.to.length} destinataire${args.to.length > 1 ? "s" : ""}`,
            danger: true,
        };
    },
    execute: async (args, ctx) => {
        const project = requireProject(ctx);
        const artifact = await prisma.assistantArtifact.findUnique({
            where: { id: args.artifactId },
            select: { id: true, clientId: true, subject: true, body: true },
        });
        if (!artifact) throw new Error("Brouillon introuvable");
        if (artifact.clientId !== project.clientId) {
            throw new Error("Ce brouillon n'appartient pas au projet actif.");
        }

        const { sendTransactionalEmail } = await import("@/lib/email/transactional");
        const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#1f2937;white-space:pre-wrap;">${artifact.body
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")}</div>`;

        const results: Array<{ email: string; sent: boolean }> = [];
        for (const recipient of args.to) {
            const sent = await sendTransactionalEmail({
                to: recipient,
                subject: artifact.subject ?? "Message",
                html,
                text: artifact.body,
            });
            results.push({ email: recipient, sent });
        }

        const failures = results.filter((r) => !r.sent);
        await prisma.assistantArtifact.update({
            where: { id: artifact.id },
            data: { sentAt: new Date(), recipients: results as unknown as Prisma.InputJsonValue },
        });

        return {
            message:
                failures.length === 0
                    ? `Brouillon envoyé à ${results.length} destinataire(s).`
                    : `${results.length - failures.length} envoyé(s), ${failures.length} en échec.`,
            artifactId: artifact.id,
            refresh: true,
        };
    },
});
