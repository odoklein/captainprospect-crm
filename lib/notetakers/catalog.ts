// ============================================
// NOTE-TAKERS — catalog (pure: safe in the browser, the API schema and tests).
// Keys are integration keys (lib/integrations/catalog, group "meetings"),
// except Leexi's, which has its own settings panel.
// ============================================

import type { IntegrationKeyName } from "@/lib/integrations/catalog";

export interface NotetakerDef {
    id: string;
    label: string;
    keys: readonly IntegrationKeyName[];
}

export const NOTETAKERS = [
    { id: "leexi", label: "Leexi", keys: [] },
    { id: "modjo", label: "Modjo", keys: ["MODJO_API_KEY"] },
    { id: "claap", label: "Claap", keys: ["CLAAP_API_KEY"] },
    { id: "fireflies", label: "Fireflies", keys: ["FIREFLIES_API_KEY"] },
    { id: "fathom", label: "Fathom", keys: ["FATHOM_API_KEY"] },
    { id: "grain", label: "Grain", keys: ["GRAIN_API_KEY"] },
    { id: "tldv", label: "tl;dv", keys: ["TLDV_API_KEY"] },
] as const satisfies readonly NotetakerDef[];

export type NotetakerId = (typeof NOTETAKERS)[number]["id"];

export const NOTETAKER_IDS = NOTETAKERS.map((n) => n.id) as unknown as readonly [NotetakerId, ...NotetakerId[]];

/** LeexiCallImport.leexiCallId for a call: Leexi's id as is (existing rows), the others prefixed. */
export function notetakerImportId(provider: string, callId: string): string {
    return provider === "leexi" ? callId : `${provider}:${callId}`;
}

export function notetakerForKey(name: string): NotetakerDef | null {
    return NOTETAKERS.find((n) => (n.keys as readonly string[]).includes(name)) ?? null;
}
