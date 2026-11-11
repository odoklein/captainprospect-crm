/**
 * The background agent's home (titled brand.agentName) (inbox, activity, reports,
 * settings). Tab and open run are URL state (nuqs), hence the adapter; the
 * Suspense boundary is required by useSearchParams under the app router.
 */

import { Suspense } from "react";
import type { Metadata } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { AgentHome } from "@/components/agent/AgentHome";
import { getBrand } from "@/lib/brand/server";

export async function generateMetadata(): Promise<Metadata> {
    const brand = await getBrand();
    return { title: brand.agentName };
}

export default function AgentPage() {
    return (
        <NuqsAdapter>
            <Suspense fallback={null}>
                <AgentHome />
            </Suspense>
        </NuqsAdapter>
    );
}
