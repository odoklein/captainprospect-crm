/**
 * Support messaging renderers.
 */

import type { RenderedMessage } from "@/lib/integrations/messaging/types";
import { esc, truncate, deepLink, severityColor } from "./common";

/**
 * Renders a new support conversation message.
 */
export function renderSupportConversationCreated(data: {
  clientName: string;
  authorName?: string | null;
  messagePreview: string;
  intent?: string | null;
  attachmentCount?: number;
  pageLabel?: string | null;
  conversationId?: string;
}): RenderedMessage {
  const {
    clientName,
    authorName,
    messagePreview,
    intent,
    attachmentCount,
    pageLabel,
  } = data;

  const getUrl = () => deepLink("manager/dashboard?support=1");

  let intentLabel = "Autre";
  let intentEmoji = "💬";

  switch (intent?.toUpperCase()) {
    case "RDV":
      intentLabel = "Question RDV";
      intentEmoji = "📅";
      break;
    case "RAPPORT":
      intentLabel = "Rapport";
      intentEmoji = "📊";
      break;
    case "PROBLEME":
      intentLabel = "Problème";
      intentEmoji = "🔴";
      break;
    case "AUTRE":
    default:
      intentLabel = "Autre";
      intentEmoji = "💬";
      break;
  }

  const title = `🚨 Nouveau message support — ${clientName}`;
  const truncatedPreview = truncate(esc(messagePreview), 300);

  const contextParts = [
    `${intentEmoji} ${intentLabel}`,
  ];

  if (authorName) {
    contextParts.push(`Par ${esc(authorName)}`);
  }
  if (pageLabel) {
    contextParts.push(`Depuis ${esc(pageLabel)}`);
  }
  if (attachmentCount && attachmentCount > 0) {
    contextParts.push(`📎 ${attachmentCount} PJ`);
  }

  return {
    fallbackText: `${title}\n\n${truncatedPreview}`,
    severity: 2,
    title,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${esc(title)}*`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `> ${truncatedPreview}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: contextParts.join(" • "),
          },
        ],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Ouvrir le support",
            },
            url: getUrl() || "",
            action_id: "open_support",
          },
        ],
      },
    ],
  };
}

/**
 * Renders a support reply message.
 */
export function renderSupportReply(data: {
  clientName: string;
  authorName: string;
  messagePreview: string;
  isManagerReply: boolean;
}): RenderedMessage {
  const { clientName, authorName, messagePreview, isManagerReply } = data;
  
  const originMarker = isManagerReply ? ` ↩︎ répondu par ${esc(authorName)} depuis le CRM` : ` par ${esc(authorName)}`;
  const title = `Nouveau message support — ${clientName}${originMarker}`;
  const truncatedPreview = truncate(esc(messagePreview), 300);

  return {
    fallbackText: `${title}\n\n${truncatedPreview}`,
    severity: 1,
    title,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${esc(title)}*`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `> ${truncatedPreview}`,
        },
      },
    ],
  };
}

/**
 * Renders a support resolved message.
 */
export function renderSupportResolved(data: {
  clientName: string;
  resolvedBy: string;
}): RenderedMessage {
  const { clientName, resolvedBy } = data;
  const title = `✅ Support résolu — ${clientName}`;
  const text = `Le ticket de support pour ${esc(clientName)} a été clôturé par ${esc(resolvedBy)}.`;

  return {
    fallbackText: text,
    severity: 0,
    title,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${esc(title)}*\n${text}`,
        },
      },
    ],
  };
}
