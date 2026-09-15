/**
 * Suivi — what actually happened on the project.
 *
 * Actions hang off campaigns, which hang off missions, so every query here
 * filters on `campaign.missionId` (or the client's missions when no single
 * mission is bound). That join is the scope.
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { sanitizeUntrusted } from "../redact";
import { requireProject } from "../context";
import { defineReadTool, frDate, frDateTime, params, rate } from "../helpers";
import type { AssistantContext } from "../types";

/** Results that count as a reachable, useful conversation. */
const CONNECT_RESULTS = [
    "INTERESTED",
    "CALLBACK_REQUESTED",
    "MEETING_BOOKED",
    "REFUS_ARGU",
    "PROJET_A_SUIVRE",
    "RELANCE",
] as const;

/** The campaign filter for the bound project. */
async function projectCampaignFilter(ctx: AssistantContext): Promise<Prisma.ActionWhereInput> {
    const project = requireProject(ctx);
    if (project.missionId) {
        return { campaign: { missionId: project.missionId } };
    }
    const missions = await prisma.mission.findMany({
        where: { clientId: project.clientId },
        select: { id: true },
    });
    return { campaign: { missionId: { in: missions.map((m) => m.id) } } };
}

function sinceDate(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
}

export const getMissionMetrics = defineReadTool({
    name: "get_mission_metrics",
    label: "Chiffres du projet",
    description:
        "Volumes et conversion du projet sur une période : actions, connects, RDV pris, RDV annulés, et le détail par SDR. Utilise-le pour toute question chiffrée sur la performance.",
    parameters: params({
        days: { type: "number", description: "Fenêtre en jours, 30 par défaut" },
    }),
    schema: z.object({ days: z.number().int().min(1).max(365).optional() }),
    execute: async (args, ctx) => {
        const days = args.days ?? 30;
        const filter = await projectCampaignFilter(ctx);
        const where: Prisma.ActionWhereInput = { ...filter, createdAt: { gte: sinceDate(days) } };

        const [total, byResult, bySdr] = await Promise.all([
            prisma.action.count({ where }),
            prisma.action.groupBy({ by: ["result"], where, _count: { _all: true } }),
            prisma.action.groupBy({ by: ["sdrId"], where, _count: { _all: true } }),
        ]);

        const counts = new Map(byResult.map((r) => [r.result, r._count._all]));
        const connects = CONNECT_RESULTS.reduce((sum, r) => sum + (counts.get(r) ?? 0), 0);
        const rdv = counts.get("MEETING_BOOKED") ?? 0;

        const sdrs = await prisma.user.findMany({
            where: { id: { in: bySdr.map((s) => s.sdrId) } },
            select: { id: true, name: true },
        });
        const sdrNames = new Map(sdrs.map((s) => [s.id, s.name]));

        const rdvBySdr = await prisma.action.groupBy({
            by: ["sdrId"],
            where: { ...where, result: "MEETING_BOOKED" },
            _count: { _all: true },
        });
        const rdvMap = new Map(rdvBySdr.map((r) => [r.sdrId, r._count._all]));

        return {
            periodeJours: days,
            totaux: {
                actions: total,
                connects,
                rdvPris: rdv,
                rdvAnnules: counts.get("MEETING_CANCELLED") ?? 0,
                tauxConnectPct: rate(connects, total),
                tauxRdvSurConnectPct: rate(rdv, connects),
            },
            parResultat: byResult
                .map((r) => ({ resultat: r.result, nombre: r._count._all }))
                .sort((a, b) => b.nombre - a.nombre),
            parSdr: bySdr
                .map((s) => ({
                    sdr: sdrNames.get(s.sdrId) ?? s.sdrId,
                    actions: s._count._all,
                    rdv: rdvMap.get(s.sdrId) ?? 0,
                }))
                .sort((a, b) => b.actions - a.actions),
        };
    },
});

