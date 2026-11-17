// ============================================
// CLIENT ONBOARDING QUESTIONNAIRE — pure (no database, no network), shared by
// the public portal (/onboarding/[token]), its API and the agency's card.
//
// The client's answers live in ClientOnboarding.onboardingData.clientQuestionnaire
// next to the keys the CRM already uses (icp, pitch, defaultMailboxId…), which
// this module never overwrites except to fill an empty icp / pitch on approval.
//
//   npm run test:client-questionnaire
// ============================================

import { z } from "zod";

// ── Options ─────────────────────────────────────────────────────────────────

export const CHANNELS = [
    { key: "CALL", label: "Téléphone", hint: "Nos équipes appellent vos prospects pour qualifier leur besoin et décrocher le rendez-vous." },
    { key: "EMAIL", label: "Email", hint: "Des séquences d'emails personnalisées, envoyées depuis une adresse à votre nom." },
    { key: "LINKEDIN", label: "LinkedIn", hint: "Invitations et messages pour engager les décideurs là où ils lisent." },
] as const;
export type ChannelKey = (typeof CHANNELS)[number]["key"];

export const SALES_CYCLES = [
    { key: "lt1m", label: "Moins d'1 mois" },
    { key: "1-3m", label: "1 à 3 mois" },
    { key: "3-6m", label: "3 à 6 mois" },
    { key: "6-12m", label: "6 à 12 mois" },
    { key: "gt12m", label: "Plus de 12 mois" },
] as const;
export const SALES_CYCLE_LABEL: Record<string, string> = Object.fromEntries(SALES_CYCLES.map((c) => [c.key, c.label]));

/** A client can describe up to this many target segments. */
export const MAX_SEGMENTS = 6;

/** NAF rév. 2 sections, the filter the French company registry understands. */
export const SECTORS = [
    { key: "C", label: "Industrie" },
    { key: "F", label: "BTP" },
    { key: "H", label: "Transport & logistique" },
    { key: "G", label: "Commerce & distribution" },
    { key: "J", label: "Tech & médias" },
    { key: "M", label: "Conseil & ingénierie" },
    { key: "N", label: "Services aux entreprises" },
    { key: "K", label: "Banque & assurance" },
    { key: "L", label: "Immobilier" },
    { key: "Q", label: "Santé & médico-social" },
    { key: "I", label: "Hôtellerie & restauration" },
    { key: "D", label: "Énergie" },
    { key: "E", label: "Eau, déchets & environnement" },
    { key: "P", label: "Enseignement & formation" },
    { key: "A", label: "Agriculture & agroalimentaire" },
    { key: "R", label: "Culture, sport & loisirs" },
    { key: "S", label: "Autres services" },
] as const;
export const SECTOR_LABEL: Record<string, string> = Object.fromEntries(SECTORS.map((s) => [s.key, s.label]));

/** Headcount groups → INSEE « tranche d'effectif salarié » codes. */
export const SIZES = [
    { key: "1-9", label: "1-9", codes: ["01", "02", "03"] },
    { key: "10-49", label: "10-49", codes: ["11", "12"] },
    { key: "50-249", label: "50-249", codes: ["21", "22", "31"] },
    { key: "250-999", label: "250-999", codes: ["32", "41"] },
    { key: "1000+", label: "1000+", codes: ["42", "51", "52", "53"] },
] as const;
export const SIZE_LABEL: Record<string, string> = Object.fromEntries(SIZES.map((s) => [s.key, s.label]));

export const JOB_TITLE_SUGGESTIONS = [
    "Dirigeant / CEO", "Directeur commercial", "Directeur des achats", "DAF", "DRH",
    "DSI / CTO", "Directeur marketing", "Directeur des opérations", "Directeur supply chain",
    "Responsable QHSE", "Office manager",
];

