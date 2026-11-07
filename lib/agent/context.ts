/**
 * The authorization envelope of a background run: the same
 * `buildAssistantContext` as the chat, acting as the run's actor, narrowed by
 * the playbook's allowlist and switched to background mode (confirm tools are
 * proposed, never executed).
 *
 * Folder scope: Track B's folders may not exist yet in this database. A run
 * carries explicit clientId/missionId whenever it can; `resolveFolderScope`
 * only fills them from the folder when the model and the table exist.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildAssistantContext } from "@/lib/ai/tools/context";
import type { AssistantContext } from "@/lib/ai/tools/types";
import type { ClaimedRun, RunBudget } from "./types";

export interface FolderScope {
    clientId: string | null;
    missionId: string | null;
    /** False when there is no folder model/table yet, or the folder is unknown. */
    found: boolean;
}

// A folder carries a client (CLIENT kind) but never a mission: the mission is chosen per thread.
type FolderClient = { findUnique: (args: { where: { id: string }; select: { clientId: boolean } }) => Promise<{ clientId: string | null } | null> };

export async function resolveFolderScope(folderId: string | null | undefined): Promise<FolderScope> {
    if (!folderId) return { clientId: null, missionId: null, found: false };
    const folders = (prisma as unknown as { assistantFolder?: FolderClient }).assistantFolder;
    if (!folders || typeof folders.findUnique !== "function") return { clientId: null, missionId: null, found: false };
    try {
        const folder = await folders.findUnique({ where: { id: folderId }, select: { clientId: true } });
        if (!folder) return { clientId: null, missionId: null, found: false };
        return { clientId: folder.clientId ?? null, missionId: null, found: true };
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2021" || error.code === "P2022")) {
            return { clientId: null, missionId: null, found: false };
        }
        throw error;
    }
}

export async function buildRunContext(
    run: ClaimedRun,
    options: { budget: RunBudget; toolAllowlist: ReadonlySet<string>; dryRun?: boolean },
): Promise<AssistantContext> {
    let clientId = run.clientId;
    let missionId = run.missionId;
    if (!clientId && run.folderId) {
        const scope = await resolveFolderScope(run.folderId);
        if (scope.found) {
            clientId = scope.clientId;
            missionId = scope.missionId;
        }
    }
    return buildAssistantContext({
        userId: run.actorId,
        clientId,
        missionId,
        conversationId: run.conversationId,
        toolAllowlist: options.toolAllowlist,
        mode: "background",
        // A dry run proposes every write instead of doing it.
        autoWriteBudget: options.dryRun ? 0 : options.budget.maxSafeWrites,
    });
}
