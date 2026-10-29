/**
 * Tool profiles — which slice of the registry a model call advertises.
 *
 * Sending all ~70 tool schemas costs about 8k tokens per call, most of them
 * for tools the question will never need. A profile is picked once per turn
 * from the question's wording: "core" plus the groups whose keywords match.
 * The model keeps an escape hatch (`load_tool_group`) when the guess is wrong,
 * and a deep run always gets everything.
 *
 * Pure: no registry import, so the registry can import this file for the
 * `load_tool_group` tool without a cycle. Names are strings on purpose — a
 * group may list a tool that is not registered yet (memory tools land in a
 * later PR); the consistency test only insists that every REGISTERED tool has
 * exactly one group.
 */

import type { AssistantContext } from "./types";

export type ToolGroup =
    | "core"
    | "contacts"
    | "calls"
    | "structure"
    | "insights"
    | "folder"
    | "actions"
    | "admin_db"
    | "agency";

export const TOOL_GROUP_NAMES: readonly ToolGroup[] = [
    "core",
    "contacts",
    "calls",
    "structure",
    "insights",
    "folder",
    "actions",
    "admin_db",
    "agency",
];

export const TOOL_GROUPS: Record<ToolGroup, readonly string[]> = {
    // Always sent: the bearings (who am I, what project), the headline figures,
    // the transcripts (the assistant's signature use), drawing, help, memory
    // and the catalogue itself.
    core: [
        "whoami",
        "global_search",
        "get_stats_overview",
        "get_sales_report",
        "get_mission_metrics",
        "get_rdv_overview",
        "get_contact_context",
        "search_transcripts",
        "get_transcript",
        "show_visual",
        "search_help",
        "list_projects",
        "get_project_overview",
        "load_tool_group",
        // Memory tools (Captain AI v4 B-PR2) — registered later, listed now.
        "remember",
        "update_memory",
        "forget",
        "list_memories",
    ],
    contacts: ["search_contacts", "get_contact", "search_companies", "get_company", "search_leads", "get_lead"],
    calls: ["search_calls", "get_call", "get_call_coverage", "search_activities", "search_appointments"],
    structure: [
        "list_clients",
        "list_missions",
        "get_mission",
        "list_campaigns",
        "get_campaign",
        "list_lists",
        "get_list",
        "list_teams",
        "get_team",
        "list_users",
        "get_user",
        "list_exclusions",
    ],
    insights: ["get_daily_reports", "get_data_quality", "get_meeting_feedback", "list_meetings", "get_campaign_status"],
    // Everything that reads the project dossier: documents, accesses, drafts, tasks.
    folder: [
        "list_project_documents",
        "read_project_document",
        "get_call_recap",
        "get_playbook",
        "list_credentials",
        "list_access_gaps",
        "propose_email_addresses",
        "list_access_activity",
        "list_drafts",
        "read_draft",
        "list_tasks",
        "list_task_boards",
    ],
    // Every safe_write and confirm tool.
    actions: [
        "draft_email",
        "create_task",
        "set_credential_mission",
        "create_portal_account",
        "save_credential",
        "reveal_password",
        "rotate_password",
        "send_credentials_email",
        "delete_credential",
        "send_onboarding_emails",
        "send_draft",
    ],
    admin_db: ["admin_db_overview", "admin_db_inspect", "admin_db_sql"],
    agency: ["get_agency_overview", "get_agency_metrics", "list_clients_needing_attention", "search_across_projects"],
};

const GROUP_OF: ReadonlyMap<string, ToolGroup> = new Map(
    TOOL_GROUP_NAMES.flatMap((group) => TOOL_GROUPS[group].map((name) => [name, group] as const)),
);

/** The group a tool name belongs to, or null for a name no group lists. */
export function toolGroupOf(name: string): ToolGroup | null {
    return GROUP_OF.get(name) ?? null;
}

export type ToolProfile = "core" | "full";

export interface ToolProfileInput {
    ctx: AssistantContext;
    depth: "standard" | "deep";
    question: string;
    /** Names the guard allows this request (listAccessibleTools). */
    accessible: readonly string[];
}

export interface ToolProfileDecision {
    profile: ToolProfile;
    groups: ToolGroup[];
    /** Names to advertise; null = everything accessible (no slimming by group). */
    names: ReadonlySet<string> | null;
}

/**
 * Keyword triggers, matched on the lower-cased, accent-stripped question, so
 * the patterns are plain ASCII. Over-matching is cheap (one group more);
 * under-matching costs the model a `load_tool_group` round trip.
 */
const GROUP_TRIGGERS: ReadonlyArray<[ToolGroup, RegExp]> = [
    ["calls", /transcri|dit au telephone|verbatim|appel|enregistr/],
    ["contacts", /contact|prospect|societe|entreprise|lead|interlocuteur|telephone|email/],
    ["structure", /liste|fichier|campagne|mission|equipe|utilisateur|sdr|exclusion/],
    ["insights", /retour|ressenti|qualite|presen|honor|no.?show|feedback|statut/],
    ["folder", /acces|mot de passe|compte|portail|document|brouillon|tache|playbook|compte.rendu/],
    ["actions", /envoi|envoy|cree|creer|supprim|regen|affiche le mot|redige|brouillon|tache|retiens|memoris|oublie/],
];

/** Agency view only: raw SQL is worth sending when the wording smells of it. */
const ADMIN_DB_TRIGGER = /sql|table|requete|croisement|colonne/;

/** Above this share of the accessible tools, slimming by group saves nothing. */
const FULL_THRESHOLD = 0.8;

export function normalizeQuestion(question: string): string {
    return question
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase();
}

export function toolProfileFor(input: ToolProfileInput): ToolProfileDecision {
    const { ctx, depth, accessible } = input;
    const full: ToolProfileDecision = { profile: "full", groups: [...TOOL_GROUP_NAMES], names: null };
    if (depth === "deep") return full;

    const text = normalizeQuestion(input.question);
    const groups: ToolGroup[] = ["core"];
    for (const [group, pattern] of GROUP_TRIGGERS) {
        if (pattern.test(text)) groups.push(group);
    }
    if (!ctx.project) {
        groups.push("agency");
        if (ADMIN_DB_TRIGGER.test(text)) groups.push("admin_db");
    }

    const wanted = new Set(groups.flatMap((group) => TOOL_GROUPS[group]));
    const names = new Set(accessible.filter((name) => wanted.has(name)));
    if (accessible.length > 0 && names.size >= accessible.length * FULL_THRESHOLD) return full;

    return { profile: "core", groups, names };
}
