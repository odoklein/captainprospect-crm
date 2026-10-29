/**
 * Deep link to one agent run: lands on Captain Agent's « Activité » tab with
 * the run's detail open (the run id lives in `?run=`).
 */

import { redirect } from "next/navigation";

export default async function AgentRunDeepLink({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    redirect(`/manager/assistant/agent?tab=activite&run=${encodeURIComponent(id)}`);
}
