"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, CalendarDays, Check, ChevronRight, CircleAlert, Database, FileText, Pencil, Rocket, Save, Target, Users } from "lucide-react";

const CHANNELS = { CALL: "Appel", EMAIL: "E-mail", LINKEDIN: "LinkedIn" } as const;
type Channel = keyof typeof CHANNELS;

interface SetupMission {
    id: string;
    name: string;
    objective?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    channel: Channel;
    channels?: Channel[];
    teamLeadSdrId?: string | null;
    teamLeadSdr?: { name: string } | null;
    sdrAssignments: { sdr: { id: string; name: string } }[];
    client?: { interlocuteurs?: { id: string; firstName: string; lastName: string }[] };
    defaultInterlocuteur?: { id: string; firstName: string; lastName: string } | null;
    missionReadiness?: { activeLists: number; readyLists: number };
}

function valuesOf(mission: SetupMission) {
    return {
        name: mission.name,
        objective: mission.objective ?? "",
        startDate: mission.startDate?.slice(0, 10) ?? "",
        endDate: mission.endDate?.slice(0, 10) ?? "",
        channels: mission.channels?.length ? mission.channels : [mission.channel],
        teamLeadSdrId: mission.teamLeadSdrId ?? "",
        defaultInterlocuteurId: mission.defaultInterlocuteur?.id ?? "",
    };
}

const FIELD_LABELS = {
    name: "Nom de la mission",
    objective: "Objectif",
    startDate: "Date de début",
    endDate: "Date de fin",
    channels: "Canaux",
    teamLeadSdrId: "Référent SDR",
    defaultInterlocuteurId: "Commercial par défaut",
} as const;

type Fields = ReturnType<typeof valuesOf>;
type Field = keyof Fields;
const FIELD_KEYS = Object.keys(FIELD_LABELS) as Field[];

function formatDate(day: string) {
    return day ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(day)) : "À définir";
}

function Property({ label, children }: { label: string; children: ReactNode }) {
    return <div><dt>{label}</dt><dd>{children}</dd></div>;
}

interface Props {
    mission: SetupMission;
    onSave: (patch: Record<string, unknown>) => Promise<boolean>;
    onTabChange: (tab: string) => void;
}

