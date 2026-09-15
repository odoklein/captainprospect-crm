/**
 * Vue agence — the cross-project tools.
 *
 * Everything here declares `requiresProject: false`, which is what makes the
 * general mode possible: the same guard, loop and panel, with no binding.
 *
 * These are MANAGER-only, like the rest of the catalogue. That is not a
 * throwaway detail — a manager already reads every tenant, so removing the
 * project binding changes nothing about what they may see. The day another role
 * is allowed in, these tools need a scope resolver in front of them, not just a
 * wider `allowedRoles`.
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { sanitizeUntrusted } from "../redact";
import { defineReadTool, frDate, params, rate } from "../helpers";

function sinceDate(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
}

const CONNECT_RESULTS = [
    "INTERESTED",
    "CALLBACK_REQUESTED",
    "MEETING_BOOKED",
    "REFUS_ARGU",
    "PROJET_A_SUIVRE",
    "RELANCE",
] as const;

export const getAgencyOverview = defineReadTool({
    name: "get_agency_overview",
    label: "Vue d'ensemble agence",
    description:
        "Le portrait de l'agence : clients actifs, missions en cours, SDR, et le volume de RDV du mois. À utiliser pour une question générale qui ne porte pas sur un client précis.",
    parameters: params({}),
    schema: z.object({}),
    requiresProject: false,
    execute: async () => {
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const [clients, missions, sdrs, meetingsThisMonth, meetingsPending] = await Promise.all([
            prisma.client.count({ where: { archivedAt: null, status: "ACTIVE" } }),
            prisma.mission.count({ where: { isActive: true, status: "ACTIVE" } }),
            prisma.user.count({ where: { role: { in: ["SDR", "BOOKER"] }, isActive: true } }),
            prisma.action.count({
                where: { result: "MEETING_BOOKED", createdAt: { gte: monthStart } },
            }),
            prisma.action.count({
                where: { result: "MEETING_BOOKED", confirmationStatus: "PENDING" },
            }),
        ]);

        return {
            clientsActifs: clients,
            missionsActives: missions,
            sdrActifs: sdrs,
            rdvCeMois: meetingsThisMonth,
            rdvEnAttenteDeConfirmation: meetingsPending,
            date: frDate(new Date()),
        };
    },
});

export const listClientsNeedingAttention = defineReadTool({
    name: "list_clients_needing_attention",
    label: "Clients à surveiller",
    description:
        "Les clients qui méritent un coup d'œil : aucun RDV récent, jours contractualisés non renseignés, commerciaux sans accès portail. Répond à « qu'est-ce qui ne va pas en ce moment ? ».",
    parameters: params({
        days: { type: "number", description: "Fenêtre d'inactivité en jours, 14 par défaut" },
    }),
    schema: z.object({ days: z.number().int().min(1).max(180).optional() }),
    requiresProject: false,
    execute: async (args) => {
        const days = args.days ?? 14;
        const since = sinceDate(days);

        const clients = await prisma.client.findMany({
            where: { archivedAt: null, status: "ACTIVE" },
            select: {
                id: true,
                name: true,
                contractedDaysPerWeek: true,
                missions: {
                    where: { isActive: true },
                    select: { id: true, name: true },
                },
                interlocuteurs: {
                    where: { isActive: true },
                    select: { id: true, portalUser: { select: { id: true } } },
                },
            },
        });

        // One grouped query rather than one per client: this tool runs on every
        // "how are things going" question and must stay cheap.
        const recentMeetings = await prisma.action.groupBy({
            by: ["campaignId"],
            where: { result: "MEETING_BOOKED", createdAt: { gte: since } },
            _count: { _all: true },
        });
        const campaigns = await prisma.campaign.findMany({
            where: { id: { in: recentMeetings.map((m) => m.campaignId) } },
            select: { id: true, missionId: true },
        });
        const missionMeetingCount = new Map<string, number>();
        for (const row of recentMeetings) {
            const missionId = campaigns.find((c) => c.id === row.campaignId)?.missionId;
            if (!missionId) continue;
            missionMeetingCount.set(
                missionId,
                (missionMeetingCount.get(missionId) ?? 0) + row._count._all,
            );
        }

        const flagged = clients
            .map((client) => {
                const meetings = client.missions.reduce(
                    (sum, m) => sum + (missionMeetingCount.get(m.id) ?? 0),
                    0,
                );
                const sansAcces = client.interlocuteurs.filter((i) => !i.portalUser).length;

                const alertes: string[] = [];
                if (client.missions.length > 0 && meetings === 0) {
                    alertes.push(`aucun RDV depuis ${days} jours`);
                }
                if (client.contractedDaysPerWeek === null) {
                    alertes.push("jours/semaine non renseignés");
                }
                if (sansAcces > 0) {
                    alertes.push(`${sansAcces} commercial(aux) sans accès portail`);
                }
                if (client.missions.length === 0) {
                    alertes.push("aucune mission active");
                }

                return {
                    clientId: client.id,
                    nom: client.name,
                    missionsActives: client.missions.length,
                    rdvSurLaPeriode: meetings,
                    alertes,
                };
            })
            .filter((c) => c.alertes.length > 0)
            .sort((a, b) => b.alertes.length - a.alertes.length);

        return {
            periodeJours: days,
            clientsAvecAlerte: flagged.slice(0, 25),
            totalClientsActifs: clients.length,
        };
    },
});

export const getAgencyMetrics = defineReadTool({
    name: "get_agency_metrics",
    label: "Chiffres agence",
    description:
        "Volumes et conversion sur toute l'agence pour une période, avec le détail par client et par SDR. Pour les chiffres d'un seul projet, utilise plutôt get_mission_metrics.",
    parameters: params({ days: { type: "number", description: "Fenêtre en jours, 30 par défaut" } }),
    schema: z.object({ days: z.number().int().min(1).max(365).optional() }),
    requiresProject: false,
    execute: async (args) => {
        const days = args.days ?? 30;
        const where: Prisma.ActionWhereInput = { createdAt: { gte: sinceDate(days) } };

        const [total, byResult, bySdr, meetingsByCampaign] = await Promise.all([
            prisma.action.count({ where }),
            prisma.action.groupBy({ by: ["result"], where, _count: { _all: true } }),
            prisma.action.groupBy({ by: ["sdrId"], where, _count: { _all: true } }),
            prisma.action.groupBy({
                by: ["campaignId"],
                where: { ...where, result: "MEETING_BOOKED" },
                _count: { _all: true },
            }),
        ]);

        const counts = new Map(byResult.map((r) => [r.result, r._count._all]));
        const connects = CONNECT_RESULTS.reduce((sum, r) => sum + (counts.get(r) ?? 0), 0);
        const rdv = counts.get("MEETING_BOOKED") ?? 0;

        const [sdrs, campaigns] = await Promise.all([
            prisma.user.findMany({
                where: { id: { in: bySdr.map((s) => s.sdrId) } },
                select: { id: true, name: true },
            }),
            prisma.campaign.findMany({
                where: { id: { in: meetingsByCampaign.map((m) => m.campaignId) } },
                select: { id: true, mission: { select: { client: { select: { name: true } } } } },
            }),
        ]);

        const sdrNames = new Map(sdrs.map((s) => [s.id, s.name]));
        const perClient = new Map<string, number>();
        for (const row of meetingsByCampaign) {
            const clientName = campaigns.find((c) => c.id === row.campaignId)?.mission.client.name;
            if (!clientName) continue;
            perClient.set(clientName, (perClient.get(clientName) ?? 0) + row._count._all);
        }

        return {
            periodeJours: days,
            totaux: {
                actions: total,
                connects,
                rdvPris: rdv,
                tauxConnectPct: rate(connects, total),
                tauxRdvSurConnectPct: rate(rdv, connects),
            },
            rdvParClient: Array.from(perClient.entries())
                .map(([client, nombre]) => ({ client, rdv: nombre }))
                .sort((a, b) => b.rdv - a.rdv),
            parSdr: bySdr
                .map((s) => ({ sdr: sdrNames.get(s.sdrId) ?? s.sdrId, actions: s._count._all }))
                .sort((a, b) => b.actions - a.actions)
                .slice(0, 20),
        };
    },
});

export const searchAcrossProjects = defineReadTool({
    name: "search_across_projects",
    label: "Recherche transverse",
    description:
        "Retrouve un client, une mission ou un commercial par son nom, quel que soit le projet. Renvoie les identifiants nécessaires pour ensuite basculer sur le bon projet.",
    parameters: params({ query: { type: "string" } }, ["query"]),
    schema: z.object({ query: z.string().min(2).max(120) }),
    requiresProject: false,
    execute: async (args) => {
        const q = args.query;

        const [clients, missions, interlocuteurs] = await Promise.all([
            prisma.client.findMany({
                where: { archivedAt: null, name: { contains: q, mode: "insensitive" } },
                select: { id: true, name: true, status: true },
                take: 10,
            }),
            prisma.mission.findMany({
                where: { name: { contains: q, mode: "insensitive" } },
                select: {
                    id: true,
                    name: true,
                    status: true,
                    client: { select: { id: true, name: true } },
                },
                take: 10,
            }),
            prisma.clientInterlocuteur.findMany({
                where: {
                    isActive: true,
                    OR: [
                        { firstName: { contains: q, mode: "insensitive" } },
                        { lastName: { contains: q, mode: "insensitive" } },
                    ],
                },
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    client: { select: { id: true, name: true } },
                    portalUser: { select: { email: true } },
                },
                take: 10,
            }),
        ]);

        return {
            clients: clients.map((c) => ({ clientId: c.id, nom: c.name, statut: c.status })),
            missions: missions.map((m) => ({
                missionId: m.id,
                nom: sanitizeUntrusted(m.name, 120),
                statut: m.status,
                clientId: m.client.id,
                client: m.client.name,
            })),
            commerciaux: interlocuteurs.map((i) => ({
                interlocuteurId: i.id,
                nom: `${i.firstName} ${i.lastName}`.trim(),
                clientId: i.client.id,
                client: i.client.name,
                emailPortail: i.portalUser?.email ?? null,
            })),
            note: "Pour agir sur un de ces éléments, demande à l'utilisateur de basculer sur le projet concerné.",
        };
    },
});
