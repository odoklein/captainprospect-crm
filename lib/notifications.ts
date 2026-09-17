import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/email/transactional";
import {
    buildRdvNotificationEmail,
    buildRdvEmailFromCustomTemplate,
    RdvNotificationData,
} from "@/lib/email/templates/rdv-notification";
import { alertClientsLiveSupportMessage } from "@/lib/slack/clientsLive";

interface CreateNotificationParams {
    userId: string;
    title: string;
    message: string;
    type?: "info" | "success" | "warning" | "error";
    link?: string;
}

/**
 * Create a notification for a user
 */
export async function createNotification({
    userId,
    title,
    message,
    type = "info",
    link,
}: CreateNotificationParams) {
    try {
        return await prisma.notification.create({
            data: {
                userId,
                title,
                message,
                type,
                link,
            },
        });
    } catch (error) {
        console.error("Failed to create notification:", error);
        return null;
    }
}

interface TaskAssignmentNotificationParams {
    assigneeId: string;
    taskTitle: string;
    projectName: string;
    assignedByName: string;
    taskId?: string;
}

/**
 * Create a notification when a task is assigned to a user
 */
export async function createTaskAssignmentNotification({
    assigneeId,
    taskTitle,
    projectName,
    assignedByName,
}: TaskAssignmentNotificationParams) {
    return createNotification({
        userId: assigneeId,
        title: "Nouvelle tâche assignée",
        message: `"${taskTitle}" dans le projet ${projectName} - assignée par ${assignedByName}`,
        type: "info",
        link: "/developer/tasks",
    });
}

/**
 * Create a notification when a task is reassigned to a different user
 */
export async function createTaskReassignmentNotification({
    assigneeId,
    taskTitle,
    projectName,
    assignedByName,
}: TaskAssignmentNotificationParams) {
    return createNotification({
        userId: assigneeId,
        title: "Tâche réassignée",
        message: `"${taskTitle}" dans le projet ${projectName} vous a été réassignée par ${assignedByName}`,
        type: "info",
        link: "/developer/tasks",
    });
}

// ============================================
// SCHEDULE / PLANNING NOTIFICATIONS
// ============================================

interface ScheduleNotificationParams {
    userId: string;
    userRole: string;
    missionName: string;
    clientName: string;
    date: string;
    startTime: string;
    endTime: string;
    managerName: string;
}

/**
 * Create a notification when a schedule block is assigned to a user
 */
export async function createScheduleAssignmentNotification({
    userId,
    userRole,
    missionName,
    clientName,
    date,
    startTime,
    endTime,
    managerName,
}: ScheduleNotificationParams) {
    const formattedDate = new Date(date).toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
    });

    const link = userRole === "BUSINESS_DEVELOPER" ? "/bd/dashboard" : "/sdr/dashboard";

    return createNotification({
        userId,
        title: "Nouveau créneau planifié",
        message: `Mission "${missionName}" (${clientName}) - ${formattedDate} de ${startTime} à ${endTime}. Planifié par ${managerName}`,
        type: "info",
        link,
    });
}

/**
 * Create a notification when a schedule block is updated
 */
export async function createScheduleUpdateNotification({
    userId,
    userRole,
    missionName,
    clientName,
    date,
    startTime,
    endTime,
    managerName,
}: ScheduleNotificationParams) {
    const formattedDate = new Date(date).toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
    });

    const link = userRole === "BUSINESS_DEVELOPER" ? "/bd/dashboard" : "/sdr/dashboard";

    return createNotification({
        userId,
        title: "Créneau modifié",
        message: `Mission "${missionName}" (${clientName}) - ${formattedDate} de ${startTime} à ${endTime}. Modifié par ${managerName}`,
        type: "warning",
        link,
    });
}

interface ScheduleCancelNotificationParams {
    userId: string;
    userRole: string;
    missionName: string;
    clientName: string;
    date: string;
    startTime: string;
    endTime: string;
}

/**
 * Create a notification when a schedule block is cancelled/deleted
 */
export async function createScheduleCancelNotification({
    userId,
    userRole,
    missionName,
    clientName,
    date,
    startTime,
    endTime,
}: ScheduleCancelNotificationParams) {
    const formattedDate = new Date(date).toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
    });

    const link = userRole === "BUSINESS_DEVELOPER" ? "/bd/dashboard" : "/sdr/dashboard";

    return createNotification({
        userId,
        title: "Créneau annulé",
        message: `Mission "${missionName}" (${clientName}) - ${formattedDate} de ${startTime} à ${endTime} a été annulé`,
        type: "warning",
        link,
    });
}