export function MissionSetupPanel({ mission, onSave, onTabChange }: Props) {
    const [draft, setDraft] = useState<Fields | null>(null);
    const [baseline, setBaseline] = useState<Fields | null>(null);
    const [lastSaved, setLastSaved] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const saved = valuesOf(mission);
    const initial = baseline ?? saved;
    const changed = draft ? FIELD_KEYS.filter((key) => JSON.stringify(initial[key]) !== JSON.stringify(draft[key])) : [];
    const dirty = changed.length > 0;

    useEffect(() => {
        if (!dirty) return;
        const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener("beforeunload", beforeUnload);
        return () => window.removeEventListener("beforeunload", beforeUnload);
    }, [dirty]);

    function setField<K extends Field>(key: K, value: Fields[K]) {
        setDraft((previous) => previous ? { ...previous, [key]: value } : previous);
        setError("");
    }

    function edit() {
        setBaseline(saved);
        setDraft(saved);
        setError("");
    }

    function cancel() {
        setDraft(null);
        setBaseline(null);
        setError("");
    }

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!draft || !dirty || saving) return;
        if (!draft.name.trim()) return setError("Renseignez le nom de la mission.");
        if (!draft.channels.length) return setError("Sélectionnez au moins un canal.");
        if (draft.startDate && draft.endDate && draft.endDate < draft.startDate) {
            return setError("La date de fin doit être le même jour ou après la date de début.");
        }
        const patch = Object.fromEntries(changed.map((field) => {
            const value = draft[field];
            return [field, typeof value === "string" ? value.trim() || null : value];
        }));
        setSaving(true);
        const ok = await onSave(patch);
        setSaving(false);
        if (!ok) return setError("Enregistrement impossible. Vos modifications sont toujours présentes.");
        setLastSaved(changed.map((field) => FIELD_LABELS[field]));
        cancel();
    }

    const readiness = mission.missionReadiness;
    const ready = Boolean(readiness?.activeLists && readiness.readyLists === readiness.activeLists);
    const contact = mission.defaultInterlocuteur;
    const contactName = contact ? `${contact.firstName} ${contact.lastName}` : "Défini par base";

    return (
        <div className="cw-columns">
            <section className="cw-panel cw-setup">
                <header className="cw-panel-toolbar">
                    <div><h2>Paramètres de la mission</h2><small>Objectif, période et organisation du travail</small></div>
                    {!draft && <button className="cw-button" onClick={edit}><Pencil /> Modifier</button>}
                    {draft && <span className="cw-pill" data-tone={dirty ? "amber" : "neutral"}><i />{dirty ? "Modifications en attente" : "En cours de modification"}</span>}
                </header>
                {draft ? (
                    <form className="cw-form" onSubmit={submit}>
                        <fieldset disabled={saving}>
                            <legend><Target /> Cadrage</legend>
                            <label>Nom de la mission<input required value={draft.name} onChange={(event) => setField("name", event.target.value)} /></label>
                            <label>Objectif<textarea rows={3} value={draft.objective} onChange={(event) => setField("objective", event.target.value)} /></label>
                            <div className="cw-form-grid">
                                <label>Date de début<input type="date" required={Boolean(initial.startDate)} value={draft.startDate} onChange={(event) => setField("startDate", event.target.value)} /></label>
                                <label>Date de fin<input type="date" required={Boolean(initial.endDate)} min={draft.startDate || undefined} value={draft.endDate} onChange={(event) => setField("endDate", event.target.value)} /></label>
                            </div>
                            <div className="cw-channel-options" role="group" aria-label="Canaux">
                                {Object.entries(CHANNELS).map(([channel, label]) => {
                                    const id = channel as Channel;
                                    const checked = draft.channels.includes(id);
                                    return <label key={channel} className="cw-check-label"><input type="checkbox" checked={checked} onChange={() => setField("channels", checked ? draft.channels.filter((item) => item !== id) : [...draft.channels, id])} />{label}</label>;
                                })}
                            </div>
                        </fieldset>
                        <fieldset disabled={saving}>
                            <legend><Users /> Équipe et suivi</legend>
                            <div className="cw-form-grid">
                                <label>Référent SDR<select value={draft.teamLeadSdrId} onChange={(event) => setField("teamLeadSdrId", event.target.value)}>
                                    <option value="">Non désigné</option>
                                    {mission.sdrAssignments.map(({ sdr }) => <option key={sdr.id} value={sdr.id}>{sdr.name}</option>)}
                                </select></label>
                                <label>Commercial par défaut<select value={draft.defaultInterlocuteurId} onChange={(event) => setField("defaultInterlocuteurId", event.target.value)}>
                                    <option value="">Défini par base</option>
                                    {mission.client?.interlocuteurs?.map((person) => <option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>)}
                                </select></label>
                            </div>
                        </fieldset>
                        {error && <p role="alert" className="cw-form-error"><CircleAlert />{error}</p>}
                        <div className="cw-form-footer">
                            <span role="status">{saving ? "Enregistrement…" : dirty ? `${changed.length} champ${changed.length > 1 ? "s" : ""} à enregistrer` : "Aucune modification"}</span>
                            <div className="cw-actions"><button type="button" className="cw-button" onClick={cancel} disabled={saving}>Annuler</button><button type="submit" className="cw-button cw-primary" disabled={!dirty || saving}><Save /> Enregistrer</button></div>
                        </div>
                    </form>
                ) : (
                    <div className="cw-review">
                        <section>
                            <h3><Target /> Cadrage</h3>
                            <p className="cw-objective">{saved.objective || "Objectif à renseigner"}</p>
                            <dl className="cw-properties">
                                <Property label="Date de début">{formatDate(saved.startDate)}</Property>
                                <Property label="Date de fin">{formatDate(saved.endDate)}</Property>
                                <Property label="Canaux">{saved.channels.map((channel) => CHANNELS[channel]).join(", ")}</Property>
                            </dl>
                        </section>
                        <section>
                            <h3><Users /> Équipe et suivi</h3>
                            <dl className="cw-properties">
                                <Property label="Référent SDR">{mission.teamLeadSdr?.name || "Non désigné"}</Property>
                                <Property label="Commercial par défaut">{contactName}</Property>
                                <Property label="Équipe affectée">{mission.sdrAssignments.length ? mission.sdrAssignments.map(({ sdr }) => sdr.name).join(", ") : "Aucune affectation"}</Property>
                            </dl>
                            <button className="cw-text-button" onClick={() => onTabChange("equipe")}>Gérer les affectations <ArrowRight /></button>
                        </section>
                    </div>
                )}
            </section>
            <aside className="cw-context" aria-label="Suivi de la configuration">
                <section className={`cw-panel ${ready ? "cw-side" : "cw-resume"}`}>
                    <div className="cw-side-heading"><Rocket /><h2>Lancement</h2></div>
                    {readiness && <div className="cw-side-progress">
                        <span>{readiness.readyLists} / {readiness.activeLists} bases prêtes</span>
                        {readiness.activeLists > 0 && <progress value={readiness.readyLists} max={readiness.activeLists} />}
                    </div>}
                    <button className="cw-text-button" onClick={() => onTabChange("lancement")}>Voir la préparation <ArrowRight /></button>
                </section>
                {(draft || lastSaved.length > 0) && <section className="cw-panel cw-side" aria-live="polite">
                    <div className="cw-side-heading">{draft ? <Pencil /> : <Check />}<h2>{draft ? "Modifications en cours" : "Dernier enregistrement"}</h2></div>
                    {draft && !dirty ? <p className="cw-side-note">Les champs modifiés apparaîtront ici.</p> : (
                        <ul className="cw-change-list">{(draft ? changed.map((key) => FIELD_LABELS[key]) : lastSaved).map((label) => <li key={label}>{draft ? <span /> : <Check />}{label}</li>)}</ul>
                    )}
                </section>}
                <section className="cw-panel cw-side">
                    <div className="cw-side-heading"><CalendarDays /><h2>Préparer la prospection</h2></div>
                    <button className="cw-side-row" onClick={() => onTabChange("audience")}><span className="cw-side-icon"><Database /></span><span><strong>Bases de prospects</strong><small>Listes et affectations</small></span><ChevronRight /></button>
                    <button className="cw-side-row" onClick={() => onTabChange("strategies")}><span className="cw-side-icon"><FileText /></span><span><strong>Ciblage et scripts</strong><small>Stratégie de chaque base</small></span><ChevronRight /></button>
                </section>
            </aside>
        </div>
    );
}
