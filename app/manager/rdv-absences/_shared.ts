/**
 * Shared by the absences page and its detail drawer: the list row shape and the
 * date / aging helpers both read it with.
 */

import { NO_SHOW_REPORT_WINDOW_HOURS } from "@/lib/meetings/noShowWindow";

export interface AbsenceRow {
    id: string;
    callbackDate: string | null;
    meetingType: string | null;
    contactName: string;
    companyName: string;
    missionId: string | null;
    missionName: string | null;
    campaignName: string | null;
    clientId: string | null;
    clientName: string;
    sdr: { id: string; name: string } | null;
    portalWindowOpen: boolean;
    feedback: {
        outcome: string;
        recontactRequested: string;
        note: string | null;
        source: string | null;
        reportedBy: string | null;
        reportedAt: string;
        standByAt: string | null;
        standByReason: string | null;
        standByBy: string | null;
        outOfScopeAt: string | null;
        outOfScopeReason: string | null;
        outOfScopeBy: string | null;
    } | null;
}

export type TabKey = "reported" | "standby" | "outofscope";

export const SOURCE_LABEL: Record<string, string> = {
    PORTAL_CLIENT: "Portail client",
    PORTAL_COMMERCIAL: "Portail commercial",
    MANAGER: "Manager (fiche RDV)",
    MANAGER_MANUAL: "Signalement manuel",
};

export const RECONTACT_OPTS = [
    { value: "YES", label: "Oui, à recontacter" },
    { value: "MAYBE", label: "Peut-être" },
    { value: "NO", label: "Non, clôturer" },
] as const;

export function fmtDate(iso: string | null): string {
    if (!iso) return "Date inconnue";
    return new Date(iso).toLocaleString("fr-FR", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris",
    });
}

function hoursSince(iso: string | null): number | null {
    if (!iso) return null;
    return Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
}

export function elapsedLabel(iso: string | null): string {
    const h = hoursSince(iso);
    if (h == null) return "—";
    if (h < 1) return "à l'instant";
    if (h < 24) return `il y a ${h} h`;
    const d = Math.floor(h / 24);
    if (d < 31) return `il y a ${d} j`;
    const m = Math.floor(d / 30);
    return `il y a ${m} mois`;
}

/** Older than this and the backlog item is properly stale, not just late. */
export function agingTone(iso: string | null): "fresh" | "late" | "stale" {
    const h = hoursSince(iso);
    if (h == null) return "fresh";
    if (h >= 24 * 14) return "stale";
    if (h >= NO_SHOW_REPORT_WINDOW_HOURS) return "late";
    return "fresh";
}
