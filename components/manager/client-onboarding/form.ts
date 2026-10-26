// ============================================
// « Nouveau client » wizard — form model (pure, no React).
// Playbook → form (re-extraction keeps what the user edited), form → POST
// /api/clients payload, and the checks shown before creating.
// ============================================

import { emptyPlaybook, type Playbook, type PlaybookContact } from "@/lib/playbook/leexi-types";
import { formatObjectionHandling } from "@/lib/onboarding/client-create";

export type SourceMode = "leexi" | "paste" | "manual";
export type Channel = "CALL" | "EMAIL" | "LINKEDIN";

export const CHANNEL_LABELS: Record<Channel, string> = { CALL: "Appel", EMAIL: "Email", LINKEDIN: "LinkedIn" };

export interface ContactDraft {
    key: string;
    name: string;
    role: string;
    email: string;
    phone: string;
    /** Create a ClientInterlocuteur: the person RDVs are booked for. */
    asInterlocuteur: boolean;
}

export interface EmailDraft {
    key: string;
    subject: string;
    body: string;
    include: boolean;
}

export interface OnboardingForm {
    // Client
    name: string;
    industry: string;
    website: string;
    email: string;
    phone: string;
    contacts: ContactDraft[];
    notes: string;
    // Cible & discours
    icp: string;
    pitch: string;
    targetIndustries: string[];
    targetJobTitles: string[];
    targetGeographies: string[];
    targetCompanySize: string;
    listingSources: string[];
    estimatedContacts: string;
    listingCriteria: string;
    introScript: string;
    discoveryScript: string;
    closingScript: string;
    objectionScript: string;
    emails: EmailDraft[];
    // Lancement
    targetLaunchDate: string;
    createMission: boolean;
    missionName: string;
    missionObjective: string;
    missionChannels: Channel[];
    missionDurationMonths: number;
    missionWorkingDays: number;
    missionRdvTarget: number;
    startChecklist: boolean;
    checklistStartDay: string;
}

export type TagField = "targetIndustries" | "targetJobTitles" | "targetGeographies" | "listingSources";

export function initialForm(today: string): OnboardingForm {
    return {
        name: "",
        industry: "",
        website: "",
        email: "",
        phone: "",
        contacts: [],
        notes: "",
        icp: "",
        pitch: "",
        targetIndustries: [],
        targetJobTitles: [],
        targetGeographies: [],
        targetCompanySize: "",
        listingSources: [],
        estimatedContacts: "",
        listingCriteria: "",
        introScript: "",
        discoveryScript: "",
        closingScript: "",
        objectionScript: "",
        emails: [],
        targetLaunchDate: "",
        createMission: true,
        missionName: "",
        missionObjective: "",
        missionChannels: ["CALL"],
        missionDurationMonths: 3,
        missionWorkingDays: 10,
        missionRdvTarget: 10,
        startChecklist: true,
        checklistStartDay: today,
    };
}

export const INDUSTRY_SUGGESTIONS = [
    "SaaS / Tech",
    "Services B2B",
    "Formation / Éducation",
    "Industrie",
    "Immobilier",
    "Énergie",
    "Santé",
    "Finance / Assurance",
    "E-commerce / Retail",
    "Événementiel",
];

export const COMPANY_SIZE_SUGGESTIONS = ["1-10 employés", "11-50 employés", "51-200 employés", "201-500 employés", "500+ employés"];

export const TAG_SUGGESTIONS: Record<TagField, string[]> = {
    targetIndustries: INDUSTRY_SUGGESTIONS,
    targetJobTitles: ["Dirigeant", "DRH", "DAF", "Directeur commercial", "Directeur marketing", "DSI", "Responsable achats", "Office manager"],
    targetGeographies: ["France", "Île-de-France", "Auvergne-Rhône-Alpes", "PACA", "Belgique", "Suisse"],
    listingSources: ["LinkedIn Sales Navigator", "Apollo.io", "Pharow", "Google Maps", "Base du client"],
};

let keySeq = 0;
export function newKey(prefix: string): string {
    keySeq += 1;
    return `${prefix}-${Date.now().toString(36)}-${keySeq}`;
}

export function emptyContact(): ContactDraft {
    return { key: newKey("c"), name: "", role: "", email: "", phone: "", asInterlocuteur: false };
}

