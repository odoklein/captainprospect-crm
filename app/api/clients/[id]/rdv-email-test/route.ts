import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  errorResponse,
  requireRole,
  successResponse,
  withErrorHandler,
} from "@/lib/api-utils";
import { z } from "zod";
import { sendTransactionalEmail } from "@/lib/email/transactional";
import {
  buildRdvEmailFromCustomTemplate,
  buildRdvNotificationEmail,
} from "@/lib/email/templates/rdv-notification";
import { brand } from "@/lib/brand";

const schema = z
  .object({
    recipientType: z.enum(["CLIENT_USER", "COMMERCIAL"]),
    userId: z.string().min(1).optional(),
    interlocuteurId: z.string().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.recipientType === "CLIENT_USER" && !data.userId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["userId"],
        message: "userId requis pour CLIENT_USER",
      });
    }
    if (data.recipientType === "COMMERCIAL" && !data.interlocuteurId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["interlocuteurId"],
        message: "interlocuteurId requis pour COMMERCIAL",
      });
    }
  });

function firstNonEmptyEmailFromInterlocuteur(
  emails: unknown
): string | null {
  const list = Array.isArray(emails) ? emails : [];
  for (const item of list) {
    if (typeof item === "string" && item.trim()) return item.trim();
    if (item && typeof item === "object") {
      const value = (item as { value?: unknown }).value;
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return null;
}

export const POST = withErrorHandler(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    await requireRole(["MANAGER"], request);
    const { id: clientId } = await params;

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.errors[0].message, 400);
    }

    const { recipientType, userId, interlocuteurId } = parsed.data;

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, name: true },
    });
    if (!client) return errorResponse("Client introuvable", 404);

    let to = "";
    let recipientLabel = "";
    let portalPath = "/client/portal/meetings";

    if (recipientType === "CLIENT_USER") {
      const user = await prisma.user.findFirst({
        where: {
          id: userId!,
          clientId,
          role: "CLIENT",
        },
        select: { email: true, name: true },
      });
      if (!user?.email) {
        return errorResponse("Utilisateur client introuvable", 404);
      }
      to = user.email;
      recipientLabel = user.name || user.email;
    } else {
      const interlocuteur = await prisma.clientInterlocuteur.findFirst({
        where: { id: interlocuteurId!, clientId },
        include: { portalUser: { select: { email: true, name: true } } },
      });
      if (!interlocuteur) {
        return errorResponse("Commercial introuvable", 404);
      }
      const email =
        interlocuteur.portalUser?.email ||
        firstNonEmptyEmailFromInterlocuteur(interlocuteur.emails);
      if (!email) {
        return errorResponse("Aucun email trouvé pour ce commercial", 400);
      }
      to = email;
      recipientLabel =
        interlocuteur.portalUser?.name ||
        `${interlocuteur.firstName} ${interlocuteur.lastName}`.trim() ||
        email;
      portalPath = "/commercial/portal/meetings";
    }

    const [customTemplate] = await Promise.all([
      (prisma as any).systemEmailTemplate.findUnique({
        where: { key: "rdv_notification" },
        select: { subject: true, bodyHtml: true },
      }),
    ]);

    const baseData = {
      contactFirstName: "Marie",
      contactLastName: "Dupont",
      companyName: "Acme Corp",
      missionName: "Mission Prospection Q2",
      scheduledAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      meetingType: "VISIO" as const,
      meetingChannel: "CALL" as const,
      meetingJoinUrl: "https://meet.google.com/abc-defg-hij",
      appUrl:
        brand.appUrl,
      portalPath,
    };

    const { html } = customTemplate
      ? buildRdvEmailFromCustomTemplate(
          customTemplate.subject,
          customTemplate.bodyHtml,
          baseData
        )
      : buildRdvNotificationEmail(baseData);

    const sent = await sendTransactionalEmail({
      to,
      subject: "Test RDV",
      html,
      text: `Email de test RDV confirmé envoyé à ${recipientLabel}.`,
    });

    if (!sent) {
      return errorResponse(
        "Envoi impossible. Vérifiez la configuration SMTP et l'expéditeur.",
        500
      );
    }

    return successResponse({
      sent: true,
      to,
      recipientLabel,
      recipientType,
    });
  }
);
