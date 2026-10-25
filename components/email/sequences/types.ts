// Shared types, labels and formatting for the Séquences screens.

export type SequenceStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
export type EnrollmentStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "REPLIED" | "BOUNCED" | "UNSUBSCRIBED" | "MANUAL_EXIT";
export type Tone = "neutral" | "primary" | "accent" | "success" | "warning" | "danger" | "info";

export interface MailboxInfo {
    id: string;
    email: string;
    displayName: string | null;
    provider: string;
    isActive: boolean;
    syncStatus: string;
    healthScore: number;
    lastError: string | null;
    lastSyncAt: string | null;
    dailySendLimit: number;
    sentToday: number;
    disabledReason: string | null;
}

export interface EngineRun {
    at: string;
    durationMs: number;
    scanned: number;
    sent: number;
    skipped: number;
    completed: number;
    deferred: number;
    exited: number;
    errors: number;
    errorSamples: string[];
}

export interface EngineStatus {
    lastRun: EngineRun | null;
    healthy: boolean;
    dueNow: number;
}

export interface SequenceListItem {
    id: string;
    name: string;
    description: string | null;
    status: SequenceStatus;
    mailbox: MailboxInfo | null;
    createdBy: { id: string; name: string } | null;
    createdAt: string;
    updatedAt: string;
    stepsCount: number;
    enrolled: number;
    active: number;
    paused: number;
    completed: number;
    replied: number;
    bounced: number;
    sent: number;
    contacted: number;
    nextSendAt: string | null;
}

export interface StepStats {
    sent: number;
    opened: number;
    clicked: number;
    replied: number;
    bounced: number;
}

export interface SequenceStep {
    id: string;
    order: number;
    name: string | null;
    subject: string;
    body: string;
    delayDays: number;
    delayHours: number;
    delayMinutes: number;
    skipIfOpened: boolean;
    skipIfClicked: boolean;
    skipIfReplied: boolean;
    stats: StepStats;
}

export interface SequenceSettings {
    name: string;
    description: string;
    mailboxId: string;
    sendTimeStart: string;
    sendTimeEnd: string;
    sendOnWeekends: boolean;
    timezone: string;
    stopOnReply: boolean;
    stopOnBounce: boolean;
    trackOpens: boolean;
    trackClicks: boolean;
}

export interface SequenceDetail extends Omit<SequenceSettings, "description" | "sendTimeStart" | "sendTimeEnd"> {
    id: string;
    description: string | null;
    sendTimeStart: string | null;
    sendTimeEnd: string | null;
    status: SequenceStatus;
    mailbox: MailboxInfo | null;
    createdBy: { id: string; name: string; email: string } | null;
    createdAt: string;
    updatedAt: string;
    steps: SequenceStep[];
    counts: Record<string, number>;
    nextSendAt: string | null;
    stats: StepStats & { enrolled: number; contacted: number; completed: number };
}

export interface MissionOption {
    id: string;
    name: string;
    clientName: string | null;
    lists: { id: string; name: string }[];
}

export interface SequenceOptions {
    mailboxes: MailboxInfo[];
    missions: MissionOption[];
    me: { id: string; name: string; email: string } | null;
    engine: EngineStatus;
}

export interface EnrollmentRow {
    id: string;
    status: EnrollmentStatus;
    currentStep: number;
    nextStepAt: string | null;
    enrolledAt: string;
    completedAt: string | null;
    exitedAt: string | null;
    exitReason: string | null;
    lastError: string | null;
    repliedAt: string | null;
    emailsSent: number;
    contact: { id: string; name: string | null; email: string | null; title: string | null; companyName: string | null };
    lastEmail: {
        id: string;
        subject: string;
        status: string;
        sentAt: string | null;
        openCount: number;
        clickCount: number;
        firstOpenedAt: string | null;
    } | null;
}

export const SEQUENCE_STATUS_META: Record<SequenceStatus, { label: string; tone: Tone }> = {
    DRAFT: { label: "Brouillon", tone: "neutral" },
    ACTIVE: { label: "Active", tone: "success" },
    PAUSED: { label: "En pause", tone: "warning" },
    ARCHIVED: { label: "Archivée", tone: "neutral" },
};

export const ENROLLMENT_STATUS_META: Record<EnrollmentStatus, { label: string; tone: Tone }> = {
    ACTIVE: { label: "En cours", tone: "primary" },
    PAUSED: { label: "En pause", tone: "warning" },
    COMPLETED: { label: "Terminé", tone: "neutral" },
    REPLIED: { label: "A répondu", tone: "success" },
    BOUNCED: { label: "Rebond", tone: "danger" },
    UNSUBSCRIBED: { label: "Désinscrit", tone: "neutral" },
    MANUAL_EXIT: { label: "Retiré", tone: "neutral" },
};

export const SKIP_REASON_LABELS: Record<string, string> = {
    NO_EMAIL: "Sans email",
    INVALID_EMAIL: "Email invalide",
    EXCLUDED: "Exclu",
    UNSUBSCRIBED: "Désinscrit",
    ALREADY_ENROLLED: "Déjà inscrit",
};

