"use client";

import { Check, ChevronRight, CircleAlert, Clock3, Database, FileText, Target, Users, CalendarDays } from "lucide-react";

export type StrategyField = "strategy" | "icp" | "pitch" | "script";

export interface LaunchList {
    id: string;
    name: string;
    isActive?: boolean;
    isArchived?: boolean;
    campaignId?: string | null;
    readiness?: {
        inheritedCampaignId?: string | null;
        hasStrategy: boolean;
        hasIcp: boolean;
        hasPitch: boolean;
        hasScript: boolean;
    };
}

interface Readiness {
    activeLists: number;
    readyLists: number;
    missingStrategy: number;
    missingIcp: number;
    missingPitch: number;
    missingScript: number;
}

const CHECKS = [
    { key: "strategy", value: "hasStrategy", count: "missingStrategy", icon: Target, label: "Stratégie liée à chaque base", short: "Stratégie", action: "Lier une stratégie" },
    { key: "icp", value: "hasIcp", count: "missingIcp", icon: Users, label: "Ciblage renseigné", short: "Ciblage", action: "Renseigner le ciblage" },
    { key: "pitch", value: "hasPitch", count: "missingPitch", icon: FileText, label: "Pitch commercial", short: "Pitch", action: "Rédiger le pitch" },
    { key: "script", value: "hasScript", count: "missingScript", icon: FileText, label: "Script d’appel", short: "Script", action: "Rédiger le script" },
] as const;

export type StepState = "done" | "todo" | "wait" | "advice";

export interface LaunchStep {
    id: string;
    label: string;
    detail: string;
    state: StepState;
    /** Counts towards the launch gate (the rest is advice). */
    blocking: boolean;
    icon: typeof Target;
    action?: { label: string; run: () => void };
}

interface Input {
    readiness?: Readiness;
    lists: LaunchList[];
    startDate?: string;
    assignmentCount: number;
    onFixAudience: () => void;
    onFixTeam: () => void;
    onFixDates: () => void;
    onFixStrategy: (field: StrategyField, list: LaunchList) => void;
}

function lists(names: string[]) {
    if (!names.length) return "";
    const [first, ...rest] = names;
    return rest.length ? `« ${first} » et ${rest.length} autre${rest.length > 1 ? "s" : ""}` : `« ${first} »`;
}

/**
 * Launch readiness as a checklist. The gate is unchanged: every active list
 * needs a strategy with a targeting, a pitch and a script. Team and start date
 * are shown as advice — they never blocked a launch and still do not.
 */
export function launchSteps({ readiness, lists: all, startDate, assignmentCount, onFixAudience, onFixTeam, onFixDates, onFixStrategy }: Input) {
    const active = all.filter((list) => list.isActive !== false && !list.isArchived);
    const hasLists = Boolean(readiness?.activeLists);
    const steps: LaunchStep[] = [{
        id: "lists",
        label: "Base de prospects active",
        detail: hasLists ? `${readiness!.activeLists} base${readiness!.activeLists > 1 ? "s" : ""} active${readiness!.activeLists > 1 ? "s" : ""}` : "Ajoutez ou réactivez une base pour alimenter la file d’appels.",
        state: hasLists ? "done" : "todo",
        blocking: true,
        icon: Database,
        action: hasLists ? undefined : { label: all.length ? "Réactiver une base" : "Ajouter une base", run: onFixAudience },
    }];

    for (const check of CHECKS) {
        // A list without strategy cannot be checked for targeting, pitch or script yet.
        const missing = active.filter((list) => list.readiness && (check.key === "strategy" || list.readiness.hasStrategy) && !list.readiness[check.value]);
        const blockedByStrategy = check.key !== "strategy" && active.some((list) => list.readiness && !list.readiness.hasStrategy);
        const waiting = !hasLists || (!missing.length && blockedByStrategy);
        const done = !waiting && !missing.length && readiness?.[check.count] === 0;
        steps.push({
            id: check.key,
            label: check.label,
            detail: done ? "Prêt sur toutes les bases actives"
                : waiting ? (hasLists ? "En attente de la stratégie de chaque base" : "En attente d’une base active")
                : `Manquant sur ${lists(missing.map((list) => list.name))}`,
            state: done ? "done" : waiting ? "wait" : "todo",
            blocking: true,
            icon: check.icon,
            action: !done && !waiting && missing[0] ? { label: check.action, run: () => onFixStrategy(check.key, missing[0]) } : undefined,
        });
    }

    steps.push({
        id: "team",
        label: "Équipe affectée",
        detail: assignmentCount ? `${assignmentCount} SDR sur la mission` : "Recommandé : sans SDR, personne n’appelle.",
        state: assignmentCount ? "done" : "advice",
        blocking: false,
        icon: Users,
        action: assignmentCount ? undefined : { label: "Affecter", run: onFixTeam },
    });
    steps.push({
        id: "dates",
        label: "Date de démarrage",
        detail: startDate ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" }).format(new Date(startDate)) : "Recommandé : indiquez quand les appels commencent.",
        state: startDate ? "done" : "advice",
        blocking: false,
        icon: CalendarDays,
        action: startDate ? undefined : { label: "Définir", run: onFixDates },
    });

    const gate = steps.filter((step) => step.blocking);
    const ready = Boolean(readiness && hasLists && readiness.readyLists === readiness.activeLists);
    return {
        steps,
        ready,
        done: gate.filter((step) => step.state === "done").length,
        total: gate.length,
        next: steps.find((step) => step.blocking && step.state === "todo" && step.action) ?? steps.find((step) => step.state === "advice"),
        activeLists: active,
    };
}

