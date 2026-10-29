/**
 * Prompt pieces specific to background runs. The base is the chat's own
 * system prompt (same persona, same rules); these add what changes when
 * nobody is on the other side.
 */

import type { FindingRow } from "./types";

export const BACKGROUND_RULES = `## Mode arrière-plan
Tu travailles en tâche de fond pour le manager : personne ne lit ta réponse en direct, elle sera
lue plus tard dans le fil « [Agent] ». Pas de question à l'utilisateur, pas de formule d'attente.
Tu ne peux exécuter aucune action sensible : si tu en proposes une, elle est enregistrée pour
validation et tu continues. Tu n'écris jamais à l'extérieur du CRM.`;

const SEVERITY_FR = { INFO: "info", WARN: "à surveiller", CRITICAL: "critique" } as const;

/** The findings as the model sees them (and as the evidence row stores them). */
export function findingsPayload(params: { jobName: string; created: FindingRow[]; escalated: FindingRow[]; reopened: FindingRow[]; resolved: FindingRow[]; now: Date }) {
    const item = (f: FindingRow) => ({
        id: f.id || undefined,
        gravite: SEVERITY_FR[f.severity],
        regle: f.rule,
        titre: f.title,
        detail: f.body,
        vu_fois: f.seenCount,
        ...(f.metrics ? { chiffres: f.metrics } : {}),
    });
    return {
        veille: params.jobName,
        date: params.now.toISOString().slice(0, 10),
        nouveaux: params.created.map(item),
        aggraves: params.escalated.map(item),
        reapparus: params.reopened.map(item),
        resolus: params.resolved.map((f) => ({ titre: f.title, regle: f.rule })),
    };
}

export function digestInstruction(params: { jobName: string; announced: number; resolved: number }): string {
    return `Voici le résultat de la veille « ${params.jobName} » : ${params.announced} signalement(s) à annoncer${
        params.resolved > 0 ? ` et ${params.resolved} résolu(s)` : ""
    }. Les données sont dans la source déjà consultée (E1) : tu n'as rien d'autre à aller chercher.

Rédige en français le point de veille pour le manager :
- une phrase d'ouverture qui dit l'essentiel (ce qui est critique en premier) ;
- une ligne par signalement, avec le nom, les chiffres exacts de la source et ce que tu recommandes de faire ;
- les signalements résolus en une ligne, s'il y en a.
Cite la source [E1] après les chiffres. Si un visuel aide (plusieurs SDR ou clients à comparer), appelle show_visual une fois ; sinon pas de visuel.
Ne reformule pas les chiffres, n'invente rien, pas de conclusion qui répète.`;
}
