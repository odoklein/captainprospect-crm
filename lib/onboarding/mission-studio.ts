// ============================================
// MISSION STUDIO — the state of the « créer ma mission » page and its mapping
// to the brief the API stores (missionBriefSchema). Pure, shared by the page
// and its tests.
//
// The page edits structured answers (sector chips, map codes…); the brief keeps
// the readable texts the agency already reads (targetAudience, geography,
// offer, differentiators), rebuilt from those answers on every change. The
// structured parts live in the brief JSON too: `territory`, and the
// questionnaire's first target segment (sectors, sizes, régions, job titles).
//
//   npx tsx --test lib/onboarding/mission-studio.test.ts
// ============================================

import { normalizeAnswers, SECTOR_LABEL, SIZE_LABEL, type Answers, type MissionTypeKey } from "@/lib/client-onboarding/questionnaire";
import { REGIONS } from "@/lib/sourcing/france";
import { missionBriefSchema, type MissionBrief, type MissionBriefInput } from "./self-service-schema";
import { composeGeography, coveredCodes, regionCover, type Territory } from "./territory";

export type Channel = "CALL" | "EMAIL" | "LINKEDIN";

export interface StudioState {
    name: string;
    missionType: MissionTypeKey | "";
    objective: string;
    sectors: string[];
    sizes: string[];
    jobTitles: string[];
    audienceNotes: string;
    exclusions: string;
    territory: Territory;
    channels: Channel[];
    startDate: string;
    endDate: string;
    targetMeetings: number | null;
    pitch: string;
    offerDetail: string;
    valueProposition: string;
    benefits: [string, string, string];
    proof: string;
}

export const SECTIONS = [
    { key: "objective", label: "Objectif", title: "Quel résultat attendez-vous ?" },
    { key: "target", label: "Cible", title: "Qui voulez-vous rencontrer ?" },
    { key: "territory", label: "Territoire", title: "Où sont vos prospects ?" },
    { key: "channels", label: "Canaux & calendrier", title: "Comment et quand ?" },
    { key: "offer", label: "Offre & différence", title: "Pourquoi vous ?" },
    { key: "review", label: "Relecture & envoi", title: "Votre brief, prêt à partir" },
] as const;
export type SectionKey = (typeof SECTIONS)[number]["key"];

const SEGMENT_ID = "mission-brief";

export function emptyState(): StudioState {
    return {
        name: "", missionType: "", objective: "", sectors: [], sizes: [], jobTitles: [], audienceNotes: "", exclusions: "",
        territory: { all: false, codes: [], note: "" }, channels: ["CALL"], startDate: "", endDate: "", targetMeetings: null,
        pitch: "", offerDetail: "", valueProposition: "", benefits: ["", "", ""], proof: "",
    };
}

/** A saved brief (new format, or one written with the former three-step form) → page state. */
export function stateFromBrief(brief: Partial<MissionBrief> | null | undefined): StudioState {
    const base = emptyState();
    if (!brief) return base;
    const q = normalizeAnswers(brief.questionnaire);
    const segment = q.segments.find((s) => s.id === SEGMENT_ID) ?? q.segments[0];
    const benefits = [...q.message.benefits, "", "", ""].slice(0, 3) as [string, string, string];
    const structuredOffer = Boolean(q.company.pitch || q.company.offer);
    const structuredValue = Boolean(q.message.valueProposition || q.message.proof || q.message.benefits.some(Boolean));
    return {
        ...base,
        name: brief.name ?? "",
        missionType: q.mission.type,
        objective: brief.objective ?? "",
        sectors: segment?.sectors ?? [],
        sizes: segment?.sizes ?? [],
        jobTitles: segment?.jobTitles ?? [],
        // Older briefs only have the free text: keep it, word for word, as the notes.
        audienceNotes: segment ? segment.notes : brief.targetAudience ?? "",
        exclusions: brief.exclusions ?? "",
        territory: brief.territory
            ? { all: brief.territory.all, codes: [...brief.territory.codes], note: brief.territory.note }
            : { all: false, codes: [], note: brief.geography ?? "" },
        channels: brief.channels?.length ? [...brief.channels] : base.channels,
        startDate: brief.startDate ?? "",
        endDate: brief.endDate ?? "",
        targetMeetings: brief.targetMeetings ?? null,
        pitch: q.company.pitch,
        offerDetail: structuredOffer ? q.company.offer : brief.offer ?? "",
        valueProposition: q.message.valueProposition,
        benefits,
        proof: structuredValue ? q.message.proof : brief.differentiators ?? "",
    };
}

