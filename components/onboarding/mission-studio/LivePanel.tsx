"use client";

import { forwardRef, type ReactNode } from "react";
import { CalendarDays, Check, Linkedin, Mail, MapPin, Phone, Target, Users } from "lucide-react";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { MISSION_TYPE_LABEL, SECTOR_LABEL, SIZE_LABEL } from "@/lib/client-onboarding/questionnaire";
import { completion, type Channel, type StudioState } from "@/lib/onboarding/mission-studio";
import { summarizeTerritory } from "@/lib/onboarding/territory";
import type { CountsStatus } from "./counts";
import { formatCount } from "./counts";

export type SaveState = { kind: "idle" | "saving" | "saved" | "error" | "invalid" | "locked"; detail?: string; local?: boolean };

const CHANNEL_META: Record<Channel, { label: string; icon: typeof Phone }> = {
    CALL: { label: "Téléphone", icon: Phone }, EMAIL: { label: "Email", icon: Mail }, LINKEDIN: { label: "LinkedIn", icon: Linkedin },
};
const day = (value: string) => (/^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    : "");

/** « 1 240 entreprises · 3 180 décideurs », ticking, with « moins de 20 » under the threshold. */
export const Counter = forwardRef<HTMLDivElement, {
    totals: [number, number]; status: CountsStatus; small: number; ready: boolean; reduced: boolean; scope: string; source: string; compact?: boolean;
}>(function Counter({ totals, status, small, ready, reduced, scope, source, compact }, ref) {
    const [companies, deciders] = totals;
    const value = (n: number) => !ready
        ? <span className="ms-count-skeleton" aria-hidden />
        : n > 0 && n < small
            ? <span className="ms-count-num ms-count-small">moins de {small}</span>
            : <AnimatedNumber className="ms-count-num" value={n} duration={reduced ? 1 : 700} formatFn={formatCount} />;
    const label = ready ? `${companies < small && companies > 0 ? `moins de ${small}` : formatCount(companies)} entreprises et ${deciders < small && deciders > 0 ? `moins de ${small}` : formatCount(deciders)} décideurs correspondent à vos critères, ${scope}.` : "Comptage en cours.";
    return <div className="ms-counter" data-compact={compact || undefined} data-busy={status === "loading" || undefined} ref={ref}>
        {status === "error" && !ready
            ? <p className="ms-counter-off">Le comptage revient dans un instant. Votre brief, lui, avance normalement.</p>
            : <>
                <p className="ms-counter-line" aria-hidden>
                    <span className="ms-count">{value(companies)}<span className="ms-count-noun">{companies > 1 ? "entreprises" : "entreprise"}</span></span>
                    <span className="ms-count-sep">·</span>
                    <span className="ms-count">{value(deciders)}<span className="ms-count-noun">{deciders > 1 ? "décideurs" : "décideur"}</span></span>
                </p>
                {compact
                    ? <p className="ms-counter-scope" aria-hidden>{scope.replace(/^dans /, "")}</p>
                    : <p className="ms-counter-caption" aria-hidden>{companies > 1 ? "correspondent" : "correspond"} à vos critères <b>{scope}</b></p>}
                <p className="ms-sr" aria-live="polite">{label}</p>
                {!compact && <p className="ms-counter-source"><span className="ms-pulse" aria-hidden />{source}</p>}
            </>}
    </div>;
});

function Slot({ label, filled, children, icon: Icon }: { label: string; filled: boolean; children: ReactNode; icon: typeof Phone }) {
    return <div className="ms-slot" data-filled={filled || undefined}>
        <dt><Icon size={14} aria-hidden />{label}</dt>
        <dd>{filled ? <span className="ms-slot-value" key={String(filled)}>{children}</span> : <span className="ms-slot-empty" aria-label="À compléter"><i /><i /></span>}</dd>
    </div>;
}

export function SaveBadge({ save }: { save: SaveState }) {
    const text = {
        idle: "", saving: "Enregistrement…", saved: "Enregistré", error: "Hors ligne · nouvel essai bientôt",
        invalid: save.detail ?? "Non enregistré", locked: "Pris en charge par l’agence",
    }[save.kind];
    if (!text) return <span className="ms-save" aria-hidden />;
    return <span className="ms-save" data-kind={save.kind} role="status" title={save.local ? "Brouillon gardé sur cet appareil jusqu’à l’envoi" : undefined}>
        {save.kind === "saved" ? <Check size={13} aria-hidden /> : <span className="ms-save-dot" aria-hidden />}{text}
    </span>;
}

/** The brief, assembling itself as the client answers. */
export const BriefCard = forwardRef<HTMLElement, { state: StudioState; save: SaveState; agency: string }>(function BriefCard({ state, save, agency }, ref) {
    const progress = completion(state);
    const territory = summarizeTerritory(state.territory);
    const target = [...state.sectors.map((s) => SECTOR_LABEL[s] ?? s), ...state.sizes.map((s) => `${SIZE_LABEL[s] ?? s} sal.`)];
    return <article className="ms-card" ref={ref} aria-label="Aperçu de votre brief">
        <header className="ms-card-head">
            <span className="ms-card-eyebrow">Brief · {agency}</span>
            <SaveBadge save={save} />
        </header>
        <h3 className="ms-card-title" data-empty={!state.name.trim() || undefined}>{state.name.trim() || "Votre mission"}</h3>
        {state.missionType && <span className="ms-card-type">{MISSION_TYPE_LABEL[state.missionType]}</span>}
        <p className="ms-card-objective" data-empty={!state.objective.trim() || undefined}>{state.objective.trim() || "Votre objectif apparaîtra ici."}</p>
        <dl className="ms-card-slots">
            <Slot label="Cible" icon={Target} filled={target.length > 0 || state.audienceNotes.trim().length > 0}>
                {target.length ? <span className="ms-card-tags">{target.map((t) => <span key={t}>{t}</span>)}</span> : state.audienceNotes.trim().slice(0, 90)}
            </Slot>
            <Slot label="Interlocuteurs" icon={Users} filled={state.jobTitles.length > 0}>
                {state.jobTitles.slice(0, 4).join(", ")}{state.jobTitles.length > 4 ? ` +${state.jobTitles.length - 4}` : ""}
            </Slot>
            <Slot label="Territoire" icon={MapPin} filled={Boolean(territory || state.territory.note.trim())}>
                <span className="ms-clamp">{[territory, state.territory.note.trim()].filter(Boolean).join(" — ")}</span>
            </Slot>
            <Slot label="Canaux & période" icon={CalendarDays} filled={state.channels.length > 0 && Boolean(state.startDate || state.endDate)}>
                <span className="ms-card-channels">{state.channels.map((c) => { const M = CHANNEL_META[c]; return <span key={c}><M.icon size={12} aria-hidden />{M.label}</span>; })}</span>
                <span className="ms-card-dates">{day(state.startDate) || "…"} → {day(state.endDate) || "…"}{state.targetMeetings ? ` · ${state.targetMeetings} RDV visés` : ""}</span>
            </Slot>
            <Slot label="Offre" icon={Check} filled={Boolean(state.pitch.trim() || state.offerDetail.trim())}>
                <span className="ms-clamp">{state.pitch.trim() || state.offerDetail.trim()}</span>
            </Slot>
        </dl>
        <footer className="ms-card-foot">
            <span>Brief complété à {Math.round(progress * 100)} %</span>
            <span className="ms-meter" aria-hidden><i style={{ transform: `scaleX(${progress})` }} /></span>
        </footer>
    </article>;
});
