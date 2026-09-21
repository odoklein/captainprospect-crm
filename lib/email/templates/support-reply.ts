export const SUPPORT_REPLY_TEMPLATE_VARIABLES = [
  { name: "{{prénom}}", description: "Prenom du destinataire" },
  { name: "{{nom_entreprise}}", description: "Nom de l'entreprise expeditrice" },
  { name: "{{support_url}}", description: "Lien vers le chat du support" },
] as const;

export const DEFAULT_SUPPORT_REPLY_SUBJECT = "Réponse disponible dans le support";

export const DEFAULT_SUPPORT_REPLY_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light only" />
  <title>Réponse disponible dans le support</title>
</head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Nous avons répondu à votre demande dans le chat du support.</div>
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:24px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:24px 28px;background:#4f46e5;color:#ffffff;">
              <h1 style="margin:0;font-size:20px;font-weight:bold;">Réponse disponible dans le support</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 12px;font-size:15px;">Bonjour {{prénom}},</p>
              <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">
                Nous avons répondu à votre demande dans le chat du support.
              </p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">
                Vous pouvez consulter notre réponse et poursuivre l'échange directement depuis votre espace client&nbsp;:
              </p>
              <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px;">
                <tr>
                  <td align="center" bgcolor="#4f46e5" style="border-radius:8px;">
                    <a href="{{support_url}}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:bold;">
                      Accéder au chat du support
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 4px;font-size:15px;">À bientôt,</p>
              <p style="margin:0;font-size:15px;">L'équipe {{nom_entreprise}}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 22px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#6b7280;">
                Cet e-mail est une notification automatique. Merci de répondre directement dans le chat du support.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

export const DEFAULT_SUPPORT_REPLY_TEXT = `Bonjour {{prénom}},

Nous avons répondu à votre demande dans le chat du support.

Vous pouvez consulter notre réponse et poursuivre l'échange directement depuis votre espace client :
{{support_url}}

À bientôt,
L'équipe {{nom_entreprise}}

Cet e-mail est une notification automatique. Merci de répondre directement dans le chat du support.`;

export type SupportReplyEmailVariables = {
  prenom: string;
  nomEntreprise: string;
  supportUrl: string;
};

export function buildSupportReplyEmail(vars: SupportReplyEmailVariables): {
  subject: string;
  html: string;
  text: string;
} {
  const map: Record<string, string> = {
    "{{prénom}}": vars.prenom,
    "{{nom_entreprise}}": vars.nomEntreprise,
    "{{support_url}}": vars.supportUrl,
  };

  const apply = (template: string) =>
    Object.entries(map).reduce((acc, [key, value]) => acc.split(key).join(value), template);

  return {
    subject: DEFAULT_SUPPORT_REPLY_SUBJECT,
    html: apply(DEFAULT_SUPPORT_REPLY_HTML),
    text: apply(DEFAULT_SUPPORT_REPLY_TEXT),
  };
}
