"use client";

import { ArrowRight, Check, ChevronRight, CircleAlert, Clock3, Database, FileText, ListChecks, Rocket, Target, Users } from "lucide-react";

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
    { key: "strategy", value: "hasStrategy", count: "missingStrategy", icon: Target, label: "Stratégie liée", issue: "Une stratégie doit être liée à la base", action: "Créer une stratégie" },
    { key: "icp", value: "hasIcp", count: "missingIcp", icon: Users, label: "Ciblage", issue: "Le ciblage reste à renseigner", action: "Renseigner le ciblage" },
    { key: "pitch", value: "hasPitch", count: "missingPitch", icon: FileText, label: "Pitch commercial", issue: "Le pitch reste à renseigner", action: "Renseigner le pitch" },
    { key: "script", value: "hasScript", count: "missingScript", icon: FileText, label: "Script d’appel", issue: "Le script d’appel manque", action: "Renseigner le script" },
] as const;

interface Props {
    readiness?: Readiness;
    lists: LaunchList[];
    startDate?: string;
    teamLead?: string;
    assignmentCount: number;
    canStart: boolean;
    active: boolean;
    publishing: boolean;
    onStart: () => void;
    onFixAudience: () => void;
    onFixTeam: () => void;
    onFixStrategy: (field: StrategyField, list: LaunchList) => void;
    onClientOnboarding?: () => void;
}

