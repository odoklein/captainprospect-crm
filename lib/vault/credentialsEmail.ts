// ============================================
// ACCESS VAULT — credential handover email
//
// Sends an account's login details to the person they belong to. This is the
// one place a vault secret is allowed to leave the system, so it is narrow on
// purpose: the recipient defaults to the credential's own login, the password
// is fetched at send time and never held anywhere else, and the send is
// recorded in the audit trail.
// ============================================

import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/api-utils";
import { decrypt } from "@/lib/encryption";
import { sendTransactionalEmail } from "@/lib/email/transactional";
import { recordVaultAudit } from "./service";

/** Keeps interpolated values from breaking out of the HTML body. */
function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function buildHtml(params: {
    recipientName: string;
    label: string;
    login: string;
    password: string;
    url: string | null;
    senderName: string;
    note: string | null;
}): string {
    const rows: Array<[string, string]> = [
        ["Identifiant", params.login],
        ["Mot de passe", params.password],
    ];
    if (params.url) rows.push(["Adresse de connexion", params.url]);

    const rowsHtml = rows
        .map(
            ([key, value]) => `
              <tr>
                <td style="padding:8px 0;font-size:13px;color:#6b7280;width:170px;">${escapeHtml(key)}</td>
                <td style="padding:8px 0;font-size:14px;color:#111827;font-family:Consolas,Monaco,monospace;font-weight:600;">${escapeHtml(value)}</td>
              </tr>`,
        )
        .join("");

    const noteHtml = params.note
        ? `<p style="margin:0 0 18px;line-height:1.6;">${escapeHtml(params.note)}</p>`
        : "";

    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Vos acces</title>
</head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,sans-serif;color:#1f2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:24px 28px;background:#4f46e5;color:#ffffff;">
              <h1 style="margin:0;font-size:20px;">Vos acces &mdash; ${escapeHtml(params.label)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 12px;">Bonjour ${escapeHtml(params.recipientName)},</p>
              ${noteHtml}
              <p style="margin:0 0 18px;line-height:1.6;">
                Voici vos identifiants de connexion. Nous vous recommandons de changer
                votre mot de passe des votre premiere connexion.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;margin:0 0 20px;">
                ${rowsHtml}
              </table>
              ${
                  params.url
                      ? `<p style="margin:0 0 22px;text-align:center;">
                <a href="${escapeHtml(params.url)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">
                  Me connecter
                </a>
              </p>`
                      : ""
              }
              <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
                Ce message contient des informations confidentielles : ne le transferez pas.
                Pour toute question, repondez directement a cet email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background:#f9fafb;font-size:12px;color:#6b7280;">
              Envoye par ${escapeHtml(params.senderName)} &mdash; Captain Prospect
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export interface SendCredentialsResult {
    sent: boolean;
    to: string;
    message: string;
}

/**
 * Emails a credential's login and password to its owner.
 *
 * @param to Override recipient. Defaults to the credential's own login when
 *           that login is an email address.
 */
export async function sendCredentialsEmail(params: {
    credentialId: string;
    actorId: string;
    to?: string | null;
    note?: string | null;
}): Promise<SendCredentialsResult> {
    const credential = await prisma.vaultCredential.findUnique({
        where: { id: params.credentialId },
        select: {
            id: true,
            label: true,
            login: true,
            url: true,
            passwordEnc: true,
            clientId: true,
            interlocuteur: { select: { firstName: true, lastName: true } },
            user: { select: { name: true, email: true } },
        },
    });
    if (!credential) throw new NotFoundError("Accès introuvable");
    if (!credential.passwordEnc) {
        throw new ValidationError(
            "Aucun mot de passe enregistré pour cet accès — impossible de l'envoyer.",
        );
    }

    const recipient = (params.to?.trim() || credential.user?.email || credential.login).trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) {
        throw new ValidationError(
            `« ${recipient} » n'est pas une adresse email valide. Précise le destinataire.`,
        );
    }

    let password: string;
    try {
        password = decrypt(credential.passwordEnc);
    } catch {
        throw new ValidationError(
            "Le mot de passe stocké n'a pas pu être déchiffré. Il doit être réinitialisé.",
        );
    }

    const actor = await prisma.user.findUnique({
        where: { id: params.actorId },
        select: { name: true },
    });

    const recipientName =
        credential.user?.name ||
        (credential.interlocuteur
            ? `${credential.interlocuteur.firstName} ${credential.interlocuteur.lastName}`.trim()
            : recipient);

    const sent = await sendTransactionalEmail({
        to: recipient,
        subject: `Vos acces - ${credential.label}`,
        html: buildHtml({
            recipientName,
            label: credential.label,
            login: credential.login,
            password,
            url: credential.url,
            senderName: actor?.name || "Captain Prospect",
            note: params.note?.trim() || null,
        }),
        text: [
            `Bonjour ${recipientName},`,
            "",
            params.note?.trim() || "Voici vos identifiants de connexion.",
            "",
            `Identifiant : ${credential.login}`,
            `Mot de passe : ${password}`,
            credential.url ? `Connexion : ${credential.url}` : "",
            "",
            "Merci de changer ce mot de passe des votre premiere connexion.",
        ]
            .filter(Boolean)
            .join("\n"),
    });

    if (!sent) {
        // sendTransactionalEmail swallows its own failures and returns false;
        // surfacing it here stops the vault from claiming a send that never left.
        throw new ValidationError(
            "L'email n'a pas pu être envoyé (SMTP non configuré ou en erreur). Rien n'a été transmis.",
        );
    }

    await prisma.vaultCredential.update({
        where: { id: credential.id },
        data: { lastSentAt: new Date(), lastSentTo: recipient },
    });

    await recordVaultAudit({
        action: "CREDENTIALS_EMAILED",
        summary: `Identifiants envoyés à ${recipient} — ${credential.label}`,
        actorId: params.actorId,
        credentialId: credential.id,
        clientId: credential.clientId,
        metadata: { to: recipient },
    });

    return {
        sent: true,
        to: recipient,
        message: `Identifiants envoyés à ${recipient}.`,
    };
}