export const OBJECTION_SUGGESTIONS = [
    "Je n'ai pas le temps", "Nous avons déjà un prestataire", "C'est trop cher",
    "Envoyez-moi un email", "Ce n'est pas le bon moment", "Je ne suis pas la bonne personne",
];

export const MEETING_CRITERIA = [
    "Décideur présent", "Besoin identifié", "Budget évoqué", "Projet dans les 6 mois",
    "Taille d'entreprise ciblée", "Zone géographique couverte",
];

export const WEEKDAYS = [
    { key: "mon", label: "Lun" }, { key: "tue", label: "Mar" }, { key: "wed", label: "Mer" },
    { key: "thu", label: "Jeu" }, { key: "fri", label: "Ven" },
] as const;

// ── Answers ─────────────────────────────────────────────────────────────────

const text = (max: number) => z.string().trim().max(max).optional().default("");
const list = <T extends z.ZodTypeAny>(item: T, max: number) => z.array(item).max(max).optional().default([]);
const shortItem = z.string().trim().min(1).max(120);
const day = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).optional().default("");

const segmentSchema = z.object({
    id: z.string().min(1).max(40),
    name: z.string().trim().max(80).optional().default(""),
    sectors: list(z.string().max(4), 30),
    sizes: list(z.string().max(12), 10),
    regions: list(z.string().max(60), 20),
    jobTitles: list(shortItem, 20),
    notes: text(1500),
});
export type Segment = z.infer<typeof segmentSchema>;

export const answersSchema = z.object({
    company: z.object({
        website: text(200),
        pitch: text(600),
        offer: text(1500),
        dealValue: text(120),
        salesCycle: text(20),
    }).prefault({}),
    channels: list(z.enum(["CALL", "EMAIL", "LINKEDIN"]), 3),
    referent: z.object({
        name: text(120),
        role: text(120),
        email: text(200),
        phone: text(40),
    }).prefault({}),
    segments: list(segmentSchema, MAX_SEGMENTS),
    samples: list(z.object({
        siren: z.string().max(20),
        name: z.string().max(200),
        verdict: z.enum(["yes", "no"]),
    }), 40),
    exclusions: z.object({ text: text(20_000) }).prefault({}),
    message: z.object({
        valueProposition: text(600),
        benefits: list(z.string().trim().max(300), 3),
        proof: text(1500),
        competitors: text(600),
        objections: list(z.object({ objection: shortItem, answer: z.string().trim().max(600).optional().default("") }), 12),
    }).prefault({}),
    meetings: z.object({
        criteria: list(shortItem, 12),
        attendee: text(200),
        bookingUrl: text(400),
        days: list(z.enum(["mon", "tue", "wed", "thu", "fri"]), 5),
        notes: text(1000),
    }).prefault({}),
    goals: z.object({
        monthlyMeetings: z.string().trim().regex(/^\d{0,4}$/).optional().default(""),
        launchDate: day,
        missionEndDate: day,
        expectedOutcome: text(1000),
    }).prefault({}),
});

export type Answers = z.infer<typeof answersSchema>;

export function emptyAnswers(): Answers {
    return answersSchema.parse({});
}

export function newSegment(id: string, index: number): Segment {
    return segmentSchema.parse({ id, name: `Cible ${index + 1}` });
}

/** Segments the client actually described (a sector picked or a description written). */
export function definedSegments(a: Answers): Segment[] {
    return a.segments.filter((s) => s.sectors.length > 0 || s.notes.trim().length >= 10);
}

/** Anything stored (older versions, hand-edited JSON) → valid answers; never throws. */
export function normalizeAnswers(raw: unknown): Answers {
    const parsed = answersSchema.safeParse(raw ?? {});
    return parsed.success ? parsed.data : emptyAnswers();
}

// ── Screens and steps ───────────────────────────────────────────────────────

