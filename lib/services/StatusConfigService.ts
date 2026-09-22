import { prisma } from "@/lib/prisma";
import type { ActionScopeType, ActionPriorityLabel, ExclusionTarget } from "@prisma/client";
import { MISSION_STATUS_PRESETS } from "@/lib/constants/actionStatusPresets";

// ============================================
// STATUS CONFIG SERVICE
// ============================================
// Config-driven action status and workflow resolution.
// Resolves effective status definitions from scope hierarchy (GLOBAL < CLIENT < MISSION < CAMPAIGN).
// ============================================

export interface EffectiveStatusDefinition {
    code: string;
    label: string;
    color: string | null;
    sortOrder: number;
    requiresNote: boolean;
    priorityLabel: ActionPriorityLabel;
    priorityOrder: number;
    triggersOpportunity: boolean;
    triggersCallback: boolean;
    /** This status is a real dead end, not a parked row — see Exclusion. */
    triggersExclusion: boolean;
    /** Level the SDR drawer pre-arms when triggersExclusion is set. */
    exclusionTarget: ExclusionTarget | null;
    resultCategoryCode: string | null;
}

export interface EffectiveNextStep {
    fromResultCode: string;
    actionType: string;
    label: string | null;
    config: unknown;
}

export interface EffectiveStatusConfig {
    statuses: EffectiveStatusDefinition[];
    nextSteps: EffectiveNextStep[];
}

const CORE_FALLBACK_STATUSES: EffectiveStatusDefinition[] = [
    {
        code: "MEETING_BOOKED",
        label: "RDV pris",
        color: "#A5D6A7",
        sortOrder: 900,
        requiresNote: false,
        priorityLabel: "SKIP",
        priorityOrder: 999,
        triggersOpportunity: true,
        triggersCallback: false,
        triggersExclusion: false,
        exclusionTarget: null,
        resultCategoryCode: null,
    },
];

const SCOPE_ORDER: ActionScopeType[] = ["GLOBAL", "CLIENT", "MISSION", "CAMPAIGN"];
const DEFAULT_PRIORITY_ORDER: Record<ActionPriorityLabel, number> = {
    CALLBACK: 1,
    FOLLOW_UP: 2,
    NEW: 3,
    RETRY: 4,
    SKIP: 999,
};

// Fallback for legacy data when a result code is not in config
const LEGACY_PRIORITY: Record<string, { order: number; label: ActionPriorityLabel }> = {
    CALLBACK_REQUESTED: { order: 1, label: "CALLBACK" },
    INTERESTED: { order: 2, label: "FOLLOW_UP" },
    NO_RESPONSE: { order: 4, label: "RETRY" },
    MEETING_CANCELLED: { order: 4, label: "RETRY" },
    INVALIDE: { order: 4, label: "RETRY" },
    MEETING_BOOKED: { order: 999, label: "SKIP" },
    BAD_CONTACT: { order: 999, label: "SKIP" },
    // Gatekeeper barriers: retryable — the contact still exists behind them
    BARRAGE_STANDARD: { order: 4, label: "RETRY" },
    BARRAGE_SECRETAIRE: { order: 4, label: "RETRY" },
    // Confirmed dead data: stop requeuing
    NUMERO_KO: { order: 999, label: "SKIP" },
    FAUX_NUMERO: { order: 999, label: "SKIP" },
    DISQUALIFIED: { order: 999, label: "SKIP" },
    ENVOIE_MAIL: { order: 999, label: "SKIP" },
    CONNECTION_SENT: { order: 999, label: "SKIP" },
    MESSAGE_SENT: { order: 999, label: "SKIP" },
    REPLIED: { order: 2, label: "FOLLOW_UP" },
    NOT_INTERESTED: { order: 999, label: "SKIP" },
    REFUS: { order: 999, label: "SKIP" },
    REFUS_ARGU: { order: 999, label: "SKIP" },
    REFUS_CATEGORIQUE: { order: 999, label: "SKIP" },
    RELANCE: { order: 1, label: "CALLBACK" },
    RAPPEL: { order: 2, label: "CALLBACK" },
    GERE_PAR_SIEGE: { order: 999, label: "SKIP" },
    PROJET_A_SUIVRE: { order: 2, label: "FOLLOW_UP" },
    MAUVAIS_INTERLOCUTEUR: { order: 999, label: "SKIP" },
    MAIL_UNIQUEMENT: { order: 999, label: "SKIP" },
    MAIL_DOC: { order: 999, label: "SKIP" },
    HORS_CIBLE: { order: 999, label: "SKIP" },
};

