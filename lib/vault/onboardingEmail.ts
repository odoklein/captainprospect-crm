/**
 * The commercial onboarding email.
 *
 * Jeff's flow, verbatim from the call: "je veux que tu mettes l'accès à la
 * plateforme, l'identifiant, le mot de passe, que tu rappelles qu'ils
 * confirment le calendrier, qu'ils ont un chat en direct sur la plateforme."
 *
 * One recipient at a time, each with their own password decrypted at send time.
 * A failure on one recipient does not abort the others — the caller gets a
 * per-recipient report, because "9 sur 13" has to be visible, not swallowed.
 */

import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { sendTransactionalEmail } from "@/lib/email/transactional";
import { recordVaultAudit } from "./service";
import { portalLoginUrl } from "./portalAccounts";

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export interface OnboardingRecipient {
    interlocuteurId: string;
    name: string;
    email: string;
    credentialId: string;
    login: string;
    bookingLink: string | null;
}

export interface OnboardingSendResult {
    name: string;
    email: string;
    sent: boolean;
    error?: string;
}

interface TemplateInput {
    recipientName: string;
    clientName: string;
    login: string;
    password: string;
    loginUrl: string;
    bookingLink: string | null;
    intro: string | null;
    senderName: string;
}

export function buildOnboardingEmailHtml(input: TemplateInput): string {
    const rows: Array<[string, string]> = [
        ["Adresse de connexion", input.loginUrl],
        ["Identifiant", input.login],
        ["Mot de passe", input.password],
    ];

    const rowsHtml = rows
        .map(
            ([key, value]) => `
              <tr>
                <td style="padding:7px 0;font-size:13px;color:#6b7280;width:170px;">${escapeHtml(key)}</td>
                <td style="padding:7px 0;font-size:14px;color:#111827;font-family:Consolas,Monaco,monospace;font-weight:600;word-break:break-all;">${escapeHtml(value)}</td>
              </tr>`,
        )
        .join("");

    const calendarBlock = input.bookingLink
        ? `<li style="margin-bottom:8px;">
             <b>Verifie ton calendrier</b> &mdash; ton lien de prise de RDV est
             <a href="${escapeHtml(input.bookingLink)}" style="color:#C64B8B;">${escapeHtml(input.bookingLink)}</a>.
             Confirme-nous que tes disponibilites y sont a jour.
           </li>`
        : `<li style="margin-bottom:8px;">
             <b>Verifie ton calendrier</b> &mdash; confirme-nous que tes disponibilites de prise de RDV sont a jour.
           </li>`;

    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Ton acces a la plateforme</title>
</head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,sans-serif;color:#1f2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:24px 28px;background:#C64B8B;color:#ffffff;">
              <h1 style="margin:0;font-size:20px;">Ton acces a la plateforme</h1>
              <p style="margin:6px 0 0;font-size:13px;opacity:.9;">${escapeHtml(input.clientName)} &times; Captain Prospect</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 14px;">Bonjour ${escapeHtml(input.recipientName)},</p>
              ${input.intro ? `<p style="margin:0 0 16px;line-height:1.6;">${escapeHtml(input.intro)}</p>` : ""}
              <p style="margin:0 0 18px;line-height:1.6;">
                Voici ton acces personnel a la plateforme. Tu y retrouves tes RDV, tes contacts
                et l'avancement de la prospection en temps reel.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;margin:0 0 20px;">
                ${rowsHtml}
              </table>

              <p style="margin:0 0 20px;text-align:center;">
                <a href="${escapeHtml(input.loginUrl)}" style="display:inline-block;background:#C64B8B;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;">
                  Me connecter
                </a>
              </p>

              <p style="margin:0 0 10px;font-weight:600;font-size:14px;">Deux choses a faire en arrivant</p>
              <ul style="margin:0 0 20px;padding-left:18px;line-height:1.6;font-size:14px;">
                <li style="margin-bottom:8px;">
                  <b>Change ton mot de passe</b> des ta premiere connexion.
                </li>
                ${calendarBlock}
              </ul>

              <p style="margin:0 0 18px;line-height:1.6;font-size:14px;background:#FAEDF4;border-radius:8px;padding:12px 14px;">
                Une question&nbsp;? Tu as un <b>chat en direct</b> sur la plateforme, en bas a droite
                de ton ecran. On te repond directement dessus, pas besoin de mail.
              </p>

              <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
                Ce message contient tes identifiants personnels : ne le transfere pas.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background:#f9fafb;font-size:12px;color:#6b7280;">
              Envoye par ${escapeHtml(input.senderName)} &mdash; Captain Prospect
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Sends the onboarding email to one commercial.
 *
 * Returns rather than throws, so a batch can report "9 sur 13" honestly.
 */
async function sendOne(
    recipient: OnboardingRecipient,
    context: { clientName: string; senderName: string; intro: string | null; actorId: string },
): Promise<OnboardingSendResult> {
    const base = { name: recipient.name, email: recipient.email };

    const credential = await prisma.vaultCredential.findUnique({
        where: { id: recipient.credentialId },
        select: { id: true, passwordEnc: true, url: true, clientId: true, label: true },
    });
    if (!credential?.passwordEnc) {
        return { ...base, sent: false, error: "Aucun mot de passe enregistré dans le coffre" };
    }

    let password: string;
    try {
        password = decrypt(credential.passwordEnc);
    } catch {
        return { ...base, sent: false, error: "Mot de passe illisible (clé de chiffrement changée)" };
    }

    const html = buildOnboardingEmailHtml({
        recipientName: recipient.name,
        clientName: context.clientName,
        login: recipient.login,
        password,
        loginUrl: credential.url || portalLoginUrl(),
        bookingLink: recipient.bookingLink,
        intro: context.intro,
        senderName: context.senderName,
    });

    const sent = await sendTransactionalEmail({
        to: recipient.email,
        subject: "Ton acces a la plateforme Captain Prospect",
        html,
        text: [
            `Bonjour ${recipient.name},`,
            "",
            context.intro ?? "Voici ton acces personnel a la plateforme.",
            "",
            `Connexion : ${credential.url || portalLoginUrl()}`,
            `Identifiant : ${recipient.login}`,
            `Mot de passe : ${password}`,
            "",
            "A faire en arrivant : change ton mot de passe, et confirme que tes disponibilites de RDV sont a jour.",
            recipient.bookingLink ? `Ton lien de RDV : ${recipient.bookingLink}` : "",
            "",
            "Une question ? Tu as un chat en direct sur la plateforme, en bas a droite.",
        ]
            .filter(Boolean)
            .join("\n"),
    });

    if (!sent) {
        // sendTransactionalEmail swallows its own failures and returns false.
        return { ...base, sent: false, error: "SMTP indisponible ou en erreur" };
    }

    await prisma.vaultCredential.update({
        where: { id: credential.id },
        data: { lastSentAt: new Date(), lastSentTo: recipient.email },
    });

    await recordVaultAudit({
        action: "CREDENTIALS_EMAILED",
        summary: `Email d'accès envoyé à ${recipient.email} — ${credential.label}`,
        actorId: context.actorId,
        credentialId: credential.id,
        clientId: credential.clientId,
        metadata: { to: recipient.email, template: "onboarding" },
    });

    return { ...base, sent: true };
}

export async function sendOnboardingEmails(params: {
    recipients: OnboardingRecipient[];
    clientName: string;
    senderName: string;
    intro: string | null;
    actorId: string;
}): Promise<{ results: OnboardingSendResult[]; sent: number; failed: number }> {
    const results: OnboardingSendResult[] = [];

    // Sequential on purpose: a burst of SMTP connections is the fastest way to
    // get an outbound domain rate-limited.
    for (const recipient of params.recipients) {
        results.push(
            await sendOne(recipient, {
                clientName: params.clientName,
                senderName: params.senderName,
                intro: params.intro,
                actorId: params.actorId,
            }),
        );
    }

    return {
        results,
        sent: results.filter((r) => r.sent).length,
        failed: results.filter((r) => !r.sent).length,
    };
}

/**
 * Builds the recipient list for a client: every active commercial that has a
 * portal account AND a stored password, with their booking link.
 */
export async function resolveOnboardingRecipients(
    clientId: string,
    interlocuteurIds?: string[],
): Promise<{ ready: OnboardingRecipient[]; skipped: Array<{ name: string; reason: string }> }> {
    const interlocuteurs = await prisma.clientInterlocuteur.findMany({
        where: {
            clientId,
            isActive: true,
            ...(interlocuteurIds?.length ? { id: { in: interlocuteurIds } } : {}),
        },
        select: {
            id: true,
            firstName: true,
            lastName: true,
            bookingLinks: true,
            portalUser: { select: { id: true, email: true, isActive: true } },
        },
    });

    const ready: OnboardingRecipient[] = [];
    const skipped: Array<{ name: string; reason: string }> = [];

    for (const person of interlocuteurs) {
        const name = `${person.firstName} ${person.lastName}`.trim();

        if (!person.portalUser) {
            skipped.push({ name, reason: "pas de compte portail" });
            continue;
        }
        if (!person.portalUser.isActive) {
            skipped.push({ name, reason: "compte désactivé" });
            continue;
        }

        const credential = await prisma.vaultCredential.findFirst({
            where: { userId: person.portalUser.id, type: "PORTAL" },
            select: { id: true, login: true, passwordEnc: true },
        });
        if (!credential) {
            skipped.push({ name, reason: "aucun accès enregistré dans le coffre" });
            continue;
        }
        if (!credential.passwordEnc) {
            skipped.push({ name, reason: "mot de passe absent du coffre — régénère-le d'abord" });
            continue;
        }

        const links = Array.isArray(person.bookingLinks)
            ? (person.bookingLinks as Array<{ value?: string }>)
            : [];

        ready.push({
            interlocuteurId: person.id,
            name,
            email: person.portalUser.email,
            credentialId: credential.id,
            login: credential.login,
            bookingLink: links.find((l) => l?.value)?.value ?? null,
        });
    }

    return { ready, skipped };
}