const PILL: Record<StepState, { label: string; tone?: string }> = {
    done: { label: "Validé", tone: "success" },
    todo: { label: "À corriger", tone: "warning" },
    wait: { label: "En attente" },
    advice: { label: "Recommandé", tone: "info" },
};
const ROW_TONE: Record<StepState, string> = { done: "done", todo: "todo", wait: "wait", advice: "wait" };

export function LaunchChecklist({ summary, readinessAvailable, onFixStrategy }: {
    summary: ReturnType<typeof launchSteps>;
    readinessAvailable: boolean;
    onFixStrategy: (field: StrategyField, list: LaunchList) => void;
}) {
    if (!readinessAvailable) return <p className="cw-empty-line"><span>La préparation des bases est indisponible pour le moment.</span></p>;
    const perList = summary.activeLists.filter((list) => list.readiness);
    const incomplete = perList.filter((list) => !CHECKS.every((check) => list.readiness?.[check.value]));
    return (
        <>
            <ul className="cw-rows" aria-label="Vérifications de lancement">
                {summary.steps.map((step) => (
                    <li key={step.id} className="cw-row">
                        <span className="cw-row-icon" data-tone={ROW_TONE[step.state]}>{step.state === "done" ? <Check aria-hidden /> : step.state === "wait" ? <Clock3 aria-hidden /> : step.state === "todo" ? <CircleAlert aria-hidden /> : <step.icon aria-hidden />}</span>
                        <span className="cw-row-main">
                            <strong>{step.label}</strong>
                            <small title={step.detail}>{step.detail}</small>
                        </span>
                        <span className="cw-row-side">
                            <span className="cw-pill" data-tone={PILL[step.state].tone}><i />{PILL[step.state].label}</span>
                            {step.action && <button className="cw-button" data-size="sm" onClick={step.action.run}>{step.action.label}<ChevronRight aria-hidden /></button>}
                        </span>
                    </li>
                ))}
            </ul>
            {perList.length > 1 && (
                <details className="cw-advanced" open={incomplete.length > 0 && incomplete.length < perList.length ? true : undefined}>
                    <summary><ChevronRight aria-hidden />Détail par base ({perList.length - incomplete.length}/{perList.length} prêtes)</summary>
                    <div className="cw-rows">
                        {perList.map((list) => (
                            <div key={list.id} className="cw-row" style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
                                <span className="cw-row-main"><strong title={list.name}>{list.name}</strong><small>{CHECKS.every((check) => list.readiness?.[check.value]) ? "Prête à prospecter" : "À compléter"}</small></span>
                                <span className="cw-row-side" style={{ flexWrap: "wrap" }}>
                                    {CHECKS.map((check) => {
                                        const complete = Boolean(list.readiness?.hasStrategy && list.readiness[check.value]);
                                        const disabled = !list.readiness || (!list.readiness.hasStrategy && check.key !== "strategy");
                                        return <button key={check.key} className="cw-button" data-size="sm" disabled={disabled} onClick={() => onFixStrategy(check.key, list)} aria-label={`${complete ? "Consulter" : check.action} : ${list.name}`}>
                                            {complete ? <Check aria-hidden className="text-success" /> : <check.icon aria-hidden />}{check.short}
                                        </button>;
                                    })}
                                </span>
                            </div>
                        ))}
                    </div>
                </details>
            )}
        </>
    );
}