/**
 * Which result codes mean "final" out of the box, and at which level.
 *
 * priorityLabel SKIP is not enough to decide this: MEETING_BOOKED and
 * MAIL_UNIQUEMENT are also SKIP, and excluding a booked meeting would be a
 * serious bug. Only a genuine dead end belongs here. Installs can override the
 * whole map per scope via ActionStatusDefinition.triggersExclusion.
 */
export const DEFAULT_EXCLUSION_TARGETS: Record<string, ExclusionTarget> = {
    REFUS_CATEGORIQUE: "COMPANY",
    HORS_CIBLE: "COMPANY",
    NOT_INTERESTED: "CONTACT",
    DISQUALIFIED: "CONTACT",
};

export interface ScopeContext {
    campaignId?: string;
    missionId?: string;
    clientId?: string;
}

async function resolveScopeChain(context: ScopeContext): Promise<{
    campaignId: string | null;
    missionId: string | null;
    clientId: string | null;
}> {
    let campaignId: string | null = context.campaignId ?? null;
    let missionId: string | null = context.missionId ?? null;
    let clientId: string | null = context.clientId ?? null;

    if (campaignId && !missionId) {
        const campaign = await prisma.campaign.findUnique({
            where: { id: campaignId },
            select: { missionId: true, mission: { select: { clientId: true } } },
        });
        if (campaign) {
            missionId = campaign.missionId;
            clientId = campaign.mission.clientId;
        }
    }
    if (missionId && !clientId) {
        const mission = await prisma.mission.findUnique({
            where: { id: missionId },
            select: { clientId: true },
        });
        if (mission) clientId = mission.clientId;
    }

    return { campaignId, missionId, clientId };
}

