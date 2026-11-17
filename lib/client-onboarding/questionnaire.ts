// ============================================
// CLIENT ONBOARDING QUESTIONNAIRE — pure (no database, no network), shared by
// the public portal (/onboarding/[token]), its API and the agency's card.
//
// Two phases:
//   1. the questionnaire (SCREENS), approved by the client on the review screen;
//   2. « Prochaines étapes » after approval: kick-off meeting with the project
//      manager, blacklist, calendar, documents (AFTER fields, still editable).
//
// The client's answers live in ClientOnboarding.onboardingData.clientQuestionnaire
// next to the keys the CRM already uses (icp, pitch, defaultMailboxId…), which
// this module never overwrites except to fill an empty icp / pitch on approval.
//
//   npm run test:client-questionnaire
// ============================================

import { z } from "zod";

// ── Options ─────────────────────────────────────────────────────────────────

export const MISSION_TYPES = [
    { key: "RDV", label: "Prise de rendez-vous", hint: "Nous décrochons des rendez-vous qualifiés avec vos prospects." },
    { key: "DETECTION", label: "Détection de projets", hint: "Nous repérons les entreprises qui ont un projet à court terme." },
    { key: "QUALIFICATION", label: "Qualification de fichier", hint: "Nous vérifions et enrichissons votre base : bons interlocuteurs, besoins, coordonnées." },
    { key: "SURVEY", label: "Sondage & enquête téléphonique", hint: "Nous interrogeons un panel : satisfaction, intention d'achat, notoriété." },
] as const;
export type MissionTypeKey = (typeof MISSION_TYPES)[number]["key"];
export const MISSION_TYPE_LABEL: Record<string, string> = Object.fromEntries(MISSION_TYPES.map((m) => [m.key, m.label]));

export const CHANNELS = [
    { key: "CALL", label: "Téléphone", hint: "Nos équipes appellent vos prospects pour qualifier leur besoin." },
    { key: "EMAIL", label: "Email", hint: "Des séquences d'emails personnalisées, envoyées à votre nom." },
    { key: "LINKEDIN", label: "LinkedIn", hint: "Invitations et messages pour engager les décideurs." },
] as const;
export type ChannelKey = (typeof CHANNELS)[number]["key"];
export const CHANNEL_LABEL: Record<string, string> = Object.fromEntries(CHANNELS.map((c) => [c.key, c.label]));

export const DATABASE_SOURCES = [
    { key: "client", label: "Je fournis la base de données", hint: "Vous nous transmettez votre fichier de prospects après l'onboarding." },
    { key: "agency", label: "À constituer par vos soins", hint: "Nous construisons la base à partir des cibles ci-dessous." },
] as const;
export const DATABASE_LABEL: Record<string, string> = Object.fromEntries(DATABASE_SOURCES.map((d) => [d.key, d.label]));

/** A client can describe up to this many target segments. */
export const MAX_SEGMENTS = 6;
export const MAX_COLLABORATORS = 5;

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

/** One-click job titles, by family (« plus d'exemples, avec des responsables aussi »). */
export const JOB_TITLE_GROUPS = [
    {
        label: "Direction",
        titles: ["Dirigeant / CEO", "Gérant", "Directeur général", "Directeur d'agence", "Directeur de site / usine", "Directeur des opérations"],
    },
    {
        label: "Directeurs",
        titles: ["Directeur commercial", "Directeur des achats", "DAF", "DRH", "DSI / CTO", "Directeur marketing", "Directeur supply chain", "Directeur technique"],
    },
    {
        label: "Responsables",
        titles: [
            "Responsable commercial", "Responsable des achats", "Responsable RH", "Responsable administratif et financier",
            "Responsable informatique", "Responsable marketing", "Responsable logistique", "Responsable maintenance",
            "Responsable qualité / QHSE", "Responsable RSE", "Responsable des services généraux", "Responsable de production",
        ],
    },
    {
        label: "Autres",
        titles: ["Office manager", "Acheteur", "Chef de projet", "Comptable", "Assistant(e) de direction"],
    },
] as const;

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
    jobTitles: list(shortItem, 30),
    notes: text(1500),
});
export type Segment = z.infer<typeof segmentSchema>;