export const listMeetings = defineReadTool({
    name: "list_meetings",
    label: "RDV du projet",
    description:
        "Les RDV du projet : date, contact, société, SDR, commercial concerné, statut de confirmation et absence signalée.",
    parameters: params({
        days: { type: "number", description: "Fenêtre en jours autour d'aujourd'hui, 30 par défaut" },
        upcomingOnly: { type: "boolean", description: "Ne garder que les RDV à venir" },
    }),
    schema: z.object({
        days: z.number().int().min(1).max(365).optional(),
        upcomingOnly: z.boolean().optional(),
    }),
    execute: async (args, ctx) => {
        const days = args.days ?? 30;
        const filter = await projectCampaignFilter(ctx);

        const meetings = await prisma.action.findMany({
            where: {
                ...filter,
                result: "MEETING_BOOKED",
                callbackDate: args.upcomingOnly
                    ? { gte: new Date() }
                    : { gte: sinceDate(days) },
            },
            orderBy: { callbackDate: "asc" },
            take: 50,
            select: {
                id: true,
                callbackDate: true,
                meetingType: true,
                confirmationStatus: true,
                sdr: { select: { name: true } },
                contact: { select: { firstName: true, lastName: true } },
                company: { select: { name: true } },
                interlocuteur: { select: { firstName: true, lastName: true } },
                meetingFeedback: { select: { outcome: true } },
            },
        });

        return {
            rdv: meetings.map((m) => ({
                actionId: m.id,
                date: frDateTime(m.callbackDate),
                type: m.meetingType,
                societe: sanitizeUntrusted(m.company?.name ?? null, 120),
                contact: m.contact
                    ? sanitizeUntrusted(`${m.contact.firstName ?? ""} ${m.contact.lastName ?? ""}`.trim(), 120)
                    : null,
                sdr: m.sdr.name,
                commercial: m.interlocuteur
                    ? `${m.interlocuteur.firstName} ${m.interlocuteur.lastName}`.trim()
                    : null,
                confirmation: m.confirmationStatus,
                retour: m.meetingFeedback?.outcome ?? null,
            })),
        };
    },
});

export const getMeetingFeedback = defineReadTool({
    name: "get_meeting_feedback",
    label: "Retours sur les RDV",
    description:
        "Les retours laissés par le client et les commerciaux après un RDV : qualité, absences, demandes de recontact. Répond à « est-ce que les RDV sont bons ? ».",
    parameters: params({ days: { type: "number" } }),
    schema: z.object({ days: z.number().int().min(1).max(365).optional() }),
    execute: async (args, ctx) => {
        const days = args.days ?? 60;
        const filter = await projectCampaignFilter(ctx);

        const feedback = await prisma.meetingFeedback.findMany({
            where: {
                action: filter,
                createdAt: { gte: sinceDate(days) },
            },
            orderBy: { createdAt: "desc" },
            take: 50,
            select: {
                outcome: true,
                recontactRequested: true,
                clientNote: true,
                source: true,
                createdAt: true,
                action: {
                    select: {
                        callbackDate: true,
                        company: { select: { name: true } },
                        sdr: { select: { name: true } },
                    },
                },
            },
        });

        const byOutcome = new Map<string, number>();
        for (const f of feedback) {
            byOutcome.set(f.outcome, (byOutcome.get(f.outcome) ?? 0) + 1);
        }

        return {
            periodeJours: days,
            resume: Array.from(byOutcome.entries()).map(([outcome, nombre]) => ({ outcome, nombre })),
            retours: feedback.map((f) => ({
                resultat: f.outcome,
                recontact: f.recontactRequested,
                source: f.source,
                societe: sanitizeUntrusted(f.action.company?.name ?? null, 120),
                sdr: f.action.sdr.name,
                dateRdv: frDate(f.action.callbackDate),
                note: sanitizeUntrusted(f.clientNote, 300),
            })),
        };
    },
});

export const getCampaignStatus = defineReadTool({
    name: "get_campaign_status",
    label: "Campagnes et listes",
    description:
        "Les campagnes du projet et l'état de leurs listes : volume total, contacts restants à travailler. Répond à « est-ce qu'on a encore de la matière ? ».",
    parameters: params({}),
    schema: z.object({}),
    execute: async (_args, ctx) => {
        const project = requireProject(ctx);

        const campaigns = await prisma.campaign.findMany({
            where: {
                mission: {
                    clientId: project.clientId,
                    ...(project.missionId ? { id: project.missionId } : {}),
                },
            },
            orderBy: { createdAt: "desc" },
            take: 25,
            select: {
                id: true,
                name: true,
                isActive: true,
                mission: { select: { name: true, channels: true } },
                assignedLists: {
                    where: { isArchived: false },
                    select: {
                        name: true,
                        type: true,
                        isActive: true,
                        _count: { select: { companies: true } },
                    },
                },
                _count: { select: { actions: true } },
            },
        });

        return {
            campagnes: campaigns.map((c) => ({
                campaignId: c.id,
                nom: c.name,
                active: c.isActive,
                mission: c.mission.name,
                canaux: c.mission.channels,
                actionsRealisees: c._count.actions,
                listes: c.assignedLists.map((l) => ({
                    nom: l.name,
                    type: l.type,
                    active: l.isActive,
                    societes: l._count.companies,
                })),
            })),
        };
    },
});