export function emptyEmail(): EmailDraft {
    return { key: newKey("e"), subject: "", body: "", include: true };
}

// ============================================
// PLAYBOOK → FORM
// ============================================

export function companySizeLabel(min: number, max: number): string {
    if (min > 0 && max > 0) return `${min}-${max} employés`;
    if (min > 0) return `${min}+ employés`;
    if (max > 0) return `1-${max} employés`;
    return "";
}

function notesFromPlaybook(pb: Playbook): string {
    return [
        pb.differentiators.length ? `Différenciateurs :\n${pb.differentiators.map((d) => `- ${d}`).join("\n")}` : "",
        pb.competitors.length ? `Concurrents : ${pb.competitors.join(", ")}` : "",
        pb.persona_pains.length ? `Problèmes des prospects :\n${pb.persona_pains.map((p) => `- ${p}`).join("\n")}` : "",
        pb.next_steps.length ? `Prochaines étapes convenues :\n${pb.next_steps.map((s) => `- ${s}`).join("\n")}` : "",
    ]
        .filter(Boolean)
        .join("\n\n");
}

/** The main contact is the first one with an email, else the first one. */
function mainContactIndex(contacts: PlaybookContact[]): number {
    const withEmail = contacts.findIndex((c) => c.email);
    return withEmail >= 0 ? withEmail : contacts.length ? 0 : -1;
}

/** What the AI proposes for each field, before merging with the form. */
export function formValuesFromPlaybook(pb: Playbook, extras: { websiteHint?: string } = {}): Partial<OnboardingForm> {
    const main = mainContactIndex(pb.key_contacts);
    const contacts: ContactDraft[] = pb.key_contacts.map((c, i) => ({
        key: newKey("c"),
        name: c.name,
        role: c.role,
        email: c.email,
        phone: c.phone,
        asInterlocuteur: i === main,
    }));
    const mp = pb.mission_params;
    const values: Partial<OnboardingForm> = {
        name: pb.company_name,
        industry: pb.sector,
        website: pb.website || extras.websiteHint || "",
        email: main >= 0 ? pb.key_contacts[main].email : "",
        phone: main >= 0 ? pb.key_contacts[main].phone : "",
        contacts,
        notes: notesFromPlaybook(pb),
        icp: pb.icp_description || pb.value_proposition,
        pitch: pb.pitch || pb.value_proposition,
        targetIndustries: pb.target_sectors,
        targetJobTitles: pb.target_roles,
        targetGeographies: pb.geography,
        targetCompanySize: companySizeLabel(pb.company_size_min, pb.company_size_max),
        introScript: pb.phone_script,
        discoveryScript: pb.call_scripts[0] ?? "",
        closingScript: pb.call_scripts[1] ?? "",
        objectionScript: formatObjectionHandling(pb.objection_handling) || pb.objections.join("\n"),
        emails: pb.email_sequence.map((e) => ({ key: newKey("e"), subject: e.subject, body: e.body, include: true })),
        targetLaunchDate: mp.start_date,
    };
    if (mp.channel) values.missionChannels = [mp.channel];
    if (mp.duration_months > 0) values.missionDurationMonths = mp.duration_months;
    if (mp.working_days_per_month > 0) values.missionWorkingDays = mp.working_days_per_month;
    if (mp.rdv_target_per_month > 0) values.missionRdvTarget = mp.rdv_target_per_month;
    if (pb.company_name) values.missionName = `Mission ${pb.company_name}`;
    return values;
}

function isEmptyValue(v: unknown): boolean {
    if (Array.isArray(v)) return v.length === 0;
    return v === "" || v === null || v === undefined;
}

function sameValue(a: unknown, b: unknown): boolean {
    return JSON.stringify(stripKeys(a)) === JSON.stringify(stripKeys(b));
}

/** Contact/email drafts carry random keys; compare their content only. */
function stripKeys(v: unknown): unknown {
    if (!Array.isArray(v)) return v;
    return v.map((item) => {
        if (item && typeof item === "object" && "key" in item) {
            const { key: _key, ...rest } = item as Record<string, unknown>;
            return rest;
        }
        return item;
    });
}

