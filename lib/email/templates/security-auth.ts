import { brand } from "@/lib/brand";
export const PASSWORD_RECOVERY_TEMPLATE_VARIABLES = [
  { name: "{{userName}}", description: "Nom de l'utilisateur" },
  { name: "{{resetUrl}}", description: "Lien de reinitialisation" },
  { name: "{{expiryMinutes}}", description: "Duree de validite en minutes" },
] as const;

export const PASSWORD_OTP_TEMPLATE_VARIABLES = [
  { name: "{{userName}}", description: "Nom de l'utilisateur" },
  { name: "{{otpCode}}", description: "Code OTP a usage unique" },
  { name: "{{expiryMinutes}}", description: "Duree de validite en minutes" },
] as const;

export const DEFAULT_PASSWORD_RECOVERY_SUBJECT =
  `Réinitialisation de votre mot de passe - ${brand.name}`;

export const DEFAULT_PASSWORD_RECOVERY_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reinitialisation du mot de passe</title>
</head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,sans-serif;color:#1f2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:24px 28px;background:#4f46e5;color:#ffffff;">
              <h1 style="margin:0;font-size:20px;">Reinitialisation du mot de passe</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 12px;">Bonjour {{userName}},</p>
              <p style="margin:0 0 18px;line-height:1.6;">
                Nous avons recu une demande de reinitialisation de votre mot de passe.
                Cliquez sur le bouton ci-dessous pour definir un nouveau mot de passe.
              </p>
              <p style="margin:0 0 22px;text-align:center;">
                <a href="{{resetUrl}}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">
                  Reinitialiser mon mot de passe
                </a>
              </p>
              <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">
                Ce lien expire dans {{expiryMinutes}} minutes.
              </p>
              <p style="margin:0;font-size:13px;color:#6b7280;">
                Si vous n'etes pas a l'origine de cette demande, ignorez cet email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

export const DEFAULT_PASSWORD_OTP_SUBJECT =
  `Votre code OTP de récupération - ${brand.name}`;

export const DEFAULT_PASSWORD_OTP_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Code OTP</title>
</head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,sans-serif;color:#1f2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:24px 28px;background:#0f172a;color:#ffffff;">
              <h1 style="margin:0;font-size:20px;">Code OTP de recuperation</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 12px;">Bonjour {{userName}},</p>
              <p style="margin:0 0 16px;line-height:1.6;">
                Utilisez ce code OTP pour valider votre demande de recuperation:
              </p>
              <p style="margin:0 0 18px;text-align:center;font-size:30px;letter-spacing:4px;font-weight:700;color:#111827;">
                {{otpCode}}
              </p>
              <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">
                Ce code expire dans {{expiryMinutes}} minutes.
              </p>
              <p style="margin:0;font-size:13px;color:#6b7280;">
                Si vous n'etes pas a l'origine de cette demande, ignorez cet email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

export function applyEmailTemplateVariables(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(
      key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "g"
    );
    result = result.replace(pattern, value);
  }
  return result;
}
