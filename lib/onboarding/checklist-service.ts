import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findOrCreateClientProject } from "@/lib/projects/client-project";
import {
    addDays,
    autoFromLabels,
    dayDiff,
    dayToDate,
    instantiate,
    keyFromLabels,
    ONBOARDING_LABEL,
    parisDayOf,
    parseTemplate,
    SECTION_LABEL_PREFIX,
    sectionLabels,
    STEP_LABEL_PREFIX,
    stepKeyFromTitle,
    stepLabels,
    templateFromChecklist,
    type AutoStep,
    type ChecklistTemplate,
} from "./checklist-template";

// ============================================
// ONBOARDING CHECKLIST — database side
// Rows are Tasks of the client's project (see checklist-template.ts). Any
// MANAGER can read and edit any client's checklist through the
// /api/clients/[id]/onboarding-checklist routes, project member or not.
// ============================================

const TEMPLATE_KEY = "onboarding.checklistTemplate";
/** Marks a step the system ticked from real data, so the UI can say so. */
const AUTODONE_LABEL = "onboarding:autodone";

export class ChecklistError extends Error {
    constructor(
        message: string,
        public status = 400,
    ) {
        super(message);
    }
}

const TASK_SELECT = {
    id: true,
    title: true,
    status: true,
    labels: true,
    position: true,
    startDate: true,
    dueDate: true,
    completedAt: true,
    parentTaskId: true,
    projectId: true,
    assignee: { select: { id: true, name: true } },
} satisfies Prisma.TaskSelect;

type TaskRow = Prisma.TaskGetPayload<{ select: typeof TASK_SELECT }>;

