/**
 * Form model generated from a playbook's JSON Schema (AgentPlaybookItem.configSchema).
 * Supports the shapes a zod object of scalars produces: number, integer,
 * boolean, string, enum (also `anyOf`/`type: [x, "null"]` wrappers of them).
 * Objects and arrays (the shared `budget`) are left to dedicated controls.
 */

export type ConfigFieldType = "number" | "integer" | "boolean" | "enum" | "string";

export interface ConfigField {
    key: string;
    label: string;
    type: ConfigFieldType;
    description: string | null;
    required: boolean;
    min: number | null;
    max: number | null;
    options: Array<{ value: string; label: string }>;
    defaultValue: unknown;
}

/** French labels for config keys the playbooks share. */
const KNOWN_LABELS: Record<string, string> = {
    days: "Fenêtre d’inactivité (jours)",
    threshold: "Seuil",
    minCalls: "Appels minimum",
    lookbackDays: "Période analysée (jours)",
    maxItems: "Nombre maximum d’éléments",
    language: "Langue",
};

const KNOWN_OPTION_LABELS: Record<string, string> = {
    immediate: "Immédiatement",
    digest: "Dans la synthèse",
    none: "Aucune",
};

/** Keys the settings form renders itself (switch, select, budget presets). */
export const RESERVED_CONFIG_KEYS = ["dryRun", "notify", "budget", "jobName"] as const;

/** "lookbackDays" → "Lookback days". */
export function humanizeKey(key: string): string {
    const words = key
        .replace(/[_-]+/g, " ")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .trim()
        .toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1);
}

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);

/** Unwraps `anyOf: [X, {type: "null"}]` and `type: ["x", "null"]`. */
function unwrapNullable(schema: Json): Json {
    const variants = (schema.anyOf ?? schema.oneOf) as unknown;
    if (Array.isArray(variants)) {
        const nonNull = variants.filter((v) => isObj(v) && v.type !== "null") as Json[];
        if (nonNull.length === 1) return { ...nonNull[0], description: schema.description ?? nonNull[0].description, default: schema.default ?? nonNull[0].default };
        const consts = nonNull.filter((v) => "const" in v);
        if (consts.length === nonNull.length && consts.length > 0) return { ...schema, enum: consts.map((v) => v.const) };
    }
    if (Array.isArray(schema.type)) {
        const types = (schema.type as unknown[]).filter((t) => t !== "null");
        if (types.length === 1) return { ...schema, type: types[0] };
    }
    return schema;
}

/** Bounds beyond ±1e15 are zod's safe-integer defaults, not a real limit. */
function bound(v: unknown): number | null {
    return typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e15 ? v : null;
}

export function buildConfigFields(schema: unknown, omit: readonly string[] = RESERVED_CONFIG_KEYS): ConfigField[] {
    if (!isObj(schema) || !isObj(schema.properties)) return [];
    const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
    const fields: ConfigField[] = [];
    for (const [key, raw] of Object.entries(schema.properties)) {
        if (omit.includes(key) || !isObj(raw)) continue;
        const prop = unwrapNullable(raw);
        let type: ConfigFieldType | null = null;
        let options: ConfigField["options"] = [];
        if (Array.isArray(prop.enum) && prop.enum.length > 0) {
            type = "enum";
            options = prop.enum.filter((v) => typeof v === "string" || typeof v === "number").map((v) => ({
                value: String(v),
                label: KNOWN_OPTION_LABELS[String(v)] ?? humanizeKey(String(v)),
            }));
        } else if (prop.type === "integer" || prop.type === "number" || prop.type === "boolean" || prop.type === "string") {
            type = prop.type;
        }
        if (!type) continue;
        const exclusiveMin = bound(prop.exclusiveMinimum);
        const exclusiveMax = bound(prop.exclusiveMaximum);
        fields.push({
            key,
            label: typeof prop.title === "string" ? prop.title : KNOWN_LABELS[key] ?? humanizeKey(key),
            type,
            description: typeof prop.description === "string" ? prop.description : null,
            required: required.has(key),
            min: bound(prop.minimum) ?? (exclusiveMin === null ? null : type === "integer" ? exclusiveMin + 1 : exclusiveMin),
            max: bound(prop.maximum) ?? (exclusiveMax === null ? null : type === "integer" ? exclusiveMax - 1 : exclusiveMax),
            options,
            defaultValue: prop.default,
        });
    }
    return fields;
}

