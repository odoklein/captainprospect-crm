"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Check, CircleAlert, Pencil, Save, Target, Users } from "lucide-react";

const CHANNELS = { CALL: "Appel", EMAIL: "E-mail", LINKEDIN: "LinkedIn" } as const;
type Channel = keyof typeof CHANNELS;

interface SetupMission {
    id: string;
    name: string;
    objective?: string | null;
    targetMeetings?: number | null;
    startDate?: string | null;
    endDate?: string | null;
    channel: Channel;
    channels?: Channel[];
    teamLeadSdrId?: string | null;
    teamLeadSdr?: { name: string } | null;
    sdrAssignments: { sdr: { id: string; name: string } }[];
    client?: { interlocuteurs?: { id: string; firstName: string; lastName: string }[] };
    defaultInterlocuteur?: { id: string; firstName: string; lastName: string } | null;
}

function valuesOf(mission: SetupMission) {
    return {
        name: mission.name,
        objective: mission.objective ?? "",
        targetMeetings: mission.targetMeetings ? String(mission.targetMeetings) : "",
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
    targetMeetings: "RDV visés",
    startDate: "Date de début",
    endDate: "Date de fin",
    channels: "Canaux",
    teamLeadSdrId: "Référent SDR",
    defaultInterlocuteurId: "Commercial par défaut",
} as const;

type Fields = ReturnType<typeof valuesOf>;
export type SetupField = keyof Fields;
const FIELD_KEYS = Object.keys(FIELD_LABELS) as SetupField[];

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
    /** Opens the editor on a field from elsewhere (rail, checklist). Bump `at` to re-trigger. */
    editRequest?: { field: SetupField; at: number } | null;
    /** Reports unsaved changes so the page can show them next to its save state. */
    onDirtyChange?: (dirty: boolean) => void;
}

