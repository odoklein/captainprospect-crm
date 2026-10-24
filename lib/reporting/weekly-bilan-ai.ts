import { callJsonModel } from "@/lib/ai/json-call";
import { renderStatsLines, type BilanNarrative, type WeeklyBilanData } from "./weekly-bilan-render";

const SYSTEM = `Tu rédiges le bilan hebdomadaire qu'une agence de prospection téléphonique envoie à son client.
Tu t'adresses au client avec « vous ». Ton ton est professionnel, direct, sans jargon interne.
Règles strictes :
- N'écris aucun chiffre absent du bloc STATS ; recopie-les à l'identique ; ne calcule aucun taux.
- Ne cite aucun prospect autre que les sociétés de la liste RDV.
- Pas de jargon : dis « conversation » et non « joint », « rendez-vous » et non « RDV booké ».
- Si le volume est faible, dis-le simplement au lieu de tirer des conclusions.
- Des constats et des actions concrètes, aucune promesse de résultat.
Réponds en JSON : {"synthese": string (2 à 3 phrases), "pointsForts": string[] (max 3), "vigilance": string[] (max 3), "prochainesEtapes": string[] (max 3)}.`;

function clip(list: unknown, max: number): string[] {
    return Array.isArray(list)
        ? list.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()).slice(0, max)
        : [];
}

export async function generateBilanNarrative(d: WeeklyBilanData): Promise<BilanNarrative> {
    const user = [
        `CLIENT : ${d.clientName}`,
        `PÉRIODE : ${d.week.label}`,
        "",
        "STATS :",
        ...renderStatsLines(d.stats),
        "",
        "RDV :",
        ...(d.meetings.length ? d.meetings.map((m) => `- ${m.company}${m.contactTitle ? ` (${m.contactTitle})` : ""}`) : ["- aucun"]),
        "",
        "SIGNAUX DE LA SEMAINE (calculés) :",
        ...(d.highlights.length ? d.highlights.map((h) => `- ${h}`) : ["- aucun"]),
        "",
        "EXTRAITS DE NOTES D'APPELS (contexte, ne pas citer de noms) :",
        ...(d.notes.length ? d.notes.map((n) => `- ${n}`) : ["- aucune note"]),
    ].join("\n");

    const { parsed } = await callJsonModel({ system: SYSTEM, user, maxTokens: 1200, timeoutMs: 60_000, temperature: 0.4 });
    return {
        synthese: typeof parsed?.synthese === "string" ? parsed.synthese.trim() : "",
        pointsForts: clip(parsed?.pointsForts, 3),
        vigilance: clip(parsed?.vigilance, 3),
        prochainesEtapes: clip(parsed?.prochainesEtapes, 3),
    };
}