/** Fields worth a merge decision; the rest (defaults like durations) follow the same rule. */
const MERGEABLE = Object.keys(initialForm("2000-01-01")) as Array<keyof OnboardingForm>;

/**
 * Apply an extraction to the form. A field takes the AI value when the user
 * has not touched it: it is still empty, still at its initial default, or
 * still equal to what the previous extraction proposed. So « Relancer
 * l'extraction » never overwrites a correction.
 */
export function mergeExtraction(
    form: OnboardingForm,
    proposed: Partial<OnboardingForm>,
    previous: Partial<OnboardingForm> | null,
    defaults: OnboardingForm,
): OnboardingForm {
    const next = { ...form } as Record<keyof OnboardingForm, unknown>;
    for (const field of MERGEABLE) {
        if (!(field in proposed)) continue;
        const value = proposed[field];
        if (isEmptyValue(value)) continue;
        const current = form[field];
        const untouched =
            isEmptyValue(current) ||
            sameValue(current, defaults[field]) ||
            (previous && field in previous && sameValue(current, previous[field]));
        if (untouched) next[field] = value;
    }
    return next as unknown as OnboardingForm;
}

/** Is the current value still exactly what the AI proposed (shown with the AI mark)? */
export function isAiValue(form: OnboardingForm, ai: Partial<OnboardingForm> | null, field: keyof OnboardingForm): boolean {
    if (!ai || !(field in ai) || isEmptyValue(ai[field])) return false;
    return sameValue(form[field], ai[field]);
}

// ============================================
// CHECKS
// ============================================

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function isValidEmail(v: string): boolean {
    return EMAIL_RE.test(v.trim());
}

export interface FormErrors {
    name?: string;
    email?: string;
    website?: string;
    contacts?: string;
    targetLaunchDate?: string;
}

export function clientStepErrors(form: OnboardingForm): FormErrors {
    const errors: FormErrors = {};
    if (!form.name.trim()) errors.name = "Le nom de l'entreprise est requis.";
    if (form.email.trim() && !isValidEmail(form.email)) errors.email = "Adresse email invalide.";
    if (form.website.trim() && /\s/.test(form.website.trim())) errors.website = "Une adresse web, sans espace (ex. acme.fr).";
    const badContact = form.contacts.find((c) => c.email.trim() && !isValidEmail(c.email));
    if (badContact) errors.contacts = `Email invalide pour ${badContact.name || "un contact"}.`;
    return errors;
}

export interface MissingItem {
    label: string;
    step: "client" | "pitch" | "launch";
}

/** Not blocking: what a manager will have to complete after creation. */
export function missingItems(form: OnboardingForm): MissingItem[] {
    const items: MissingItem[] = [];
    if (!form.email.trim() && !form.contacts.some((c) => c.email.trim())) items.push({ label: "Email du client", step: "client" });
    if (!form.contacts.some((c) => c.asInterlocuteur && c.name.trim())) items.push({ label: "Interlocuteur qui reçoit les RDV", step: "client" });
    if (!form.website.trim()) items.push({ label: "Site web", step: "client" });
    if (!form.icp.trim()) items.push({ label: "Profil client idéal", step: "pitch" });
    if (form.targetJobTitles.length === 0) items.push({ label: "Fonctions ciblées", step: "pitch" });
    if (!form.introScript.trim()) items.push({ label: "Script d'accroche", step: "pitch" });
    if (form.createMission && !form.targetLaunchDate) items.push({ label: "Date de lancement", step: "launch" });
    return items;
}

// ============================================
// FORM → POST /api/clients
// ============================================

export interface SourceInfo {
    mode: SourceMode;
    recapText: string;
    leexiCall?: { id: string; title: string; date: string | null; duration: number } | null;
}

function cleanList(list: string[]): string[] {
    return list.map((s) => s.trim()).filter((s, i, all) => s && all.indexOf(s) === i);
}

/**
 * The playbook stored on the client and the mission (the assistant's
 * get_playbook reads it) reflects the wizard's final values, not the raw
 * extraction. Manual clients get one too as soon as there is something in it.
 */
