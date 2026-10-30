// ============================================
// INTEGRATION KEYS — catalog of the third-party keys an agency can change
// after its CRM is created (BYOK). Pure: safe to import anywhere.
//
// Two kinds of configuration, never mixed:
//   • fixed at creation (container env, written once by provisioning):
//     DATABASE_URL, NEXTAUTH_SECRET, ENCRYPTION_KEY, INSTANCE_ID, MINIO_*…
//     Changing one means a redeploy, and ENCRYPTION_KEY can never change
//     (it seals the keys below).
//   • changeable (this catalog): stored encrypted in the agency's database,
//     edited from the Console or from Paramètres → Intégrations, live in
//     about a second, no restart.
//
// Read a key with integrationKey("OPENAI_API_KEY") (lib/integrations/keys).
// A stored value wins over the container env; with neither, the feature is off.
// ============================================

export type IntegrationGroup = "ai" | "telephony" | "meetings" | "data";

export interface IntegrationKeyDef {
    /** Env-style name, also the name in the store. */
    name: string;
    label: string;
    group: IntegrationGroup;
    /** What stops working without it, in the user's words. */
    usedFor: string;
    placeholder?: string;
    docsUrl?: string;
}

export const INTEGRATION_GROUPS: Record<IntegrationGroup, { label: string; hint: string }> = {
    ai: { label: "Intelligence artificielle", hint: "Assistant, fiches, analyses et rédaction" },
    telephony: { label: "Téléphonie", hint: "Statistiques d'appels et enregistrements" },
    meetings: { label: "Enregistreurs de réunions", hint: "Importer un appel de closing dans « Nouveau client »" },
    data: { label: "Données & prospection", hint: "Sourcing, enrichissement, recherche d'entreprises" },
};

