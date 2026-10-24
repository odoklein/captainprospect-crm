/**
 * Onboarding checklist template — pure, no database (npm run test:onboarding).
 *
 * A client's onboarding is a plain checklist (Valentin: « la liste à cocher,
 * le truc basique »), stored as Tasks of the client's project so every step
 * with a due date also lands in the manager home's « Tâches du jour »:
 *   - one parent Task per section   labels: onboarding, onboarding:section:<key>
 *   - one subtask per step          labels: onboarding, onboarding:step:<key>
 * Each step's startDate holds J0 (the checklist start) and its dueDate is
 * J0 + offset, so offsets can be recomputed from the rows themselves.
 *
 * Days are "YYYY-MM-DD" strings (Europe/Paris calendar days).
 */

export type AutoStep = "first-call" | "setup-invoiced" | "setup-paid";

export interface TemplateStep {
    key: string;
    title: string;
    /** Days after J0; null = no due date. */
    offsetDays: number | null;
    /** Ticked by the system from real data (first call, billing schedule). */
    auto?: AutoStep;
}

export interface TemplateSection {
    key: string;
    title: string;
    steps: TemplateStep[];
}

export interface ChecklistTemplate {
    version: 1;
    sections: TemplateSection[];
}

export const ONBOARDING_LABEL = "onboarding";
export const SECTION_LABEL_PREFIX = "onboarding:section:";
export const STEP_LABEL_PREFIX = "onboarding:step:";
export const AUTO_LABEL_PREFIX = "onboarding:auto:";

/** Valentin's « Docka » flow, completed with JF's launch steps. Offsets to confirm with JF. */
export const DEFAULT_TEMPLATE: ChecklistTemplate = {
    version: 1,
    sections: [
        {
            key: "contractualisation",
            title: "Contractualisation",
            steps: [
                { key: "pack-contractuel", title: "Envoi du pack contractuel", offsetDays: 0 },
                { key: "devis-dpa", title: "Signature du devis et du DPA", offsetDays: 3 },
                { key: "facture-setup", title: "Facture de setup envoyée", offsetDays: 3, auto: "setup-invoiced" },
                { key: "setup-paye", title: "Setup payé", offsetDays: 10, auto: "setup-paid" },
            ],
        },
        {
            key: "cadrage",
            title: "Cadrage",
            steps: [
                { key: "questionnaire-envoye", title: "Questionnaire de cadrage envoyé", offsetDays: 1 },
                { key: "questionnaire-recu", title: "Questionnaire reçu", offsetDays: 5 },
                { key: "audit", title: "Audit de l'activité", offsetDays: 7 },
                { key: "playbook", title: "Playbook et script rédigés", offsetDays: 10 },
            ],
        },
        {
            key: "equipe",
            title: "Équipe",
            steps: [
                { key: "entretiens-sdr", title: "Entretiens SDR", offsetDays: 7 },
                { key: "sdr-planifies", title: "SDR choisis et planifiés", offsetDays: 10 },
            ],
        },
        {
            key: "lancement",
            title: "Lancement",
            steps: [
                { key: "atelier", title: "Atelier de lancement avec le client", offsetDays: 12 },
                { key: "acces-portail", title: "Accès portail client envoyé", offsetDays: 12 },
                { key: "agenda", title: "Agenda de prise de RDV connecté", offsetDays: 12 },
                { key: "premier-appel", title: "Premier appel", offsetDays: 14, auto: "first-call" },
            ],
        },
    ],
};

