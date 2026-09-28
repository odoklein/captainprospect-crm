"use client";

import { useQuery } from "@tanstack/react-query";
import type { Mission } from "../_lib/types";

async function resolveDefaultMailbox(missionId: string): Promise<string | null> {
    const missionRes = await fetch(`/api/missions/${missionId}`);
    const missionJson = await missionRes.json();
    if (!missionJson.success) return null;
    const missionDefault = missionJson.data?.defaultMailboxId as string | undefined;
    if (missionDefault) return missionDefault;
    const clientId = missionJson.data?.client?.id as string | undefined;
    if (!clientId) return null;
    const clientRes = await fetch(`/api/clients/${clientId}`);
    const clientJson = await clientRes.json();
    if (!clientJson.success) return null;
    return (clientJson.data?.onboarding?.onboardingData?.defaultMailboxId as string | undefined) ?? null;
}

/**
 * Mailbox the composer should preselect: the mission's, else the client's
 * onboarding default. Cached per mission instead of re-fetched on every email.
 */
export function useDefaultMailbox(mission: Mission | null, enabled: boolean): string | undefined {
    const known = mission?.defaultMailboxId ?? null;
    const { data } = useQuery({
        queryKey: ["sdr", "action-cockpit", "default-mailbox", mission?.id ?? null],
        queryFn: () => resolveDefaultMailbox(mission!.id),
        enabled: enabled && !!mission && !known,
        staleTime: 10 * 60_000,
    });
    return known ?? data ?? undefined;
}
