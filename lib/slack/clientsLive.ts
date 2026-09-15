/**
 * ============================================================
 * SLACK — #clients-live alerts
 * ============================================================
 * Pushes client-facing events (support messages, late no-show reports) to the
 * existing #clients-live Slack channel through an incoming webhook, so the team
 * sees them without having to sit in the CRM.
 *
 * Configure `SLACK_CLIENTS_LIVE_WEBHOOK_URL` (falls back to `SLACK_WEBHOOK_URL`).
 * With no webhook configured this is a no-op: Slack is an extra channel, never
 * a dependency of the flow that triggers it.
 *
 * Every helper here is fire-and-forget — it resolves to `false` on failure and
 * never throws, so a Slack outage can't break a client's support message.
 */

const SLACK_TIMEOUT_MS = 5000;

export function clientsLiveWebhookUrl(): string | null {
    return process.env.SLACK_CLIENTS_LIVE_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL || null;
}

export function isClientsLiveEnabled(): boolean {
    return !!clientsLiveWebhookUrl();
}

type SlackBlock = Record<string, unknown>;

async function postToClientsLive(payload: {
    text: string;
    blocks?: SlackBlock[];
}): Promise<boolean> {
    const url = clientsLiveWebhookUrl();
    if (!url) return false;

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), SLACK_TIMEOUT_MS);
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok) {
            console.error("[slack:clients-live] Webhook rejected:", res.status, await res.text().catch(() => ""));
            return false;
        }
        return true;
    } catch (error) {
        console.error("[slack:clients-live] Webhook failed:", error);
        return false;
    }
}

function appUrl(): string {
    return process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "";
}

function absoluteUrl(path: string): string | null {
    const base = appUrl();
    if (!base) return null;
    return `${base.replace(/\/$/, "")}${path}`;
}

/** Slack renders `&`, `<` and `>` as markup — escape them in user-supplied text. */
function esc(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function truncate(text: string, max: number): string {
    const clean = text.replace(/\s+/g, " ").trim();
    return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

const INTENT_LABELS: Record<string, string> = {
    RDV: "Question RDV",
    RAPPORT: "Rapport",
    PROBLEME: "Problème",
    AUTRE: "Autre",
};

const INTENT_EMOJI: Record<string, string> = {
    RDV: "📅",
    RAPPORT: "📊",
    PROBLEME: "🔴",
    AUTRE: "💬",
};

/**
 * A client (or their commercial) just wrote in the support chat.
 */
export async function alertClientsLiveSupportMessage(data: {
    clientName: string;
    authorName?: string | null;
    messagePreview: string;
    intent?: string | null;
    attachmentCount?: number;
    pageLabel?: string | null;
}): Promise<boolean> {
    const intent = data.intent ?? null;
    const emoji = intent ? INTENT_EMOJI[intent] ?? "💬" : "💬";
    const intentLabel = intent ? INTENT_LABELS[intent] ?? intent : null;

    const headline = `${emoji} Nouveau message support — ${data.clientName}`;
    const preview = truncate(data.messagePreview || "📷 Pièce jointe", 300);

    const context: string[] = [];
    if (intentLabel) context.push(`*${esc(intentLabel)}*`);
    if (data.authorName) context.push(esc(data.authorName));
    if (data.pageLabel) context.push(`depuis « ${esc(data.pageLabel)} »`);
    if (data.attachmentCount) {
        const plural = data.attachmentCount > 1 ? "s" : "";
        context.push(`📎 ${data.attachmentCount} pièce${plural} jointe${plural}`);
    }

    const link = absoluteUrl("/manager/dashboard?support=1");
    const blocks: SlackBlock[] = [
        {
            type: "section",
            text: { type: "mrkdwn", text: `*${esc(headline)}*\n>${esc(preview)}` },
        },
    ];
    if (context.length > 0) {
        blocks.push({
            type: "context",
            elements: [{ type: "mrkdwn", text: context.join("  ·  ") }],
        });
    }
    if (link) {
        blocks.push({
            type: "actions",
            elements: [
                {
                    type: "button",
                    text: { type: "plain_text", text: "Ouvrir le support", emoji: true },
                    url: link,
                },
            ],
        });
    }

    return postToClientsLive({ text: `${headline} — ${preview}`, blocks });
}

/**
 * A manager manually flagged a meeting as no-show after the 48h self-service
 * window had closed.
 */
export async function alertClientsLiveLateNoShow(data: {
    clientName: string;
    contactName: string;
    companyName: string;
    missionName?: string | null;
    meetingDate?: string | null;
    sdrName?: string | null;
    reportedBy: string;
    note?: string | null;
}): Promise<boolean> {
    const headline = `👻 RDV absent signalé manuellement — ${data.clientName}`;
    const dateStr = data.meetingDate
        ? new Date(data.meetingDate).toLocaleString("fr-FR", {
            day: "2-digit", month: "2-digit", year: "numeric",
            hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris",
        })
        : null;

    const lines = [`*${esc(data.contactName)}* — ${esc(data.companyName)}`];
    if (dateStr) lines.push(`RDV du ${dateStr}`);
    if (data.missionName) lines.push(`Mission : ${esc(data.missionName)}`);
    if (data.sdrName) lines.push(`Booké par : ${esc(data.sdrName)}`);
    if (data.note) lines.push(`_${esc(truncate(data.note, 200))}_`);

    const link = absoluteUrl("/manager/rdv-absences");
    const blocks: SlackBlock[] = [
        { type: "section", text: { type: "mrkdwn", text: `*${esc(headline)}*\n${lines.join("\n")}` } },
        { type: "context", elements: [{ type: "mrkdwn", text: `Signalé par ${esc(data.reportedBy)} · remonté au dashboard télépro` }] },
    ];
    if (link) {
        blocks.push({
            type: "actions",
            elements: [
                {
                    type: "button",
                    text: { type: "plain_text", text: "Voir les signalements", emoji: true },
                    url: link,
                },
            ],
        });
    }

    return postToClientsLive({ text: `${headline} — ${data.contactName} (${data.companyName})`, blocks });
}
