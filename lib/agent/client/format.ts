/**
 * Pure helpers for the Captain Agent screens: durations, money, countdowns,
 * severity ordering and the inbox grouping. No React, no fetch, so they run
 * under `npx tsx --test` and stay identical on every screen.
 */

import type {
    AgentFindingItem,
    AgentFindingState,
    AgentJobKind,
    AgentRunCard,
    AgentRunStatus,
    AgentSeverity,
    AgentStepStatus,
} from "@/lib/assistant/api-contract";

// ============================================
// Durations and money
// ============================================

const pad2 = (n: number) => String(n).padStart(2, "0");

/** 950 → "0 s", 42_000 → "42 s", 185_000 → "3 min 05", 3_720_000 → "1 h 02". */
export function formatDuration(ms: number | null | undefined): string {
    if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return "—";
    const totalSec = Math.floor(ms / 1000);
    if (totalSec < 60) return `${totalSec} s`;
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    if (min < 60) return sec === 0 ? `${min} min` : `${min} min ${pad2(sec)}`;
    const h = Math.floor(min / 60);
    return `${h} h ${pad2(min % 60)}`;
}

/** Stopwatch rendering for a live run: "0:07", "4:32", "1:02:09". */
export function formatClock(ms: number): string {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
}

/** Wall time of a run: finished − started, or now − started while it runs. */
export function runDurationMs(
    run: Pick<AgentRunCard, "startedAt" | "finishedAt">,
    now: Date = new Date(),
): number | null {
    if (!run.startedAt) return null;
    const start = new Date(run.startedAt).getTime();
    const end = run.finishedAt ? new Date(run.finishedAt).getTime() : now.getTime();
    return Math.max(0, end - start);
}

