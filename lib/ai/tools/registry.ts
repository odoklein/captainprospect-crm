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
 *
 * The second half is the wire side: `toProviderTools` turns the accessible
 * tools into provider specs, narrowed to a profile (lib/ai/tools/profiles.ts)
 * and slimmed (`slimToolSchema`) so a call carries fewer tokens.
 */

import type { ToolSpec } from "@/lib/ai/providers/types";
import { PERIODS } from "@/lib/api-v1/dates";
import { AssistantContext, AnyToolDefinition } from "./types";

/** OpenAI Chat Completions function-tool envelope (older callers and tests). */
export interface OpenAIToolSpec {
    type: "function";
    function: { name: string; description: string; parameters: Record<string, unknown> };
}
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
import { CRM_DATA_TOOLS } from "./definitions/crm";
import { getStatsOverviewTool } from "./definitions/stats";
import { showVisual } from "./definitions/visuals";
import { defineLoadToolGroup } from "./definitions/toolgroups";
import { forget, listMemories, remember, updateMemory } from "./definitions/memory";
import { FILE_TOOLS } from "./definitions/files";
import { REPORTING_TOOLS } from "./definitions/reporting";
// The index, not tools/resolve.ts: resolve imports this registry.
import { AGENT_RUN_TOOLS } from "@/lib/agent/tools/index";

// The catalogue reads the registry it belongs to; the closure resolves it at
// call time, after the array below exists.
const loadToolGroup = defineLoadToolGroup(() => ASSISTANT_TOOLS);

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
    // Statistiques — the /manager/analytics engine, chart-ready.
    getStatsOverviewTool,
    // Dessiner — charts, key figures, tables; checked against the turn's sources.
    showVisual,
    // Catalogue — the escape hatch of the tool profiles.
    loadToolGroup,
    // Mémoire — what the manager said and asked to keep. Not a source to cite.
    listMemories,
    // Fichiers du dossier — uploaded documents, extracted and searchable.
    ...FILE_TOOLS,
    // Captain Agent — run-scoped tools (dataset, propose_action, record_finding) need a
    // permission only background runs hold, so chat never sees them; publish_weekly_bilan
    // is a confirm tool, proposed by the weekly report and approved by a manager.
    ...AGENT_RUN_TOOLS,
    ...REPORTING_TOOLS,
    // Données CRM — contacts, appels, transcriptions, RDV, listes, retours SDR.
    // Scoped to the bound project; agency-wide when none is bound.
    ...CRM_DATA_TOOLS,

    // ── SAFE WRITE — automatic, budgeted, logged, undone in one click ────────
    draftEmail,
    createTask,
    fileCredentialUnderMission,
    // Mémoire — reversible in one click (soft delete), logged like any write.
    remember,
    updateMemory,
    forget,

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

// ============================================
// Schema slimming
// ============================================

/** Long enough for "what it returns and when to use it"; the rest is prompt material. */
export const MAX_SCHEMA_DESCRIPTION = 220;

/** The preset list lives once in the system prompt instead of once per tool. */
const PERIOD_DESCRIPTION = "Préréglage de période (liste dans « Périodes » des consignes) ; sinon date_from/date_to.";
const CURSOR_DESCRIPTION = "next_cursor d’une page précédente";
const LIMIT_DESCRIPTION = "1–100 (défaut 20)";

/**
 * Sentences the bridged CRM tools repeat verbatim. Their content now lives in
 * the slimmed `period` / `cursor` property descriptions, once per tool.
 */
const BOILERPLATE: readonly RegExp[] = [
    /\s*Dates: prefer the `period` preset \(Paris time\)\./g,
    /\s*Results are paginated: pass the returned next_cursor as `cursor` to get the next page\./g,
];

const SHORT_DESCRIPTIONS: ReadonlyArray<[string, string]> = [
    ["cursor", CURSOR_DESCRIPTION],
    ["limit", LIMIT_DESCRIPTION],
];

/**
 * Validation-only keywords. The service re-validates every argument with its
 * own zod shape, so on the wire they only cost tokens; the few that guide the
 * model (page size bounds, defaults) are said in the shortened descriptions.
 */
const VALIDATION_KEYS = new Set(["minLength", "maxLength", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "pattern", "default"]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The public API's `zBool` accepts "true"/"false" strings for query strings;
 * a model sends JSON, so the boolean alone is the whole contract.
 */
function isQueryBool(node: Record<string, unknown>): boolean {
    const variants = node.anyOf;
    if (!Array.isArray(variants) || variants.length !== 2) return false;
    const types = variants.map((v) => (isRecord(v) ? v.type : null));
    return types.includes("boolean") && types.includes("string");
}

/** True for the shared `zPeriod` preset list — not for a tool with presets of its own. */
function isSharedPeriodEnum(prop: Record<string, unknown>): boolean {
    const values = prop.enum;
    return Array.isArray(values) && values.length === PERIODS.length && PERIODS.every((p, i) => values[i] === p);
}

/** Cut at a word boundary with an ellipsis; never longer than `max`. */
export function capDescription(text: string, max = MAX_SCHEMA_DESCRIPTION): string {
    if (text.length <= max) return text;
    const head = text.slice(0, max - 1);
    const space = head.lastIndexOf(" ");
    // A boundary in the first half means a single giant token: cut mid-word instead.
    const kept = space > max / 2 ? head.slice(0, space) : head;
    return `${kept.replace(/[\s,;:·—–-]+$/u, "")}…`;
}

/**
 * Walk a JSON Schema node: cap descriptions, drop `additionalProperties:false`,
 * empty `required` and validation keywords (strict mode is off, so they only cost tokens). The
 * `properties` map is walked by value, so an argument named "description" or
 * "required" is left alone.
 */
function slimNode(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(slimNode);
    if (!isRecord(node)) return node;
    if (isQueryBool(node)) {
        const { anyOf: _anyOf, ...rest } = node;
        return slimNode({ ...rest, type: "boolean" });
    }
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
        if (key === "additionalProperties" && value === false) continue;
        if (key === "required" && Array.isArray(value) && value.length === 0) continue;
        if (VALIDATION_KEYS.has(key)) continue;
        if (key === "description" && typeof value === "string") {
            out[key] = capDescription(value);
            continue;
        }
        if (key === "properties" && isRecord(value)) {
            out[key] = Object.fromEntries(Object.entries(value).map(([name, schema]) => [name, slimNode(schema)]));
            continue;
        }
        out[key] = slimNode(value);
    }
    return out;
}