export const TIMEZONES = [
    { value: "Europe/Paris", label: "Paris (Europe/Paris)" },
    { value: "Europe/Brussels", label: "Bruxelles (Europe/Brussels)" },
    { value: "Europe/Zurich", label: "Zurich (Europe/Zurich)" },
    { value: "Europe/Luxembourg", label: "Luxembourg (Europe/Luxembourg)" },
    { value: "Europe/London", label: "Londres (Europe/London)" },
    { value: "America/Montreal", label: "Montréal (America/Montreal)" },
    { value: "Indian/Antananarivo", label: "Antananarivo (Indian/Antananarivo)" },
    { value: "Africa/Casablanca", label: "Casablanca (Africa/Casablanca)" },
    { value: "Africa/Abidjan", label: "Abidjan (Africa/Abidjan)" },
    { value: "Africa/Dakar", label: "Dakar (Africa/Dakar)" },
];

// ============================================
// FORMATTING
// ============================================

export function pct(part: number, whole: number): string {
    if (!whole) return "—";
    const v = (part / whole) * 100;
    return `${v >= 10 || v === 0 ? Math.round(v) : v.toFixed(1).replace(".", ",")} %`;
}

export function plural(n: number, one: string, many?: string): string {
    return `${n.toLocaleString("fr-FR")} ${n > 1 ? many ?? `${one}s` : one}`;
}

export function formatDateTime(value: string | Date | null | undefined, timeZone = "Europe/Paris"): string {
    if (!value) return "—";
    const d = typeof value === "string" ? new Date(value) : value;
    try {
        return d.toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone });
    } catch {
        return d.toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    }
}

/** "dans 2 h", "il y a 12 min", "demain 09:00"… short and human. */
export function formatRelative(value: string | Date | null | undefined): string {
    if (!value) return "—";
    const d = typeof value === "string" ? new Date(value) : value;
    const diff = d.getTime() - Date.now();
    const abs = Math.abs(diff);
    const min = Math.round(abs / 60000);
    const future = diff > 0;
    if (min < 1) return future ? "dans un instant" : "à l'instant";
    if (min < 60) return future ? `dans ${min} min` : `il y a ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return future ? `dans ${h} h` : `il y a ${h} h`;
    const days = Math.round(h / 24);
    if (days < 7) return future ? `dans ${days} j` : `il y a ${days} j`;
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export function delayLabel(step: { delayDays: number; delayHours: number }, index: number): string {
    if (index === 0) {
        if (!step.delayDays && !step.delayHours) return "Dès l'inscription";
        return `${step.delayDays ? plural(step.delayDays, "jour") : ""}${step.delayDays && step.delayHours ? " " : ""}${step.delayHours ? `${step.delayHours} h` : ""} après l'inscription`;
    }
    if (!step.delayDays && !step.delayHours) return "Juste après l'email précédent";
    return `${step.delayDays ? `+${plural(step.delayDays, "jour")}` : ""}${step.delayDays && step.delayHours ? " " : ""}${step.delayHours ? `${step.delayDays ? "" : "+"}${step.delayHours} h` : ""}`;
}

/** Cumulative day label for the timeline: "Jour 0", "Jour 3"… */
export function dayLabels(steps: { delayDays: number; delayHours: number }[]): string[] {
    let total = 0;
    return steps.map((s) => {
        total += s.delayDays + s.delayHours / 24;
        const day = Math.floor(total);
        return `Jour ${day}`;
    });
}

export function mailboxLabel(m: Pick<MailboxInfo, "email" | "displayName"> | null | undefined): string {
    if (!m) return "Aucune boîte";
    return m.displayName ? `${m.displayName} · ${m.email}` : m.email;
}

/** Health of a mailbox for sending, in words the manager understands. */
export function mailboxHealth(m: MailboxInfo | null | undefined): { tone: Tone; label: string; detail?: string } {
    if (!m) return { tone: "danger", label: "Aucune boîte d'envoi" };
    if (!m.isActive) return { tone: "danger", label: "Désactivée", detail: m.disabledReason || m.lastError || undefined };
    if (m.syncStatus === "ERROR") return { tone: "warning", label: "Erreur de synchronisation", detail: m.lastError || undefined };
    if (m.provider === "REACHINBOX") {
        return {
            tone: "warning",
            label: "Boîte ReachInbox",
            detail: "Les envois passent par l'API ReachInbox (Onebox). Pour une séquence, une boîte SMTP ou Gmail/Outlook est plus fiable.",
        };
    }
    if (m.healthScore < 50) return { tone: "warning", label: `Santé ${m.healthScore}/100`, detail: m.lastError || undefined };
    return { tone: "success", label: "Connectée" };
}

/** "[Prénom]"-style placeholders left from copy-pasted templates. */
export function findBracketPlaceholders(text: string): string[] {
    const found = new Set<string>();
    for (const m of text.matchAll(/\[([A-Za-zÀ-ÿ' _-]{2,30})\]/g)) found.add(m[0]);
    return Array.from(found);
}
