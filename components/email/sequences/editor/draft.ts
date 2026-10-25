// Editable draft of a sequence (settings + steps) shared by the "new" and
// detail screens, and its conversion to the API payload.

import type { SequenceDetail, SequenceSettings, StepStats } from "../types";

export interface DraftStep {
    /** Stable React key (also for unsaved steps). */
    key: string;
    /** Server id once saved. */
    id?: string;
    subject: string;
    body: string;
    delayDays: number;
    delayHours: number;
    skipIfOpened: boolean;
    skipIfClicked: boolean;
    skipIfReplied: boolean;
    stats?: StepStats;
}

export interface SequenceDraft {
    settings: SequenceSettings;
    steps: DraftStep[];
}

let counter = 0;
export function newKey(): string {
    counter += 1;
    return `new-${Date.now().toString(36)}-${counter}`;
}

export function newStep(index: number): DraftStep {
    return {
        key: newKey(),
        subject: "",
        body:
            index === 0
                ? "Bonjour {{firstName}},\n\n\n\nBien cordialement,\n{{senderName}}"
                : "Bonjour {{firstName}},\n\nJe me permets de revenir vers vous au sujet de mon précédent message.\n\nBien cordialement,\n{{senderName}}",
        delayDays: index === 0 ? 0 : 3,
        delayHours: 0,
        skipIfOpened: false,
        skipIfClicked: false,
        skipIfReplied: true,
    };
}

export const DEFAULT_SETTINGS: SequenceSettings = {
    name: "",
    description: "",
    mailboxId: "",
    sendTimeStart: "09:00",
    sendTimeEnd: "18:00",
    sendOnWeekends: false,
    timezone: "Europe/Paris",
    stopOnReply: true,
    stopOnBounce: true,
    trackOpens: true,
    trackClicks: true,
};

export function draftFromDetail(detail: SequenceDetail): SequenceDraft {
    return {
        settings: {
            name: detail.name,
            description: detail.description ?? "",
            mailboxId: detail.mailboxId,
            sendTimeStart: detail.sendTimeStart ?? "",
            sendTimeEnd: detail.sendTimeEnd ?? "",
            sendOnWeekends: detail.sendOnWeekends,
            timezone: detail.timezone || "Europe/Paris",
            stopOnReply: detail.stopOnReply,
            stopOnBounce: detail.stopOnBounce,
            trackOpens: detail.trackOpens,
            trackClicks: detail.trackClicks,
        },
        steps: detail.steps.map((s) => ({
            key: s.id,
            id: s.id,
            subject: s.subject,
            body: s.body,
            delayDays: s.delayDays,
            delayHours: s.delayHours,
            skipIfOpened: s.skipIfOpened,
            skipIfClicked: s.skipIfClicked,
            skipIfReplied: s.skipIfReplied,
            stats: s.stats,
        })),
    };
}

export function draftToPayload(draft: SequenceDraft) {
    const s = draft.settings;
    return {
        name: s.name.trim(),
        description: s.description.trim(),
        mailboxId: s.mailboxId,
        sendTimeStart: s.sendTimeStart || null,
        sendTimeEnd: s.sendTimeEnd || null,
        sendOnWeekends: s.sendOnWeekends,
        timezone: s.timezone,
        stopOnReply: s.stopOnReply,
        stopOnBounce: s.stopOnBounce,
        trackOpens: s.trackOpens,
        trackClicks: s.trackOpens, // clicks are tracked together with opens by the sender
        steps: draft.steps.map((st) => ({
            id: st.id ?? null,
            subject: st.subject.trim(),
            body: st.body,
            delayDays: st.delayDays,
            delayHours: st.delayHours,
            delayMinutes: 0,
            skipIfOpened: st.skipIfOpened,
            skipIfClicked: st.skipIfClicked,
            skipIfReplied: st.skipIfReplied,
        })),
    };
}

export function draftSignature(draft: SequenceDraft): string {
    return JSON.stringify(draftToPayload(draft));
}

/** Problems that block saving, in the order the user should fix them. */
export function draftErrors(draft: SequenceDraft): string[] {
    const errors: string[] = [];
    if (!draft.settings.name.trim()) errors.push("Donnez un nom à la séquence");
    if (!draft.settings.mailboxId) errors.push("Choisissez une boîte d'envoi");
    if (draft.settings.sendTimeStart && draft.settings.sendTimeEnd && draft.settings.sendTimeEnd <= draft.settings.sendTimeStart) {
        errors.push("L'heure de fin d'envoi doit être après l'heure de début");
    }
    if (draft.steps[0] && !draft.steps[0].subject.trim()) errors.push("Le premier email a besoin d'un objet");
    return errors;
}

/** Client-side HTML → text for templates written in HTML (most are plain text). */
export function htmlToPlain(html: string): string {
    if (!/<\s*(p|div|br|table|ul|ol|li|h[1-6]|span|a|strong|b|em|i|img)\b[^>]*>/i.test(html)) return html;
    if (typeof window === "undefined") return html.replace(/<[^>]*>/g, "");
    const prepared = html
        .replace(/<\s*br\s*\/?>/gi, "\n")
        .replace(/<\s*\/\s*(p|div|h[1-6]|li|tr)\s*>/gi, "\n\n")
        .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, (_m, href: string, label: string) =>
            label.replace(/<[^>]*>/g, "").trim() === href ? href : `${label} (${href})`,
        );
    const doc = new DOMParser().parseFromString(prepared, "text/html");
    return (doc.body.textContent || "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
