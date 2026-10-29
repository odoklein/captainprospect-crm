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
import { Skeleton } from "@/components/ui/shadcn/skeleton";

function WorkspaceFallback() {
    return (
        <div className="flex h-full w-full bg-canvas" aria-busy="true">
            <div className="hidden w-[272px] shrink-0 flex-col gap-2 border-r border-line bg-surface-2 p-3 md:flex">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="mt-2 h-9 w-full rounded-xl" />
                {Array.from({ length: 6 }, (_, i) => (
                    <Skeleton key={i} className="h-7 rounded-xl" style={{ width: `${60 + ((i * 13) % 30)}%` }} />
                ))}
            </div>
            <div className="flex-1 bg-surface" />
        </div>
    );
}

export default function CaptainAiPage() {
    return (
        <Suspense fallback={<WorkspaceFallback />}>
            <AssistantWorkspace />
        </Suspense>
    );
}
