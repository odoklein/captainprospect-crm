"use client";

/**
 * ============================================================
 * ASSISTANT PROJET — page
 * ============================================================
 * The dedicated workspace home of the assistant powered by assistant-ui
 * and OpenAI low-cost models (gpt-4o-mini). Features a sidebar with
 * conversation threads, project scope filter, and token consumption metrics.
 */

import { AiMark } from "@/components/ui/AiMark";
import { PageHeader } from "@/components/ui";
import { AssistantSidebarLayout } from "@/components/assistant-ui/AssistantSidebarLayout";

export default function AssistantProjetPage() {
    return (
        <div className="flex h-[calc(100vh-1px)] flex-col gap-4 p-6">
            <PageHeader
                title="Assistant Projet IA"
                subtitle="Pilotez vos projets, documents, accès commerciaux et métriques via gpt-4o-mini."
                icon={<AiMark className="h-4 w-4" />}
            />

            <div className="min-h-0 flex-1">
                <AssistantSidebarLayout />
            </div>
        </div>
    );
}