export const INTEGRATION_KEYS = [
    {
        name: "OPENAI_API_KEY",
        label: "OpenAI",
        group: "ai",
        usedFor: "Assistant manager, fiches RDV, Analyse IA, rédaction d'emails, transcription des appels",
        placeholder: "sk-…",
        docsUrl: "https://platform.openai.com/api-keys",
    },
    {
        name: "GEMINI_API_KEY",
        label: "Google Gemini",
        group: "ai",
        usedFor: "Essayé en premier pour les scripts, les CR et l'extraction de tâches (OpenAI prend le relais)",
        placeholder: "AIza…",
        docsUrl: "https://aistudio.google.com/app/apikey",
    },
    {
        name: "DEEPSEEK_API_KEY",
        label: "DeepSeek",
        group: "ai",
        usedFor:
            "Tâches IA de fond (synthèses, bilans) et réponses rapides de l'assistant. Les données CRM ne lui sont envoyées que via un point d'accès hébergé en UE (DEEPSEEK_BASE_URL + DEEPSEEK_RESIDENCY=eu) ; sinon, enrichissement public uniquement",
        placeholder: "sk-…",
        docsUrl: "https://platform.deepseek.com/api_keys",
    },
    {
        name: "ALLO_API_KEY",
        label: "Allo — clé API",
        group: "telephony",
        usedFor: "Statistiques d'appels, écoute des enregistrements, enrichissement des appels",
    },
    {
        name: "ALLO_WEBHOOK_SECRET",
        label: "Allo — secret du webhook",
        group: "telephony",
        usedFor: "Accepter les appels envoyés par Allo en temps réel (/api/webhooks/allo)",
    },
    // Note-takers (lib/notetakers): the « Appel enregistré » source of the « Nouveau client » wizard.
    {
        name: "MODJO_API_KEY",
        label: "Modjo",
        group: "meetings",
        usedFor: "Importer un appel Modjo (résumés, prochaines étapes, transcription) dans « Nouveau client »",
        docsUrl: "https://help.modjo.ai/en/articles/9310645-modjo-api",
    },
    {
        name: "CLAAP_API_KEY",
        label: "Claap",
        group: "meetings",
        usedFor: "Importer un enregistrement Claap (points clés, actions, transcription) dans « Nouveau client »",
        placeholder: "cla_…",
        docsUrl: "https://help.claap.io/en/articles/11833785-using-claap-s-api",
    },
    {
        name: "GRAIN_API_KEY",
        label: "Grain",
        group: "meetings",
        usedFor: "Importer un appel Grain (notes IA, transcription) dans « Nouveau client »",
        placeholder: "grain_pat_…",
        docsUrl: "https://grain.com/app/settings/account/integrations/personal_api",
    },
    {
        name: "FIREFLIES_API_KEY",
        label: "Fireflies",
        group: "meetings",
        usedFor: "Importer un appel Fireflies (résumé, actions, transcription) dans « Nouveau client »",
        docsUrl: "https://app.fireflies.ai/integrations/custom/fireflies",
    },
    {
        name: "FATHOM_API_KEY",
        label: "Fathom",
        group: "meetings",
        usedFor: "Importer un appel Fathom (résumé, actions, transcription) dans « Nouveau client »",
        docsUrl: "https://fathom.video/customize#api-access-header",
    },
    {
        name: "TLDV_API_KEY",
        label: "tl;dv",
        group: "meetings",
        usedFor: "Importer un appel tl;dv (notes, transcription) dans « Nouveau client »",
        docsUrl: "https://tldv.io/app/settings/personal-settings/api-keys",
    },
    {
        name: "SERPER_API_KEY",
        label: "Serper",
        group: "data",
        usedFor: "Sourcing Google Maps",
        docsUrl: "https://serper.dev/api-key",
    },
    {
        name: "APIFY_API_TOKEN",
        label: "Apify",
        group: "data",
        usedFor: "Sourcing Google Maps (si Serper n'est pas configuré)",
        placeholder: "apify_api_…",
    },
    {
        name: "APOLLO_API_KEY",
        label: "Apollo",
        group: "data",
        usedFor: "Recherche et enrichissement de contacts",
    },
    {
        name: "GOOGLE_PLACES_API_KEY",
        label: "Google Places",
        group: "data",
        usedFor: "Trouver le téléphone d'une entreprise",
        placeholder: "AIza…",
    },
    {
        name: "MAPBOX_ACCESS_TOKEN",
        label: "Mapbox",
        group: "data",
        usedFor: "Trouver le téléphone d'une entreprise (second fournisseur)",
        placeholder: "pk.…",
    },
    {
        name: "SERP_API_KEY",
        label: "SerpApi",
        group: "data",
        usedFor: "Recherche de téléphone dans l'enrichisseur",
    },
    {
        name: "PAPPERS_API_KEY",
        label: "Pappers",
        group: "data",
        usedFor: "Fiches entreprises (SIREN, adresse) pour la facturation",
    },
    {
        name: "EXPLORIUM_API_KEY",
        label: "Explorium",
        group: "data",
        usedFor: "Enrichissement d'entreprises et de contacts",
    },
] as const satisfies readonly IntegrationKeyDef[];

export type IntegrationKeyName = (typeof INTEGRATION_KEYS)[number]["name"];

export const INTEGRATION_KEY_NAMES: readonly IntegrationKeyName[] = INTEGRATION_KEYS.map((k) => k.name);

export function isIntegrationKeyName(name: string): name is IntegrationKeyName {
    return (INTEGRATION_KEY_NAMES as readonly string[]).includes(name);
}

/** Rejects what is obviously not a key (pasted with spaces, a whole env line, too long). */
export function checkIntegrationValue(name: IntegrationKeyName, raw: string): { ok: true; value: string } | { ok: false; message: string } {
    let value = raw.trim();
    if (value.startsWith(`${name}=`)) value = value.slice(name.length + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1).trim();
    if (!value) return { ok: false, message: "Valeur vide" };
    if (value.length > 512) return { ok: false, message: "Valeur trop longue (512 caractères maximum)" };
    if (/\s/.test(value)) return { ok: false, message: "Une clé ne contient pas d'espace ni de retour à la ligne" };
    return { ok: true, value };
}

/** "••••a1b2" — enough to recognise a key, never enough to use it. */
export function keyHint(value: string): string {
    return value.length >= 16 ? `••••${value.slice(-4)}` : "••••";
}
