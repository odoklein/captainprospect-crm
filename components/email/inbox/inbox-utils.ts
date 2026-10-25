// ============================================
// INBOX — shared types and helpers
// ============================================

import { format, isToday, isYesterday, isThisWeek, isThisYear } from "date-fns";
import { fr } from "date-fns/locale";

// ---- API shapes -------------------------------------------------------

export type OutreachStatus = "sent" | "opened" | "replied" | "bounced";

export interface ThreadSummary {
    id: string;
    mailboxId: string;
    subject: string;
    snippet: string | null;
    participantEmails: string[];
    isRead: boolean;
    isStarred: boolean;
    isArchived: boolean;
    isTrashed: boolean;
    labels: string[];
    priority: string | null;
    slaDeadline: string | null;
    lastEmailAt: string;
    messageCount: number;
    inboundCount: number;
    outboundCount: number;
    latestEmail: {
        id: string;
        fromAddress: string;
        fromName: string | null;
        toAddresses: string[];
        direction: "INBOUND" | "OUTBOUND";
        status: string;
        date: string;
    } | null;
    outreachStatus: OutreachStatus | null;
    lastSentBy: { id: string; name: string } | null;
    clientId: string | null;
    missionId: string | null;
    contactId: string | null;
    contact: { id: string; firstName: string | null; lastName: string | null; companyId: string } | null;
    mission: { id: string; name: string } | null;
    mailbox: {
        id: string;
        email: string;
        displayName: string | null;
        owner: { id: string; name: string } | null;
    };
}

export interface EmailAttachmentInfo {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    downloadable: boolean;
}

export interface EmailMessage {
    id: string;
    fromAddress: string;
    fromName: string | null;
    toAddresses: string[];
    ccAddresses: string[];
    subject: string;
    bodyHtml: string | null;
    bodyText: string | null;
    direction: "INBOUND" | "OUTBOUND";
    status: string;
    openCount: number;
    firstOpenedAt: string | null;
    receivedAt: string | null;
    sentAt: string | null;
    createdAt: string;
    sentBy: { id: string; name: string } | null;
    attachments: EmailAttachmentInfo[];
}

export interface ThreadLinks {
    clientId: string | null;
    missionId: string | null;
    contactId: string | null;
    campaignId: string | null;
    opportunityId: string | null;
    client: { id: string; name: string; email: string | null; industry: string | null } | null;
    mission: { id: string; name: string; clientId: string; client: { id: string; name: string } } | null;
    campaign: { id: string; name: string } | null;
    contact: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        email: string | null;
        phone: string | null;
        title: string | null;
        company: {
            id: string;
            name: string;
            listId: string;
            list: { id: string; name: string; missionId: string } | null;
        } | null;
    } | null;
    opportunity: { id: string; needSummary: string | null; urgency: string | null } | null;
}

export interface ThreadComment {
    id: string;
    content: string;
    createdAt: string;
    user: { id: string; name: string; email?: string };
}

export interface ThreadDetail extends ThreadLinks {
    id: string;
    mailboxId: string;
    subject: string;
    participantEmails: string[];
    isRead: boolean;
    isStarred: boolean;
    isArchived: boolean;
    isTrashed: boolean;
    labels: string[];
    lastEmailAt: string;
    emails: EmailMessage[];
    comments: ThreadComment[];
    mailbox: {
        id: string;
        ownerId: string;
        email: string;
        displayName: string | null;
        provider: string;
        owner: { id: string; name: string } | null;
    };
    permissions: {
        canRead: boolean;
        canSend: boolean;
        canSendAs: boolean;
        sendBlockedReason: string | null;
        canDelete: boolean;
    };
}

export interface InboxMailbox {
    id: string;
    email: string;
    displayName: string | null;
    provider: string;
    syncStatus: string;
    healthScore: number;
    lastError?: string | null;
    lastSyncAt?: string | null;
    ownerId?: string;
    owner?: { id: string; name: string } | null;
    isOwn?: boolean;
    _count?: { threads: number; emails: number };
}

// ---- Folders ----------------------------------------------------------

export const FOLDER_LABELS: Record<string, string> = {
    inbox: "Boîte de réception",
    unread: "Non lus",
    starred: "Favoris",
    sent: "Envoyés",
    archive: "Archives",
    trash: "Corbeille",
    all: "Tous les messages",
};

