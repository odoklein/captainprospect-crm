// « À traiter »: what a manager has to act on, mission by mission.
// One item per mission (its most urgent problem), each pointing to the exact
// place where it is fixed. Pure so the directory, the client home and tests
// all read the same rules.

import type { MissionReadiness } from "@/lib/missions/readiness";

export type AttentionTone = "danger" | "warning" | "success" | "neutral";

export interface AttentionMission {
    id: string;
    name: string;
    status: string;
    startDate?: string | null;
    endDate?: string | null;
    sdrCount?: number;
    readiness?: MissionReadiness;
    openPoints?: number;
}

export interface Attention {
    tone: AttentionTone;
    /** Short French label, e.g. « 3 points avant le lancement ». */
    label: string;
    /** One line of context under the label. */
    detail: string;
    /** Button text for the direct fix. */
    action: string;
    /** Mission panel that holds the fix (?tab=). */
    tab: "lancement" | "audience" | "equipe" | "general";
    /** Lower is more urgent. */
    rank: number;
}

const DAY = 86_400_000;
const ENDING_WINDOW_DAYS = 14;

const dateFr = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" });

function plural(count: number, one: string, many: string) {
    return `${count} ${count > 1 ? many : one}`;
}

function daysUntil(day: string | null | undefined, now: number) {
    if (!day) return null;
    const time = Date.parse(day);
    return Number.isNaN(time) ? null : Math.ceil((time - now) / DAY);
}

export function missionAttention(mission: AttentionMission, now = Date.now()): Attention | null {
    const readiness = mission.readiness;
    const points = mission.openPoints ?? 0;
    const noLists = Boolean(readiness && readiness.activeLists === 0);
    const noTeam = mission.sdrCount === 0;

    if (mission.status === "DRAFT") {
        const startIn = daysUntil(mission.startDate, now);
        const late = startIn !== null && startIn < 0;
        const when = mission.startDate ? `Démarrage prévu le ${dateFr.format(new Date(mission.startDate))}` : "Date de démarrage à définir";
        const detail = late ? `${when}, date dépassée` : when;
        const rank = late ? 0 : 10;
        if (noLists) return { tone: late ? "danger" : "warning", label: "Aucune base de prospects", detail, action: "Ajouter une base", tab: "audience", rank: rank + 1 };
        if (points > 0) return { tone: late ? "danger" : "warning", label: `${plural(points, "point", "points")} avant le lancement`, detail, action: "Corriger", tab: "lancement", rank: rank + 2 };
        if (noTeam) return { tone: late ? "danger" : "warning", label: "Aucun SDR affecté", detail, action: "Affecter", tab: "equipe", rank: rank + 3 };
        if (readiness) return { tone: "success", label: "Prête à lancer", detail, action: "Lancer", tab: "lancement", rank: 20 };
        return null;
    }

    if (mission.status === "ACTIVE") {
        if (noTeam) return { tone: "danger", label: "Mission active sans SDR", detail: "Personne n’appelle sur cette mission.", action: "Affecter", tab: "equipe", rank: 1 };
        if (noLists) return { tone: "danger", label: "Aucune base active", detail: "La file d’appels est vide.", action: "Ajouter une base", tab: "audience", rank: 2 };
        if (points > 0 && readiness) {
            const incomplete = readiness.activeLists - readiness.readyLists;
            return { tone: "warning", label: `${plural(incomplete, "base incomplète", "bases incomplètes")}`, detail: `${plural(points, "point", "points")} de ciblage ou de script à compléter.`, action: "Corriger", tab: "lancement", rank: 12 };
        }
        const endIn = daysUntil(mission.endDate, now);
        if (endIn !== null && endIn >= 0 && endIn <= ENDING_WINDOW_DAYS) {
            const label = endIn === 0 ? "Se termine aujourd’hui" : `Se termine dans ${plural(endIn, "jour", "jours")}`;
            return { tone: "neutral", label, detail: `Fin prévue le ${dateFr.format(new Date(mission.endDate!))}. Prolonger ou clôturer.`, action: "Ouvrir", tab: "general", rank: 30 + endIn };
        }
    }
    return null;
}

export interface AttentionClient<M extends AttentionMission = AttentionMission> {
    id: string;
    name: string;
    status: string;
    missions?: M[];
}

export interface AttentionEntry<M extends AttentionMission = AttentionMission> extends Attention {
    clientId: string;
    clientName: string;
    mission: M;
}

/** Every open item across clients, most urgent first. Paused or stopped clients are left out. */
export function collectAttention<M extends AttentionMission>(clients: AttentionClient<M>[], now = Date.now()): AttentionEntry<M>[] {
    return clients
        .filter((client) => client.status === "ACTIVE")
        .flatMap((client) => (client.missions ?? []).flatMap((mission) => {
            const item = missionAttention(mission, now);
            return item ? [{ ...item, clientId: client.id, clientName: client.name, mission }] : [];
        }))
        .sort((a, b) => a.rank - b.rank || a.clientName.localeCompare(b.clientName, "fr") || a.mission.name.localeCompare(b.mission.name, "fr"));
}
