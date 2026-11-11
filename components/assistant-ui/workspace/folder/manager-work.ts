import type { AgentFindingItem, AgentRunCard } from "@/lib/assistant/api-contract";

export type WorkItem = { id: string; title: string; context: string; label: string; priority: number; runId: string | null; finding?: AgentFindingItem };
export type WorkFilter = "all" | "decisions" | "blocked" | "active";
export function workMatchesFilter(item: WorkItem, filter: WorkFilter): boolean {
    return filter === "all" || (filter === "decisions" ? item.priority === 0 || item.priority === 3 : filter === "blocked" ? item.priority === 1 || item.priority === 2 : item.priority >= 4);
}
/** Keep approvals and blockers ahead of activity. Never infer completion from missing data. */
export function managerWorkItems(runs: AgentRunCard[], findings: AgentFindingItem[], folderId: string | null): WorkItem[] {
    const unique = new Map<string, AgentRunCard>();
    for (const run of runs) {
        if ((!folderId || run.folderId === folderId) && !unique.has(run.id)) unique.set(run.id, run);
    }
    const items: WorkItem[] = [];
    const statuses: Partial<Record<AgentRunCard["status"], [number, string]>> = {
        WAITING_APPROVAL: [0, "À décider"], FAILED: [1, "À reprendre"], DEFERRED: [2, "Différé"],
        RUNNING: [4, "En cours"], QUEUED: [5, "En attente"],
    };
    for (const run of unique.values()) {
        const status = statuses[run.status];
        if (!status) continue;
        items.push({ id: `run:${run.id}`, title: run.goal || run.jobName || "Travail confié à l'assistant", context: run.clientName || "Tous les clients", label: status[1], priority: status[0], runId: run.id });
    }
    for (const f of findings) {
        if (f.state !== "OPEN" || (folderId && f.folderId !== folderId)) continue;
        if (f.runId && items.some(i => i.runId === f.runId && i.priority <= 2)) continue;
        items.push({ id: `finding:${f.id}`, title: f.title, context: f.clientName || "Tous les clients", label: f.severity === "CRITICAL" ? "À débloquer" : "À examiner", priority: f.severity === "CRITICAL" ? 1 : 3, runId: f.runId, finding: f });
    }
    return items.sort((a, b) => a.priority - b.priority);
}
