/**
 * Finding rows → AgentFindingItem with names resolved in batches (clients,
 * subjects, client folders). Shared by the findings routes.
 */

import type { AgentFindingItem } from "@/lib/assistant/api-contract";
import { clientNames, folderIdsByClient, userNames } from "./api";
import { toFindingItem, type FindingItemRow } from "./serialize";

export async function toFindingItems(rows: FindingItemRow[]): Promise<AgentFindingItem[]> {
    const [clients, subjects, folders] = await Promise.all([
        clientNames(rows.map((r) => r.clientId)),
        userNames(rows.map((r) => r.subjectUserId)),
        folderIdsByClient(rows.filter((r) => !r.folderId).map((r) => r.clientId)),
    ]);
    return rows.map((r) =>
        toFindingItem(r, {
            clientName: r.clientId ? (clients.get(r.clientId) ?? null) : null,
            subjectName: r.subjectUserId ? (subjects.get(r.subjectUserId) ?? null) : null,
            folderId: r.clientId ? (folders.get(r.clientId) ?? null) : null,
        }),
    );
}
