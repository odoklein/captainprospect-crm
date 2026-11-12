/**
 * ============================================================
 * SLACK OAUTH FLOW
 * ============================================================
 */

import { encrypt } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { runtimeAppUrl } from "@/lib/runtime-config/env";

const SLACK_OAUTH_SCOPES = [
  "chat:write", "chat:write.public", "channels:read", "groups:read",
  "channels:history", "groups:history", "users:read", "users:read.email",
  "commands", "reactions:read", "files:write", "links:read", "links:write", "im:write",
];

export function buildSlackInstallUrl(state: string): string {
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", config.messaging.slackClientId);
  url.searchParams.set("scope", SLACK_OAUTH_SCOPES.join(","));
  // Container env read at runtime (a literal NEXT_PUBLIC_ read is frozen at build)
  const appUrl = runtimeAppUrl() || "http://localhost:3000";
  url.searchParams.set("redirect_uri", `${appUrl}/api/integrations/messaging/slack/oauth/callback`);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function handleSlackOAuthCallback(code: string, installedById?: string): Promise<{ workspaceId: string }> {
  const appUrl = runtimeAppUrl() || "http://localhost:3000";
  const redirectUri = `${appUrl}/api/integrations/messaging/slack/oauth/callback`;
  
  const response = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: config.messaging.slackClientId,
      client_secret: config.messaging.slackClientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  const data = await response.json();
  if (!data.ok) {
    throw new Error(`Slack OAuth failed: ${data.error}`);
  }

  const { team, access_token } = data;
  
  const encryptedToken = encrypt(access_token);

  const workspace = await prisma.messagingWorkspace.upsert({
    where: {
      provider_externalTeamId: {
        provider: "SLACK",
        externalTeamId: team.id,
      },
    },
    update: {
      teamName: team.name,
      botTokenEnc: encryptedToken,
      isActive: true,
      installedById,
      installedAt: new Date(),
    },
    create: {
      provider: "SLACK",
      externalTeamId: team.id,
      teamName: team.name,
      botTokenEnc: encryptedToken,
      isActive: true,
      installedById,
      installedAt: new Date(),
    },
  });

  return { workspaceId: workspace.id };
}