// ============================================
// CLIENT PORTAL NOTIFICATIONS
// ============================================

export interface CreateClientPortalNotificationParams {
    title: string;
    message: string;
    type?: "info" | "success" | "warning" | "error";
    link?: string;
}

/**
 * Create a notification for all active CLIENT users linked to the given client.
 * Used for: new opportunity, new RDV, new message, new file.
 */
export async function createClientPortalNotification(
    clientId: string,
    params: CreateClientPortalNotificationParams
) {
    const { title, message, type = "info", link } = params;
    try {
        const users = await prisma.user.findMany({
            where: {
                role: "CLIENT",
                clientId,
                isActive: true,
            },
            select: { id: true },
        });
        const results = await Promise.allSettled(
            users.map((u) =>
                createNotification({ userId: u.id, title, message, type, link })
            )
        );
        return results.every((r) => r.status === "fulfilled");
    } catch (error) {
        console.error("Failed to create client portal notification:", error);
        return false;
    }
}

// ============================================
// CLIENT PORTAL: ENRICHED NOTIFICATIONS
// ============================================

interface MeetingBookedNotificationData {
    contactFirstName?: string | null;
    contactLastName?: string | null;
    contactTitle?: string | null;
    companyName: string;
    sdrNote?: string | null;
}

/**
 * Notify client when SDR books a meeting.
 * Includes one sentence of SDR context inline.
 */
export async function createMeetingBookedNotification(
    clientId: string,
    data: MeetingBookedNotificationData
) {
    const name = [data.contactFirstName, data.contactLastName].filter(Boolean).join(" ") || "Contact";
    const context = data.contactTitle ? `${data.contactTitle}, ${data.companyName}` : data.companyName;
    const noteExcerpt = data.sdrNote ? ` — ${data.sdrNote.slice(0, 100)}` : "";

    return createClientPortalNotification(clientId, {
        title: "Nouveau RDV planifie",
        message: `RDV avec ${name} (${context})${noteExcerpt}`,
        type: "success",
        link: "/client/portal/meetings",
    });
}

/**
 * Notify client when monthly report is ready.
 */
export async function createReportPublishedNotification(
    clientId: string,
    monthName: string,
    year: number
) {
    return createClientPortalNotification(clientId, {
        title: "Rapport mensuel disponible",
        message: `Votre rapport ${monthName} ${year} est pret. Consultez vos resultats et partagez-le.`,
        type: "info",
        link: "/client/portal/reporting",
    });
}

/**
 * Notify client before an upcoming meeting.
 */
export async function createMeetingReminderNotification(
    clientId: string,
    data: MeetingBookedNotificationData,
    timeLabel: string
) {
    const name = [data.contactFirstName, data.contactLastName].filter(Boolean).join(" ") || "Contact";
    const noteExcerpt = data.sdrNote ? ` — ${data.sdrNote.slice(0, 80)}` : "";

    return createClientPortalNotification(clientId, {
        title: `Rappel : RDV ${timeLabel}`,
        message: `RDV avec ${name} (${data.companyName})${noteExcerpt}. Preparez votre reunion !`,
        type: "info",
        link: "/client/portal/meetings",
    });
}

/**
 * Notify client when a milestone is reached.
 */
export async function createMilestoneNotification(
    clientId: string,
    milestoneMessage: string
) {
    return createClientPortalNotification(clientId, {
        title: "Felicitations !",
        message: milestoneMessage,
        type: "success",
        link: "/client/portal/reporting",
    });
}

// ============================================
// MANAGER ALERTS — client actions
// ============================================

/**
 * Notify every active MANAGER user about a client-initiated event.
 * Fire-and-forget: errors are logged but never thrown.
 */
export async function notifyAllManagers(params: Omit<CreateNotificationParams, "userId">) {
    try {
        const managers = await prisma.user.findMany({
            where: { role: "MANAGER", isActive: true },
            select: { id: true },
        });
        await Promise.allSettled(
            managers.map((m) => createNotification({ ...params, userId: m.id })),
        );
    } catch (error) {
        console.error("[notifyAllManagers] Failed:", error);
    }
}

interface ClientMeetingAlertData {
    clientName: string;
    contactName: string;
    companyName: string;
    missionName?: string;
    meetingDate?: string | null;
}

function fmtDateParis(iso: string | null | undefined): string {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Europe/Paris",
        });
    } catch {
        return "";
    }
}