async function loadTasks(clientId: string): Promise<TaskRow[]> {
    return prisma.task.findMany({
        where: { labels: { has: ONBOARDING_LABEL }, project: { clientId } },
        select: TASK_SELECT,
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
}

async function requireTaskOfClient(clientId: string, taskId: string): Promise<TaskRow> {
    const task = await prisma.task.findFirst({
        where: { id: taskId, labels: { has: ONBOARDING_LABEL }, project: { clientId } },
        select: TASK_SELECT,
    });
    if (!task) throw new ChecklistError("Étape introuvable pour ce client", 404);
    return task;
}

// ============================================
// TEMPLATE (SystemConfig override of the code default)
// ============================================

export async function getTemplate(): Promise<ChecklistTemplate> {
    try {
        const row = await prisma.systemConfig.findUnique({ where: { key: TEMPLATE_KEY } });
        return parseTemplate(row?.value);
    } catch (err) {
        console.warn("[onboarding] template unreadable, using the default", err);
        return parseTemplate(null);
    }
}

export async function saveTemplateFromClient(clientId: string): Promise<ChecklistTemplate> {
    const tasks = await loadTasks(clientId);
    if (tasks.length === 0) throw new ChecklistError("Aucune checklist à enregistrer pour ce client");
    const byParent = new Map<string, TaskRow[]>();
    for (const t of tasks) if (t.parentTaskId) byParent.set(t.parentTaskId, [...(byParent.get(t.parentTaskId) ?? []), t]);
    const template = templateFromChecklist(
        tasks
            .filter((t) => !t.parentTaskId)
            .map((section) => ({
                title: section.title,
                labels: section.labels,
                steps: (byParent.get(section.id) ?? []).map((step) => ({
                    title: step.title,
                    labels: step.labels,
                    startDay: step.startDate ? parisDayOf(step.startDate) : null,
                    dueDay: step.dueDate ? parisDayOf(step.dueDate) : null,
                })),
            })),
    );
    const value = JSON.stringify(template);
    await prisma.systemConfig.upsert({ where: { key: TEMPLATE_KEY }, create: { key: TEMPLATE_KEY, value }, update: { value } });
    return template;
}

export async function resetTemplate(): Promise<void> {
    await prisma.systemConfig.deleteMany({ where: { key: TEMPLATE_KEY } });
}

// ============================================
// AUTO STEPS — ticked from real data, one direction only
// ============================================

async function firstCallDay(clientId: string): Promise<string | null> {
    const rows = await prisma.$queryRaw<Array<{ first: Date | null }>>(Prisma.sql`
        SELECT MIN(a."createdAt") AS first
        FROM "Action" a
        INNER JOIN "Campaign" c ON c.id = a."campaignId"
        INNER JOIN "Mission" m ON m.id = c."missionId"
        WHERE m."clientId" = ${clientId} AND a.channel::text = 'CALL'
    `);
    return rows[0]?.first ? parisDayOf(rows[0].first) : null;
}

/** Setup ticks of the billing schedule (SystemConfig "billing.schedule.client:<id>"), if any. */
async function setupTicks(clientId: string): Promise<{ invoicedAt: string | null; paidAt: string | null }> {
    try {
        const row = await prisma.systemConfig.findUnique({ where: { key: `billing.schedule.client:${clientId}` } });
        const setup = row ? (JSON.parse(row.value)?.setup ?? null) : null;
        return {
            invoicedAt: typeof setup?.invoicedAt === "string" ? setup.invoicedAt : null,
            paidAt: typeof setup?.paidAt === "string" ? setup.paidAt : null,
        };
    } catch {
        return { invoicedAt: null, paidAt: null };
    }
}

async function reconcileAutoSteps(clientId: string, tasks: TaskRow[]): Promise<{ changed: boolean; firstCall: string | null }> {
    const open = tasks.filter((t) => t.parentTaskId && t.status !== "DONE" && autoFromLabels(t.labels));
    const firstCall = await firstCallDay(clientId);
    if (open.length === 0) return { changed: false, firstCall };

    const setup = open.some((t) => autoFromLabels(t.labels) !== "first-call")
        ? await setupTicks(clientId)
        : { invoicedAt: null, paidAt: null };
    const detected: Record<AutoStep, string | null> = {
        "first-call": firstCall,
        "setup-invoiced": setup.invoicedAt?.slice(0, 10) ?? setup.paidAt?.slice(0, 10) ?? null,
        "setup-paid": setup.paidAt?.slice(0, 10) ?? null,
    };

    let changed = false;
    for (const task of open) {
        const day = detected[autoFromLabels(task.labels)!];
        if (!day) continue;
        await prisma.task.update({
            where: { id: task.id },
            data: { status: "DONE", completedAt: dayToDate(day), labels: [...task.labels, AUTODONE_LABEL] },
        });
        changed = true;
    }
    if (changed) {
        for (const parentId of new Set(open.map((t) => t.parentTaskId!))) await syncSectionStatus(parentId);
    }
    return { changed, firstCall };
}

/** A section is DONE when all its steps are, TODO otherwise. Called after every tick. */
export async function syncSectionStatus(parentId: string): Promise<void> {
    const parent = await prisma.task.findUnique({ where: { id: parentId }, select: { status: true, labels: true } });
    if (!parent || !parent.labels.includes(ONBOARDING_LABEL)) return;
    const steps = await prisma.task.findMany({ where: { parentTaskId: parentId }, select: { status: true } });
    const allDone = steps.length > 0 && steps.every((s) => s.status === "DONE");
    const next = allDone ? "DONE" : "TODO";
    if (parent.status === next) return;
    await prisma.task.update({
        where: { id: parentId },
        data: { status: next, completedAt: allDone ? new Date() : null },
    });
}

// ============================================
// VIEW
// ============================================

export interface ChecklistStepView {
    id: string;
    key: string | null;
    title: string;
    done: boolean;
    dueDay: string | null;
    offsetDays: number | null;
    completedDay: string | null;
    overdue: boolean;
    assignee: { id: string; name: string } | null;
    auto: AutoStep | null;
    autoDetected: boolean;
}

export interface ChecklistSectionView {
    id: string;
    key: string | null;
    title: string;
    done: number;
    total: number;
    steps: ChecklistStepView[];
}

export interface ChecklistView {
    projectId: string | null;
    startDay: string | null;
    firstCallDay: string | null;
    onboardingStatus: string | null;
    progress: { done: number; total: number };
    complete: boolean;
    sections: ChecklistSectionView[];
}

async function buildView(clientId: string, tasks: TaskRow[], today: string, firstCall: string | null = null): Promise<ChecklistView> {
    const onboarding = await prisma.clientOnboarding.findUnique({ where: { clientId }, select: { status: true } });
    const parents = tasks.filter((t) => !t.parentTaskId);
    const byParent = new Map<string, TaskRow[]>();
    for (const t of tasks) if (t.parentTaskId) byParent.set(t.parentTaskId, [...(byParent.get(t.parentTaskId) ?? []), t]);

    let startDay: string | null = null;
    const sections: ChecklistSectionView[] = parents.map((parent) => {
        const steps = (byParent.get(parent.id) ?? []).map((step) => {
            const dueDay = step.dueDate ? parisDayOf(step.dueDate) : null;
            const stepStart = step.startDate ? parisDayOf(step.startDate) : null;
            if (stepStart && (!startDay || stepStart < startDay)) startDay = stepStart;
            const done = step.status === "DONE";
            return {
                id: step.id,
                key: keyFromLabels(step.labels, STEP_LABEL_PREFIX),
                title: step.title,
                done,
                dueDay,
                offsetDays: stepStart && dueDay ? dayDiff(stepStart, dueDay) : null,
                completedDay: step.completedAt ? parisDayOf(step.completedAt) : null,
                overdue: !done && !!dueDay && dueDay < today,
                assignee: step.assignee ? { id: step.assignee.id, name: step.assignee.name } : null,
                auto: autoFromLabels(step.labels),
                autoDetected: done && step.labels.includes(AUTODONE_LABEL),
            };
        });
        return {
            id: parent.id,
            key: keyFromLabels(parent.labels, SECTION_LABEL_PREFIX),
            title: parent.title,
            done: steps.filter((s) => s.done).length,
            total: steps.length,
            steps,
        };
    });

    const done = sections.reduce((n, s) => n + s.done, 0);
    const total = sections.reduce((n, s) => n + s.total, 0);
    return {
        projectId: tasks[0]?.projectId ?? null,
        startDay,
        firstCallDay: firstCall,
        onboardingStatus: onboarding?.status ?? null,
        progress: { done, total },
        complete: total > 0 && done === total,
        sections,
    };
}

export async function getChecklist(clientId: string): Promise<ChecklistView> {
    const tasks = await loadTasks(clientId);
    const { changed, firstCall } = await reconcileAutoSteps(clientId, tasks);
    return buildView(clientId, changed ? await loadTasks(clientId) : tasks, parisDayOf(new Date()), firstCall);
}

// ============================================
// WRITES
// ============================================

export async function startChecklist(
    clientId: string,
    userId: string,
    input: { startDay: string; assigneeId?: string | null },
): Promise<ChecklistView> {
    const existing = await prisma.task.count({ where: { labels: { has: ONBOARDING_LABEL }, project: { clientId } } });
    if (existing > 0) throw new ChecklistError("Un onboarding existe déjà pour ce client", 409);

    const project = await findOrCreateClientProject(clientId, userId);
    const template = await getTemplate();
    const assigneeId = input.assigneeId ?? userId;

    await prisma.$transaction(async (tx) => {
        for (const section of instantiate(template, input.startDay)) {
            const parent = await tx.task.create({
                data: {
                    projectId: project.id,
                    clientId,
                    source: "ONBOARDING",
                    title: section.title,
                    status: "TODO",
                    priority: "MEDIUM",
                    position: section.position,
                    labels: section.labels,
                    createdById: userId,
                },
                select: { id: true },
            });
            for (const step of section.steps) {
                await tx.task.create({
                    data: {
                        projectId: project.id,
                        clientId,
                        source: "ONBOARDING",
                        parentTaskId: parent.id,
                        title: step.title,
                        status: "TODO",
                        priority: "MEDIUM",
                        position: step.position,
                        labels: step.labels,
                        startDate: dayToDate(step.startDay),
                        dueDate: step.dueDay ? dayToDate(step.dueDay) : null,
                        assigneeId,
                        createdById: userId,
                    },
                });
            }
        }
        await tx.clientOnboarding.updateMany({ where: { clientId, status: "DRAFT" }, data: { status: "IN_PROGRESS" } });
    });

    return getChecklist(clientId);
}

/** Move J0: every open step keeps its offset. Done steps keep their history. */
export async function shiftStart(clientId: string, newStartDay: string): Promise<void> {
    const tasks = await loadTasks(clientId);
    const view = await buildView(clientId, tasks, parisDayOf(new Date()));
    if (!view.startDay) throw new ChecklistError("Aucun onboarding démarré pour ce client", 404);
    const delta = dayDiff(view.startDay, newStartDay);
    if (delta === 0) return;
    await prisma.$transaction(
        tasks
            .filter((t) => t.parentTaskId)
            .map((t) =>
                prisma.task.update({
                    where: { id: t.id },
                    data: {
                        startDate: dayToDate(newStartDay),
                        ...(t.status !== "DONE" && t.dueDate
                            ? { dueDate: dayToDate(addDays(parisDayOf(t.dueDate), delta)) }
                            : {}),
                    },
                }),
            ),
    );
}

export async function addStep(
    clientId: string,
    userId: string,
    input: { parentId: string | null; title: string; dueDay?: string | null },
): Promise<void> {
    const title = input.title.trim();
    if (!title) throw new ChecklistError("Titre requis");
    const tasks = await loadTasks(clientId);
    if (tasks.length === 0) throw new ChecklistError("Démarrez d'abord l'onboarding", 409);
    const projectId = tasks[0].projectId;
    const view = await buildView(clientId, tasks, parisDayOf(new Date()));

    if (!input.parentId) {
        const position = tasks.filter((t) => !t.parentTaskId).length;
        await prisma.task.create({
            data: {
                projectId,
                clientId,
                source: "ONBOARDING",
                title,
                status: "TODO",
                position,
                labels: sectionLabels(`${stepKeyFromTitle(title)}-${Date.now().toString(36)}`),
                createdById: userId,
            },
        });
        return;
    }

    const parent = tasks.find((t) => t.id === input.parentId && !t.parentTaskId);
    if (!parent) throw new ChecklistError("Section introuvable", 404);
    const siblings = tasks.filter((t) => t.parentTaskId === parent.id);
    await prisma.task.create({
        data: {
            projectId,
            clientId,
            source: "ONBOARDING",
            parentTaskId: parent.id,
            title,
            status: "TODO",
            position: siblings.length,
            labels: stepLabels(`${stepKeyFromTitle(title)}-${Date.now().toString(36)}`),
            startDate: view.startDay ? dayToDate(view.startDay) : null,
            dueDate: input.dueDay ? dayToDate(input.dueDay) : null,
            assigneeId: siblings[0]?.assignee?.id ?? userId,
            createdById: userId,
        },
    });
    await syncSectionStatus(parent.id);
}

export async function updateStep(
    clientId: string,
    taskId: string,
    input: {
        title?: string;
        done?: boolean;
        dueDay?: string | null;
        assigneeId?: string | null;
        move?: "up" | "down";
    },
): Promise<void> {
    const task = await requireTaskOfClient(clientId, taskId);
    const data: Prisma.TaskUncheckedUpdateInput = {};
    if (input.title !== undefined) {
        const title = input.title.trim();
        if (!title) throw new ChecklistError("Titre requis");
        data.title = title;
    }
    if (input.done !== undefined && task.parentTaskId) {
        data.status = input.done ? "DONE" : "TODO";
        data.completedAt = input.done ? new Date() : null;
        if (!input.done) data.labels = task.labels.filter((l) => l !== AUTODONE_LABEL);
    }
    if (input.dueDay !== undefined && task.parentTaskId) data.dueDate = input.dueDay ? dayToDate(input.dueDay) : null;
    if (input.assigneeId !== undefined && task.parentTaskId) data.assigneeId = input.assigneeId || null;
    if (Object.keys(data).length > 0) await prisma.task.update({ where: { id: taskId }, data });

    if (input.move) {
        const siblings = await prisma.task.findMany({
            where: task.parentTaskId
                ? { parentTaskId: task.parentTaskId }
                : { projectId: task.projectId, parentTaskId: null, labels: { has: ONBOARDING_LABEL } },
            select: { id: true },
            orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        });
        const ids = siblings.map((s) => s.id);
        const index = ids.indexOf(taskId);
        const target = input.move === "up" ? index - 1 : index + 1;
        if (index >= 0 && target >= 0 && target < ids.length) {
            [ids[index], ids[target]] = [ids[target], ids[index]];
            await prisma.$transaction(ids.map((id, position) => prisma.task.update({ where: { id }, data: { position } })));
        }
    }

    if (task.parentTaskId && input.done !== undefined) await syncSectionStatus(task.parentTaskId);
}

export async function deleteStep(clientId: string, taskId: string): Promise<void> {
    const task = await requireTaskOfClient(clientId, taskId);
    if (!task.parentTaskId) {
        // A section goes with its steps (subtasks would otherwise be orphaned: onDelete SetNull).
        await prisma.$transaction([
            prisma.task.deleteMany({ where: { parentTaskId: task.id } }),
            prisma.task.delete({ where: { id: task.id } }),
        ]);
        return;
    }
    await prisma.task.delete({ where: { id: task.id } });
    await syncSectionStatus(task.parentTaskId);
}

/** « Passer le client en Actif » once the checklist is done — never silently. */
export async function activateClientOnboarding(clientId: string): Promise<void> {
    await prisma.clientOnboarding.updateMany({
        where: { clientId, status: { not: "ACTIVE" } },
        data: { status: "ACTIVE", completedAt: new Date() },
    });
}