export function folderLabel(folder: string): string {
    if (folder.startsWith("label:")) return folder.slice(6);
    return FOLDER_LABELS[folder] ?? folder;
}

/** Selected mailbox in the URL: an id, "team" (supervisors) or undefined (all mine). */
export const TEAM_MAILBOX = "team";

// ---- Roles & routes ---------------------------------------------------

export function isSupervisorRole(role?: string | null): boolean {
    return role === "MANAGER" || role === "DEVELOPER";
}

/** Where a user reads their mail. */
export function inboxPathForRole(role?: string | null): string {
    if (role === "MANAGER") return "/manager/emails/inbox";
    if (role === "DEVELOPER") return "/developer/mailbox";
    return "/sdr/emails/inbox";
}

export function threadHref(role: string | null | undefined, threadId: string): string {
    return `${inboxPathForRole(role)}?thread=${encodeURIComponent(threadId)}`;
}

/** Pages of the CRM a thread's links open, per role (null = no page for this role). */
export function crmRoutes(role?: string | null) {
    const isManager = role === "MANAGER";
    const isSdrSide = role === "SDR" || role === "BUSINESS_DEVELOPER" || role === "BOOKER";
    return {
        contact: (c: { id: string; company?: { id: string; listId: string } | null }): string | null => {
            if (isManager && c.company) {
                return `/manager/lists/${c.company.listId}?contactId=${c.id}&companyId=${c.company.id}`;
            }
            if (isSdrSide) return `/sdr/contacts/${c.id}`;
            return null;
        },
        company: (co: { id: string; listId: string }): string | null => {
            if (isManager) return `/manager/lists/${co.listId}`;
            if (isSdrSide) return `/sdr/companies/${co.id}`;
            return null;
        },
        mission: (id: string): string | null => (isManager ? `/manager/missions/${id}` : null),
        client: (id: string): string | null => (isManager ? `/manager/clients/${id}` : null),
    };
}

// ---- Dates ------------------------------------------------------------

export function formatSmartDate(dateStr: string): string {
    const date = new Date(dateStr);
    if (isToday(date)) return format(date, "HH:mm", { locale: fr });
    if (isYesterday(date)) return "Hier";
    if (isThisWeek(date, { weekStartsOn: 1 })) return format(date, "EEE", { locale: fr });
    if (isThisYear(date)) return format(date, "d MMM", { locale: fr });
    return format(date, "dd/MM/yy", { locale: fr });
}

export function messageDate(e: Pick<EmailMessage, "receivedAt" | "sentAt" | "createdAt">): string {
    return e.receivedAt ?? e.sentAt ?? e.createdAt;
}

export function formatFullDate(dateStr: string): string {
    return format(new Date(dateStr), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr });
}

// ---- Text -------------------------------------------------------------

