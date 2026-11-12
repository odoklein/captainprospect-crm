/**
 * Reporting tools.
 *
 * `publish_weekly_bilan` (confirm): publishes a weekly bilan the agent wrote
 * (an AssistantArtifact REPORT) as the client's « Reporting » session, the
 * same row a manager creates from the client page
 * (lib/client-sessions/create.ts), and optionally e-mails it.
 *
 * Outward-facing on two counts (client portal, e-mail), hence `confirm`.
 * Recipients are restricted to addresses the CRM already knows for this
 * client (client e-mail, its active portal users) or internal staff: a
 * proposal can never mail a stranger, whatever a prompt injected into a call
 * note said. Exported as REPORTING_TOOLS; the registry lists it.
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/email/transactional";
import { createClientSession, findSessionClient } from "@/lib/client-sessions/create";
import { bilanSessionDate, bilanWeek } from "@/lib/reporting/weekly-bilan-week";
import { addDay, parisMidnight } from "@/lib/manager-home/today-rules";
import { defineConfirmTool, params } from "../helpers";
import { requireProject } from "../context";
import { ToolAuthorizationError, ToolValidationError, type AnyToolDefinition, type AssistantContext } from "../types";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const PublishSchema = z.object({
    /** Optional inside a bound project (the binding is the tenant); must match it when given. */
    client_id: z.string().min(1).optional(),
    week_start: z.string().regex(DAY_RE, "date AAAA-MM-JJ attendue"),
    artifact_id: z.string().min(1),
    recipients: z.array(z.string().trim().toLowerCase().email()).max(10).optional(),
});

type PublishArgs = z.infer<typeof PublishSchema>;

