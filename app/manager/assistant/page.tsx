"use client";

/**
 * ============================================================
 * ASSISTANT PROJET — page
 * ============================================================
 * The standalone home of the assistant. The panel is self-contained and takes a
 * `fixedClientId`, so the same component drops into Dashboard Projet or a
 * client page without changes.
 */

import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui";
import AssistantProjetPanel from "@/components/assistant-projet/AssistantProjetPanel";

export default function AssistantProjetPage() {
    return (
        <div className="flex h-[calc(100vh-1px)] flex-col gap-4 p-6">
            <PageHeader
                title="Assistant Projet"
                subtitle="Un assistant par projet : il connaît le client, la mission, les documents, les accès et les chiffres."
                icon={<Sparkles className="h-4 w-4" />}
            />

            <div className="min-h-0 flex-1">
                <AssistantProjetPanel className="mx-auto max-w-4xl" />
            </div>
        </div>
    );
}
