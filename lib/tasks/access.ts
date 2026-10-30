/**
 * Who may see, edit or delete a Task — pure, no database (npm run test:tasks).
 *
 * Since the unified task list, a Task may have no project (personal / inbox
 * task). The rules, from widest to narrowest:
 *   - CLIENT users never touch internal tasks;
 *   - a MANAGER sees and changes everything;
 *   - the creator and the assignee see, edit and delete their task;
 *   - the project owner and project admins also delete; any project member edits;
 *   - a session to-do addressed to a role (audienceRole) is editable by that
 *     role, ALWAYS by every internal user — but only a person above deletes it.
 */

export type TaskAudienceRole = "SDR" | "MANAGER" | "DEV" | "ALWAYS";

export interface TaskAccessUser {
    id: string;
    role: string;
}

export interface TaskAccessTarget {
    createdById: string;
    assigneeId: string | null;
    audienceRole?: TaskAudienceRole | null;
    project: {
        ownerId: string;
        members: { userId: string; role: string }[];
    } | null;
}

/** UserRole values each audienceRole reaches. */
const AUDIENCE_ROLES: Record<Exclude<TaskAudienceRole, "ALWAYS">, string[]> = {
    SDR: ["SDR", "BOOKER"],
    MANAGER: ["MANAGER"],
    DEV: ["DEVELOPER"],
};

/** The audienceRole values a user with this role belongs to (ALWAYS included). */
export function audienceRolesFor(userRole: string): TaskAudienceRole[] {
    if (userRole === "CLIENT") return [];
    const roles: TaskAudienceRole[] = ["ALWAYS"];
    for (const [audience, userRoles] of Object.entries(AUDIENCE_ROLES)) {
        if (userRoles.includes(userRole)) roles.push(audience as TaskAudienceRole);
    }
    return roles;
}

function isPersonallyLinked(user: TaskAccessUser, task: TaskAccessTarget): boolean {
    return task.createdById === user.id || task.assigneeId === user.id;
}

function isProjectAdmin(user: TaskAccessUser, task: TaskAccessTarget): boolean {
    if (!task.project) return false;
    return (
        task.project.ownerId === user.id ||
        task.project.members.some((m) => m.userId === user.id && ["owner", "admin"].includes(m.role))
    );
}

function isProjectMember(user: TaskAccessUser, task: TaskAccessTarget): boolean {
    if (!task.project) return false;
    return task.project.ownerId === user.id || task.project.members.some((m) => m.userId === user.id);
}

function isInAudience(user: TaskAccessUser, task: TaskAccessTarget): boolean {
    if (!task.audienceRole) return false;
    return audienceRolesFor(user.role).includes(task.audienceRole);
}

export function canEditTask(user: TaskAccessUser, task: TaskAccessTarget): boolean {
    if (user.role === "CLIENT") return false;
    if (user.role === "MANAGER") return true;
    return isPersonallyLinked(user, task) || isProjectMember(user, task) || isInAudience(user, task);
}

/** Reading follows editing: nobody sees a task they could not tick. */
export const canViewTask = canEditTask;

export function canDeleteTask(user: TaskAccessUser, task: TaskAccessTarget): boolean {
    if (user.role === "CLIENT") return false;
    if (user.role === "MANAGER") return true;
    return isPersonallyLinked(user, task) || isProjectAdmin(user, task);
}

/** Prisma `include` that loads exactly what the checks above read. */
export const TASK_ACCESS_INCLUDE = {
    project: { select: { ownerId: true, members: { select: { userId: true, role: true } } } },
} as const;