/** « Secteurs : … », « Taille : … », « Interlocuteurs : … », then the client's own words. */
export function composeAudience(s: Pick<StudioState, "sectors" | "sizes" | "jobTitles" | "audienceNotes">): string {
    const lines: string[] = [];
    if (s.sectors.length) lines.push(`Secteurs : ${s.sectors.map((k) => SECTOR_LABEL[k] ?? k).join(", ")}`);
    if (s.sizes.length) lines.push(`Taille : ${s.sizes.map((k) => SIZE_LABEL[k] ?? k).join(", ")} salariés`);
    if (s.jobTitles.length) lines.push(`Interlocuteurs : ${s.jobTitles.join(", ")}`);
    const notes = s.audienceNotes.trim();
    if (notes) lines.push(lines.length ? `Précisions : ${notes}` : notes);
    return lines.join("\n");
}

export function composeOffer(s: Pick<StudioState, "pitch" | "offerDetail">): string {
    return [s.pitch.trim(), s.offerDetail.trim()].filter(Boolean).join("\n\n");
}

export function composeDifferentiators(s: Pick<StudioState, "valueProposition" | "benefits" | "proof">): string {
    return [s.valueProposition, ...s.benefits, s.proof].map((v) => v.trim()).filter(Boolean).join("\n\n");
}

/** Régions the map selection covers entirely (the questionnaire segment keeps région names). */
export function fullRegions(t: Territory): string[] {
    const codes = coveredCodes(t);
    return REGIONS.filter((r) => regionCover(codes, r.name).state === "full").map((r) => r.name);
}

/** Page state → the brief body sent to the API (validated by missionBriefSchema on both sides). */
export function briefFromState(s: StudioState, previous?: Answers | null): MissionBriefInput {
    const q = structuredClone(previous ?? normalizeAnswers(undefined));
    q.company.pitch = s.pitch.trim().slice(0, 600);
    q.company.offer = s.offerDetail.trim().slice(0, 1500);
    q.message.valueProposition = s.valueProposition.trim().slice(0, 600);
    // Positions are kept (the page has three fixed slots); readers skip the empty ones.
    q.message.benefits = s.benefits.some((b) => b.trim()) ? s.benefits.map((b) => b.trim().slice(0, 300)) : [];
    q.message.proof = s.proof.trim().slice(0, 1500);
    q.mission.type = s.missionType;
    q.channels = [...s.channels];
    const segment = {
        id: SEGMENT_ID,
        name: (s.name.trim() || "Cible principale").slice(0, 80),
        sectors: [...s.sectors],
        sizes: [...s.sizes],
        regions: fullRegions(s.territory),
        jobTitles: s.jobTitles.map((t) => t.trim().slice(0, 120)).filter(Boolean).slice(0, 30),
        notes: s.audienceNotes.trim().slice(0, 1500),
    };
    q.segments = [segment, ...q.segments.filter((x) => x.id !== SEGMENT_ID)].slice(0, 6);
    return {
        questionnaire: q,
        name: s.name,
        objective: s.objective,
        channels: [...s.channels],
        startDate: s.startDate,
        endDate: s.endDate,
        targetMeetings: s.targetMeetings,
        targetAudience: composeAudience(s),
        geography: composeGeography(s.territory),
        offer: composeOffer(s),
        differentiators: composeDifferentiators(s),
        exclusions: s.exclusions,
        territory: { all: s.territory.all, codes: [...s.territory.codes], note: s.territory.note },
    };
}

