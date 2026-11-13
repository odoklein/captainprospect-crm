/**
 * SDR tools — the Assistant SDR panel (/sdr/*), on the same registry, guard
 * and executor as the Assistant Projet. « A future SDR-facing tool is a role
 * flag, not a second system » (AI_ASSISTANT_ARCHITECTURE.md §8).
 *
 * Scope: the signed-in user's own work. Every query takes `ctx.userId`; no
 * argument names another SDR, a mission or a client. The SDR route also
 * pins `ctx.toolAllowlist` to SDR_TOOL_NAMES, so none of the manager tools is
 * reachable from the panel even if its role list were widened one day.
 *
 * The one write, rescheduling a callback, is a `confirm` tool: the SDR sees
 * the old and new date on a card and clicks before anything changes.
 */

import { z } from "zod";
import { DateTime } from "luxon";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findOwnCallback, loadFollowUps, loadNextCall, loadTodayOutreach } from "@/lib/sdr-assistant/data";
import { APP_TIMEZONE, frWhen } from "@/lib/sdr-assistant/signals";
import { defineConfirmTool, defineReadTool, NO_PARAMS, params } from "../helpers";

export const SDR_ROLES: UserRole[] = ["SDR", "BUSINESS_DEVELOPER", "BOOKER"];

export const sdrListFollowUps = defineReadTool({
    name: "sdr_list_follow_ups",
    label: "Rappels à traiter",
    description:
        "Rappels et relances en attente de l'utilisateur (ses propres rappels) : compteurs en retard / aujourd'hui / à venir, et la liste avec lien vers la fiche. À utiliser pour « qui dois-je relancer », « mes rappels ».",
    parameters: params({
        window: {
            type: "string",
            enum: ["overdue_and_today", "next_7_days", "all"],
            description: "overdue_and_today (défaut), next_7_days, ou all",
        },
        limit: { type: "integer", description: "1–30 (défaut 15)" },
    }),
    schema: z.object({
        window: z.enum(["overdue_and_today", "next_7_days", "all"]).optional(),
        limit: z.number().int().min(1).max(30).optional(),
    }),
    allowedRoles: SDR_ROLES,
    requiresProject: false,
    execute: async (args, ctx) => loadFollowUps(ctx.userId, args),
});

export const sdrPrepareNextCall = defineReadTool({
    name: "sdr_prepare_next_call",
    label: "Préparation du prochain appel",
    description:
        "Le prochain prospect de la file d'actions de l'utilisateur (ou celui qu'il nomme via `search`) : fiche, pourquoi l'appeler maintenant, historique des échanges et résumés d'appel, pitch et script de la mission.",
    parameters: params({
        search: { type: "string", description: "Nom du contact ou de la société, si l'utilisateur en cite un" },
    }),
    schema: z.object({ search: z.string().max(120).optional() }),
    allowedRoles: SDR_ROLES,
    requiresProject: false,
    execute: async (args, ctx) => loadNextCall(ctx.userId, ctx.role, args.search ?? null),
});

export const sdrTodayOutreach = defineReadTool({
    name: "sdr_today_outreach",
    label: "Activité du jour",
    description:
        "Ce que l'utilisateur a fait aujourd'hui (heure de Paris) : appels, emails, LinkedIn, RDV, répartition des résultats, dernières actions avec lien vers la fiche, et prochaines actions recommandées calculées à partir de ces lignes.",
    parameters: NO_PARAMS,
    schema: z.object({}).strict(),
    allowedRoles: SDR_ROLES,
    requiresProject: false,
    execute: async (_args, ctx) => loadTodayOutreach(ctx.userId),
});

/** "2026-11-16T10:30" (Paris) or a full ISO string → Date, or null when unusable. */
export function parseParisDateTime(value: string, now = new Date()): Date | null {
    const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(value.trim());
    const dt = hasZone ? DateTime.fromISO(value.trim()) : DateTime.fromISO(value.trim(), { zone: APP_TIMEZONE });
    if (!dt.isValid) return null;
    const date = dt.toJSDate();
    // A reschedule into the past is a typo, not a plan.
    if (date.getTime() < now.getTime() - 60_000) return null;
    return date;
}

export const sdrRescheduleFollowUp = defineConfirmTool({
    name: "sdr_reschedule_follow_up",
    label: "Report d'un rappel",
    description:
        "Propose de déplacer un des rappels de l'utilisateur à une nouvelle date (callbackId via sdr_list_follow_ups). Ne s'exécute qu'après confirmation de l'utilisateur sur la carte.",
    parameters: params(
        {
            callbackId: { type: "string", description: "callbackId renvoyé par sdr_list_follow_ups" },
            newDate: { type: "string", description: "Date et heure de Paris, ISO sans fuseau, ex : 2026-11-16T10:30" },
            note: { type: "string", description: "Note optionnelle ajoutée au rappel" },
        },
        ["callbackId", "newDate"],
    ),
    schema: z.object({
        callbackId: z.string().min(1).max(64),
        newDate: z.string().min(10).max(40),
        note: z.string().max(500).optional(),
    }),
    allowedRoles: SDR_ROLES,
    requiresProject: false,
    describe: async (args, ctx) => {
        const callback = await findOwnCallback(ctx.userId, args.callbackId);
        if (!callback) throw new Error("Rappel introuvable dans vos rappels.");
        const date = parseParisDateTime(args.newDate);
        if (!date) throw new Error(`Date invalide ou passée : ${args.newDate}`);
        const now = new Date();
        return {
            title: "Reporter le rappel",
            details: [
                { label: "Prospect", value: callback.who },
                { label: "Prévu", value: frWhen(callback.callbackDate, now) ?? "sans date" },
                { label: "Nouvelle date", value: frWhen(date, now) ?? args.newDate },
                ...(args.note ? [{ label: "Note ajoutée", value: args.note }] : []),
            ],
            warning: null,
            confirmLabel: "Reporter",
            danger: false,
        };
    },
    execute: async (args, ctx) => {
        // Ownership and status are checked again at click time, not trusted from the proposal.
        const callback = await findOwnCallback(ctx.userId, args.callbackId);
        if (!callback) throw new Error("Rappel introuvable dans vos rappels.");
        const date = parseParisDateTime(args.newDate);
        if (!date) throw new Error(`Date invalide ou passée : ${args.newDate}`);
        const note = args.note?.trim()
            ? [callback.note?.trim(), `Reporté : ${args.note.trim()}`].filter(Boolean).join("\n")
            : undefined;
        await prisma.action.update({
            where: { id: callback.id },
            data: { callbackDate: date, ...(note !== undefined ? { note } : {}) },
        });
        return { message: `Rappel de ${callback.who} reporté ${frWhen(date, new Date())}.`, refresh: true };
    },
});

export const SDR_TOOLS = [sdrListFollowUps, sdrPrepareNextCall, sdrTodayOutreach, sdrRescheduleFollowUp];

/** The whole surface of the SDR panel: the route pins ctx.toolAllowlist to it. */
export const SDR_TOOL_NAMES: ReadonlySet<string> = new Set(SDR_TOOLS.map((t) => t.name));
