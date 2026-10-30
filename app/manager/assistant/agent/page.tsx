/**
 * Captain Agent — the background agent's home (inbox, activity, reports,
 * settings). Tab and open run are URL state (nuqs), hence the adapter; the
 * Suspense boundary is required by useSearchParams under the app router.
 */

import { Suspense } from "react";
import type { Metadata } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { AgentHome } from "@/components/agent/AgentHome";

export const metadata: Metadata = { title: "Captain Agent" };

export default function CaptainAgentPage() {
    return (
        <NuqsAdapter>
            <Suspense fallback={null}>
                <AgentHome />
            </Suspense>
        </NuqsAdapter>
    );
}
