/**
 * The tool registry — the exhaustive list of what the assistant is allowed to
 * do.
 *
 * If a capability is not in this array, the model cannot reach it. Adding an
 * entry is the only way to widen the surface, which makes this file the review
 * checkpoint for every future expansion.
 *
 * Sections follow the risk tiers, so the two lists that matter — what runs by
 * itself, and what can leave the building — are readable at a glance.
 */

import type { MistralToolSpec } from "@/lib/ai/mistral";
import { AssistantContext, AnyToolDefinition } from "./types";
import { listAccessibleTools } from "./guard";

import { getProjectOverview, listProjects, listTaskBoards } from "./definitions/projects";
import {
    getCallRecap,
    getPlaybook,
    listProjectDocuments,
    readProjectDocument,
} from "./definitions/documents";
import {
    createPortalAccount,
    fileCredentialUnderMission,
    listAccessActivity,
    listAccessGaps,
    listProjectCredentials,
    proposeEmails,
    removeCredential,
    revealPassword,
    rotatePassword,
    saveCredential,
    sendCredentials,
} from "./definitions/access";
import {
    getCampaignStatus,
    getMeetingFeedback,
    getMissionMetrics,
    listMeetings,
} from "./definitions/activity";
import {
    draftEmail,
    listDrafts,
    readDraft,
    sendDraft,
    sendOnboardingEmailsTool,
} from "./definitions/communication";
import { createTask, listTasks } from "./definitions/organisation";
import {
    getAgencyMetrics,
    getAgencyOverview,
    listClientsNeedingAttention,
    searchAcrossProjects,
} from "./definitions/agency";
import { searchHelp } from "./definitions/knowledge";

export const ASSISTANT_TOOLS: AnyToolDefinition[] = [
    // ── READ — no side effects, run automatically ────────────────────────────
    // Vue agence — the only tools that work with no project bound
    getAgencyOverview,
    listClientsNeedingAttention,
    getAgencyMetrics,
    searchAcrossProjects,
    searchHelp,
    // Structure
    listProjects,
    getProjectOverview,
    listTaskBoards,
    // Contexte du projet
    listProjectDocuments,
    readProjectDocument,
    getCallRecap,
    getPlaybook,
    // Accès
    listProjectCredentials,
    listAccessGaps,
    proposeEmails,
    listAccessActivity,
    // Suivi
    getMissionMetrics,
    listMeetings,
    getMeetingFeedback,
    getCampaignStatus,
    // Production
    listDrafts,
    readDraft,
    listTasks,

    // ── SAFE WRITE — automatic, budgeted, logged, undone in one click ────────
    draftEmail,
    createTask,
    fileCredentialUnderMission,

    // ── CONFIRM — never runs from the loop. A human clicks. ──────────────────
    createPortalAccount,
    saveCredential,
    revealPassword,
    rotatePassword,
    sendCredentials,
    removeCredential,
    sendOnboardingEmailsTool,
    sendDraft,
];

const BY_NAME = new Map(ASSISTANT_TOOLS.map((tool) => [tool.name, tool]));

if (BY_NAME.size !== ASSISTANT_TOOLS.length) {
    throw new Error("Duplicate tool name in ASSISTANT_TOOLS registry");
}

export function getTool(name: string): AnyToolDefinition | undefined {
    return BY_NAME.get(name);
}

export function getToolsForContext(ctx: AssistantContext): AnyToolDefinition[] {
    return listAccessibleTools(ASSISTANT_TOOLS, ctx);
}

/** Mistral function-calling schema for the tools this caller may use. */
export function toMistralTools(ctx: AssistantContext): MistralToolSpec[] {
    return getToolsForContext(ctx).map((tool) => ({
        type: "function" as const,
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters as unknown as Record<string, unknown>,
        },
    }));
}

/** Counts for the docs and the UI footer. */
export function toolCounts() {
    return {
        total: ASSISTANT_TOOLS.length,
        read: ASSISTANT_TOOLS.filter((t) => t.risk === "read").length,
        safeWrite: ASSISTANT_TOOLS.filter((t) => t.risk === "safe_write").length,
        confirm: ASSISTANT_TOOLS.filter((t) => t.risk === "confirm").length,
        /** Usable in "vue agence", with no project bound. */
        agencyWide: ASSISTANT_TOOLS.filter((t) => !t.requiresProject).length,
    };
}
