/**
 * Row building for the prospection export: which lines go out, and what
 * Captain Prospect did on each of them.
 *
 * Two kinds of filters, deliberately kept apart:
 *  - action filters (SDR, channel, period) decide which actions are counted;
 *  - row filters (treatment, current status) decide which lines are exported,
 *    judged on the counted actions only.
 * So "Julien, septembre, non traités" means the lines Julien did not touch in
 * September — and every number on an exported line is consistent with it.
 */

import { DateTime } from "luxon";
import type {
    ExportAction,
    ExportCompany,
    ExportRow,
    ProspectionExportFilters,
    RowTreatment,
    StatusVocabulary,
} from "./types";
import { UNTREATED_LABEL } from "./types";

export const EXPORT_TIME_ZONE = "Europe/Paris";

export const CHANNEL_LABELS: Record<string, string> = {
    CALL: "Appel",
    EMAIL: "Email",
    LINKEDIN: "LinkedIn",
};

export const MEETING_TYPE_LABELS: Record<string, string> = {
    VISIO: "Visio",
    PHYSIQUE: "Physique",
    TELEPHONIQUE: "Téléphonique",
};

export function formatDateTimeFr(date: Date | null | undefined): string {
    if (!date || Number.isNaN(date.getTime())) return "";
    return DateTime.fromJSDate(date).setZone(EXPORT_TIME_ZONE).toFormat("dd/MM/yyyy HH:mm");
}

export function formatDateFr(date: Date | null | undefined): string {
    if (!date || Number.isNaN(date.getTime())) return "";
    return DateTime.fromJSDate(date).setZone(EXPORT_TIME_ZONE).toFormat("dd/MM/yyyy");
}

