"use client";

import { useQuery } from "@tanstack/react-query";
import type { Block, PageTemplate } from "@/lib/client-pages/blocks";

export interface ClientPageSummary {
    id: string;
    title: string;
    icon: string | null;
    missionId: string | null;
    position: number;
    createdAt: string;
    updatedAt: string;
    updatedBy: { id: string; name: string } | null;
}

export interface ClientPageDetail extends Omit<ClientPageSummary, "position"> {
    clientId: string;
    blocks: Block[];
    createdBy: { id: string; name: string } | null;
}

export const clientPagesKey = (clientId: string) => ["client-pages", clientId] as const;
export const clientPageKey = (pageId: string) => ["client-page", pageId] as const;

async function readJson<T>(res: Response): Promise<T> {
    const json = await res.json().catch(() => ({ success: false, error: "Réponse illisible du serveur" }));
    if (!res.ok || !json.success) {
        const error = new Error(json.error || "Erreur serveur") as Error & { status?: number; conflict?: unknown };
        error.status = res.status;
        error.conflict = json.conflict;
        throw error;
    }
    return json.data as T;
}

export function useClientPages(clientId: string, enabled = true) {
    return useQuery({
        queryKey: clientPagesKey(clientId),
        queryFn: async () => readJson<ClientPageSummary[]>(await fetch(`/api/clients/${clientId}/pages`)),
        enabled,
        staleTime: 30_000,
    });
}

export async function createClientPage(clientId: string, input: { template: PageTemplate; missionId?: string | null; title?: string }) {
    return readJson<ClientPageSummary>(await fetch(`/api/clients/${clientId}/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    }));
}

export async function fetchClientPage(pageId: string) {
    return readJson<ClientPageDetail>(await fetch(`/api/client-pages/${pageId}`));
}

export async function saveClientPage(pageId: string, patch: { title?: string; blocks?: Block[]; missionId?: string | null; baseUpdatedAt?: string }, keepalive = false) {
    return readJson<ClientPageDetail>(await fetch(`/api/client-pages/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
        keepalive,
    }));
}

export async function deleteClientPage(pageId: string) {
    return readJson<{ id: string }>(await fetch(`/api/client-pages/${pageId}`, { method: "DELETE" }));
}