export async function notifyManagersClientSignal(data: ClientMeetingAlertData & {
    outcome: string;
    recontact: string;
    clientNote?: string | null;
}) {
    const dateStr = fmtDateParis(data.meetingDate);
    const recontactLabel = data.recontact === "YES" ? "souhaite recontact" : data.recontact === "MAYBE" ? "peut-etre recontact" : "pas de recontact";
    return notifyAllManagers({
        title: `Signal client : ${data.clientName}`,
        message: `${data.contactName} (${data.companyName})${dateStr ? ` - ${dateStr}` : ""} — Contact absent, ${recontactLabel}${data.clientNote ? ` — "${data.clientNote.slice(0, 80)}"` : ""}`,
        type: "warning",
        link: "/manager/rdv",
    });
}

export async function notifyManagersCommercialAbsent(data: ClientMeetingAlertData & {
    recontact: string;
    clientNote?: string | null;
    commercialName?: string;
}) {
    const dateStr = fmtDateParis(data.meetingDate);
    const recontactLabel = data.recontact === "YES" ? "recontact demandé" : data.recontact === "MAYBE" ? "recontact possible" : "pas de recontact";
    return notifyAllManagers({
        title: `RDV Absent (commercial) : ${data.clientName}`,
        message: `${data.contactName} (${data.companyName})${dateStr ? ` - ${dateStr}` : ""} — Marqué absent par ${data.commercialName ?? "le commercial"}, ${recontactLabel}${data.clientNote ? ` — "${data.clientNote.slice(0, 80)}"` : ""} — A rappeler`,
        type: "error",
        link: "/manager/rdv",
    });
}

export async function notifyManagersClientFeedback(data: ClientMeetingAlertData & {
    outcome: string;
    clientNote?: string | null;
}) {
    const outcomeLabels: Record<string, string> = { POSITIVE: "Positif", NEUTRAL: "Neutre", NEGATIVE: "Negatif", NO_SHOW: "Absent" };
    const label = outcomeLabels[data.outcome] ?? data.outcome;
    const dateStr = fmtDateParis(data.meetingDate);
    return notifyAllManagers({
        title: `Avis client : ${data.clientName}`,
        message: `${data.contactName} (${data.companyName})${dateStr ? ` - ${dateStr}` : ""} — Retour : ${label}${data.clientNote ? ` — "${data.clientNote.slice(0, 80)}"` : ""}`,
        type: data.outcome === "NEGATIVE" || data.outcome === "NO_SHOW" ? "warning" : "info",
        link: "/manager/rdv",
    });
}

export async function notifyManagersClientReschedule(data: ClientMeetingAlertData & {
    newDate: string;
    reason?: string | null;
}) {
    const oldDateStr = fmtDateParis(data.meetingDate);
    const newDateStr = fmtDateParis(data.newDate);
    return notifyAllManagers({
        title: `Demande report : ${data.clientName}`,
        message: `${data.contactName} (${data.companyName}) demande un report${oldDateStr ? ` du ${oldDateStr}` : ""}${newDateStr ? ` au ${newDateStr}` : ""}${data.reason ? ` — "${data.reason.slice(0, 80)}"` : ""}`,
        type: "warning",
        link: "/manager/rdv",
    });
}

export async function notifyManagersClientCancel(data: ClientMeetingAlertData & {
    cancellationReason?: string;
}) {
    const dateStr = fmtDateParis(data.meetingDate);
    return notifyAllManagers({
        title: `Annulation client : ${data.clientName}`,
        message: `${data.contactName} (${data.companyName})${dateStr ? ` - ${dateStr}` : ""} — RDV annule par le client${data.cancellationReason ? ` (${data.cancellationReason})` : ""}`,
        type: "error",
        link: "/manager/rdv",
    });
}

export async function notifyManagersClientSupportMessage(data: {
    clientName: string;
    messagePreview: string;
    intent?: string | null;
    authorName?: string | null;
    attachmentCount?: number;
    pageLabel?: string | null;
}) {
    const intentLabels: Record<string, string> = { RDV: "Question RDV", RAPPORT: "Rapport", PROBLEME: "Probleme", AUTRE: "Autre" };
    const intentStr = data.intent ? ` [${intentLabels[data.intent] ?? data.intent}]` : "";

    // Mirror the in-app notification to #clients-live so the team sees client
    // messages without sitting in the CRM. No-op when no webhook is configured.
    void alertClientsLiveSupportMessage({
        clientName: data.clientName,
        authorName: data.authorName ?? null,
        messagePreview: data.messagePreview,
        intent: data.intent ?? null,
        attachmentCount: data.attachmentCount,
        pageLabel: data.pageLabel ?? null,
    });

    return notifyAllManagers({
        title: `Message support : ${data.clientName}${intentStr}`,
        message: data.messagePreview.slice(0, 140),
        type: data.intent === "PROBLEME" ? "warning" : "info",
    });
}

