/**
 * ============================================================
 * SLACK ADAPTER
 * ============================================================
 */

import type {
  MessagingAdapter,
  RenderedMessage,
  PostResult,
  VerifyResult,
  ChannelRef,
  InboundEvent,
} from "@/lib/integrations/messaging/types";
import { verifySlackSignature } from "./verify";
import { toSlackPayload } from "./blocks";
import { parseSlackEvent } from "./inbound";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { config } from "@/lib/config";

export class SlackAdapter implements MessagingAdapter {
  readonly provider = "SLACK";
  private botToken: string;
  private signingSecret: string;
  private botUserId?: string;

  constructor(opts: { botToken: string; signingSecret: string; botUserId?: string }) {
    this.botToken = opts.botToken;
    this.signingSecret = opts.signingSecret;
    this.botUserId = opts.botUserId;
  }

  private async slackApi(method: string, body?: unknown): Promise<any> {
    const res = await fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.botToken}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });

    if (res.status === 429) {
      const retryAfter = res.headers.get("retry-after") || "1";
      throw new Error(`Slack API rate limited, retry after ${retryAfter}s`);
    }

    const data = await res.json();
    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }

    return data;
  }

  async post(ch: string, msg: RenderedMessage, opts?: { threadTs?: string }): Promise<PostResult> {
    const payload = toSlackPayload(msg);
    const data = await this.slackApi("chat.postMessage", {
      channel: ch,
      text: payload.text,
      blocks: payload.blocks,
      thread_ts: opts?.threadTs,
    });

    return {
      channelId: data.channel,
      messageTs: data.ts,
      threadTs: data.message?.thread_ts,
    };
  }

  async edit(ch: string, ts: string, msg: RenderedMessage): Promise<void> {
    const payload = toSlackPayload(msg);
    await this.slackApi("chat.update", {
      channel: ch,
      ts,
      text: payload.text,
      blocks: payload.blocks,
    });
  }

  async addReaction(ch: string, ts: string, emoji: string): Promise<void> {
    await this.slackApi("reactions.add", {
      channel: ch,
      timestamp: ts,
      name: emoji,
    });
  }

  async verifyInbound(req: Request, rawBody: string): Promise<VerifyResult> {
    const timestamp = req.headers.get("x-slack-request-timestamp");
    const signature = req.headers.get("x-slack-signature");

    if (!timestamp || !signature) {
      return { valid: false, error: "Missing signature headers" };
    }

    const valid = verifySlackSignature(this.signingSecret, timestamp, rawBody, signature);
    return { valid };
  }

  async parseInbound(payload: unknown): Promise<InboundEvent[]> {
    return parseSlackEvent(payload);
  }

  async listChannels(): Promise<ChannelRef[]> {
    const data = await this.slackApi("conversations.list", {
      types: "public_channel,private_channel",
      exclude_archived: true,
      limit: 1000,
    });

    return (data.channels || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      isPrivate: c.is_private || false,
    }));
  }
}

/** Get or create a SlackAdapter for a MessagingWorkspace. */
export async function getSlackAdapter(workspaceId: string): Promise<SlackAdapter | null> {
  const workspace = await prisma.messagingWorkspace.findUnique({
    where: { id: workspaceId },
  });

  if (!workspace || !workspace.isActive || workspace.provider !== "SLACK" || !workspace.botTokenEnc) {
    return null;
  }

  const botToken = decrypt(workspace.botTokenEnc);
  
  return new SlackAdapter({
    botToken,
    signingSecret: config.messaging.slackSigningSecret,
  });
}

/** Legacy webhook fallback for the transition period. */
export async function postViaLegacyWebhook(webhookUrl: string, msg: RenderedMessage): Promise<boolean> {
  const payload = toSlackPayload(msg);
  
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return res.ok;
}
