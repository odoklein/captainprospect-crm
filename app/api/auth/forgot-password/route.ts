import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { sendTransactionalEmail } from "@/lib/email/transactional";
import { recordAuthEvent } from "@/lib/auth-event";
import {
  DEFAULT_PASSWORD_RECOVERY_HTML,
  DEFAULT_PASSWORD_RECOVERY_SUBJECT,
  applyEmailTemplateVariables,
} from "@/lib/email/templates/security-auth";
import { brand } from "@/lib/brand";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      // Always return success to prevent email enumeration
      return Response.json({ success: true });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const forwardedFor = request.headers.get("x-forwarded-for");
    const ip = forwardedFor?.split(",")[0]?.trim() || null;
    const userAgent = request.headers.get("user-agent");

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, name: true, isActive: true },
    });

    // Always return success even if user doesn't exist (prevent enumeration)
    if (!user || user.isActive === false) {
      return Response.json({ success: true });
    }

    // Invalidate any existing unused tokens for this email
    await prisma.passwordResetToken.updateMany({
      where: { email: normalizedEmail, usedAt: null },
      data: { usedAt: new Date() },
    });

    // Generate a secure token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = await bcrypt.hash(rawToken, 10);

    // Store hashed token (expires in 1 hour)
    await prisma.passwordResetToken.create({
      data: {
        email: normalizedEmail,
        token: hashedToken,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    recordAuthEvent({
      outcome: "SUCCESS",
      userId: user.id,
      ip,
      userAgent,
      eventTag: "PASSWORD_RECOVERY_REQUEST",
    });

    // Build reset URL
    const baseUrl =
      brand.appUrl;
    const resetUrl = `${baseUrl}/reset-password?token=${rawToken}&email=${encodeURIComponent(normalizedEmail)}`;

    const customTemplate = await (prisma as any).systemEmailTemplate.findUnique({
      where: { key: "password_recovery" },
      select: { subject: true, bodyHtml: true },
    });
    const subjectTemplate =
      customTemplate?.subject || DEFAULT_PASSWORD_RECOVERY_SUBJECT;
    const htmlTemplate = customTemplate?.bodyHtml || DEFAULT_PASSWORD_RECOVERY_HTML;
    const templateVars = {
      "{{userName}}": user.name || "Bonjour",
      "{{resetUrl}}": resetUrl,
      "{{expiryMinutes}}": "60",
    };

    // Send email (still returns success to the client to prevent enumeration)
    const emailSent = await sendTransactionalEmail({
      to: normalizedEmail,
      subject: applyEmailTemplateVariables(subjectTemplate, templateVars),
      html: applyEmailTemplateVariables(htmlTemplate, templateVars),
      text: `Bonjour ${user.name},\n\nCliquez sur ce lien pour réinitialiser votre mot de passe :\n${resetUrl}\n\nCe lien expire dans 1 heure.\n\nSi vous n'avez pas demandé cette réinitialisation, ignorez cet email.`,
      from: process.env.SYSTEM_SMTP_FROM || undefined,
    });
    if (!emailSent) {
      console.error("[forgot-password] Transactional email send failed", {
        email: normalizedEmail,
      });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("[forgot-password] Error:", error);
    // Still return success to prevent information leakage
    return Response.json({ success: true });
  }
}
