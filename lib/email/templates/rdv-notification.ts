export interface RdvNotificationData {
  contactFirstName?: string | null;
  contactLastName?: string | null;
  companyName?: string | null;
  missionName?: string | null;
  scheduledAt?: Date | null;
  meetingType?: "VISIO" | "PHYSIQUE" | "TELEPHONIQUE" | null;
  meetingChannel?: "CALL" | "EMAIL" | "LINKEDIN" | null;
  meetingJoinUrl?: string | null;
  meetingAddress?: string | null;
  meetingPhone?: string | null;
  appUrl?: string;
  /** Override the portal path used in the CTA button. Defaults to /client/portal/meetings. */
  portalPath?: string;
  /**
   * "rescheduled" re-uses this layout to announce a date change rather than a
   * new booking: the wording changes and the old slot is shown struck through.
   */
  variant?: "new" | "rescheduled";
  /** The slot the RDV used to occupy. Only read when variant is "rescheduled". */
  previousScheduledAt?: Date | null;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function meetingTypeLabel(type?: string | null): string {
  if (type === "VISIO") return "Visioconférence";
  if (type === "PHYSIQUE") return "Présentiel";
  if (type === "TELEPHONIQUE") return "Téléphonique";
  return "Non précisé";
}

function meetingTypeBadgeColor(type?: string | null): {
  bg: string;
  text: string;
} {
  if (type === "VISIO") return { bg: "#dbeafe", text: "#1d4ed8" };
  if (type === "PHYSIQUE") return { bg: "#dcfce7", text: "#15803d" };
  if (type === "TELEPHONIQUE") return { bg: "#fef9c3", text: "#854d0e" };
  return { bg: "#f3f4f6", text: "#374151" };
}

function meetingTypeIcon(type?: string | null): string {
  if (type === "VISIO") return "📹";
  if (type === "PHYSIQUE") return "📍";
  if (type === "TELEPHONIQUE") return "📞";
  return "📅";
}

function meetingChannelLabel(channel?: string | null): string {
  if (channel === "CALL") return "Appel";
  if (channel === "EMAIL") return "Email";
  if (channel === "LINKEDIN") return "LinkedIn";
  return "Appel";
}

function connectionBlock(data: RdvNotificationData): string {
  if (data.meetingType === "VISIO" && data.meetingJoinUrl) {
    return `
      <tr>
        <td style="padding: 0 0 24px 0;">
          <table cellpadding="0" cellspacing="0" width="100%" style="background-color: #eff6ff; border-radius: 8px; border: 1px solid #bfdbfe;">
            <tr>
              <td style="padding: 16px 20px;">
                <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 600; color: #1d4ed8; text-transform: uppercase; letter-spacing: 0.05em;">
                  📹 Lien de connexion
                </p>
                <a href="${data.meetingJoinUrl}" style="color: #1d4ed8; font-size: 14px; word-break: break-all; text-decoration: none; font-weight: 500;">
                  ${data.meetingJoinUrl}
                </a>
                <br/>
                <a href="${data.meetingJoinUrl}" style="display: inline-block; margin-top: 12px; padding: 10px 20px; background-color: #1d4ed8; color: #ffffff; font-size: 13px; font-weight: 600; border-radius: 6px; text-decoration: none;">
                  Rejoindre le meeting →
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
  }

  if (data.meetingType === "PHYSIQUE" && data.meetingAddress) {
    return `
      <tr>
        <td style="padding: 0 0 24px 0;">
          <table cellpadding="0" cellspacing="0" width="100%" style="background-color: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0;">
            <tr>
              <td style="padding: 16px 20px;">
                <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 600; color: #15803d; text-transform: uppercase; letter-spacing: 0.05em;">
                  📍 Adresse
                </p>
                <p style="margin: 0; font-size: 14px; color: #166534; font-weight: 500; line-height: 1.5;">
                  ${data.meetingAddress}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
  }

  if (data.meetingType === "TELEPHONIQUE" && data.meetingPhone) {
    return `
      <tr>
        <td style="padding: 0 0 24px 0;">
          <table cellpadding="0" cellspacing="0" width="100%" style="background-color: #fefce8; border-radius: 8px; border: 1px solid #fde68a;">
            <tr>
              <td style="padding: 16px 20px;">
                <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 600; color: #854d0e; text-transform: uppercase; letter-spacing: 0.05em;">
                  📞 Numéro de téléphone
                </p>
                <p style="margin: 0; font-size: 16px; color: #78350f; font-weight: 700; letter-spacing: 0.05em;">
                  ${data.meetingPhone}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
  }

  return "";
}

/**
 * Builds the HTML body for a new RDV notification email.
 */
export function buildRdvNotificationEmail(data: RdvNotificationData): {
  subject: string;
  html: string;
} {
  const appUrl =
    data.appUrl ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    "https://app.captainprospect.fr";
  const portalPath = data.portalPath || "/client/portal/meetings";

  const contactName = [data.contactFirstName, data.contactLastName]
    .filter(Boolean)
    .join(" ")
    .trim() || "un contact";

  const company = data.companyName || "une entreprise";
  const mission = data.missionName || "votre mission";

  const badgeColor = meetingTypeBadgeColor(data.meetingType);
  const typeLabel = meetingTypeLabel(data.meetingType);
  const typeIcon = meetingTypeIcon(data.meetingType);
  const channelLabel = meetingChannelLabel(data.meetingChannel);

  const isRescheduled = data.variant === "rescheduled";

  const subject = isRescheduled
    ? `RDV déplacé — ${contactName} (${company})`
    : `Nouveau RDV confirmé — ${contactName} (${company})`;

  const previousDateRow =
    isRescheduled && data.previousScheduledAt
      ? `<tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td width="40%" style="font-size: 13px; color: #6b7280; font-weight: 500;">🕓 Ancien créneau</td>
              <td style="font-size: 13px; color: #9ca3af; font-weight: 500; text-decoration: line-through;">${capitalize(formatDate(data.previousScheduledAt))} à ${formatTime(data.previousScheduledAt)}</td>
            </tr>
          </table>
        </td>
      </tr>`
      : "";

  const dateRow = data.scheduledAt
    ? `<tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td width="40%" style="font-size: 13px; color: #6b7280; font-weight: 500;">📅 Date</td>
              <td style="font-size: 13px; color: #111827; font-weight: 600;">${capitalize(formatDate(data.scheduledAt))}</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td width="40%" style="font-size: 13px; color: #6b7280; font-weight: 500;">⏰ Heure</td>
              <td style="font-size: 13px; color: #111827; font-weight: 600;">${formatTime(data.scheduledAt)} (Paris)</td>
            </tr>
          </table>
        </td>
      </tr>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">

  <!-- Wrapper -->
  <table cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; width: 100%;">

          <!-- HEADER -->
          <tr>
            <td style="background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%); border-radius: 12px 12px 0 0; padding: 28px 36px; text-align: center;">
              <p style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">
                ⚓ Captain Prospect
              </p>
              <p style="margin: 6px 0 0; font-size: 13px; color: #94a3b8; letter-spacing: 0.04em; text-transform: uppercase;">
                Notification · Rendez-vous
              </p>
            </td>
          </tr>

          <!-- BODY CARD -->
          <tr>
            <td style="background-color: #ffffff; padding: 36px 36px 28px; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">

              <!-- Success badge -->
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color: ${isRescheduled ? "#fffbeb" : "#f0fdf4"}; border: 1px solid ${isRescheduled ? "#fcd34d" : "#86efac"}; border-radius: 20px; padding: 5px 14px; display: inline-block;">
                    <span style="font-size: 12px; font-weight: 700; color: ${isRescheduled ? "#b45309" : "#15803d"}; text-transform: uppercase; letter-spacing: 0.06em;">
                      ${isRescheduled ? "🕓 RDV déplacé" : "✅ Nouveau RDV confirmé"}
                    </span>
                  </td>
                </tr>
              </table>

              <h1 style="margin: 18px 0 8px; font-size: 22px; font-weight: 800; color: #0f172a; line-height: 1.3;">
                ${isRescheduled ? "Votre rendez-vous a été déplacé" : "Bonne nouvelle !"}
              </h1>
              <p style="margin: 0 0 24px; font-size: 15px; color: #475569; line-height: 1.6;">
                ${
                  isRescheduled
                    ? `La date du rendez-vous avec <strong style="color: #0f172a;">${contactName}</strong> (${company}) sur votre mission <strong style="color: #0f172a;">${mission}</strong> a changé. Voici le nouveau créneau :`
                    : `Un nouveau rendez-vous a été réservé sur votre mission <strong style="color: #0f172a;">${mission}</strong>.`
                }
              </p>

              <!-- Details table -->
              <table cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0; margin-bottom: 24px;">
                ${previousDateRow}
                <tr>
                  <td style="padding: 20px 20px 0;">
                    <p style="margin: 0 0 12px; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em;">
                      Détails du rendez-vous
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 20px 16px;">
                    <table cellpadding="0" cellspacing="0" width="100%">
                      ${dateRow}
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
                          <table cellpadding="0" cellspacing="0" width="100%">
                            <tr>
                              <td width="40%" style="font-size: 13px; color: #6b7280; font-weight: 500;">👤 Contact</td>
                              <td style="font-size: 13px; color: #111827; font-weight: 600;">${contactName}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
                          <table cellpadding="0" cellspacing="0" width="100%">
                            <tr>
                              <td width="40%" style="font-size: 13px; color: #6b7280; font-weight: 500;">🏢 Entreprise</td>
                              <td style="font-size: 13px; color: #111827; font-weight: 600;">${company}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
                          <table cellpadding="0" cellspacing="0" width="100%">
                            <tr>
                              <td width="40%" style="font-size: 13px; color: #6b7280; font-weight: 500;">📡 Canal</td>
                              <td style="font-size: 13px; color: #111827; font-weight: 600;">${channelLabel}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <table cellpadding="0" cellspacing="0" width="100%">
                            <tr>
                              <td width="40%" style="font-size: 13px; color: #6b7280; font-weight: 500;">${typeIcon} Format</td>
                              <td>
                                <span style="display: inline-block; padding: 2px 10px; background-color: ${badgeColor.bg}; color: ${badgeColor.text}; font-size: 12px; font-weight: 700; border-radius: 12px;">
                                  ${typeLabel}
                                </span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Connection block (VISIO / PHYSIQUE / TELEPHONIQUE) -->
              <table cellpadding="0" cellspacing="0" width="100%">
                ${connectionBlock(data)}
              </table>

              <!-- CTA button -->
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="padding: 8px 0 0;">
                    <a href="${appUrl}${portalPath}"
                       style="display: inline-block; padding: 13px 32px; background-color: #0f172a; color: #ffffff; font-size: 14px; font-weight: 700; border-radius: 8px; text-decoration: none; letter-spacing: 0.01em;">
                      Voir tous mes RDVs →
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background-color: #f8fafc; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none; padding: 20px 36px; text-align: center;">
              <p style="margin: 0 0 4px; font-size: 12px; color: #94a3b8;">
                <strong style="color: #64748b;">Captain Prospect</strong> · Plateforme de prospection B2B
              </p>
              <p style="margin: 0; font-size: 11px; color: #cbd5e1; line-height: 1.5;">
                Vous recevez cet email car vous êtes client sur la plateforme Captain Prospect.<br/>
                Pour toute question, contactez votre chargé de compte.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;

  return { subject, html };
}

// ============================================
// VARIABLE SUBSTITUTION (for manager-editable templates)
// ============================================

/** All variables available in the editable template */
export const RDV_TEMPLATE_VARIABLES: { name: string; description: string }[] = [
  { name: "{{contactName}}", description: "Nom complet du contact (prénom + nom)" },
  { name: "{{companyName}}", description: "Nom de l'entreprise du contact" },
  { name: "{{missionName}}", description: "Nom de la mission" },
  { name: "{{meetingDate}}", description: "Date du RDV (ex: lundi 10 mars 2026)" },
  { name: "{{meetingTime}}", description: "Heure du RDV (ex: 14:30)" },
  { name: "{{meetingTypeLabel}}", description: "Format du RDV (Visioconférence / Présentiel / Téléphonique)" },
  { name: "{{meetingChannelLabel}}", description: "Canal du RDV (Appel / Email / LinkedIn)" },
  { name: "{{meetingJoinUrl}}", description: "Lien de connexion (VISIO uniquement)" },
  { name: "{{meetingAddress}}", description: "Adresse (PHYSIQUE uniquement)" },
  { name: "{{meetingPhone}}", description: "Numéro de téléphone (TÉLÉPHONIQUE uniquement)" },
  { name: "{{portalUrl}}", description: "Lien vers le portail client (mes RDVs)" },
];

/** Substitute {{variables}} in a template string with actual values */
export function substituteTemplateVariables(
  template: string,
  data: RdvNotificationData
): string {
  const appUrl =
    data.appUrl ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    "https://app.captainprospect.fr";
  const portalPath = data.portalPath || "/client/portal/meetings";

  const contactName = [data.contactFirstName, data.contactLastName]
    .filter(Boolean)
    .join(" ")
    .trim() || "un contact";

  const vars: Record<string, string> = {
    "{{contactName}}": contactName,
    "{{companyName}}": data.companyName || "une entreprise",
    "{{missionName}}": data.missionName || "votre mission",
    "{{meetingDate}}": data.scheduledAt
      ? capitalize(formatDate(data.scheduledAt))
      : "Date non définie",
    "{{meetingTime}}": data.scheduledAt
      ? formatTime(data.scheduledAt) + " (Paris)"
      : "",
    "{{meetingTypeLabel}}": meetingTypeLabel(data.meetingType),
    "{{meetingChannelLabel}}": meetingChannelLabel(data.meetingChannel),
    "{{meetingJoinUrl}}": data.meetingJoinUrl || "",
    "{{meetingAddress}}": data.meetingAddress || "",
    "{{meetingPhone}}": data.meetingPhone || "",
    "{{portalUrl}}": `${appUrl}${portalPath}`,
  };

  return Object.entries(vars).reduce(
    (str, [key, val]) => str.replaceAll(key, val),
    template
  );
}

/**
 * Build the email using a manager-saved custom template (with {{variable}} substitution).
 * Falls back to the dynamic default if no custom template is provided.
 */
export function buildRdvEmailFromCustomTemplate(
  customSubject: string,
  customBodyHtml: string,
  data: RdvNotificationData
): { subject: string; html: string } {
  return {
    subject: substituteTemplateVariables(customSubject, data),
    html: substituteTemplateVariables(customBodyHtml, data),
  };
}

// ============================================
// DEFAULT TEMPLATE CONSTANTS (for the manager editor)
// ============================================

export const DEFAULT_RDV_TEMPLATE_SUBJECT =
  "Nouveau RDV confirmé — {{contactName}} ({{companyName}})";

export const DEFAULT_RDV_TEMPLATE_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nouveau RDV confirmé</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; width: 100%;">

          <!-- HEADER -->
          <tr>
            <td style="background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%); border-radius: 12px 12px 0 0; padding: 28px 36px; text-align: center;">
              <p style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">⚓ Captain Prospect</p>
              <p style="margin: 6px 0 0; font-size: 13px; color: #94a3b8; letter-spacing: 0.04em; text-transform: uppercase;">Notification · Rendez-vous</p>
            </td>
          </tr>

          <!-- BODY CARD -->
          <tr>
            <td style="background-color: #ffffff; padding: 36px 36px 28px; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">

              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color: #f0fdf4; border: 1px solid #86efac; border-radius: 20px; padding: 5px 14px;">
                    <span style="font-size: 12px; font-weight: 700; color: #15803d; text-transform: uppercase; letter-spacing: 0.06em;">✅ Nouveau RDV confirmé</span>
                  </td>
                </tr>
              </table>

              <h1 style="margin: 18px 0 8px; font-size: 22px; font-weight: 800; color: #0f172a; line-height: 1.3;">Bonne nouvelle !</h1>
              <p style="margin: 0 0 24px; font-size: 15px; color: #475569; line-height: 1.6;">
                Un nouveau rendez-vous a été réservé sur votre mission <strong style="color: #0f172a;">{{missionName}}</strong>.
              </p>

              <!-- Details table -->
              <table cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0; margin-bottom: 24px;">
                <tr><td style="padding: 20px 20px 0;"><p style="margin: 0 0 12px; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em;">Détails du rendez-vous</p></td></tr>
                <tr>
                  <td style="padding: 0 20px 16px;">
                    <table cellpadding="0" cellspacing="0" width="100%">
                      <tr><td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;"><table cellpadding="0" cellspacing="0" width="100%"><tr><td width="40%" style="font-size: 13px; color: #6b7280; font-weight: 500;">📅 Date</td><td style="font-size: 13px; color: #111827; font-weight: 600;">{{meetingDate}}</td></tr></table></td></tr>
                      <tr><td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;"><table cellpadding="0" cellspacing="0" width="100%"><tr><td width="40%" style="font-size: 13px; color: #6b7280; font-weight: 500;">⏰ Heure</td><td style="font-size: 13px; color: #111827; font-weight: 600;">{{meetingTime}}</td></tr></table></td></tr>
                      <tr><td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;"><table cellpadding="0" cellspacing="0" width="100%"><tr><td width="40%" style="font-size: 13px; color: #6b7280; font-weight: 500;">👤 Contact</td><td style="font-size: 13px; color: #111827; font-weight: 600;">{{contactName}}</td></tr></table></td></tr>
                      <tr><td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;"><table cellpadding="0" cellspacing="0" width="100%"><tr><td width="40%" style="font-size: 13px; color: #6b7280; font-weight: 500;">🏢 Entreprise</td><td style="font-size: 13px; color: #111827; font-weight: 600;">{{companyName}}</td></tr></table></td></tr>
                      <tr><td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;"><table cellpadding="0" cellspacing="0" width="100%"><tr><td width="40%" style="font-size: 13px; color: #6b7280; font-weight: 500;">📋 Format</td><td style="font-size: 13px; color: #111827; font-weight: 600;">{{meetingTypeLabel}}</td></tr></table></td></tr>
                      <tr><td style="padding: 8px 0;"><table cellpadding="0" cellspacing="0" width="100%"><tr><td width="40%" style="font-size: 13px; color: #6b7280; font-weight: 500;">📡 Canal</td><td style="font-size: 13px; color: #111827; font-weight: 600;">{{meetingChannelLabel}}</td></tr></table></td></tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="padding: 8px 0 0;">
                    <a href="{{portalUrl}}" style="display: inline-block; padding: 13px 32px; background-color: #0f172a; color: #ffffff; font-size: 14px; font-weight: 700; border-radius: 8px; text-decoration: none; letter-spacing: 0.01em;">Voir tous mes RDVs →</a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background-color: #f8fafc; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none; padding: 20px 36px; text-align: center;">
              <p style="margin: 0 0 4px; font-size: 12px; color: #94a3b8;"><strong style="color: #64748b;">Captain Prospect</strong> · Plateforme de prospection B2B</p>
              <p style="margin: 0; font-size: 11px; color: #cbd5e1; line-height: 1.5;">Vous recevez cet email car vous êtes client sur la plateforme Captain Prospect.<br/>Pour toute question, contactez votre chargé de compte.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
