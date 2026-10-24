"use client";

/**
 * ============================================================
 * ASSISTANT PROJET — page
 * ============================================================
 * The dedicated workspace home of the assistant (gpt-4o-mini). It takes the
 * whole main area — AppLayoutShell gives this route no padded wrapper — with
 * a chatbot-style history rail, project scope picker and centred thread.
 */

import { ChatWorkspace } from "@/components/assistant-ui/ChatWorkspace";

export default function AssistantProjetPage() {
    return <ChatWorkspace />;
}
