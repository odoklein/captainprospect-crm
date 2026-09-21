/**
 * ============================================================
 * SLACK BLOCK KIT RENDERER
 * ============================================================
 */

import type { RenderedMessage } from "@/lib/integrations/messaging/types";

export type SlackBlock = Record<string, unknown>;

export function toBlockKit(msg: RenderedMessage): SlackBlock[] {
  const blocks: SlackBlock[] = [];

  // 1. Title section
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*${msg.title}*`,
    },
  });

  // 2. Fields section
  if (msg.fields && msg.fields.length > 0) {
    blocks.push({
      type: "section",
      fields: msg.fields.map((f) => ({
        type: "mrkdwn",
        text: `*${f.label}*\n${f.value}`,
      })),
    });
  }

  // 3. Context section
  if (msg.context) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: msg.context,
        },
      ],
    });
  }

  // 4. Actions section
  if (msg.actions && msg.actions.length > 0) {
    blocks.push({
      type: "actions",
      elements: msg.actions.map((action) => {
        const btn: Record<string, unknown> = {
          type: "button",
          text: {
            type: "plain_text",
            text: action.label,
            emoji: true,
          },
        };

        if (action.url) {
          btn.url = action.url;
        } else {
          btn.action_id = action.actionId;
          if (action.style === "primary" || action.style === "danger") {
            btn.style = action.style;
          }
        }

        return btn;
      }),
    });
  }

  // Divider at end if actions exist
  if (msg.actions && msg.actions.length > 0) {
    blocks.push({ type: "divider" });
  }

  return blocks;
}

export function toSlackPayload(msg: RenderedMessage): { text: string; blocks: SlackBlock[] } {
  return {
    text: msg.fallbackText,
    blocks: toBlockKit(msg),
  };
}