// ============================================
// DAYS
// ============================================

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDay(value: unknown): value is string {
    if (typeof value !== "string" || !DAY_RE.test(value)) return false;
    const d = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addDays(day: string, n: number): string {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

export function dayDiff(from: string, to: string): number {
    return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Calendar day in Paris for an instant. */
export function parisDayOf(date: Date): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Paris",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date);
}

/**
 * Stored instant for a calendar day: 10:00 UTC is the same day in Paris in
 * summer and winter, and in every UI that formats it in local time.
 */
export function dayToDate(day: string): Date {
    return new Date(`${day}T10:00:00.000Z`);
}

// ============================================
// TEMPLATE
// ============================================

function slug(value: string): string {
    return (
        value
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 40) || "etape"
    );
}

/** A saved template (SystemConfig), or the code default when missing/invalid. */
export function parseTemplate(raw: string | null | undefined): ChecklistTemplate {
    if (!raw) return DEFAULT_TEMPLATE;
    try {
        const parsed = JSON.parse(raw) as ChecklistTemplate;
        if (parsed?.version !== 1 || !Array.isArray(parsed.sections) || parsed.sections.length === 0) {
            return DEFAULT_TEMPLATE;
        }
        const sections = parsed.sections
            .filter((s) => s && typeof s.title === "string" && Array.isArray(s.steps))
            .map((s) => ({
                key: typeof s.key === "string" && s.key ? s.key : slug(s.title),
                title: s.title.trim(),
                steps: s.steps
                    .filter((st) => st && typeof st.title === "string" && st.title.trim())
                    .map((st) => ({
                        key: typeof st.key === "string" && st.key ? st.key : slug(st.title),
                        title: st.title.trim(),
                        offsetDays:
                            typeof st.offsetDays === "number" && Number.isFinite(st.offsetDays)
                                ? Math.max(0, Math.round(st.offsetDays))
                                : null,
                        ...(st.auto === "first-call" || st.auto === "setup-invoiced" || st.auto === "setup-paid"
                            ? { auto: st.auto }
                            : {}),
                    })),
            }))
            .filter((s) => s.title);
        return sections.length ? { version: 1, sections } : DEFAULT_TEMPLATE;
    } catch {
        return DEFAULT_TEMPLATE;
    }
}

export interface InstantiatedStep {
    key: string;
    title: string;
    position: number;
    startDay: string;
    dueDay: string | null;
    labels: string[];
}

export interface InstantiatedSection {
    key: string;
    title: string;
    position: number;
    labels: string[];
    steps: InstantiatedStep[];
}

export function sectionLabels(key: string): string[] {
    return [ONBOARDING_LABEL, `${SECTION_LABEL_PREFIX}${key}`];
}

export function stepLabels(key: string, auto?: AutoStep): string[] {
    return [ONBOARDING_LABEL, `${STEP_LABEL_PREFIX}${key}`, ...(auto ? [`${AUTO_LABEL_PREFIX}${auto}`] : [])];
}

/** The rows to create for a checklist starting on startDay. */
export function instantiate(template: ChecklistTemplate, startDay: string): InstantiatedSection[] {
    return template.sections.map((section, sIndex) => ({
        key: section.key,
        title: section.title,
        position: sIndex,
        labels: sectionLabels(section.key),
        steps: section.steps.map((step, index) => ({
            key: step.key,
            title: step.title,
            position: index,
            startDay,
            dueDay: step.offsetDays === null ? null : addDays(startDay, step.offsetDays),
            labels: stepLabels(step.key, step.auto),
        })),
    }));
}

/** Label helpers for rows read back from the database. */
export function keyFromLabels(labels: string[], prefix: string): string | null {
    const label = labels.find((l) => l.startsWith(prefix));
    return label ? label.slice(prefix.length) : null;
}

export function autoFromLabels(labels: string[]): AutoStep | null {
    const value = keyFromLabels(labels, AUTO_LABEL_PREFIX);
    return value === "first-call" || value === "setup-invoiced" || value === "setup-paid" ? value : null;
}

/** A client's current checklist turned back into a template (« Enregistrer comme modèle »). */
export function templateFromChecklist(
    sections: Array<{
        title: string;
        labels: string[];
        steps: Array<{ title: string; labels: string[]; startDay: string | null; dueDay: string | null }>;
    }>,
): ChecklistTemplate {
    return {
        version: 1,
        sections: sections.map((section) => ({
            key: keyFromLabels(section.labels, SECTION_LABEL_PREFIX) ?? slug(section.title),
            title: section.title,
            steps: section.steps.map((step) => {
                const auto = autoFromLabels(step.labels);
                return {
                    key: keyFromLabels(step.labels, STEP_LABEL_PREFIX) ?? slug(step.title),
                    title: step.title,
                    offsetDays:
                        step.startDay && step.dueDay ? Math.max(0, dayDiff(step.startDay, step.dueDay)) : null,
                    ...(auto ? { auto } : {}),
                };
            }),
        })),
    };
}

export { slug as stepKeyFromTitle };
