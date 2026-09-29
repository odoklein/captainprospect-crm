/**
 * Query-string contract of the prospection export endpoints, shared by the
 * export dialog (builds it) and the API routes (parse it). No server imports:
 * this file is bundled client-side too.
 *
 *   listIds    comma-separated list ids (absent = every non-archived list)
 *   statuses   comma-separated result codes — current status of the line
 *   treatment  all | treated | untreated
 *   sdrIds     comma-separated user ids   ┐
 *   channels   CALL,EMAIL,LINKEDIN        ├ restrict the counted actions
 *   from, to   YYYY-MM-DD (Paris days)    ┘
 */

import { DateTime } from "luxon";
import type { ExportChannel, ProspectionExportFilters, TreatmentFilter } from "./types";

const ZONE = "Europe/Paris";
const CHANNELS: ExportChannel[] = ["CALL", "EMAIL", "LINKEDIN"];

export interface ExportQueryInput {
    listIds: string[] | null;
    statuses: string[];
    treatment: TreatmentFilter;
    sdrIds: string[];
    channels: ExportChannel[];
    /** YYYY-MM-DD */
    from: string;
    /** YYYY-MM-DD */
    to: string;
}

function csv(value: string | null): string[] {
    if (!value) return [];
    return [...new Set(value.split(",").map((v) => v.trim()).filter(Boolean))].slice(0, 500);
}

function parseDay(value: string | null, edge: "start" | "end"): Date | null {
    if (!value) return null;
    const dt = /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? DateTime.fromISO(value, { zone: ZONE })
        : DateTime.fromISO(value, { setZone: true });
    if (!dt.isValid) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return (edge === "start" ? dt.startOf("day") : dt.endOf("day")).toJSDate();
    }
    return dt.toJSDate();
}

export function parseExportFilters(params: URLSearchParams): ProspectionExportFilters {
    const listIds = params.has("listIds") ? csv(params.get("listIds")) : null;
    const treatmentRaw = params.get("treatment");
    const treatment: TreatmentFilter = treatmentRaw === "treated" || treatmentRaw === "untreated" ? treatmentRaw : "all";
    return {
        listIds,
        statuses: csv(params.get("statuses")),
        treatment,
        sdrIds: csv(params.get("sdrIds")),
        channels: csv(params.get("channels"))
            .map((c) => c.toUpperCase())
            .filter((c): c is ExportChannel => (CHANNELS as string[]).includes(c)),
        from: parseDay(params.get("from"), "start"),
        to: parseDay(params.get("to"), "end"),
    };
}

export function buildExportQuery(input: ExportQueryInput): URLSearchParams {
    const q = new URLSearchParams();
    if (input.listIds) q.set("listIds", input.listIds.join(","));
    if (input.statuses.length) q.set("statuses", input.statuses.join(","));
    if (input.treatment !== "all") q.set("treatment", input.treatment);
    if (input.sdrIds.length) q.set("sdrIds", input.sdrIds.join(","));
    if (input.channels.length) q.set("channels", input.channels.join(","));
    if (input.from) q.set("from", input.from);
    if (input.to) q.set("to", input.to);
    return q;
}
