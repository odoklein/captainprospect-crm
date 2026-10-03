"use client";

/**
 * ============================================================
 * ASSISTANT PROJET — page
 * ============================================================
 * The standalone home of the assistant. The panel is self-contained and takes a
 * `fixedClientId`, so the same component drops into Dashboard Projet or a
 * client page without changes.
 */

import { AiMark } from "@/components/ui/AiMark";
import { PageHeader } from "@/components/ui";
import AssistantProjetPanel from "@/components/assistant-projet/AssistantProjetPanel";

export default function AssistantProjetPage() {
    return (
        <div className="flex h-[calc(100vh-1px)] flex-col gap-4 p-6">
            <PageHeader
                title="Assistant Projet"
                subtitle="Questions sur un projet : client, mission, documents, accès et chiffres."
                icon={<AiMark className="h-4 w-4" />}
            />

            <div className="min-h-0 flex-1">
                <AssistantProjetPanel className="mx-auto max-w-4xl" />
            </div>
        </div>
    );
}