// ============================================
// RDV EMAIL NOTIFICATIONS
// ============================================

export interface RdvEmailNotificationData extends RdvNotificationData {
    interlocuteurId?: string;
}

/**
 * Send a transactional email to all CLIENT users of the given clientId
 * (and to Client.email if set) when a new RDV is booked on their mission.
 *
 * Respects the per-client `rdvEmailNotificationsEnabled` toggle.
 * Uses the manager-customised SystemEmailTemplate if one exists, otherwise
 * falls back to the default dynamic template.
 *
 * Fire-and-forget: errors are logged but never thrown.
 */
export async function sendNewRdvEmailNotification(
    clientId: string,
    data: RdvEmailNotificationData
): Promise<void> {
    try {
        const [clientUsers, client, customTemplate, interlocuteur] = await Promise.all([
            prisma.user.findMany({
                where: { role: "CLIENT", clientId, isActive: true },
                select: { email: true },
            }),
            prisma.client.findUnique({
                where: { id: clientId },
                select: { email: true, rdvEmailNotificationsEnabled: true },
            }),
            (prisma as any).systemEmailTemplate.findUnique({
                where: { key: "rdv_notification" },
                select: { subject: true, bodyHtml: true },
            }),
            data.interlocuteurId
                ? prisma.clientInterlocuteur.findUnique({
                      where: { id: data.interlocuteurId },
                      select: {
                          emails: true,
                          portalUser: { select: { email: true } },
                      },
                  })
                : Promise.resolve(null),
        ]);

        // Respect per-client opt-out (default true if field doesn't exist yet)
        if (client?.rdvEmailNotificationsEnabled === false) {
            return;
        }

        const recipients = new Set<string>();
        for (const u of clientUsers) {
            if (u.email) recipients.add(u.email);
        }
        if (client?.email) recipients.add(client.email);

        const interlocuteurRecipients = new Set<string>();
        if (interlocuteur) {
            const rawEmails = Array.isArray(interlocuteur.emails) ? interlocuteur.emails : [];
            for (const item of rawEmails) {
                if (typeof item === "string") {
                    const value = item.trim();
                    if (value) interlocuteurRecipients.add(value);
                    continue;
                }
                if (item && typeof item === "object") {
                    const maybeValue = (item as { value?: unknown }).value;
                    if (typeof maybeValue === "string" && maybeValue.trim()) {
                        interlocuteurRecipients.add(maybeValue.trim());
                    }
                }
            }
            if (interlocuteur.portalUser?.email) {
                interlocuteurRecipients.add(interlocuteur.portalUser.email);
            }
        }

        // If an email belongs to the interlocuteur, prefer the commercial CTA version.
        for (const email of interlocuteurRecipients) {
            recipients.delete(email);
        }

        if (recipients.size > 0) {
            // Use custom DB template if available, otherwise use default dynamic builder
            const { subject, html } = customTemplate && data.variant !== "rescheduled"
                ? buildRdvEmailFromCustomTemplate(customTemplate.subject, customTemplate.bodyHtml, data)
                : buildRdvNotificationEmail(data);

            await Promise.allSettled(
                Array.from(recipients).map((email) =>
                    sendTransactionalEmail({ to: email, subject, html })
                )
            );
        }

        if (interlocuteurRecipients.size > 0) {
            const interlocuteurData: RdvNotificationData = {
                ...data,
                portalPath: "/commercial/portal/meetings",
            };
            const { subject, html } = customTemplate && data.variant !== "rescheduled"
                ? buildRdvEmailFromCustomTemplate(
                      customTemplate.subject,
                      customTemplate.bodyHtml,
                      interlocuteurData
                  )
                : buildRdvNotificationEmail(interlocuteurData);

            await Promise.allSettled(
                Array.from(interlocuteurRecipients).map((email) =>
                    sendTransactionalEmail({ to: email, subject, html })
                )
            );
        }
    } catch (error) {
        console.error("[sendNewRdvEmailNotification] Failed:", error);
    }
}

/**
 * Tell the client their RDV moved to a new slot. Same recipients and same
 * per-client toggle as a new booking — only the wording differs, and the old
 * slot is shown so nobody has to guess what changed.
 */
export async function sendRdvRescheduledEmailNotification(
    clientId: string,
    data: RdvEmailNotificationData & { previousScheduledAt?: Date | null }
): Promise<void> {
    return sendNewRdvEmailNotification(clientId, { ...data, variant: "rescheduled" });
}
