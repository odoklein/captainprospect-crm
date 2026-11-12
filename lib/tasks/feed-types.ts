/**
 * The unified task list — one row shape for every kind of to-do.
 * Shared by the server (lib/tasks/feed.ts) and the page (components/tasks/TaskFeed.tsx).
 *
 * Stored tasks (Task) are editable rows. Tickets and system to-dos are read-only
 * rows that link to the screen where they are handled. SDR callbacks are never
 * listed one by one: they arrive as counts (CallbackCount).
 */

export type WorkKind = "task" | "ticket" | "system";

/** Task.source, plus the read-only sources. */
export type WorkSource = "MANUAL" | "ONBOARDING" | "SESSION" | "AI" | "SYSTEM" | "TICKET";

export type WorkPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface WorkItem {
    /** Unique across kinds: "task:<id>", "ticket:<id>", "billing:<key>"… */
    id: string;
    kind: WorkKind;
    source: WorkSource;
    title: string;
    /** Europe/Paris calendar day "YYYY-MM-DD", null = no due date. */
    dueDay: string | null;
    priority: WorkPriority;
    done: boolean;
    /** The CRM user it is assigned to. */
    owner: { id: string; name: string } | null;
    /** Who it is for when that is not a CRM user: a client-side name or a role. */
    ownerLabel: string | null;
    client: { id: string; name: string } | null;
    project: { id: string; name: string } | null;
    /** Context line: onboarding section, parent task, ticket number… */
    context: string | null;
    /** Read-only rows open this page; null for a task (it opens the task drawer). */
    href: string | null;
    /** Task id, for kind "task". */
    taskId: string | null;
}

export interface CallbackCount {
    sdrId: string;
    sdrName: string;
    /** Callbacks whose time has passed. */
    late: number;
    /** Late + still to do today: what "urgent" means. */
    urgent: number;
}

export type FeedScope = "mine" | "team";

export interface TaskFeedPayload {
    day: string;
    scope: FeedScope;
    items: WorkItem[];
    /** The viewer's own urgent callbacks (SDR, BOOKER), else null. */
    myCallbacks: CallbackCount | null;
    /** Per-SDR urgent callbacks, team scope for managers only, else null. */
    teamCallbacks: CallbackCount[] | null;
    /** Whether the viewer may switch to the team scope. */
    canSeeTeam: boolean;
    /** Where the urgent-callback card leads. */
    callbacksHref: string | null;
    /** Names of the sources that failed to load (the rest still shows). */
    errors: string[];
}

export const SOURCE_LABELS: Record<WorkSource, string> = {
    MANUAL: "Manuelles",
    ONBOARDING: "Onboarding",
    SESSION: "Sessions client",
    AI: "Assistant",
    SYSTEM: "À traiter",
    TICKET: "Tickets",
};