/** Where a schema issue is shown: its section and the field that gets the message. */
export const FIELD_OF_ISSUE: Record<string, { section: SectionKey; field: string }> = {
    name: { section: "objective", field: "name" },
    objective: { section: "objective", field: "objective" },
    targetAudience: { section: "target", field: "audience" },
    exclusions: { section: "target", field: "exclusions" },
    geography: { section: "territory", field: "note" },
    territory: { section: "territory", field: "note" },
    channels: { section: "channels", field: "channels" },
    startDate: { section: "channels", field: "startDate" },
    endDate: { section: "channels", field: "endDate" },
    targetMeetings: { section: "channels", field: "targetMeetings" },
    offer: { section: "offer", field: "pitch" },
    differentiators: { section: "offer", field: "valueProposition" },
    questionnaire: { section: "offer", field: "pitch" },
};

/** Kinder French than zod's defaults, for the few messages the schema does not set itself. */
function kindMessage(path: string, message: string): string {
    if (path === "startDate" || path === "endDate") return message === "Date invalide." ? "Choisissez une date." : message;
    if (path === "targetMeetings") return "Indiquez un nombre entier de rendez-vous (ou laissez vide).";
    if (path === "targetAudience") return "Choisissez au moins un secteur ou une fonction, ou décrivez votre cible en quelques mots.";
    if (path === "offer") return "Dites en une phrase ce que vous vendez.";
    return message;
}

export interface StudioIssues {
    /** field → message */
    fields: Record<string, string>;
    /** sections with at least one issue, in page order */
    sections: SectionKey[];
}

export function validateState(s: StudioState, previous?: Answers | null): { brief: MissionBrief | null; issues: StudioIssues } {
    const result = missionBriefSchema.safeParse(briefFromState(s, previous));
    if (result.success) return { brief: result.data, issues: { fields: {}, sections: [] } };
    const fields: Record<string, string> = {};
    const sections = new Set<SectionKey>();
    for (const issue of result.error.issues) {
        const path = String(issue.path[0] ?? "");
        const target = FIELD_OF_ISSUE[path] ?? { section: "review" as const, field: "form" };
        fields[target.field] ??= kindMessage(path, issue.message);
        sections.add(target.section);
    }
    return { brief: null, issues: { fields, sections: SECTIONS.map((x) => x.key).filter((k) => sections.has(k)) } };
}

const validDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

/** A section reads as « done » on the rail once its essentials are there. */
export function sectionDone(key: SectionKey, s: StudioState): boolean {
    switch (key) {
        case "objective": return Boolean(s.name.trim() && s.objective.trim());
        case "target": return s.sectors.length > 0 || s.jobTitles.length > 0 || s.audienceNotes.trim().length >= 10;
        case "territory": return s.territory.all || s.territory.codes.length > 0 || s.territory.note.trim().length > 0;
        case "channels": return s.channels.length > 0 && validDay(s.startDate) && validDay(s.endDate) && s.endDate >= s.startDate;
        case "offer": return Boolean(s.pitch.trim() || s.offerDetail.trim());
        case "review": return SECTIONS.slice(0, 5).every((x) => sectionDone(x.key, s));
    }
}

/** 0…1, over the five sections the client fills. */
export function completion(s: StudioState): number {
    return SECTIONS.slice(0, 5).filter((x) => sectionDone(x.key, s)).length / 5;
}

/** Same content (ignoring key order of nothing but our own objects) — used to skip no-op autosaves. */
export function sameState(a: StudioState, b: StudioState): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

/** Local draft (new missions only, until the brief is first sent). */
export interface LocalDraft {
    version: 1;
    savedAt: number;
    state: StudioState;
}

export function readLocalDraft(raw: string | null): LocalDraft | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as LocalDraft;
        if (parsed?.version !== 1 || typeof parsed.savedAt !== "number" || !parsed.state) return null;
        return { ...parsed, state: { ...emptyState(), ...parsed.state } };
    } catch {
        return null;
    }
}
