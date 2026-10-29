/**
 * load_tool_group — the escape hatch of the tool profiles.
 *
 * A model call only advertises the "core" group plus the groups the question
 * seemed to need (lib/ai/tools/profiles.ts). When the guess was wrong, the
 * model calls this to see what another group offers; the orchestrator then
 * widens the next call's tool list to that group. It looks nothing up, so it
 * is not a source (`noEvidence`).
 *
 * The registry is injected rather than imported: the registry lists this tool,
 * so importing it back from here would be a cycle.
 */

import { z } from "zod";
import { defineReadTool, params } from "../helpers";
import { listAccessibleTools } from "../guard";
import { TOOL_GROUPS, TOOL_GROUP_NAMES, type ToolGroup } from "../profiles";
import type { AnyToolDefinition } from "../types";

/** Enough to tell the tools apart; the full description comes with the schema once loaded. */
const SUMMARY_CHARS = 160;

export interface ToolGroupEntry {
    name: string;
    label: string;
    description: string;
}

export interface ToolGroupCatalogue {
    group: ToolGroup;
    tools: ToolGroupEntry[];
}

const LOADABLE_GROUPS = TOOL_GROUP_NAMES.filter((group) => group !== "core");

export function defineLoadToolGroup(resolveTools: () => AnyToolDefinition[]) {
    return defineReadTool<{ group: ToolGroup }, ToolGroupCatalogue>({
        name: "load_tool_group",
        label: "Catalogue d’outils",
        noEvidence: true,
        requiresProject: false,
        description:
            "Les outils affichés sont un sous-ensemble. Appelle ceci pour obtenir ceux d’un autre groupe (contacts, calls, structure, insights, folder, actions, admin_db, agency) si la question en a besoin.",
        parameters: params(
            {
                group: {
                    type: "string",
                    enum: [...LOADABLE_GROUPS],
                    description:
                        "contacts (fiches contact/société/lead) · calls (appels, RDV, actions) · structure (clients, missions, campagnes, listes, équipes) · insights (retours SDR, qualité, feedback RDV) · folder (documents, accès, brouillons, tâches) · actions (créer, envoyer, mots de passe) · admin_db (SQL, vue agence) · agency (vue agence)",
                },
            },
            ["group"],
        ),
        schema: z.object({ group: z.enum(LOADABLE_GROUPS as [ToolGroup, ...ToolGroup[]]) }),
        execute: async (args, ctx) => {
            const members = new Set(TOOL_GROUPS[args.group]);
            // The guard decides what this caller may see, exactly as for the main list.
            const tools = listAccessibleTools(resolveTools(), ctx)
                .filter((tool) => members.has(tool.name))
                .map((tool) => ({
                    name: tool.name,
                    label: tool.label,
                    description: tool.description.slice(0, SUMMARY_CHARS),
                }));
            return { group: args.group, tools };
        },
    });
}