/** « Cadrage » of the mission brief: read as a document, edited as a form, saved explicitly. */
export function MissionSetupPanel({ mission, onSave, onTabChange, editRequest, onDirtyChange }: Props) {
    const [draft, setDraft] = useState<Fields | null>(null);
    const [baseline, setBaseline] = useState<Fields | null>(null);
    const [lastSaved, setLastSaved] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const formRef = useRef<HTMLFormElement>(null);
    const editButton = useRef<HTMLButtonElement>(null);
    const saved = valuesOf(mission);
    const initial = baseline ?? saved;
    const changed = draft ? FIELD_KEYS.filter((key) => JSON.stringify(initial[key]) !== JSON.stringify(draft[key])) : [];
    const dirty = changed.length > 0;

    useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

    useEffect(() => {
        if (!dirty) return;
        const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener("beforeunload", beforeUnload);
        return () => window.removeEventListener("beforeunload", beforeUnload);
    }, [dirty]);

    useEffect(() => {
        if (!editRequest) return;
        if (!draft) { setBaseline(saved); setDraft(saved); setError(""); }
        requestAnimationFrame(() => {
            const field = formRef.current?.querySelector<HTMLElement>(`[name="${editRequest.field}"]`);
            field?.focus();
            field?.scrollIntoView({ block: "center" });
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editRequest?.at]);

    function setField<K extends SetupField>(key: K, value: Fields[K]) {
        setDraft((previous) => previous ? { ...previous, [key]: value } : previous);
        setError("");
    }

    function edit() {
        setBaseline(saved);
        setDraft(saved);
        setError("");
        setLastSaved([]);
        requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>("[name=name]")?.focus());
    }

    function close() {
        setDraft(null);
        setBaseline(null);
        setError("");
        requestAnimationFrame(() => editButton.current?.focus());
    }

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!draft || !dirty || saving) return;
        if (!draft.name.trim()) return setError("Renseignez le nom de la mission.");
        if (!draft.channels.length) return setError("Sélectionnez au moins un canal.");
        if (draft.targetMeetings && !/^\d{1,5}$/.test(draft.targetMeetings.trim())) return setError("Le nombre de RDV visés doit être un nombre entier.");
        if (draft.startDate && draft.endDate && draft.endDate < draft.startDate) {
            return setError("La date de fin doit être le même jour ou après la date de début.");
        }
        const patch = Object.fromEntries(changed.map((field) => {
            const value = draft[field];
            if (field === "targetMeetings") return [field, draft.targetMeetings.trim() ? Number(draft.targetMeetings) : null];
            return [field, typeof value === "string" ? value.trim() || null : value];
        }));
        setSaving(true);
        const ok = await onSave(patch);
        setSaving(false);
        if (!ok) return setError("Enregistrement impossible. Vos modifications sont toujours là : réessayez.");
        setLastSaved(changed.map((field) => FIELD_LABELS[field]));
        close();
    }

    const dateError = Boolean(draft?.startDate && draft.endDate && draft.endDate < draft.startDate);

    return (
        <section className="cw-section" id="cw-cadrage" aria-labelledby="cw-cadrage-title">
            <div className="cw-section-head">
                <h2 id="cw-cadrage-title">Cadrage</h2>
                {draft
                    ? <span className="cw-pill" data-tone={dirty ? "warning" : undefined} role="status"><i />{dirty ? `${changed.length} modification${changed.length > 1 ? "s" : ""} non enregistrée${changed.length > 1 ? "s" : ""}` : "En cours de modification"}</span>
                    : <button ref={editButton} className="cw-button" data-size="sm" onClick={edit}><Pencil /> Modifier</button>}
            </div>
            {draft ? (
                <form ref={formRef} className="cw-form cw-edit-card" onSubmit={submit} onKeyDown={(event) => { if (event.key === "Escape" && !dirty) { event.preventDefault(); close(); } }}>
                    <fieldset disabled={saving}>
                        <legend><Target /> Objectif et période</legend>
                        <label>Nom de la mission<input name="name" required value={draft.name} onChange={(event) => setField("name", event.target.value)} /></label>
                        <label>Objectif<textarea name="objective" rows={3} value={draft.objective} placeholder="Ex. 12 rendez-vous qualifiés avec des DSI de PME industrielles" onChange={(event) => setField("objective", event.target.value)} /></label>
                        <div className="cw-form-grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
                            <label>RDV visés<input name="targetMeetings" inputMode="numeric" placeholder="Ex. 12" value={draft.targetMeetings} onChange={(event) => setField("targetMeetings", event.target.value)} /></label>
                            <label>Date de début<input name="startDate" type="date" required={Boolean(initial.startDate)} value={draft.startDate} onChange={(event) => setField("startDate", event.target.value)} /></label>
                            <label>Date de fin<input name="endDate" type="date" required={Boolean(initial.endDate)} min={draft.startDate || undefined} aria-invalid={dateError} value={draft.endDate} onChange={(event) => setField("endDate", event.target.value)} /></label>
                        </div>
                        <div className="cw-channel-options" role="group" aria-label="Canaux">
                            {Object.entries(CHANNELS).map(([channel, label]) => {
                                const id = channel as Channel;
                                const checked = draft.channels.includes(id);
                                return <label key={channel} className="cw-check-label"><input type="checkbox" name="channels" checked={checked} onChange={() => setField("channels", checked ? draft.channels.filter((item) => item !== id) : [...draft.channels, id])} />{label}</label>;
                            })}
                        </div>
                    </fieldset>
                    <fieldset disabled={saving}>
                        <legend><Users /> Suivi</legend>
                        <div className="cw-form-grid">
                            <label>Référent SDR<select name="teamLeadSdrId" value={draft.teamLeadSdrId} onChange={(event) => setField("teamLeadSdrId", event.target.value)}>
                                <option value="">Non désigné</option>
                                {mission.sdrAssignments.map(({ sdr }) => <option key={sdr.id} value={sdr.id}>{sdr.name}</option>)}
                            </select></label>
                            <label>Commercial par défaut<select name="defaultInterlocuteurId" value={draft.defaultInterlocuteurId} onChange={(event) => setField("defaultInterlocuteurId", event.target.value)}>
                                <option value="">Défini par base</option>
                                {mission.client?.interlocuteurs?.map((person) => <option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>)}
                            </select></label>
                        </div>
                        {!mission.sdrAssignments.length && <p className="cw-hint">Le référent se choisit parmi l’équipe affectée. <button type="button" className="cw-text-button" style={{ margin: 0 }} onClick={() => onTabChange("equipe")}>Affecter l’équipe</button></p>}
                    </fieldset>
                    {error && <p role="alert" className="cw-form-error"><CircleAlert />{error}</p>}
                    <div className="cw-form-footer">
                        <span role="status">{saving ? "Enregistrement…" : dirty ? changed.map((key) => FIELD_LABELS[key]).join(", ") : "Aucune modification"}</span>
                        <div className="cw-actions">
                            <button type="button" className="cw-button cw-quiet" onClick={close} disabled={saving}>{dirty ? "Annuler les modifications" : "Fermer"}</button>
                            <button type="submit" className="cw-button cw-primary" disabled={!dirty || saving}><Save /> Enregistrer</button>
                        </div>
                    </div>
                </form>
            ) : (
                <div className="cw-review">
                    <section>
                        <p className="cw-objective" data-empty={saved.objective ? undefined : ""}>{saved.objective || <span className="cw-muted">Objectif à renseigner : le résultat attendu, la cible et le volume.</span>}</p>
                        <dl className="cw-properties">
                            <Property label="Objectif chiffré">{mission.targetMeetings ? `${mission.targetMeetings} RDV` : "À chiffrer"}</Property>
                            <Property label="Période">{saved.startDate || saved.endDate ? `${formatDate(saved.startDate)} → ${formatDate(saved.endDate)}` : "À définir"}</Property>
                            <Property label="Canaux">{saved.channels.map((channel) => CHANNELS[channel]).join(", ")}</Property>
                        </dl>
                    </section>
                    {lastSaved.length > 0 && <p className="cw-hint" role="status"><Check aria-hidden className="mr-1 inline h-3.5 w-3.5 text-success" />Enregistré : {lastSaved.join(", ")}</p>}
                </div>
            )}
        </section>
    );
}