const personSchema = z.object({ name: text(120), email: text(200), role: text(120) });

export const answersSchema = z.object({
    company: z.object({
        website: text(200),
        pitch: text(600),
        offer: text(1500),
        dealValue: text(120),
    }).prefault({}),
    mission: z.object({
        type: z.enum(["RDV", "DETECTION", "QUALIFICATION", "SURVEY"]).or(z.literal("")).optional().default(""),
    }).prefault({}),
    channels: list(z.enum(["CALL", "EMAIL", "LINKEDIN"]), 3),
    referent: z.object({
        name: text(120),
        role: text(120),
        email: text(200),
        phone: text(40),
    }).prefault({}),
    collaborators: list(personSchema, MAX_COLLABORATORS),
    database: z.enum(["client", "agency"]).or(z.literal("")).optional().default(""),
    segments: list(segmentSchema, MAX_SEGMENTS),
    samples: list(z.object({
        siren: z.string().max(20),
        name: z.string().max(200),
        verdict: z.enum(["yes", "no"]),
    }), 40),
    message: z.object({
        valueProposition: text(600),
        benefits: list(z.string().trim().max(300), 3),
        proof: text(1500),
        competitors: list(z.object({ name: text(120), website: text(200) }), 3),
    }).prefault({}),
    meetings: z.object({
        criteria: list(shortItem, 12),
        attendee: text(200),
        bookingUrl: text(400),
        days: list(z.enum(["mon", "tue", "wed", "thu", "fri"]), 5),
    }).prefault({}),
    goals: z.object({
        monthlyMeetings: z.string().trim().regex(/^\d{0,4}$/).optional().default(""),
        launchDate: day,
    }).prefault({}),
    // After approval (« Prochaines étapes »).
    exclusions: z.object({ text: text(20_000) }).prefault({}),
    documents: z.object({ links: text(3000) }).prefault({}),
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

/**
 * Once approved, only the « Prochaines étapes » fields can change: the
 * questionnaire itself stays as validated (the agency can reopen it).
 */
export function mergeAfterApproval(approved: Answers, incoming: Answers): Answers {
    return {
        ...approved,
        exclusions: incoming.exclusions,
        documents: incoming.documents,
        meetings: { ...approved.meetings, bookingUrl: incoming.meetings.bookingUrl, days: incoming.meetings.days, attendee: incoming.meetings.attendee },
    };
}

// ── Screens and steps ───────────────────────────────────────────────────────

export const STEPS = [
    { key: "entreprise", label: "Votre entreprise" },
    { key: "cibles", label: "Vos cibles" },
    { key: "discours", label: "Votre discours" },
    { key: "validation", label: "Validation" },
] as const;
export type StepKey = (typeof STEPS)[number]["key"];

export const SCREENS = [
    { key: "pitch", step: "entreprise" },
    { key: "mission", step: "entreprise" },
    { key: "offer", step: "entreprise" },
    { key: "referent", step: "entreprise" },
    { key: "targets", step: "cibles" },
    { key: "value", step: "discours" },
    { key: "meetings", step: "discours" },
    { key: "review", step: "validation" },
] as const satisfies readonly { key: string; step: StepKey }[];
export type ScreenKey = (typeof SCREENS)[number]["key"];

export const SCREEN_KEYS = SCREENS.map((s) => s.key) as ScreenKey[];

/** Rough minutes per screen, for « environ N min restantes ». */
const SCREEN_MINUTES: Record<ScreenKey, number> = {
    pitch: 1, mission: 1, offer: 2, referent: 1.5, targets: 4, value: 3, meetings: 1.5, review: 1,
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
        case "mission": {
            const out: string[] = [];
            if (!a.mission.type) out.push("Choisissez le type de mission.");
            if (a.channels.length === 0) out.push("Choisissez au moins un canal.");
            return out;
        }
        case "referent": {
            const out: string[] = [];
            if (!a.referent.name) out.push("Indiquez votre nom.");
            if (!a.referent.role) out.push("Indiquez votre rôle dans l'entreprise.");
            if (!EMAIL_RE.test(a.referent.email)) out.push("Indiquez une adresse email valide.");
            const badMate = a.collaborators.find((c) => c.email && !EMAIL_RE.test(c.email));
            if (badMate) out.push(`L'email de ${badMate.name || "votre collaborateur"} n'est pas valide.`);
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
        case "meetings":
            return a.mission.type === "RDV" && a.meetings.criteria.length === 0
                ? ["Choisissez au moins un critère de RDV qualifié."]
                : [];
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
        case "offer": return !!(a.company.offer || a.company.dealValue);
        case "meetings": return a.meetings.criteria.length > 0 || !!a.goals.monthlyMeetings || !!a.goals.launchDate;
        default: return true;
    }
}

// ── After approval ──────────────────────────────────────────────────────────

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

export const NEXT_STEPS = ["kickoff", "blacklist", "calendar", "documents"] as const;
export type NextStepKey = (typeof NEXT_STEPS)[number];

export function nextStepDone(step: NextStepKey, a: Answers): boolean {
    switch (step) {
        case "blacklist": return parseExclusions(a.exclusions.text).length > 0;
        case "calendar": return /^https?:\/\/\S+\.\S+/i.test(a.meetings.bookingUrl);
        case "documents": return a.documents.links.trim().length > 0;
        default: return false;
    }
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
    if (a.database) blocks.push(`Base de données : ${DATABASE_LABEL[a.database]}`);
    const yes = a.samples.filter((s) => s.verdict === "yes").map((s) => s.name);
    const no = a.samples.filter((s) => s.verdict === "no").map((s) => s.name);
    if (yes.length) blocks.push(`Exemples pertinents : ${yes.join(", ")}`);
    if (no.length) blocks.push(`Exemples écartés : ${no.join(", ")}`);
    return blocks.join("\n\n");
}

/** Plain-text pitch brief, written to onboardingData.pitch when it is empty. */
export function pitchSummary(a: Answers): string {
    const lines: string[] = [];
    if (a.company.pitch) lines.push(a.company.pitch);
    if (a.mission.type) lines.push(`Mission : ${MISSION_TYPE_LABEL[a.mission.type]}${a.channels.length ? ` (${a.channels.map((c) => CHANNEL_LABEL[c]).join(", ")})` : ""}`);
    if (a.message.valueProposition) lines.push(`Proposition de valeur : ${a.message.valueProposition}`);
    if (a.company.offer) lines.push(`Offre : ${a.company.offer}`);
    if (a.company.dealValue) lines.push(`Panier moyen : ${a.company.dealValue}`);
    const benefits = a.message.benefits.filter((b) => b.trim());
    if (benefits.length) lines.push(`Avantages concurrentiels : ${joinFr(benefits)}`);
    if (a.message.proof) lines.push(`Preuves : ${a.message.proof}`);
    const competitors = a.message.competitors.filter((c) => c.name).map((c) => (c.website ? `${c.name} (${c.website})` : c.name));
    if (competitors.length) lines.push(`Concurrents : ${competitors.join(", ")}`);
    return lines.join("\n");
}

/** Plain-text goals and team, shown to the agency next to the pitch. */
export function goalsSummary(a: Answers): string {
    const g = a.goals;
    const lines: string[] = [];
    if (g.monthlyMeetings) lines.push(`Objectif : ${g.monthlyMeetings} RDV par mois`);
    if (g.launchDate) lines.push(`Lancement souhaité : ${new Date(`${g.launchDate}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`);
    if (a.meetings.criteria.length) lines.push(`RDV qualifié : ${a.meetings.criteria.join(", ")}`);
    if (a.referent.name) lines.push(`Interlocuteur : ${[a.referent.name, a.referent.role, a.referent.email, a.referent.phone].filter(Boolean).join(" · ")}`);
    for (const c of a.collaborators.filter((x) => x.name || x.email)) {
        lines.push(`Collaborateur à inviter : ${[c.name, c.role, c.email].filter(Boolean).join(" · ")}`);
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