/** 0 → "0 €", 0.004 → "< 0,01 €", 0.123 → "0,12 €", 12.5 → "12,50 €". */
export function formatEur(n: number | null | undefined): string {
    if (n === null || n === undefined || !Number.isFinite(n) || n <= 0) return "0 €";
    if (n < 0.01) return "< 0,01 €";
    return `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

/** "expire dans 2 j", "expire dans 3 h", "expire dans 12 min", "expire bientôt", "expirée". */
export function expiryLabel(expiresAt: string, now: Date = new Date()): { label: string; urgent: boolean; expired: boolean } {
    const diff = new Date(expiresAt).getTime() - now.getTime();
    if (diff <= 0) return { label: "expirée", urgent: true, expired: true };
    const min = Math.floor(diff / 60_000);
    if (min < 1) return { label: "expire bientôt", urgent: true, expired: false };
    if (min < 60) return { label: `expire dans ${min} min`, urgent: min < 30, expired: false };
    const h = Math.floor(min / 60);
    if (h < 48) return { label: `expire dans ${h} h`, urgent: false, expired: false };
    return { label: `expire dans ${Math.floor(h / 24)} j`, urgent: false, expired: false };
}

const WEEKDAY_SHORT = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

function sameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Future instant, for "prochaine exécution": "dans 4 min", "aujourd’hui à 18:00", "demain à 08:00", "lun. 08:00", "12 nov. 08:00". */
export function futureLabel(iso: string | null | undefined, now: Date = new Date()): string {
    if (!iso) return "—";
    const at = new Date(iso);
    const diff = at.getTime() - now.getTime();
    if (diff <= 0) return "imminente";
    const min = Math.floor(diff / 60_000);
    if (min < 1) return "dans un instant";
    if (min < 60) return `dans ${min} min`;
    const hhmm = `${pad2(at.getHours())}:${pad2(at.getMinutes())}`;
    if (sameDay(at, now)) return `aujourd’hui à ${hhmm}`;
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    if (sameDay(at, tomorrow)) return `demain à ${hhmm}`;
    if (diff < 6 * 86_400_000) return `${WEEKDAY_SHORT[at.getDay()]} ${hhmm}`;
    return `${at.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} ${hhmm}`;
}

/** Day heading for a timeline: « Aujourd’hui », « Hier », else « lundi 27 oct. ». */
export function dayLabel(iso: string, now: Date = new Date()): string {
    const at = new Date(iso);
    if (sameDay(at, now)) return "Aujourd’hui";
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (sameDay(at, yesterday)) return "Hier";
    const label = at.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short", ...(at.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
    return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Consecutive items bucketed by local day, order preserved. */
export function groupByDay<T>(items: readonly T[], dateOf: (item: T) => string, now: Date = new Date()): Array<{ label: string; items: T[] }> {
    const out: Array<{ label: string; items: T[] }> = [];
    for (const item of items) {
        const label = dayLabel(dateOf(item), now);
        const last = out[out.length - 1];
        if (last && last.label === label) last.items.push(item);
        else out.push({ label, items: [item] });
    }
    return out;
}

/** Snooze target: same wall time, `days` later. */
export function snoozeUntil(days: number, now: Date = new Date()): string {
    return new Date(now.getTime() + days * 86_400_000).toISOString();
}

// ============================================
// Labels
// ============================================

export const RUN_STATUS_LABEL: Record<AgentRunStatus, string> = {
    QUEUED: "En file",
    RUNNING: "En cours",
    WAITING_APPROVAL: "À valider",
    DONE: "Terminé",
    FAILED: "Échec",
    CANCELLED: "Annulé",
    DEFERRED: "Reporté",
};

export const STEP_STATUS_LABEL: Record<AgentStepStatus, string> = {
    PENDING: "À venir",
    RUNNING: "En cours",
    DONE: "Fait",
    FAILED: "Échec",
    SKIPPED: "Ignorée",
};

export const KIND_LABEL: Record<AgentJobKind, string> = {
    WATCH: "Veille",
    REPORT: "Rapport",
    MISSION: "Mission",
    DIGEST: "Synthèse",
};

export const TRIGGER_LABEL: Record<AgentRunCard["trigger"], string> = {
    SCHEDULE: "Planifiée",
    MANUAL: "Manuelle",
    EVENT: "Événement",
};

export const SEVERITY_LABEL: Record<AgentSeverity, string> = {
    CRITICAL: "Critique",
    WARN: "Attention",
    INFO: "Info",
};

export const FINDING_STATE_LABEL: Record<AgentFindingState, string> = {
    OPEN: "Ouvert",
    ACKED: "Traité",
    SNOOZED: "Reporté",
    RESOLVED: "Résolu",
};

export function isLiveStatus(status: AgentRunStatus | null | undefined): boolean {
    return status === "QUEUED" || status === "RUNNING";
}

// ============================================
// Severity and grouping
// ============================================

export const SEVERITY_RANK: Record<AgentSeverity, number> = { CRITICAL: 3, WARN: 2, INFO: 1 };

/** Most severe first, then the most recently seen. Does not mutate. */
export function sortFindings<T extends Pick<AgentFindingItem, "severity" | "lastSeenAt">>(items: readonly T[]): T[] {
    return [...items].sort(
        (a, b) =>
            SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
            new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime(),
    );
}

/** Group key of a finding: its client, else its folder, else the agency view. */
export function findingGroupKey(f: Pick<AgentFindingItem, "clientId" | "folderId">): string {
    if (f.clientId) return `client:${f.clientId}`;
    if (f.folderId) return `folder:${f.folderId}`;
    return "agency";
}

export interface FindingGroup<T> {
    key: string;
    label: string;
    clientId: string | null;
    folderId: string | null;
    items: T[];
    topSeverity: AgentSeverity;
    counts: Record<AgentSeverity, number>;
}

/**
 * Findings grouped by client / folder, each group severity-sorted, and the
 * groups ordered by their worst finding, then their critical count, then
 * their size, then the most recent activity. The agency group sorts like any other.
 */
export function groupFindings<T extends AgentFindingItem>(items: readonly T[]): FindingGroup<T>[] {
    const map = new Map<string, FindingGroup<T>>();
    for (const f of items) {
        const key = findingGroupKey(f);
        let g = map.get(key);
        if (!g) {
            g = {
                key,
                label: key === "agency" ? "Vue agence" : f.clientName ?? "Dossier",
                clientId: f.clientId,
                folderId: f.folderId,
                items: [],
                topSeverity: f.severity,
                counts: { CRITICAL: 0, WARN: 0, INFO: 0 },
            };
            map.set(key, g);
        }
        if (!g.folderId && f.folderId) g.folderId = f.folderId;
        if (g.label === "Dossier" && f.clientName) g.label = f.clientName;
        g.items.push(f);
        g.counts[f.severity] += 1;
        if (SEVERITY_RANK[f.severity] > SEVERITY_RANK[g.topSeverity]) g.topSeverity = f.severity;
    }
    const groups = [...map.values()].map((g) => ({ ...g, items: sortFindings(g.items) }));
    const latest = (g: FindingGroup<T>) => Math.max(...g.items.map((i) => new Date(i.lastSeenAt).getTime()));
    return groups.sort(
        (a, b) =>
            SEVERITY_RANK[b.topSeverity] - SEVERITY_RANK[a.topSeverity] ||
            b.counts.CRITICAL - a.counts.CRITICAL ||
            b.items.length - a.items.length ||
            latest(b) - latest(a) ||
            a.label.localeCompare(b.label, "fr"),
    );
}

export interface FindingFilters {
    severity: AgentSeverity | "ALL";
    /** A findingGroupKey, or "ALL". */
    group: string;
}

export function filterFindings<T extends AgentFindingItem>(items: readonly T[], filters: FindingFilters): T[] {
    return items.filter(
        (f) => (filters.severity === "ALL" || f.severity === filters.severity) && (filters.group === "ALL" || findingGroupKey(f) === filters.group),
    );
}

/** Distinct groups present in a list, for the client filter: [{ key, label }] sorted by label, agency first. */
export function groupOptions(items: readonly AgentFindingItem[]): Array<{ key: string; label: string }> {
    const seen = new Map<string, string>();
    for (const f of items) {
        const key = findingGroupKey(f);
        if (!seen.has(key) || seen.get(key) === "Dossier") seen.set(key, key === "agency" ? "Vue agence" : f.clientName ?? "Dossier");
    }
    return [...seen.entries()]
        .map(([key, label]) => ({ key, label }))
        .sort((a, b) => (a.key === "agency" ? -1 : b.key === "agency" ? 1 : a.label.localeCompare(b.label, "fr")));
}

/** Clamp an index into [0, length − 1]; −1 when the list is empty. */
export function clampIndex(index: number, length: number): number {
    if (length <= 0) return -1;
    return Math.min(length - 1, Math.max(0, index));
}

/** Percent of a budget used, clamped to [0, 100]; null when the budget is unknown. */
export function budgetPercent(used: number, max: number | null | undefined): number | null {
    if (!max || max <= 0 || !Number.isFinite(used)) return null;
    return Math.min(100, Math.max(0, (used / max) * 100));
}

/** Tolerant extraction of a run id from a POST missions / jobs/run answer. */
export function extractRunId(data: unknown): string | null {
    if (!data || typeof data !== "object") return null;
    const d = data as Record<string, unknown>;
    if (typeof d.runId === "string") return d.runId;
    if (d.run && typeof d.run === "object" && typeof (d.run as Record<string, unknown>).id === "string") {
        return (d.run as Record<string, unknown>).id as string;
    }
    if (typeof d.id === "string") return d.id;
    return null;
}

/** Tolerant list unwrapping: `T[]`, `{ items }`, or `{ [key]: T[] }`. */
export function asList<T>(data: unknown, key?: string): T[] {
    if (Array.isArray(data)) return data as T[];
    if (data && typeof data === "object") {
        const d = data as Record<string, unknown>;
        if (key && Array.isArray(d[key])) return d[key] as T[];
        if (Array.isArray(d.items)) return d.items as T[];
    }
    return [];
}