/** Form draft: every value as the control holds it (string for inputs, boolean for switches). */
export type ConfigDraft = Record<string, string | boolean>;

export function initialDraft(fields: readonly ConfigField[], current: Record<string, unknown> | null | undefined): ConfigDraft {
    const draft: ConfigDraft = {};
    for (const f of fields) {
        const v = current && f.key in current ? current[f.key] : f.defaultValue;
        if (f.type === "boolean") draft[f.key] = v === true;
        else draft[f.key] = v === undefined || v === null ? "" : String(v);
    }
    return draft;
}

export interface DraftResult {
    values: Record<string, unknown>;
    errors: Record<string, string>;
}

/**
 * Coerces and validates a draft. Empty optional fields are dropped (the
 * playbook default applies); required ones and out-of-bounds numbers error.
 */
export function readDraft(fields: readonly ConfigField[], draft: ConfigDraft): DraftResult {
    const values: Record<string, unknown> = {};
    const errors: Record<string, string> = {};
    for (const f of fields) {
        const raw = draft[f.key];
        if (f.type === "boolean") {
            values[f.key] = raw === true;
            continue;
        }
        const text = typeof raw === "string" ? raw.trim() : "";
        if (text === "") {
            if (f.required) errors[f.key] = "Champ requis.";
            continue;
        }
        if (f.type === "enum") {
            if (!f.options.some((o) => o.value === text)) errors[f.key] = "Choix invalide.";
            else values[f.key] = text;
            continue;
        }
        if (f.type === "string") {
            values[f.key] = text;
            continue;
        }
        const n = Number(text.replace(",", "."));
        if (!Number.isFinite(n)) {
            errors[f.key] = "Nombre attendu.";
            continue;
        }
        if (f.type === "integer" && !Number.isInteger(n)) {
            errors[f.key] = "Nombre entier attendu.";
            continue;
        }
        if (f.min !== null && n < f.min) {
            errors[f.key] = `Minimum ${f.min}.`;
            continue;
        }
        if (f.max !== null && n > f.max) {
            errors[f.key] = `Maximum ${f.max}.`;
            continue;
        }
        values[f.key] = n;
    }
    return { values, errors };
}

/** Whether the schema declares a key (dryRun, notify) at the top level. */
export function schemaHas(schema: unknown, key: string): boolean {
    return isObj(schema) && isObj(schema.properties) && key in schema.properties;
}

/** Enum values of a top-level key, e.g. notify → ["immediate", "digest"]. */
export function schemaEnum(schema: unknown, key: string): string[] {
    if (!isObj(schema) || !isObj(schema.properties)) return [];
    const prop = schema.properties[key];
    if (!isObj(prop)) return [];
    const p = unwrapNullable(prop);
    return Array.isArray(p.enum) ? p.enum.filter((v): v is string => typeof v === "string") : [];
}

/**
 * Slider settings for a bounded number: integers with a span ≤ 365 step by 1,
 * decimals step by a hundredth of the span. null when a free input fits better
 * (unbounded, or too wide a span for a pointer to be precise).
 */
export function sliderSpec(f: Pick<ConfigField, "type" | "min" | "max">): { min: number; max: number; step: number } | null {
    if (f.type !== "integer" && f.type !== "number") return null;
    if (f.min === null || f.max === null || f.max <= f.min) return null;
    const span = f.max - f.min;
    if (f.type === "integer") return span <= 365 ? { min: f.min, max: f.max, step: 1 } : null;
    if (span > 1000) return null;
    const raw = span / 100;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    return { min: f.min, max: f.max, step: magnitude };
}

export function optionLabel(value: string): string {
    return KNOWN_OPTION_LABELS[value] ?? humanizeKey(value);
}