export const STEPS = [
    { key: "entreprise", label: "Votre entreprise" },
    { key: "cibles", label: "Vos cibles" },
    { key: "discours", label: "Votre discours" },
    { key: "objectifs", label: "Vos objectifs" },
    { key: "validation", label: "Validation" },
] as const;
export type StepKey = (typeof STEPS)[number]["key"];

export const SCREENS = [
    { key: "pitch", step: "entreprise" },
    { key: "offer", step: "entreprise" },
    { key: "channels", step: "entreprise" },
    { key: "referent", step: "entreprise" },
    { key: "targets", step: "cibles" },
    { key: "exclusions", step: "cibles" },
    { key: "value", step: "discours" },
    { key: "objections", step: "discours" },
    { key: "meetings", step: "discours" },
    { key: "goals", step: "objectifs" },
    { key: "review", step: "validation" },
] as const satisfies readonly { key: string; step: StepKey }[];
export type ScreenKey = (typeof SCREENS)[number]["key"];

export const SCREEN_KEYS = SCREENS.map((s) => s.key) as ScreenKey[];

/** Rough minutes per screen, for « environ N min restantes ». */
const SCREEN_MINUTES: Record<ScreenKey, number> = {
    pitch: 1, offer: 2, channels: 0.5, referent: 1, targets: 4, exclusions: 1,
    value: 3, objections: 2, meetings: 2, goals: 2, review: 1,
};