export function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export function htmlToText(html: string): string {
    return html
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

export function messagePlainText(e: Pick<EmailMessage, "bodyText" | "bodyHtml">): string {
    return e.bodyText?.trim() || (e.bodyHtml ? htmlToText(e.bodyHtml) : "");
}

/** Remove scripts, handlers and active content from a received email. */
export function sanitizeEmailHtml(html: string): string {
    return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
        .replace(/<(iframe|object|form)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi, "")
        .replace(/<(embed|link|meta|base)\b[^>]*\/?>/gi, "")
        .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
        .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
        .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
        .replace(/(href|src)\s*=\s*(["']?)\s*javascript:[^"'\s>]*\2/gi, "$1=\"#\"")
        .replace(/<a\s/gi, '<a target="_blank" rel="noopener noreferrer nofollow" ');
}

export function displayName(name: string | null | undefined, email: string): string {
    return name?.trim() || email;
}

export function contactName(c: { firstName: string | null; lastName: string | null } | null | undefined): string {
    if (!c) return "";
    return [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
}

export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace(".", ",")} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

// ---- Reply / forward drafts ------------------------------------------

export type ComposeMode = "new" | "reply" | "replyAll" | "forward";

export interface ComposeDraft {
    mode: ComposeMode;
    threadId?: string;
    /** Mailbox the reply must leave from (the thread's). */
    mailboxId?: string;
    subject: string;
    to: string[];
    cc: string[];
    /** HTML placed under the signature (quoted message). */
    quotedHtml?: string;
    /** For the AI draft: what we answer. */
    lastMessageText?: string;
    lastMessageFrom?: string;
}

function prefixed(subject: string, prefix: "Re" | "Tr"): string {
    const s = subject?.trim() || "(Sans objet)";
    const re = prefix === "Re" ? /^(re|ré)\s*:/i : /^(tr|fwd?)\s*:/i;
    return re.test(s) ? s : `${prefix} : ${s}`;
}

/** The message being answered: the last one we received, else the last one. */
export function lastInbound(thread: Pick<ThreadDetail, "emails">): EmailMessage | null {
    for (let i = thread.emails.length - 1; i >= 0; i--) {
        if (thread.emails[i].direction === "INBOUND") return thread.emails[i];
    }
    return thread.emails[thread.emails.length - 1] ?? null;
}

function quoteBlock(e: EmailMessage, forward: boolean): string {
    const date = formatFullDate(messageDate(e));
    const from = e.fromName ? `${escapeHtml(e.fromName)} &lt;${escapeHtml(e.fromAddress)}&gt;` : escapeHtml(e.fromAddress);
    const body = e.bodyHtml ? sanitizeEmailHtml(e.bodyHtml) : escapeHtml(e.bodyText ?? "").replace(/\n/g, "<br>");
    if (forward) {
        return [
            `<div>---------- Message transféré ----------</div>`,
            `<div>De : ${from}</div>`,
            `<div>Date : ${escapeHtml(date)}</div>`,
            `<div>Objet : ${escapeHtml(e.subject || "")}</div>`,
            `<div>À : ${escapeHtml(e.toAddresses.join(", "))}</div>`,
            e.ccAddresses.length ? `<div>Cc : ${escapeHtml(e.ccAddresses.join(", "))}</div>` : "",
            `<br>`,
            `<div>${body}</div>`,
        ].join("");
    }
    return `<div>Le ${escapeHtml(date)}, ${from} a écrit :</div><blockquote style="margin:0 0 0 .8ex;border-left:2px solid rgba(0,0,0,.18);padding-left:1ex">${body}</blockquote>`;
}

export function buildComposeDraft(thread: ThreadDetail, mode: Exclude<ComposeMode, "new">): ComposeDraft {
    const target = lastInbound(thread);
    const own = thread.mailbox.email.toLowerCase();
    const base = {
        threadId: thread.id,
        mailboxId: thread.mailboxId,
        lastMessageText: target ? messagePlainText(target).slice(0, 6000) : undefined,
        lastMessageFrom: target ? displayName(target.fromName, target.fromAddress) : undefined,
    };

    if (mode === "forward") {
        return {
            ...base,
            mode,
            subject: prefixed(thread.subject, "Tr"),
            to: [],
            cc: [],
            quotedHtml: target ? quoteBlock(target, true) : undefined,
        };
    }

    // Reply to the sender of the message we answer; when that is us (our own
    // last message), reply to its recipients instead.
    let to: string[] = [];
    if (target) {
        to = target.fromAddress.toLowerCase() === own
            ? target.toAddresses.filter((a) => a.toLowerCase() !== own)
            : [target.fromAddress];
    }

    let cc: string[] = [];
    if (mode === "replyAll" && target) {
        const exclude = new Set([own, ...to.map((a) => a.toLowerCase())]);
        cc = Array.from(new Set([...target.toAddresses, ...target.ccAddresses]))
            .filter((a) => !exclude.has(a.toLowerCase()));
    }

    return {
        ...base,
        mode,
        subject: prefixed(thread.subject, "Re"),
        to,
        cc,
        quotedHtml: target ? quoteBlock(target, false) : undefined,
    };
}

// ---- Fetch helper -----------------------------------------------------

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, { cache: "no-store", ...init });
    let json: { success?: boolean; data?: T; error?: string } | null = null;
    try {
        json = await res.json();
    } catch {
        // non-JSON error page
    }
    if (!res.ok || !json?.success) {
        throw new Error(json?.error || (res.status === 403 ? "Accès non autorisé" : `Erreur ${res.status}`));
    }
    return json.data as T;
}
