// ============================================
// Which model the call features use: end-of-call summary, suggested result
// (the card under the call island) and the pre-call brief.
//
//   CALL_AI_MODEL = deepseek-chat   → DeepSeek
//   CALL_AI_MODEL = gpt-4o / empty  → OpenAI (default)
//
// Set it in Paramètres → Intégrations (live in about a second) or in the
// container env. Switching back to OpenAI = changing that one value.
//
// Call transcripts are prospects' personal data (raw_crm). DeepSeek's official
// API is hosted in China, which the provider layer refuses for that data
// unless DEEPSEEK_BASE_URL + DEEPSEEK_RESIDENCY=eu point at an EU host, or the
// agency explicitly allows it with AI_ALLOW_CN_RAW_CRM=true. When DeepSeek is
// not usable, the call goes to OpenAI directly (if its key is set) and the
// diagnostics panel says why.
// ============================================

import { integrationKey } from "@/lib/integrations/keys";
import { DEFAULT_JSON_MODEL } from "./json-call";
import { residencyAllows, resolveModel } from "./providers/catalog";
import type { ProviderId } from "./providers/types";

export interface CallModelChoice {
    /** What the setting asks for. */
    requested: string;
    requestedProvider: ProviderId;
    /** What a call actually starts with. */
    model: string;
    /** Tried once if `model` fails at run time; null when there is none. */
    fallback: string | null;
    /** Why `model` differs from `requested`, in French; null when it does not. */
    reason: string | null;
}

/** Pure: the choice from the setting and which keys exist. */
export function chooseCallModel(input: {
    setting?: string | null;
    openaiKey: boolean;
    deepseekKey: boolean;
    env?: Record<string, string | undefined>;
}): CallModelChoice {
    const requested = input.setting?.trim() || DEFAULT_JSON_MODEL;
    const spec = resolveModel(requested);
    const openaiFallback = spec.provider !== "openai" && input.openaiKey ? DEFAULT_JSON_MODEL : null;

    let reason: string | null = null;
    if (spec.provider === "deepseek" && !input.deepseekKey) reason = "Clé DeepSeek absente (DEEPSEEK_API_KEY)";
    else if (spec.provider === "openai" && !input.openaiKey) reason = "Clé OpenAI absente (OPENAI_API_KEY)";
    else if (!residencyAllows("raw_crm", spec.provider, input.env ?? process.env)) {
        reason = "DeepSeek (API officielle, hébergée en Chine) n'est pas autorisé pour les données d'appel";
    }

    if (reason && openaiFallback) return { requested, requestedProvider: spec.provider, model: openaiFallback, fallback: null, reason };
    return { requested, requestedProvider: spec.provider, model: requested, fallback: reason ? null : openaiFallback, reason };
}

export function callModelChoice(): CallModelChoice {
    return chooseCallModel({
        setting: integrationKey("CALL_AI_MODEL"),
        openaiKey: Boolean(integrationKey("OPENAI_API_KEY")),
        deepseekKey: Boolean(integrationKey("DEEPSEEK_API_KEY")),
    });
}

/** The two options to pass to callJsonModel. */
export function callModelOptions(): { model: string; fallbackModel: string | null } {
    const c = callModelChoice();
    return { model: c.model, fallbackModel: c.fallback };
}
