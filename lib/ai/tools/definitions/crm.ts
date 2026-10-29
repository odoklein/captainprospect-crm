/**
 * Données CRM — the prospecting data itself (contacts, calls, transcripts,
 * RDV, lists, SDR reports, sales report), borrowed from the public API's MCP
 * catalogue instead of being re-implemented.
 *
 * Those services filter every query on a `Principal`. Here the principal is
 * synthesised from the assistant context, so the project binding IS the
 * tenant: a bound project sees its client (and mission) only; the agency view
 * — manager-only like every assistant tool — sees every client, exactly like
 * an internal all-clients key.
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Principal } from "@/lib/api-v1/auth";
import { ApiError } from "@/lib/api-v1/errors";
import { INTERNAL_TOOLS, TOOLS, type ToolDef } from "@/lib/api-v1/mcp-tools";
import { ADMIN_DB_TOOLS } from "@/lib/api-v1/admin-db-tools";
import { toJsonSafe } from "@/lib/api-v1/sql-guard";
import { READ_SCOPES } from "@/lib/api-v1/scopes";
import { defineReadTool } from "../helpers";
import { neutralizeUntrusted } from "../redact";
import { ToolValidationError, type AssistantContext, type JsonSchemaObject } from "../types";

/** French labels for the tool trace. Unlisted tools fall back to their name. */
const LABELS: Record<string, string> = {
    whoami: "Périmètre et glossaire",
    global_search: "Recherche globale",
    search_contacts: "Recherche de contacts",
    get_contact: "Fiche contact",
    get_contact_context: "Historique du prospect",
    search_companies: "Recherche de sociétés",
    get_company: "Fiche société",
    search_leads: "Pipeline des leads",
    get_lead: "Fiche lead",
    search_calls: "Recherche d'appels",
    get_call: "Détail d'un appel",
    search_transcripts: "Recherche dans les transcriptions",
    get_transcript: "Transcription d'appel",
    search_activities: "Recherche d'actions",
    search_appointments: "Recherche de RDV",
    list_teams: "Équipes",
    get_team: "Équipe",
    list_users: "Utilisateurs",
    get_user: "Fiche utilisateur",
    list_clients: "Clients",
    list_campaigns: "Campagnes",
    get_campaign: "Campagne et script",
    list_missions: "Missions",
    get_mission: "Mission en détail",
    list_lists: "Listes de prospection",
    get_list: "Liste en détail",
    get_rdv_overview: "Bilan des RDV",
    list_exclusions: "Exclusions",
    get_daily_reports: "Retours journée SDR",
    get_data_quality: "Qualité des données",
    get_sales_report: "Rapport commercial",
    get_call_coverage: "Couverture des appels",
    admin_db_overview: "Carte de la base",
    admin_db_inspect: "Structure d'une table",
    admin_db_sql: "Requête SQL en lecture seule",
};

/**
 * The raw-database tools ChatGPT gets with an all-clients key. Agency view
 * only: they see every client, so a project conversation never lists them.
 * `admin_db_query` / `_aggregate` / `_get_record` are left out — they pass
 * model-built Prisma `include`s, and SQL answers the same questions.
 */
const AGENCY_DB_TOOLS = ADMIN_DB_TOOLS.filter((def) =>
    ["admin_db_overview", "admin_db_inspect", "admin_db_sql"].includes(def.name),
);

/** A tool result above this many characters is cut, so one search cannot fill the context. */
const MAX_RESULT_CHARS = 40_000;

function principalFor(ctx: AssistantContext): Principal {
    const project = ctx.project;
    return {
        keyId: "assistant-projet",
        keyName: "Assistant Projet",
        clientId: project?.clientId ?? null,
        allClients: !project,
        missionId: project?.missionId ?? null,
        scopes: [...READ_SCOPES],
        issuedById: ctx.userId,
    };
}

function jsonSchemaFor(def: ToolDef): JsonSchemaObject {
    // `input` + `any`: the services coerce and transform some arguments, which
    // has no JSON Schema form — the model only needs the shape it may send.
    const schema = z.toJSONSchema(z.object(def.shape), { io: "input", unrepresentable: "any" }) as Record<
        string,
        unknown
    >;
    return {
        type: "object",
        properties: (schema.properties as Record<string, unknown>) ?? {},
        required: (schema.required as string[]) ?? [],
        additionalProperties: false,
    };
}

function bridge(def: ToolDef, options: { agencyOnly?: boolean } = {}) {
    return defineReadTool({
        name: def.name,
        label: LABELS[def.name] ?? def.name,
        description: def.description,
        parameters: jsonSchemaFor(def),
        // The service validates against its own shape (with its coercions);
        // validating here as well would run the transforms twice.
        schema: z.record(z.string(), z.unknown()),
        requiresProject: false,
        agencyOnly: options.agencyOnly,
        execute: async (args, ctx) => {
            let result: unknown;
            try {
                // Notes, transcripts and company names are typed by prospects and
                // SDRs: neutralised like every project tool's free text.
                result = neutralizeUntrusted(toJsonSafe(await def.run({ p: principalFor(ctx), db: prisma }, args)));
            } catch (error) {
                if (error instanceof ApiError) {
                    throw new ToolValidationError(`${error.code}: ${error.message}`);
                }
                throw error;
            }

            const text = JSON.stringify(result) ?? "null";
            if (text.length <= MAX_RESULT_CHARS) return result;
            return {
                truncated: true,
                note: "Résultat trop long, coupé. Relance avec un `limit` plus petit ou des filtres plus précis.",
                partial: text.slice(0, MAX_RESULT_CHARS),
            };
        },
    });
}

export const CRM_DATA_TOOLS = [
    ...[...TOOLS, ...INTERNAL_TOOLS].map((def) => bridge(def)),
    ...AGENCY_DB_TOOLS.map((def) => bridge(def, { agencyOnly: true })),
];