export function playbookFromForm(form: OnboardingForm, extracted: Playbook | null): Playbook | null {
    const base = extracted ?? emptyPlaybook();
    const emails = form.emails.filter((e) => e.include && (e.subject.trim() || e.body.trim()));
    const hasContent = extracted || form.icp.trim() || form.pitch.trim() || form.introScript.trim() || form.discoveryScript.trim() || emails.length;
    if (!hasContent) return null;
    return {
        ...base,
        company_name: form.name.trim(),
        website: form.website.trim(),
        sector: form.industry.trim(),
        icp_description: form.icp.trim(),
        pitch: form.pitch.trim(),
        target_roles: cleanList(form.targetJobTitles),
        target_sectors: cleanList(form.targetIndustries),
        geography: cleanList(form.targetGeographies),
        phone_script: form.introScript.trim(),
        call_scripts: [form.discoveryScript.trim(), form.closingScript.trim()].filter(Boolean),
        email_sequence: emails.map((e) => ({ subject: e.subject.trim(), body: e.body.trim() })),
        key_contacts: form.contacts
            .filter((c) => c.name.trim() || c.email.trim())
            .map((c) => ({ name: c.name.trim(), role: c.role.trim(), email: c.email.trim(), phone: c.phone.trim() })),
        mission_params: {
            channel: form.missionChannels[0] ?? "",
            working_days_per_month: form.missionWorkingDays,
            duration_months: form.missionDurationMonths,
            rdv_target_per_month: form.missionRdvTarget,
            start_date: form.targetLaunchDate,
        },
    };
}

export function buildCreatePayload(form: OnboardingForm, extracted: Playbook | null, source: SourceInfo): Record<string, unknown> {
    const playbook = playbookFromForm(form, extracted);
    const emails = form.emails.filter((e) => e.include && (e.subject.trim() || e.body.trim()));
    const channels = form.missionChannels.length ? form.missionChannels : (["CALL"] as Channel[]);
    const payload: Record<string, unknown> = {
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        industry: form.industry.trim() || null,
        website: form.website.trim() || null,
        onboardingData: {
            icp: form.icp.trim(),
            pitch: form.pitch.trim(),
            targetIndustries: cleanList(form.targetIndustries),
            targetCompanySize: form.targetCompanySize.trim(),
            targetJobTitles: cleanList(form.targetJobTitles),
            targetGeographies: cleanList(form.targetGeographies),
            listingSources: cleanList(form.listingSources),
            listingCriteria: form.listingCriteria.trim(),
            estimatedContacts: form.estimatedContacts.trim(),
            ...(extracted?.next_steps.length ? { nextSteps: extracted.next_steps } : {}),
        },
        contacts: form.contacts
            .filter((c) => c.name.trim() || c.email.trim())
            .map((c) => ({ name: c.name.trim(), role: c.role.trim(), email: c.email.trim(), phone: c.phone.trim(), asInterlocuteur: c.asInterlocuteur })),
        targetLaunchDate: form.targetLaunchDate || null,
        scripts: {
            intro: form.introScript.trim(),
            discovery: form.discoveryScript.trim(),
            objection: form.objectionScript.trim(),
            closing: form.closingScript.trim(),
        },
        notes: form.notes.trim() || null,
        createMission: form.createMission,
        missionName: form.missionName.trim() || null,
        missionObjective: form.missionObjective.trim() || null,
        missionChannel: channels[0],
        missionChannels: channels,
        missionDurationMonths: form.missionDurationMonths,
        missionWorkingDays: form.missionWorkingDays,
        missionRdvTarget: form.missionRdvTarget,
        campaignPitch: form.pitch.trim() || null,
        salesPlaybook: playbook ?? undefined,
        emailTemplates: emails.map((e) => ({ subject: e.subject.trim(), body: e.body.trim() })),
        startChecklist: form.startChecklist,
        checklistStartDay: form.startChecklist ? form.checklistStartDay || null : null,
    };
    if (source.mode !== "manual" && source.recapText.trim()) {
        payload.leexiImport = {
            leexiCallId: source.leexiCall?.id,
            source: source.mode === "leexi" ? "api" : "paste",
            rawRecap: source.recapText,
            callTitle: source.leexiCall?.title,
            callDate: source.leexiCall?.date ?? null,
            callDuration: source.leexiCall?.duration,
        };
    }
    return payload;
}
