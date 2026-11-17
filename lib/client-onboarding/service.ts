// Server-only: the client onboarding link (/onboarding/[token]) — creation by the
// agency, the portal's view of it, autosave and the client's final approval.
//
// Answers are written with a single-key jsonb update, so a client typing in the
// portal and a manager editing other onboardingData keys (icp, mailbox…) at the
// same moment never overwrite each other.

import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notifyAllManagers } from "@/lib/notifications";
import { ONBOARDING_LABEL, SECTION_LABEL_PREFIX, STEP_LABEL_PREFIX } from "@/lib/onboarding/checklist-template";
import { syncSectionStatus } from "@/lib/onboarding/checklist-service";
import {
    completion,
    goalsSummary,
    icpSummary,
    missingScreens,
    normalizeAnswers,
    pitchSummary,
    prefillAnswers,
    readState,
    stillPrefilled,
    type Answers,
    type QuestionnaireState,
    type ScreenKey,
} from "./questionnaire";

export const LINK_TTL_DAYS = 90;

export class OnboardingLinkError extends Error {
    constructor(message: string, public status = 400) {
        super(message);
    }
}

// ── Shared reads ────────────────────────────────────────────────────────────

const ONBOARDING_SELECT = {
    id: true,
    clientId: true,
    status: true,
    onboardingData: true,
    targetLaunchDate: true,
    shareToken: true,
    shareCreatedAt: true,
    shareCreatedById: true,
    shareExpiresAt: true,
    clientOpenedAt: true,
    clientLastSeenAt: true,
    clientSubmittedAt: true,
    client: { select: { id: true, name: true, email: true, bookingUrl: true } },
} satisfies Prisma.ClientOnboardingSelect;

type OnboardingRow = Prisma.ClientOnboardingGetPayload<{ select: typeof ONBOARDING_SELECT }>;

function dataOf(row: { onboardingData: unknown }): Record<string, unknown> {
    const d = row.onboardingData;
    return d && typeof d === "object" && !Array.isArray(d) ? (d as Record<string, unknown>) : {};
}

function welcomeMessageOf(row: { onboardingData: unknown }): string {
    const link = dataOf(row).clientLink as { welcomeMessage?: unknown } | undefined;
    return typeof link?.welcomeMessage === "string" ? link.welcomeMessage : "";
}

/** Sets top-level keys of onboardingData atomically; `fillIfEmpty` keys only when blank. */
async function patchOnboardingData(
    onboardingId: string,
    set: Record<string, unknown>,
    fillIfEmpty: Record<string, string> = {},
): Promise<void> {
    const fills = Object.entries(fillIfEmpty).filter(([, v]) => v.trim());
    const fillSql = fills.length
        ? Prisma.join(
            fills.map(([k, v]) => Prisma.sql`
                || CASE WHEN COALESCE("onboardingData"->>${k}, '') = ''
                        THEN jsonb_build_object(${k}::text, ${v}::text) ELSE '{}'::jsonb END`),
            " ",
        )
        : Prisma.empty;
    await prisma.$executeRaw`
        UPDATE "ClientOnboarding"
        SET "onboardingData" = COALESCE("onboardingData", '{}'::jsonb) || ${JSON.stringify(set)}::jsonb ${fillSql},
            "updatedAt" = NOW()
        WHERE "id" = ${onboardingId}
    `;
}

function newToken(): string {
    return randomBytes(24).toString("base64url");
}

/** Token shape check before touching the database (cheap rejection of junk URLs). */
export function isTokenShape(token: string): boolean {
    return /^[A-Za-z0-9_-]{20,64}$/.test(token);
}

// ── Checklist integration ───────────────────────────────────────────────────