export function ReadinessPanel({
    readiness, lists, startDate, teamLead, assignmentCount, canStart, active, publishing,
    onStart, onFixAudience, onFixTeam, onFixStrategy, onClientOnboarding,
}: Props) {
    const activeLists = lists.filter((list) => list.isActive !== false && !list.isArchived);
    const hasLists = Boolean(readiness?.activeLists);
    const ready = Boolean(readiness && hasLists && readiness.readyLists === readiness.activeLists);
    const fixes = readiness && hasLists ? CHECKS.flatMap((check) =>
        readiness[check.count] > 0 ? activeLists
            .filter((list) => list.readiness && (check.key === "strategy" || list.readiness.hasStrategy) && !list.readiness[check.value])
            .map((list) => ({ check, list })) : [],
    ) : [];
    const first = fixes[0];
    const steps = [
        { label: "Base de prospects active", icon: Database, done: hasLists, pending: false, action: onFixAudience },
        ...CHECKS.map((check) => {
            const fix = fixes.find((item) => item.check.key === check.key);
            return { label: check.label, icon: check.icon, done: Boolean(hasLists && readiness?.[check.count] === 0 && (check.key === "strategy" || readiness.missingStrategy === 0)), pending: !hasLists || !fix, action: fix ? () => onFixStrategy(check.key, fix.list) : undefined };
        }),
    ];
    const date = startDate ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" }).format(new Date(startDate)) : "À définir";

    return (
        <div className="cw-columns">
            <div className="cw-launch-main">
                {readiness && (!hasLists || first) && (
                    <section className="cw-blocker" aria-label="Prochaine action">
                        <div className="cw-blocker-icon"><CircleAlert /></div>
                        <div>
                            <div className="cw-blocker-label">{active ? "À corriger" : "À faire avant le lancement"}</div>
                            <h2>{!hasLists ? "Aucune base de prospects active" : first?.check.issue}</h2>
                            <p>{!hasLists ? "Ajoutez ou réactivez une base pour préparer la prospection." : <>Base concernée&nbsp;: <strong>{first?.list.name}</strong></>}</p>
                            <div className="cw-blocker-meta"><Users /> À traiter par un manager</div>
                            <button className="cw-button cw-primary" onClick={!hasLists ? onFixAudience : first ? () => onFixStrategy(first.check.key, first.list) : undefined}>
                                {!hasLists ? "Ouvrir les bases de prospects" : first?.check.action} <ArrowRight />
                            </button>
                        </div>
                    </section>
                )}
                {ready && <div className="cw-ready" role="status"><Check /><div><strong>Toutes les bases actives sont prêtes</strong><p>Les SDR ont accès au ciblage, au pitch et au script de chaque base.</p></div></div>}
                {activeLists.length > 0 && <section className="cw-panel">
                    <header className="cw-panel-toolbar"><div><h2>Préparation par base</h2><small>Ouvrez directement le point à compléter.</small></div><Database className="cw-muted" /></header>
                    <div className="divide-y divide-slate-100">{activeLists.map(list => {
                        const missing = CHECKS.filter(check => list.readiness && !list.readiness[check.value] && (check.key === "strategy" || list.readiness.hasStrategy));
                        return <div key={list.id} className="px-5 py-4"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-slate-800">{list.name}</h3><span className="text-xs text-slate-500">{CHECKS.every(check => list.readiness?.[check.value]) ? "Prête à prospecter" : missing.length ? `${missing.length} point${missing.length > 1 ? "s" : ""} à compléter` : "Vérification en attente"}</span></div><div className="mt-3 flex flex-wrap gap-2">{CHECKS.map(check => {
                            const complete = Boolean(list.readiness?.hasStrategy && list.readiness[check.value]);
                            const disabled = !list.readiness || (!list.readiness.hasStrategy && check.key !== "strategy");
                            return <button key={check.key} className="cw-button" disabled={disabled} onClick={() => onFixStrategy(check.key, list)} title={complete ? `Consulter ou modifier : ${check.label}` : check.action}>{complete ? <Check className="text-teal-600" /> : <check.icon />}{check.label}{!complete && !disabled && <ChevronRight />}</button>;
                        })}</div></div>;
                    })}</div>
                </section>}
                <section className="cw-panel">
                    <header className="cw-panel-toolbar"><div><h2>Vérifications de lancement</h2><small>Préparation des bases de prospects</small></div><ListChecks className="cw-muted" /></header>
                    {readiness ? <ul className="cw-checklist">
                        {steps.map(({ label, icon: Icon, done, pending, action }) => <li key={label}>
                            <span className="cw-check-icon" data-state={done ? "done" : pending ? "pending" : "issue"}>{done ? <Check /> : <Icon />}</span>
                            <span><strong>{label}</strong><small>{done ? "Validé" : pending ? "En attente de la base ou de sa stratégie" : "À compléter"}</small></span>
                            {!done && action && <button className="cw-button" onClick={action}>Corriger <ChevronRight /></button>}
                        </li>)}
                    </ul> : <p className="cw-side-note">La préparation des bases est indisponible.</p>}
                    {fixes.length > 1 && <div className="cw-panel-footer"><small className="cw-muted">{fixes.length} points à corriger au total sur les bases actives.</small></div>}
                </section>
            </div>
            <aside className="cw-context" aria-label="Détails du lancement">
                <section className="cw-panel cw-side">
                    <div className="cw-side-heading"><Rocket /><h2>Démarrage</h2></div>
                    <div className="cw-side-progress">
                        <span>{readiness?.readyLists ?? 0} / {readiness?.activeLists ?? 0} bases prêtes</span>
                        {hasLists && readiness && <progress value={readiness.readyLists} max={readiness.activeLists} />}
                    </div>
                    <dl className="cw-side-properties">
                        <div><dt>Début prévu</dt><dd>{date}</dd></div>
                        <div><dt>Référent SDR</dt><dd>{teamLead || "Non désigné"}</dd></div>
                        <div><dt>Équipe affectée</dt><dd>{assignmentCount} SDR</dd></div>
                    </dl>
                    {!assignmentCount && <button className="cw-text-button" onClick={onFixTeam}>Affecter l’équipe <ArrowRight /></button>}
                    {publishing || canStart ? <div className="cw-side-action">
                        <button className="cw-button cw-primary" disabled={!ready && !publishing} onClick={onStart}>
                            {publishing ? <Clock3 /> : <Rocket />}{publishing ? "Gérer la visibilité" : "Démarrer la mission"}
                        </button>
                    </div> : active ? <p className="cw-side-note"><span className="cw-pill" data-tone="green"><i />Mission active</span></p> : null}
                </section>
                {onClientOnboarding && <section className="cw-panel cw-side">
                    <div className="cw-side-heading"><ListChecks /><h2>Intégration client</h2></div>
                    <p className="cw-side-note">Retrouvez les étapes communes au client, du contrat au premier appel.</p>
                    <button className="cw-text-button" onClick={onClientOnboarding}>Voir l’intégration client <ArrowRight /></button>
                </section>}
            </aside>
        </div>
    );
}
