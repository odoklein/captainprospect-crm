"use client";

/** Agent tab: the folder's watch rules, runs, findings and proposals. */

import { FolderAgentPanel } from "@/components/agent/FolderAgentPanel";

export function AgentTab({ folderId, clientId }: { folderId: string; clientId: string | null }) {
    return <FolderAgentPanel folderId={folderId} clientId={clientId} />;
}
