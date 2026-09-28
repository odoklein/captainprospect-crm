"use client";

import { useMutation } from "@tanstack/react-query";
import type { QueueItem } from "../_lib/types";

/** Body of POST /api/actions (see createActionSchema in app/api/actions/route.ts). */
export interface LogActionInput {
    contactId?: string;
    companyId: string;
    campaignId: string;
    channel: string;
    result: string;
    note?: string;
    callbackDate?: string;
    /** Seconds, 1–7200. */
    duration?: number;
}

export interface LoggedAction {
    id: string;
}

export async function postAction(input: LogActionInput): Promise<LoggedAction> {
    const res = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
    let json: { success?: boolean; data?: { id: string }; error?: string } = {};
    try {
        json = await res.json();
    } catch {
        // non-JSON error page
    }
    if (!res.ok || !json.success || !json.data?.id) {
        throw new Error(json.error || "Erreur lors de l'enregistrement");
    }
    return { id: json.data.id };
}

/** Builds the POST body for a queue row — the only place that knows the mapping. */
export function actionInputForRow(
    row: QueueItem,
    result: string,
    extra: Pick<LogActionInput, "note" | "callbackDate" | "duration"> & { channel?: string } = {},
): LogActionInput {
    const { channel, ...rest } = extra;
    return {
        contactId: row.contactId ?? undefined,
        companyId: row.companyId,
        campaignId: row.campaignId,
        channel: channel ?? row.channel,
        result,
        ...rest,
    };
}

export function useLogAction() {
    return useMutation({ mutationFn: postAction });
}

/** Runs async jobs with a small concurrency cap; resolves with the failure count. */
export async function runLimited<T>(items: T[], limit: number, job: (item: T) => Promise<unknown>): Promise<number> {
    let failures = 0;
    let cursor = 0;
    const worker = async () => {
        while (cursor < items.length) {
            const item = items[cursor++];
            try {
                await job(item);
            } catch {
                failures++;
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return failures;
}