/** The report body as the client portal shows it (raw text): no visual markers, no source labels. */
export function bilanPlainText(markdown: string): string {
    return markdown
        .replace(/\[\[visuel \d+\]\]/gi, "")
        .replace(/\s*\[E\d{1,3}\](?:\s*\[E\d{1,3}\])*/g, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

/** E-mail text: the portal text without markdown emphasis. */
export function bilanEmailText(markdown: string): string {
    return bilanPlainText(markdown)
        .replace(/^#{1,6}\s*/gm, "")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/^- /gm, "• ");
}

function escapeHtml(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface Resolved {
    client: { id: string; name: string; email: string | null };
    week: { start: string; end: string; label: string };
    artifact: { id: string; title: string; body: string };
    recipients: string[];
    existingSessionId: string | null;
}

/** Everything the card and the execution need, from the database. Throws on any mismatch. */
async function resolvePublish(args: PublishArgs, ctx: AssistantContext): Promise<Resolved> {
    const project = requireProject(ctx);
    if (args.client_id && args.client_id !== project.clientId) {
        throw new ToolAuthorizationError("Ce bilan concerne un autre client que le projet ouvert.", "out_of_scope");
    }
    const client = await findSessionClient(project.clientId);
    if (!client) throw new ToolValidationError("Client introuvable.");

    // Any day of the wanted week works: the Wednesday lands inside it.
    const week = bilanWeek(new Date(`${addDay(args.week_start, 2)}T12:00:00Z`));

    const artifact = await prisma.assistantArtifact.findUnique({
        where: { id: args.artifact_id },
        select: { id: true, kind: true, title: true, body: true, clientId: true },
    });
    if (!artifact || artifact.clientId !== client.id || artifact.kind !== "REPORT") {
        throw new ToolValidationError("Rapport introuvable pour ce client.");
    }

    const recipients = [...new Set(args.recipients ?? [])];
    if (recipients.length > 0) {
        const known = await prisma.user.findMany({
            where: {
                isActive: true,
                email: { in: recipients, mode: "insensitive" },
                OR: [{ role: "CLIENT", clientId: client.id }, { role: { in: ["MANAGER", "BUSINESS_DEVELOPER"] } }],
            },
            select: { email: true },
        });
        const allowed = new Set(known.map((u) => u.email.toLowerCase()));
        if (client.email) allowed.add(client.email.toLowerCase());
        const strangers = recipients.filter((r) => !allowed.has(r));
        if (strangers.length > 0) {
            throw new ToolValidationError(
                `Destinataire(s) inconnu(s) du CRM pour ce client : ${strangers.join(", ")}. Seuls l'e-mail du client, ses comptes portail et l'équipe interne sont autorisés.`,
            );
        }
    }

    const existing = await prisma.clientSession.findFirst({
        where: { clientId: client.id, type: "Reporting", date: { gte: parisMidnight(week.start), lt: parisMidnight(addDay(week.end, 3)) } },
        select: { id: true },
    });

    return { client, week, artifact: { id: artifact.id, title: artifact.title, body: artifact.body }, recipients, existingSessionId: existing?.id ?? null };
}

export const publishWeeklyBilan = defineConfirmTool({
    name: "publish_weekly_bilan",
    label: "Publier le bilan hebdomadaire",
    description:
        "Publie un bilan hebdomadaire rédigé (artifact REPORT) comme session « Reporting » du client, visible sur son espace, et l'envoie éventuellement par e-mail. Toujours validé par un manager.",
    parameters: params(
        {
            client_id: { type: "string", description: "Id du client (implicite dans un projet)." },
            week_start: { type: "string", description: "Lundi de la semaine du bilan, AAAA-MM-JJ." },
            artifact_id: { type: "string", description: "Id du rapport (AssistantArtifact REPORT) à publier." },
            recipients: { type: "array", items: { type: "string" }, description: "E-mails à qui envoyer le bilan (connus du CRM pour ce client)." },
        },
        ["week_start", "artifact_id"],
    ),
    schema: PublishSchema,
    requiresProject: true,
    describe: async (args, ctx) => {
        const r = await resolvePublish(args, ctx);
        if (r.existingSessionId) {
            throw new ToolValidationError(`Un bilan « Reporting » est déjà publié pour la ${r.week.label.toLowerCase()}.`);
        }
        return {
            title: `Publier le bilan de ${r.client.name}`,
            details: [
                { label: "Client", value: r.client.name },
                { label: "Semaine", value: r.week.label },
                { label: "Rapport", value: r.artifact.title },
                { label: "Session", value: `« Reporting » du ${bilanSessionDate(r.week).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric", timeZone: "Europe/Paris" })}` },
                { label: "Envoi par e-mail", value: r.recipients.length > 0 ? r.recipients.join(", ") : "Aucun (espace client uniquement)" },
            ],
            warning:
                r.recipients.length > 0
                    ? `Le bilan sera visible sur l'espace client et envoyé à ${r.recipients.length} destinataire(s).`
                    : "Le bilan sera visible sur l'espace client.",
            confirmLabel: r.recipients.length > 0 ? "Publier et envoyer" : "Publier",
            danger: r.recipients.length > 0,
        };
    },
    execute: async (args, ctx) => {
        const r = await resolvePublish(args, ctx);
        if (r.existingSessionId) {
            throw new ToolValidationError(`Un bilan « Reporting » est déjà publié pour la ${r.week.label.toLowerCase()} : rien n'a été publié.`);
        }
        const crMarkdown = bilanPlainText(r.artifact.body);
        const emailText = bilanEmailText(r.artifact.body);
        const { session } = await createClientSession({
            client: r.client,
            input: { type: "Reporting", date: bilanSessionDate(r.week), crMarkdown, summaryEmail: emailText, notifyByEmail: false },
            userId: ctx.userId,
        });

        let sent = false;
        if (r.recipients.length > 0) {
            sent = await sendTransactionalEmail({
                to: r.recipients,
                subject: `Bilan hebdomadaire — ${r.client.name} — ${r.week.label}`,
                text: emailText,
                html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;white-space:pre-wrap">${escapeHtml(emailText)}</div>`,
            });
            if (sent) {
                await prisma.clientSession.update({ where: { id: session.id }, data: { emailSentAt: new Date() } });
            }
        }
        await prisma.assistantArtifact.update({
            where: { id: r.artifact.id },
            data: { sentAt: new Date(), recipients: r.recipients.length > 0 ? r.recipients : undefined },
            select: { id: true },
        });

        const mail = r.recipients.length === 0 ? "" : sent ? ` et envoyé à ${r.recipients.join(", ")}` : " (l'e-mail n'a pas pu partir : SMTP non configuré ou refusé)";
        return {
            message: `Bilan de ${r.client.name} publié (${r.week.label})${mail}.`,
            refresh: true,
            artifactId: r.artifact.id,
        };
    },
});

export const REPORTING_TOOLS: AnyToolDefinition[] = [publishWeeklyBilan];
