"use client";

/**
 * ============================================================
 * CAPTAIN AI — workspace
 * ============================================================
 * Rail (folders, clients, pins), folder home and threads. It takes the whole
 * main area — AppLayoutShell gives this route no padded wrapper. Suspense
 * because the workspace reads its state from the URL.
 */

import { Suspense } from "react";
import { AssistantWorkspace } from "@/components/assistant-ui/workspace/AssistantWorkspace";

export default function CaptainAiPage() {
    return (
        <Suspense fallback={<div className="h-full w-full bg-canvas" aria-busy="true" />}>
            <AssistantWorkspace />
        </Suspense>
    );
}
