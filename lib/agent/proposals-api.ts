/**
 * Proposal rows → AgentProposalItem (with the decider's name), for the
 * decide routes.
 */

import { prisma } from "@/lib/prisma";
import type { AgentProposalItem } from "@/lib/assistant/api-contract";
import { userNames } from "./api";
import { toProposalItem } from "./serialize";
import { withStore } from "./store";

export async function loadProposalItems(ids: string[]): Promise<Map<string, AgentProposalItem>> {
    if (ids.length === 0) return new Map();
    const rows = await withStore(() => prisma.agentProposal.findMany({ where: { id: { in: ids } } }));
    const names = await userNames(rows.map((r) => r.decidedById));
    const now = new Date();
    return new Map(rows.map((r) => [r.id, toProposalItem(r, r.decidedById ? (names.get(r.decidedById) ?? null) : null, now)]));
}

export async function loadProposalItem(id: string): Promise<AgentProposalItem | null> {
    return (await loadProposalItems([id])).get(id) ?? null;
}