/** 754 → "12:34", 3 754 → "1:02:34". */
export function formatDuration(totalSeconds: number): string {
    if (!totalSeconds || totalSeconds <= 0) return "";
    const s = Math.round(totalSeconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
    return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

function collapseWhitespace(text: string): string {
    return text.replace(/\s+/g, " ").trim();
}

// ============================================
// FILTERS
// ============================================

export function actionIsCounted(action: ExportAction, filters: ProspectionExportFilters): boolean {
    if (filters.sdrIds.length && !filters.sdrIds.includes(action.sdrId)) return false;
    if (filters.channels.length && !filters.channels.includes(action.channel)) return false;
    const t = action.createdAt.getTime();
    if (filters.from && t < filters.from.getTime()) return false;
    if (filters.to && t > filters.to.getTime()) return false;
    return true;
}

export function rowIsExported(treatment: RowTreatment, filters: ProspectionExportFilters): boolean {
    if (filters.treatment === "treated" && !treatment.treated) return false;
    if (filters.treatment === "untreated" && treatment.treated) return false;
    if (filters.statuses.length) {
        if (!treatment.lastResult || !filters.statuses.includes(treatment.lastResult)) return false;
    }
    return true;
}

// ============================================
// TREATMENT SUMMARY
// ============================================

export function historyLine(action: ExportAction, vocabulary: StatusVocabulary): string {
    const parts = [
        formatDateTimeFr(action.createdAt),
        CHANNEL_LABELS[action.channel] ?? action.channel,
        vocabulary.labelFor(action.result),
        action.sdrName,
    ].filter(Boolean);
    let line = parts.join(" · ");
    if (action.callbackDate && (vocabulary.isCallback(action.result) || action.result === "MEETING_BOOKED")) {
        line += ` (${action.result === "MEETING_BOOKED" ? "RDV" : "rappel"} le ${formatDateTimeFr(action.callbackDate)})`;
    }
    const note = action.note ? collapseWhitespace(action.note) : "";
    if (note) line += ` — ${note}`;
    return line;
}

/**
 * @param actions counted actions of one line, oldest first.
 * @param options.withHistory false skips building `historyLines` (luxon
 *   formatting per action) for callers that never display them.
 */
export function summarizeActions(
    actions: ExportAction[],
    vocabulary: StatusVocabulary,
    options: { withHistory?: boolean } = {}
): RowTreatment {
    let callCount = 0;
    let emailCount = 0;
    let linkedinCount = 0;
    let totalCallSeconds = 0;
    let lastNote: string | null = null;
    let lastCallSummary: string | null = null;
    let meetingAction: ExportAction | null = null;

    for (const a of actions) {
        if (a.channel === "CALL") {
            callCount++;
            if (a.duration && a.duration > 0) totalCallSeconds += a.duration;
        } else if (a.channel === "EMAIL") emailCount++;
        else if (a.channel === "LINKEDIN") linkedinCount++;

        if (a.note?.trim()) lastNote = a.note.trim();
        if (a.callSummary?.trim()) lastCallSummary = a.callSummary.trim();
        // A cancellation after the booking voids it.
        if (a.result === "MEETING_BOOKED") meetingAction = a;
        else if (a.result === "MEETING_CANCELLED") meetingAction = null;
    }

    const first = actions[0] ?? null;
    const last = actions[actions.length - 1] ?? null;
    const nextCallbackAt = last && last.callbackDate && vocabulary.isCallback(last.result) ? last.callbackDate : null;

    return {
        treated: actions.length > 0,
        actionCount: actions.length,
        callCount,
        emailCount,
        linkedinCount,
        totalCallSeconds,
        firstActionAt: first?.createdAt ?? null,
        lastActionAt: last?.createdAt ?? null,
        lastResult: last?.result ?? null,
        lastResultLabel: last ? vocabulary.labelFor(last.result) : UNTREATED_LABEL,
        lastChannel: last?.channel ?? null,
        lastSdrName: last?.sdrName ?? null,
        lastNote,
        lastCallSummary,
        nextCallbackAt,
        meetingBookedAt: meetingAction?.createdAt ?? null,
        meetingAt: meetingAction?.callbackDate ?? null,
        meetingType: meetingAction?.meetingType ?? null,
        historyLines: options.withHistory === false ? [] : actions.slice().reverse().map((a) => historyLine(a, vocabulary)),
    };
}

// ============================================
// ROW ASSEMBLY
// ============================================

export interface ActionIndex {
    byContact: Map<string, ExportAction[]>;
    /** Actions logged on the company itself (no contact) — e.g. calls to the switchboard. */
    byCompanyOnly: Map<string, ExportAction[]>;
}

/** @param actions every action of the lists, any order. */
export function indexActions(actions: ExportAction[]): ActionIndex {
    const byContact = new Map<string, ExportAction[]>();
    const byCompanyOnly = new Map<string, ExportAction[]>();
    const sorted = actions.slice().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    for (const a of sorted) {
        if (a.contactId) {
            const bucket = byContact.get(a.contactId);
            if (bucket) bucket.push(a);
            else byContact.set(a.contactId, [a]);
        } else if (a.ownerCompanyId) {
            const bucket = byCompanyOnly.get(a.ownerCompanyId);
            if (bucket) bucket.push(a);
            else byCompanyOnly.set(a.ownerCompanyId, [a]);
        }
    }
    return { byContact, byCompanyOnly };
}

function mergeChronological(a: ExportAction[], b: ExportAction[]): ExportAction[] {
    if (a.length === 0) return b;
    if (b.length === 0) return a;
    const out: ExportAction[] = [];
    let i = 0;
    let j = 0;
    while (i < a.length || j < b.length) {
        if (j >= b.length || (i < a.length && a[i].createdAt.getTime() <= b[j].createdAt.getTime())) out.push(a[i++]);
        else out.push(b[j++]);
    }
    return out;
}

/**
 * One line per contact, or one line for a company without contacts — the
 * shape of a client file. Company-level actions (logged without a contact)
 * are part of every line of that company: they are attempts to reach it.
 */
export function buildRows(
    companies: ExportCompany[],
    index: ActionIndex,
    filters: ProspectionExportFilters,
    vocabulary: StatusVocabulary,
    options: { applyRowFilters?: boolean; withHistory?: boolean } = {}
): ExportRow[] {
    const applyRowFilters = options.applyRowFilters ?? true;
    const rows: ExportRow[] = [];
    for (const company of companies) {
        const companyActions = (index.byCompanyOnly.get(company.id) ?? []).filter((a) => actionIsCounted(a, filters));
        const lines = company.contacts.length > 0 ? company.contacts : [null];
        for (const contact of lines) {
            const own = contact ? (index.byContact.get(contact.id) ?? []).filter((a) => actionIsCounted(a, filters)) : [];
            const actions = mergeChronological(own, companyActions);
            const treatment = summarizeActions(actions, vocabulary, { withHistory: options.withHistory });
            if (applyRowFilters && !rowIsExported(treatment, filters)) continue;
            rows.push({ company, contact, actions, treatment });
        }
    }
    return rows;
}