/**
 * The same tool, cheaper on the wire. Pure: returns a new spec, the registry
 * object is never touched. Inside a bound project `client_id` is removed — the
 * binding IS the tenant, the argument could only narrow to nothing.
 */
export function slimToolSchema(spec: ToolSpec, ctx: AssistantContext): ToolSpec {
    const params = isRecord(spec.parameters) ? spec.parameters : {};
    const properties: Record<string, unknown> = isRecord(params.properties) ? { ...params.properties } : {};
    let required = Array.isArray(params.required) ? [...params.required] : [];

    if (ctx.project && "client_id" in properties) {
        delete properties.client_id;
        required = required.filter((name) => name !== "client_id");
    }
    for (const [name, description] of SHORT_DESCRIPTIONS) {
        const prop = properties[name];
        if (isRecord(prop)) properties[name] = { ...prop, description };
    }
    const period = properties.period;
    if (isRecord(period) && isSharedPeriodEnum(period)) {
        properties.period = { ...period, description: PERIOD_DESCRIPTION };
    }

    const parameters = slimNode({ ...params, properties, required }) as Record<string, unknown>;
    const description = BOILERPLATE.reduce((text, pattern) => text.replace(pattern, ""), spec.description).trim();
    return { name: spec.name, description: capDescription(description), parameters };
}

// ============================================
// Wire formats
// ============================================

export interface ProviderToolsOptions {
    /** Names to advertise (a profile); null or absent = every accessible tool. */
    names?: ReadonlySet<string> | null;
}

/** Provider-neutral specs exactly as defined — the "before" of the token audit. */
export function toRawProviderTools(ctx: AssistantContext): ToolSpec[] {
    return getToolsForContext(ctx).map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters as unknown as Record<string, unknown>,
    }));
}

/**
 * Provider-neutral function specs for the tools this caller may use (what the
 * runtime sends): guard-filtered, narrowed to `names` when a profile gave one,
 * slimmed.
 */
export function toProviderTools(ctx: AssistantContext, options: ProviderToolsOptions = {}): ToolSpec[] {
    const names = options.names ?? null;
    return toRawProviderTools(ctx)
        .filter((tool) => !names || names.has(tool.name))
        .map((tool) => slimToolSchema(tool, ctx));
}

/** OpenAI function-calling schema for the tools this caller may use. */
export function toOpenAITools(ctx: AssistantContext, options: ProviderToolsOptions = {}): OpenAIToolSpec[] {
    return toProviderTools(ctx, options).map((tool) => ({ type: "function" as const, function: tool }));
}

// ============================================
// Token estimate
// ============================================

function tsType(schema: unknown): string {
    if (!isRecord(schema)) return "any";
    if (Array.isArray(schema.enum)) return schema.enum.map((v) => JSON.stringify(v)).join(" | ");
    if (Array.isArray(schema.anyOf)) return schema.anyOf.map(tsType).join(" | ");
    const type = Array.isArray(schema.type) ? schema.type.join(" | ") : schema.type;
    if (type === "array") return `${tsType(schema.items)}[]`;
    if (type === "object" && isRecord(schema.properties)) return `{\n${tsProperties(schema)}}`;
    if (type === "integer") return "number";
    return typeof type === "string" ? type : "any";
}

function tsProperties(schema: Record<string, unknown>): string {
    const required = new Set(Array.isArray(schema.required) ? schema.required : []);
    const properties = isRecord(schema.properties) ? schema.properties : {};
    return Object.entries(properties)
        .map(([key, prop]) => {
            const comment = isRecord(prop) && typeof prop.description === "string" ? `// ${prop.description}\n` : "";
            return `${comment}${key}${required.has(key) ? "" : "?"}: ${tsType(prop)},\n`;
        })
        .join("");
}

/**
 * The tools as the provider's prompt sees them: OpenAI renders function tools
 * as a TypeScript namespace, far terser than the JSON we send. Estimating on
 * that rendering (≈ 4 chars per token) is what matches the billed input.
 */
export function renderToolsAsTypeScript(specs: ToolSpec[]): string {
    const body = specs
        .map((spec) => `// ${spec.description}\ntype ${spec.name} = (_: {\n${tsProperties(spec.parameters)}}) => any;\n`)
        .join("\n");
    return `namespace functions {\n\n${body}\n} // namespace functions`;
}

/** Billed-side estimate of a tool list; `JSON.stringify(specs).length / 4` overstates it by about a third. */
export function estimateWireTokens(specs: ToolSpec[]): number {
    return Math.ceil(renderToolsAsTypeScript(specs).length / 4);
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