/** Ticks a step of the client's onboarding checklist, if it exists and is open. */
async function tickChecklistStep(clientId: string, stepKey: string): Promise<void> {
    try {
        const step = await prisma.task.findFirst({
            where: {
                project: { clientId },
                labels: { hasEvery: [ONBOARDING_LABEL, `${STEP_LABEL_PREFIX}${stepKey}`] },
                status: { not: "DONE" },
            },
            select: { id: true, parentTaskId: true },
        });
        if (!step) return;
        await prisma.task.update({ where: { id: step.id }, data: { status: "DONE", completedAt: new Date() } });
        if (step.parentTaskId) await syncSectionStatus(step.parentTaskId);
    } catch (err) {
        console.error("[client-onboarding] checklist tick failed", stepKey, err);
    }
}

/** The « Contractualisation » steps, read-only, for the portal's admin card. */
async function contractSteps(clientId: string): Promise<{ title: string; done: boolean }[]> {
    const rows = await prisma.task.findMany({
        where: {
            project: { clientId },
            labels: { has: ONBOARDING_LABEL },
            parentTask: { labels: { has: `${SECTION_LABEL_PREFIX}contractualisation` } },
        },
        select: { title: true, status: true },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
    return rows.map((r) => ({ title: r.title, done: r.status === "DONE" }));
}

// ── Portal (public, by token) ───────────────────────────────────────────────

export interface PortalView {
    clientName: string;
    accountManager: { name: string } | null;
    targetLaunchDate: string | null;
    welcomeMessage: string;
    state: QuestionnaireState;
    contract: { title: string; done: boolean }[];
}

export type PortalLookup =
    | { kind: "ok"; view: PortalView }
    | { kind: "expired" }
    | { kind: "not_found" };

async function findByToken(token: string): Promise<OnboardingRow | null> {
    if (!isTokenShape(token)) return null;
    return prisma.clientOnboarding.findUnique({ where: { shareToken: token }, select: ONBOARDING_SELECT });
}

async function requireLiveLink(token: string): Promise<OnboardingRow> {
    const row = await findByToken(token);
    if (!row) throw new OnboardingLinkError("Lien introuvable", 404);
    if (row.shareExpiresAt && row.shareExpiresAt < new Date()) throw new OnboardingLinkError("Ce lien a expiré", 410);
    return row;
}

/** The portal's data. First open: pre-fills from what the agency knows and records it. */
export async function openPortal(token: string): Promise<PortalLookup> {
    const row = await findByToken(token);
    if (!row) return { kind: "not_found" };
    if (row.shareExpiresAt && row.shareExpiresAt < new Date()) return { kind: "expired" };

    const data = dataOf(row);
    let state = readState(data.clientQuestionnaire);
    if (!state) {
        const { answers, prefilled } = prefillAnswers({
            pitch: typeof data.pitch === "string" ? data.pitch : null,
            icp: typeof data.icp === "string" ? data.icp : null,
            bookingUrl: row.client.bookingUrl,
            email: row.client.email,
            launchDate: row.targetLaunchDate?.toISOString().slice(0, 10) ?? null,
        });
        state = { version: 1, answers, screen: "pitch", prefilled, updatedAt: null, submittedAt: null };
        await patchOnboardingData(row.id, { clientQuestionnaire: state });
    }

    const now = new Date();
    const [manager, contract] = await Promise.all([
        row.shareCreatedById
            ? prisma.user.findUnique({ where: { id: row.shareCreatedById }, select: { name: true } })
            : null,
        contractSteps(row.clientId),
        prisma.clientOnboarding.update({
            where: { id: row.id },
            data: { clientLastSeenAt: now, ...(row.clientOpenedAt ? {} : { clientOpenedAt: now }) },
            select: { id: true },
        }),
    ]);

    return {
        kind: "ok",
        view: {
            clientName: row.client.name,
            accountManager: manager ? { name: manager.name } : null,
            targetLaunchDate: row.targetLaunchDate?.toISOString() ?? null,
            welcomeMessage: welcomeMessageOf(row),
            state,
            contract,
        },
    };
}

/** Autosave from the portal. Refused once the client has approved. */
export async function saveFromPortal(
    token: string,
    input: { answers: unknown; screen: ScreenKey },
): Promise<{ updatedAt: string; prefilled: string[] }> {
    const row = await requireLiveLink(token);
    const prev = readState(dataOf(row).clientQuestionnaire);
    if (prev?.submittedAt) throw new OnboardingLinkError("Le questionnaire a déjà été validé", 409);

    const answers: Answers = normalizeAnswers(input.answers);
    const prefilled = prev ? stillPrefilled(prev.prefilled, prev.answers, answers) : [];
    const updatedAt = new Date().toISOString();
    const state: QuestionnaireState = { version: 1, answers, screen: input.screen, prefilled, updatedAt, submittedAt: null };

    await patchOnboardingData(row.id, { clientQuestionnaire: state });
    await prisma.clientOnboarding.update({
        where: { id: row.id },
        data: {
            clientLastSeenAt: new Date(),
            // A client at work means the onboarding has started; never moves a later status back.
            ...(row.status === "DRAFT" ? { status: "IN_PROGRESS" } : {}),
        },
        select: { id: true },
    });
    return { updatedAt, prefilled };
}

/** The client approves: answers lock, the CRM gets the summaries, managers are told. */
export async function submitFromPortal(token: string): Promise<{ submittedAt: string }> {
    const row = await requireLiveLink(token);
    const prev = readState(dataOf(row).clientQuestionnaire);
    if (!prev) throw new OnboardingLinkError("Questionnaire vide", 400);
    if (prev.submittedAt) return { submittedAt: prev.submittedAt };
    if (missingScreens(prev.answers).length > 0) {
        throw new OnboardingLinkError("Il reste des réponses obligatoires à compléter", 422);
    }

    const now = new Date();
    const submittedAt = now.toISOString();
    const a = prev.answers;
    await patchOnboardingData(
        row.id,
        { clientQuestionnaire: { ...prev, submittedAt, updatedAt: submittedAt } },
        { icp: icpSummary(a), pitch: pitchSummary(a), objectifs: goalsSummary(a) },
    );
    await prisma.clientOnboarding.update({
        where: { id: row.id },
        data: {
            clientSubmittedAt: now,
            clientLastSeenAt: now,
            // The client's wished date becomes the target unless the agency already set one.
            ...(!row.targetLaunchDate && a.goals.launchDate ? { targetLaunchDate: new Date(`${a.goals.launchDate}T12:00:00.000Z`) } : {}),
            ...(row.status === "DRAFT" || row.status === "IN_PROGRESS" ? { status: "READY_FOR_REVIEW" } : {}),
        },
        select: { id: true },
    });
    if (!row.client.bookingUrl && /^https?:\/\//i.test(a.meetings.bookingUrl)) {
        await prisma.client.update({ where: { id: row.clientId }, data: { bookingUrl: a.meetings.bookingUrl } });
    }

    await tickChecklistStep(row.clientId, "questionnaire-recu");
    await notifyAllManagers({
        title: "Onboarding validé par le client",
        message: `${row.client.name} a complété et validé son questionnaire d'onboarding.`,
        type: "success",
        link: `/manager/clients?client=${row.clientId}`,
    });
    return { submittedAt };
}

// ── Agency side (managers) ──────────────────────────────────────────────────

export interface LinkInfo {
    onboardingStatus: string | null;
    token: string | null;
    createdAt: string | null;
    expiresAt: string | null;
    expired: boolean;
    openedAt: string | null;
    lastSeenAt: string | null;
    submittedAt: string | null;
    targetLaunchDate: string | null;
    welcomeMessage: string;
    completion: number;
    missing: ScreenKey[];
    state: QuestionnaireState | null;
}

async function onboardingOf(clientId: string): Promise<OnboardingRow | null> {
    return prisma.clientOnboarding.findUnique({ where: { clientId }, select: ONBOARDING_SELECT });
}

function toInfo(row: OnboardingRow | null): LinkInfo {
    const state = row ? readState(dataOf(row).clientQuestionnaire) : null;
    return {
        onboardingStatus: row?.status ?? null,
        token: row?.shareToken ?? null,
        createdAt: row?.shareCreatedAt?.toISOString() ?? null,
        expiresAt: row?.shareExpiresAt?.toISOString() ?? null,
        expired: !!row?.shareExpiresAt && row.shareExpiresAt < new Date(),
        openedAt: row?.clientOpenedAt?.toISOString() ?? null,
        lastSeenAt: row?.clientLastSeenAt?.toISOString() ?? null,
        submittedAt: state?.submittedAt ?? row?.clientSubmittedAt?.toISOString() ?? null,
        targetLaunchDate: row?.targetLaunchDate?.toISOString() ?? null,
        welcomeMessage: row ? welcomeMessageOf(row) : "",
        completion: state ? completion(state.answers) : 0,
        missing: state ? missingScreens(state.answers) : [],
        state,
    };
}

export async function getLinkInfo(clientId: string): Promise<LinkInfo> {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) throw new OnboardingLinkError("Client introuvable", 404);
    return toInfo(await onboardingOf(clientId));
}

export interface LinkSettings {
    targetLaunchDate?: string | null;
    welcomeMessage?: string;
}

function launchDate(day: string | null | undefined): Date | null | undefined {
    if (day === undefined) return undefined;
    if (day === null || day === "") return null;
    // Noon UTC: the same calendar day in every European time zone.
    return new Date(`${day}T12:00:00.000Z`);
}

/** Creates the link, or replaces it (the old URL stops working). */
export async function createLink(clientId: string, userId: string, settings: LinkSettings): Promise<LinkInfo> {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) throw new OnboardingLinkError("Client introuvable", 404);

    const now = new Date();
    const link = {
        shareToken: newToken(),
        shareCreatedAt: now,
        shareCreatedById: userId,
        shareExpiresAt: new Date(now.getTime() + LINK_TTL_DAYS * 86_400_000),
        ...(launchDate(settings.targetLaunchDate) !== undefined ? { targetLaunchDate: launchDate(settings.targetLaunchDate) } : {}),
    };
    const row = await prisma.clientOnboarding.upsert({
        where: { clientId },
        create: { clientId, createdById: userId, ...link },
        update: link,
        select: { id: true },
    });
    if (settings.welcomeMessage !== undefined) {
        await patchOnboardingData(row.id, { clientLink: { welcomeMessage: settings.welcomeMessage } });
    }
    await tickChecklistStep(clientId, "questionnaire-envoye");
    return getLinkInfo(clientId);
}