export async function getEffectiveStatusConfig(
    context: ScopeContext
): Promise<EffectiveStatusConfig> {
    const { campaignId, missionId, clientId } = await resolveScopeChain(context);

    const orConditions: Array<{ scopeType: ActionScopeType; scopeId: string | null }> = [
        { scopeType: "GLOBAL", scopeId: "" },
    ];
    if (clientId) orConditions.push({ scopeType: "CLIENT", scopeId: clientId });
    if (missionId) orConditions.push({ scopeType: "MISSION", scopeId: missionId });
    if (campaignId) orConditions.push({ scopeType: "CAMPAIGN", scopeId: campaignId });

    const rows = await prisma.actionStatusDefinition.findMany({
        where: {
            isActive: true,
            OR: orConditions.map(({ scopeType, scopeId }) => ({
                scopeType,
                scopeId: scopeId ?? "",
            })),
        },
        orderBy: { sortOrder: "asc" },
    });

    // Merge by code: most specific scope wins (CAMPAIGN > MISSION > CLIENT > GLOBAL)
    const byCode = new Map<string, typeof rows[0]>();
    for (const row of rows) {
        const existing = byCode.get(row.code);
        const existingOrder = existing ? SCOPE_ORDER.indexOf(existing.scopeType) : -1;
        const rowOrder = SCOPE_ORDER.indexOf(row.scopeType);
        if (!existing || rowOrder > existingOrder) {
            byCode.set(row.code, row);
        }
    }

    let statuses: EffectiveStatusDefinition[] = Array.from(byCode.values())
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((r) => ({
            code: r.code,
            label: r.label ?? r.code,
            color: r.color ?? null,
            sortOrder: r.sortOrder,
            requiresNote: r.requiresNote,
            priorityLabel: r.priorityLabel,
            priorityOrder: r.priorityOrder ?? DEFAULT_PRIORITY_ORDER[r.priorityLabel],
            triggersOpportunity: r.triggersOpportunity,
            triggersCallback: r.triggersCallback,
            triggersExclusion: r.triggersExclusion,
            exclusionTarget: r.exclusionTarget ?? (r.triggersExclusion ? "CONTACT" : null),
            resultCategoryCode: r.resultCategoryCode ?? null,
        }));

    // Channel fallback: for LINKEDIN missions, ensure LinkedIn result codes are allowed
    const linkedinPreset = MISSION_STATUS_PRESETS.LINKEDIN as Array<{ code: string; label: string; color: string | null; sortOrder: number; requiresNote: boolean; priorityLabel: ActionPriorityLabel; priorityOrder: number | null; triggersOpportunity: boolean; triggersCallback: boolean }>;
    if (missionId && linkedinPreset?.length) {
        const mission = await prisma.mission.findUnique({
            where: { id: missionId },
            select: { channel: true },
        });
        if (mission?.channel === "LINKEDIN") {
            const existingCodes = new Set(statuses.map((s) => s.code));
            for (const p of linkedinPreset) {
                if (!existingCodes.has(p.code)) {
                    existingCodes.add(p.code);
                    statuses.push({
                        code: p.code,
                        label: p.label,
                        color: p.color,
                        sortOrder: p.sortOrder,
                        requiresNote: p.requiresNote,
                        priorityLabel: p.priorityLabel,
                        priorityOrder: p.priorityOrder ?? DEFAULT_PRIORITY_ORDER[p.priorityLabel],
                        triggersOpportunity: p.triggersOpportunity,
                        triggersCallback: p.triggersCallback,
                        triggersExclusion: DEFAULT_EXCLUSION_TARGETS[p.code] !== undefined,
                        exclusionTarget: DEFAULT_EXCLUSION_TARGETS[p.code] ?? null,
                        resultCategoryCode: null,
                    });
                }
            }
            statuses.sort((a, b) => a.sortOrder - b.sortOrder);
        }
    }

    // Safety net: ensure core workflow statuses exist in effective config.
    // MEETING_BOOKED is required by SDR drawers/pages to open booking dialog flow.
    for (const fallback of CORE_FALLBACK_STATUSES) {
        if (!statuses.some((s) => s.code === fallback.code)) {
            statuses.push({
                ...fallback,
                sortOrder: Math.max(...statuses.map((s) => s.sortOrder), 0) + 1,
            });
        }
    }
    statuses.sort((a, b) => a.sortOrder - b.sortOrder);

    // Next steps (same merge logic)
    const nextStepRows = await prisma.actionNextStep.findMany({
        where: {
            OR: orConditions.map(({ scopeType, scopeId }) => ({
                scopeType,
                scopeId: scopeId ?? "",
            })),
        },
    });

    const nextStepsByKey = new Map<string, (typeof nextStepRows)[0]>();
    for (const row of nextStepRows) {
        const key = `${row.fromResultCode}:${row.actionType}`;
        const existing = nextStepsByKey.get(key);
        const existingOrder = existing ? SCOPE_ORDER.indexOf(existing.scopeType) : -1;
        const rowOrder = SCOPE_ORDER.indexOf(row.scopeType);
        if (!existing || rowOrder > existingOrder) {
            nextStepsByKey.set(key, row);
        }
    }

    const nextSteps: EffectiveNextStep[] = Array.from(nextStepsByKey.values()).map((r) => ({
        fromResultCode: r.fromResultCode,
        actionType: r.actionType,
        label: r.label,
        config: r.config as unknown,
    }));

    return { statuses, nextSteps };
}

export async function getAllowedResultCodes(context: ScopeContext): Promise<string[]> {
    const { statuses } = await getEffectiveStatusConfig(context);
    return statuses.map((s) => s.code);
}

export function getPriorityForResult(
    resultCode: string | null,
    config: EffectiveStatusConfig
): { priorityOrder: number; priorityLabel: ActionPriorityLabel } {
    if (resultCode === null) {
        return { priorityOrder: 3, priorityLabel: "NEW" };
    }

    const status = config.statuses.find((s) => s.code === resultCode);
    if (status) {
        return {
            priorityOrder: status.priorityOrder,
            priorityLabel: status.priorityLabel,
        };
    }

    const legacy = LEGACY_PRIORITY[resultCode];
    if (legacy) {
        return { priorityOrder: legacy.order, priorityLabel: legacy.label };
    }

    return { priorityOrder: 999, priorityLabel: "SKIP" };
}

export const statusConfigService = {
    getEffectiveStatusConfig,
    getAllowedResultCodes,
    getPriorityForResult,
};
