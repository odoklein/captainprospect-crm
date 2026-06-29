// ============================================
// EMAIL SENDING SERVICE
// Handles email sending with tracking
// ============================================

import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { inlineHtmlForEmail } from "./inline-styles";
import {
  getEmailProvider,
  OAuthTokens,
  SendEmailParams,
  EmailAddress,
} from "../providers";
import { Mailbox } from "@prisma/client";
import { randomUUID } from "crypto";

// ============================================
// TYPES
// ============================================

export interface SendOptions {
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  attachments?: {
    filename: string;
    content: Buffer;
    mimeType: string;
  }[];
  trackPixelId?: string; // Legacy support
  trackingPixelId?: string;
  inReplyTo?: string;
  threadId?: string;
  /** Outreach / mission context (quick-send from SDR) */
  contactId?: string;
  missionId?: string;
  sentById?: string;
  templateId?: string;
  trackOpens?: boolean;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  threadId?: string;
  emailId?: string;
  error?: string;
}

// ============================================
// SENDING SERVICE CLASS
// ============================================

export class EmailSendingService {
  // ============================================
  // SEND EMAIL
  // ============================================

  async sendEmail(
    mailboxId: string,
    options: SendOptions,
  ): Promise<SendResult> {
    try {
      // Get mailbox
      const mailbox = await prisma.mailbox.findUnique({
        where: { id: mailboxId },
      });

      if (!mailbox) {
        return { success: false, error: "Mailbox not found" };
      }

      if (!mailbox.isActive) {
        return { success: false, error: "Mailbox is inactive" };
      }

      // Check daily send limit
      await this.checkAndResetDailyLimit(mailbox);

      if (mailbox.sentToday >= mailbox.dailySendLimit) {
        return { success: false, error: "Daily send limit reached" };
      }

      // Generate tracking pixel if enabled
      // Default to true unless environment variable explicitly disables it
      const globalTrackingEnabled =
        process.env.EMAIL_TRACKING_ENABLED !== "false";
      const shouldTrackOpens =
        globalTrackingEnabled && options.trackOpens !== false;

      const trackingPixelId = shouldTrackOpens
        ? options.trackingPixelId || options.trackPixelId || randomUUID()
        : undefined;

      // Inject tracking pixel into HTML
      let bodyHtml = options.bodyHtml;
      if (bodyHtml && trackingPixelId) {
        const trackingDomain = mailbox.trackingDomain || undefined;
        bodyHtml = this.injectTrackingPixel(
          bodyHtml,
          trackingPixelId,
          trackingDomain,
        );
      }

      // Append signature if set
      if (mailbox.signatureHtml && bodyHtml) {
        bodyHtml = `${bodyHtml}<br/><br/>${mailbox.signatureHtml}`;
      } else if (mailbox.signature && options.bodyText) {
        options.bodyText = `${options.bodyText}\n\n${mailbox.signature}`;
      }

      // Inline CSS for email client compatibility (Gmail, Outlook, etc.)
      if (bodyHtml) {
        bodyHtml = inlineHtmlForEmail(bodyHtml);
      }

      // Build send params
      const sendParams: SendEmailParams = {
        from: {
          email: mailbox.email,
          name: mailbox.displayName || undefined,
        },
        to: options.to,
        cc: options.cc,
        bcc: options.bcc,
        subject: options.subject,
        bodyHtml,
        bodyText: options.bodyText,
        attachments: options.attachments?.map((a) => ({
          filename: a.filename,
          mimeType: a.mimeType,
          size: a.content.length,
          content: a.content,
        })),
        trackingPixelId: trackingPixelId || undefined,
        inReplyTo: options.inReplyTo,
        threadId: options.threadId,
      };

      let result: {
        success: boolean;
        messageId?: string;
        threadId?: string;
        error?: string;
      };

      // Handle different provider types
      if (mailbox.provider === "CUSTOM") {
        // IMAP/SMTP - use password-based auth
        if (!mailbox.password || !mailbox.smtpHost) {
          return { success: false, error: "SMTP configuration incomplete" };
        }

        // Import ImapProvider dynamically to avoid circular deps
        const { ImapProvider } = await import("../providers/imap");

        const imapConfig = {
          email: mailbox.email,
          password: decrypt(mailbox.password),
          imapHost: mailbox.imapHost || "",
          imapPort: mailbox.imapPort || 993,
          smtpHost: mailbox.smtpHost,
          smtpPort: mailbox.smtpPort || 587,
        };

        const imapProvider = new ImapProvider(imapConfig);
        result = await imapProvider.sendEmail({} as OAuthTokens, sendParams);
      } else if ((mailbox.provider as string) === "REACHINBOX") {
        // ReachInbox - API key auth via accessToken
        if (!mailbox.accessToken) {
          return { success: false, error: "ReachInbox API key missing" };
        }

        const provider = getEmailProvider(mailbox.provider);
        const tokens: OAuthTokens = { accessToken: decrypt(mailbox.accessToken) };
        result = await provider.sendEmail(tokens, sendParams);
      } else {
        // OAuth providers (Gmail, Outlook)
        const provider = getEmailProvider(mailbox.provider);
        let tokens = this.getTokensFromMailbox(mailbox);

        // Check if tokens need refresh
        if (mailbox.tokenExpiry && new Date() >= mailbox.tokenExpiry) {
          if (!mailbox.refreshToken) {
            return { success: false, error: "Token expired" };
          }

          const refreshedTokens = await provider.refreshTokens(
            decrypt(mailbox.refreshToken),
          );

          // Update mailbox with new tokens
          await prisma.mailbox.update({
            where: { id: mailboxId },
            data: {
              accessToken: refreshedTokens.accessToken,
              refreshToken:
                refreshedTokens.refreshToken || mailbox.refreshToken,
              tokenExpiry: refreshedTokens.expiresAt,
            },
          });

          tokens = refreshedTokens;
        }

        result = await provider.sendEmail(tokens, sendParams);
      }

      if (!result.success) {
        return { success: false, error: result.error };
      }

      // Create or update thread
      let thread = options.threadId
        ? await prisma.emailThread.findUnique({
            where: { id: options.threadId },
          })
        : null;

      if (!thread && result.threadId) {
        // Try to find by provider thread ID
        thread = await prisma.emailThread.findFirst({
          where: {
            mailboxId,
            providerThreadId: result.threadId,
          },
        });
      }

      if (!thread) {
        // Create new thread
        thread = await prisma.emailThread.create({
          data: {
            mailboxId,
            subject: options.subject,
            snippet: options.bodyText?.substring(0, 200),
            participantEmails: options.to.map((t) => t.email),
            providerThreadId: result.threadId,
            lastEmailAt: new Date(),
          },
        });
      }

      // Create email record
      const email = await prisma.email.create({
        data: {
          mailboxId,
          threadId: thread.id,
          fromAddress: mailbox.email,
          fromName: mailbox.displayName,
          toAddresses: options.to.map((t) => t.email),
          ccAddresses: options.cc?.map((c) => c.email) || [],
          bccAddresses: options.bcc?.map((b) => b.email) || [],
          subject: options.subject,
          bodyHtml,
          bodyText: options.bodyText,
          snippet: options.bodyText?.substring(0, 200),
          direction: "OUTBOUND",
          status: "SENT",
          trackingPixelId,
          providerMessageId: result.messageId,
          providerThreadId: result.threadId,
          sentAt: new Date(),
          contactId: options.contactId ?? undefined,
          missionId: options.missionId ?? undefined,
          sentById: options.sentById ?? undefined,
          templateId: options.templateId ?? undefined,
        },
      });

      // Wrap links in the stored HTML for click tracking
      // We do this after creating the email record so we have the emailId
      if (bodyHtml && shouldTrackOpens) {
        const trackingDomain = mailbox.trackingDomain || undefined;
        const wrappedHtml = this.wrapLinksForTracking(bodyHtml, email.id, trackingDomain);
        if (wrappedHtml !== bodyHtml) {
          await prisma.email.update({
            where: { id: email.id },
            data: { bodyHtml: wrappedHtml },
          });
        }
      }

      await prisma.emailThread.update({
        where: { id: thread.id },
        data: {
          lastEmailAt: new Date(),
          snippet: options.bodyText?.substring(0, 200),
        },
      });

      // Increment sent count
      await prisma.mailbox.update({
        where: { id: mailboxId },
        data: { sentToday: { increment: 1 } },
      });

      return {
        success: true,
        messageId: result.messageId,
        threadId: thread.id,
        emailId: email.id,
      };
    } catch (error) {
      console.error("Send email error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // ============================================
  // SCHEDULE SEND (Queue)
  // ============================================

  async scheduleSend(
    mailboxId: string,
    options: SendOptions,
    _scheduledAt?: Date,
  ): Promise<{ success: boolean; jobId?: string; error?: string }> {
    try {
      void _scheduledAt;

      const { scheduleEmailSend } = await import("../queue");

      const job = await scheduleEmailSend({
        mailboxId,
        to: options.to,
        cc: options.cc,
        bcc: options.bcc,
        subject: options.subject,
        bodyHtml: options.bodyHtml,
        bodyText: options.bodyText,
        trackingPixelId: options.trackingPixelId,
        inReplyTo: options.inReplyTo,
      });

      return {
        success: true,
        jobId: job.id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to schedule",
      };
    }
  }

  // ============================================
  // TRACKING
  // ============================================

  async recordOpen(
    trackingPixelId: string,
    _metadata?: {
      ipAddress?: string;
      userAgent?: string;
    },
  ): Promise<void> {
    void _metadata;

    const email = await prisma.email.findUnique({
      where: { trackingPixelId },
    });

    if (!email) return;

    const now = new Date();
    const isFirstOpen = !email.firstOpenedAt;

    await prisma.email.update({
      where: { id: email.id },
      data: {
        openCount: { increment: 1 },
        firstOpenedAt: isFirstOpen ? now : undefined,
        lastOpenedAt: now,
        status:
          email.status === "SENT" || email.status === "DELIVERED"
            ? "OPENED"
            : email.status,
      },
    });

    // Update sequence step stats if applicable
    if (email.sequenceStepId) {
      await prisma.emailSequenceStep.update({
        where: { id: email.sequenceStepId },
        data: { totalOpened: { increment: 1 } },
      });
    }
  }

  async recordClick(
    trackingPixelId: string,
    _url: string,
    _metadata?: {
      ipAddress?: string;
      userAgent?: string;
    },
  ): Promise<void> {
    void _url;
    void _metadata;

    const email = await prisma.email.findUnique({
      where: { trackingPixelId },
    });

    if (!email) return;

    await prisma.email.update({
      where: { id: email.id },
      data: {
        clickCount: { increment: 1 },
        status:
          email.status !== "REPLIED" && email.status !== "BOUNCED"
            ? "CLICKED"
            : email.status,
      },
    });

    // Update sequence step stats if applicable
    if (email.sequenceStepId) {
      await prisma.emailSequenceStep.update({
        where: { id: email.sequenceStepId },
        data: { totalClicked: { increment: 1 } },
      });
    }
  }

  // ============================================
  // HELPERS
  // ============================================

  private getTokensFromMailbox(mailbox: Mailbox): OAuthTokens {
    if (!mailbox.accessToken) {
      throw new Error("No access token available");
    }

    return {
      accessToken: decrypt(mailbox.accessToken),
      refreshToken: mailbox.refreshToken
        ? decrypt(mailbox.refreshToken)
        : undefined,
      expiresAt: mailbox.tokenExpiry || undefined,
    };
  }

  private async checkAndResetDailyLimit(mailbox: Mailbox): Promise<void> {
    const now = new Date();
    const lastReset = mailbox.lastSendReset;

    // Reset if last reset was on a different day
    if (
      lastReset.getDate() !== now.getDate() ||
      lastReset.getMonth() !== now.getMonth() ||
      lastReset.getFullYear() !== now.getFullYear()
    ) {
      await prisma.mailbox.update({
        where: { id: mailbox.id },
        data: {
          sentToday: 0,
          lastSendReset: now,
        },
      });
      mailbox.sentToday = 0;
    }
  }

  private injectTrackingPixel(
    html: string,
    trackingPixelId: string,
    customDomain?: string,
  ): string {
    // Prioritize mailbox-specific tracking domain
    // Fallback to global env var, then NEXTAUTH_URL
    const baseUrl = (
      customDomain ||
      process.env.EMAIL_TRACKING_DOMAIN ||
      process.env.NEXTAUTH_URL ||
      ""
    ).replace(/\/$/, "");

    const pixelUrl = `${baseUrl}/api/email/tracking/open?id=${trackingPixelId}`;
    const pixel = `<img src="${pixelUrl}" width="1" height="1" style="display:none" alt="" />`;

    // Insert before closing body tag or at the end
    if (html.includes("</body>")) {
      return html.replace("</body>", `${pixel}</body>`);
    }
    return html + pixel;
  }

  private wrapLinksForTracking(
    html: string,
    emailId: string,
    customDomain?: string,
  ): string {
    const baseUrl = (
      customDomain ||
      process.env.EMAIL_TRACKING_DOMAIN ||
      process.env.NEXTAUTH_URL ||
      ""
    ).replace(/\/$/, "");

    let linkIndex = 0;

    return html.replace(
      /<a\s+([^>]*?)href=["']([^"']+)["']([^>]*)>/gi,
      (match, before, href, after) => {
        // Skip non-http links (mailto:, tel:, #, unsubscribe patterns)
        const lowerHref = href.toLowerCase().trim();
        if (
          lowerHref.startsWith("mailto:") ||
          lowerHref.startsWith("tel:") ||
          lowerHref.startsWith("#") ||
          lowerHref.includes("unsubscribe") ||
          lowerHref.includes("tracking/click") // Already wrapped
        ) {
          return match;
        }

        const lid = String(linkIndex++);
        const trackingUrl = `${baseUrl}/api/email/tracking/click?eid=${emailId}&url=${encodeURIComponent(href)}&lid=${lid}`;
        return `<a ${before}href="${trackingUrl}"${after}>`;
      },
    );
  }
}

// ============================================
// EXPORT SINGLETON
// ============================================

export const emailSendingService = new EmailSendingService();