export async function updateLink(clientId: string, settings: LinkSettings): Promise<LinkInfo> {
    const row = await onboardingOf(clientId);
    if (!row) throw new OnboardingLinkError("Aucun onboarding pour ce client", 404);
    const date = launchDate(settings.targetLaunchDate);
    if (date !== undefined) {
        await prisma.clientOnboarding.update({ where: { id: row.id }, data: { targetLaunchDate: date }, select: { id: true } });
    }
    if (settings.welcomeMessage !== undefined) {
        await patchOnboardingData(row.id, { clientLink: { welcomeMessage: settings.welcomeMessage } });
    }
    return getLinkInfo(clientId);
}

/** Unlocks an approved questionnaire so the client can change answers. */
export async function reopenQuestionnaire(clientId: string): Promise<LinkInfo> {
    const row = await onboardingOf(clientId);
    const state = row ? readState(dataOf(row).clientQuestionnaire) : null;
    if (!row || !state) throw new OnboardingLinkError("Aucun questionnaire pour ce client", 404);
    await patchOnboardingData(row.id, { clientQuestionnaire: { ...state, submittedAt: null } });
    await prisma.clientOnboarding.update({ where: { id: row.id }, data: { clientSubmittedAt: null }, select: { id: true } });
    return getLinkInfo(clientId);
}

export async function revokeLink(clientId: string): Promise<LinkInfo> {
    const row = await onboardingOf(clientId);
    if (row) {
        await prisma.clientOnboarding.update({
            where: { id: row.id },
            data: { shareToken: null, shareExpiresAt: null },
            select: { id: true },
        });
    }
    return getLinkInfo(clientId);
}