export function minutesLeft(fromIndex: number): number {
    return Math.max(1, Math.round(SCREENS.slice(fromIndex).reduce((n, s) => n + SCREEN_MINUTES[s.key], 0)));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * What still blocks a screen, in the words the client reads. Empty = done.
 * Only what the agency cannot start without is required; the rest is optional.
 */
export function screenIssues(screen: ScreenKey, a: Answers): string[] {
    switch (screen) {
        case "pitch":
            return a.company.pitch.length < 10 ? ["Décrivez ce que vous vendez en une phrase."] : [];
        case "channels":
            return a.channels.length === 0 ? ["Choisissez au moins un canal."] : [];
        case "referent": {
            const out: string[] = [];
            if (!a.referent.name) out.push("Indiquez le nom de votre interlocuteur.");
            if (!EMAIL_RE.test(a.referent.email)) out.push("Indiquez une adresse email valide.");
            return out;
        }
        case "targets":
            return definedSegments(a).length === 0
                ? ["Définissez au moins une cible : un secteur, ou quelques mots pour la décrire."]
                : [];
        case "value":
            return a.message.valueProposition.length < 10 && a.message.benefits.every((b) => !b.trim())
                ? ["Décrivez votre proposition de valeur ou au moins un avantage."]
                : [];
        case "goals":
            return a.goals.launchDate ? [] : ["Indiquez la date de lancement souhaitée."];
        case "meetings":
            return a.meetings.criteria.length === 0 ? ["Choisissez au moins un critère de RDV qualifié."] : [];
        default:
            return [];
    }
}

export function isStepDone(step: StepKey, a: Answers): boolean {
    if (step === "validation") return false;
    return SCREENS.filter((s) => s.step === step).every((s) => screenIssues(s.key, a).length === 0);
}

/** Screens the client must still complete before approving (review excluded). */
export function missingScreens(a: Answers): ScreenKey[] {
    return SCREEN_KEYS.filter((k) => k !== "review" && screenIssues(k, a).length > 0);
}

/** 0–100, over the screens that have something to fill (all but review). */
export function completion(a: Answers): number {
    const keys = SCREEN_KEYS.filter((k) => k !== "review");
    const filled = keys.filter((k) => isScreenTouched(k, a) && screenIssues(k, a).length === 0).length;
    return Math.round((filled / keys.length) * 100);
}

/** Optional screens count as filled only when the client wrote something. */
function isScreenTouched(screen: ScreenKey, a: Answers): boolean {
    switch (screen) {
        case "offer": return !!(a.company.offer || a.company.dealValue || a.company.salesCycle);
        case "exclusions": return !!a.exclusions.text.trim();
        case "objections": return a.message.objections.length > 0 || !!a.message.competitors;
        default: return true;
    }
}

// ── Exclusions ──────────────────────────────────────────────────────────────

/** One company per line (or comma / semicolon separated), de-duplicated case-insensitively. */
export function parseExclusions(raw: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const part of raw.split(/[\n;,\t]+/)) {
        const name = part.trim().replace(/^["']|["']$/g, "").trim();
        if (name.length < 2) continue;
        const key = name.toLocaleLowerCase("fr");
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(name);
    }
    return out;
}

// ── Summaries for the CRM ───────────────────────────────────────────────────

function joinFr(items: string[]): string {
    if (items.length <= 1) return items.join("");
    return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

/** Plain-text target profile, written to onboardingData.icp when it is empty. */
export function icpSummary(a: Answers): string {
    const blocks = definedSegments(a).map((t, i) => {
        const lines: string[] = [`${t.name || `Cible ${i + 1}`}`];
        if (t.sectors.length) lines.push(`- Secteurs : ${t.sectors.map((s) => SECTOR_LABEL[s] ?? s).join(", ")}`);
        if (t.sizes.length) lines.push(`- Taille : ${t.sizes.map((s) => SIZE_LABEL[s] ?? s).join(", ")} salariés`);
        lines.push(`- Zones : ${t.regions.length ? t.regions.join(", ") : "France entière"}`);
        if (t.jobTitles.length) lines.push(`- Interlocuteurs : ${t.jobTitles.join(", ")}`);
        if (t.notes) lines.push(`- Précisions : ${t.notes}`);
        return lines.join("\n");
    });
    const yes = a.samples.filter((s) => s.verdict === "yes").map((s) => s.name);
    const no = a.samples.filter((s) => s.verdict === "no").map((s) => s.name);
    if (yes.length) blocks.push(`Exemples pertinents : ${yes.join(", ")}`);
    if (no.length) blocks.push(`Exemples écartés : ${no.join(", ")}`);
    return blocks.join("\n\n");
}

/** Plain-text goals, shown to the agency next to the pitch. */
export function goalsSummary(a: Answers): string {
    const g = a.goals;
    const fmt = (d: string) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "");
    const lines: string[] = [];
    if (g.monthlyMeetings) lines.push(`Objectif : ${g.monthlyMeetings} RDV par mois`);
    if (g.launchDate) lines.push(`Lancement souhaité : ${fmt(g.launchDate)}`);
    if (g.missionEndDate) lines.push(`Fin prévisionnelle : ${fmt(g.missionEndDate)}`);
    if (g.expectedOutcome) lines.push(`Résultat attendu à 3 mois : ${g.expectedOutcome}`);
    return lines.join("\n");
}

/** Plain-text pitch brief, written to onboardingData.pitch when it is empty. */
export function pitchSummary(a: Answers): string {
    const lines: string[] = [];
    if (a.company.pitch) lines.push(a.company.pitch);
    if (a.message.valueProposition) lines.push(`Proposition de valeur : ${a.message.valueProposition}`);
    if (a.company.offer) lines.push(`Offre : ${a.company.offer}`);
    if (a.company.dealValue) lines.push(`Panier moyen : ${a.company.dealValue}`);
    if (a.company.salesCycle) lines.push(`Cycle de vente : ${SALES_CYCLE_LABEL[a.company.salesCycle] ?? a.company.salesCycle}`);
    const benefits = a.message.benefits.filter((b) => b.trim());
    if (benefits.length) lines.push(`Avantages concurrentiels : ${joinFr(benefits)}`);
    if (a.message.proof) lines.push(`Preuves : ${a.message.proof}`);
    if (a.message.competitors) lines.push(`Concurrents : ${a.message.competitors}`);
    for (const o of a.message.objections) {
        lines.push(o.answer ? `Objection « ${o.objection} » → ${o.answer}` : `Objection fréquente : « ${o.objection} »`);
    }
    return lines.join("\n");
}

/** A first call opener drafted from the answers, shown on the review screen. */
export function scriptOpener(a: Answers, clientName: string): string {
    const pitch = a.company.pitch.replace(/\.$/, "");
    const benefit = a.message.benefits.find((b) => b.trim());
    const sectors = (definedSegments(a)[0]?.sectors ?? []).map((s) => SECTOR_LABEL[s]?.toLowerCase()).filter(Boolean) as string[];
    const who = sectors.length ? `des entreprises ${sectors.length === 1 ? "du secteur" : "des secteurs"} ${joinFr(sectors)}` : "des entreprises comme la vôtre";
    const parts = [`Bonjour, je vous appelle de la part de ${clientName}.`];
    if (pitch) parts.push(`${pitch.charAt(0).toUpperCase()}${pitch.slice(1)}, et nous accompagnons ${who}.`);
    if (benefit) parts.push(`Nos clients nous choisissent surtout pour ${benefit.charAt(0).toLowerCase()}${benefit.slice(1).replace(/\.$/, "")}.`);
    parts.push("Est-ce un sujet chez vous en ce moment ?");
    return parts.join(" ");
}

// ── Stored state ────────────────────────────────────────────────────────────

/** onboardingData.clientQuestionnaire */
export interface QuestionnaireState {
    version: 1;
    answers: Answers;
    /** Last screen the client was on, to resume there. */
    screen: ScreenKey;
    /** Answers the agency pre-filled; the portal flags them until the client edits. */
    prefilled: string[];
    updatedAt: string | null;
    submittedAt: string | null;
}

export function readState(raw: unknown): QuestionnaireState | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Partial<QuestionnaireState>;
    return {
        version: 1,
        answers: normalizeAnswers(r.answers),
        screen: SCREEN_KEYS.includes(r.screen as ScreenKey) ? (r.screen as ScreenKey) : "pitch",
        prefilled: Array.isArray(r.prefilled) ? r.prefilled.filter((x): x is string => typeof x === "string") : [],
        updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : null,
        submittedAt: typeof r.submittedAt === "string" ? r.submittedAt : null,
    };
}

/** What the agency already knows, used the first time the client opens the link. */
export function prefillAnswers(known: {
    pitch?: string | null;
    icp?: string | null;
    bookingUrl?: string | null;
    email?: string | null;
    /** YYYY-MM-DD */
    launchDate?: string | null;
}): { answers: Answers; prefilled: string[] } {
    const answers = emptyAnswers();
    const prefilled: string[] = [];
    if (known.pitch?.trim()) {
        answers.company.pitch = known.pitch.trim().slice(0, 600);
        prefilled.push("company.pitch");
    }
    answers.segments = [newSegment("s1", 0)];
    if (known.icp?.trim()) {
        answers.segments[0].notes = known.icp.trim().slice(0, 1500);
        prefilled.push("segments");
    }
    if (known.launchDate && /^\d{4}-\d{2}-\d{2}$/.test(known.launchDate)) {
        answers.goals.launchDate = known.launchDate;
        prefilled.push("goals.launchDate");
    }
    if (known.bookingUrl?.trim()) {
        answers.meetings.bookingUrl = known.bookingUrl.trim().slice(0, 400);
        prefilled.push("meetings.bookingUrl");
    }
    if (known.email?.trim() && EMAIL_RE.test(known.email.trim())) {
        answers.referent.email = known.email.trim();
        prefilled.push("referent.email");
    }
    return { answers, prefilled };
}

/** Pre-filled paths whose value the client has since changed are no longer flagged. */
export function stillPrefilled(prefilled: string[], before: Answers, after: Answers): string[] {
    const get = (a: Answers, path: string): unknown =>
        path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), a);
    return prefilled.filter((p) => JSON.stringify(get(before, p)) === JSON.stringify(get(after, p)));
}
